from datetime import datetime

from celery_app import celery
from config import settings
from models import SessionLocal, RoyaltyLiquidation
from supabase_utils import upload_bytes
from app import (
    app as flask_app,
    TZ_MADRID,
    _build_royalty_liquidation_pdf_bytes,
    _get_royalty_liquidation_record,
    _semester_range,
    to_uuid,
)


def _task_base_url() -> str:
    raw = (settings.PUBLIC_BASE_URL or "https://app.local").strip()
    if not raw:
        return "https://app.local"
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw.rstrip("/")
    return ("https://" + raw).rstrip("/")


def _storage_key_for_pdf(kind: str, beneficiary_id, sem_year: int, sem_half: int, filename: str) -> str:
    return f"royalties/liquidations/{sem_year}-S{sem_half}/{(kind or '').strip().lower()}_{beneficiary_id}/{filename}"


@celery.task(name="royalties.generate_liquidation_pdf", bind=True)
def generate_royalty_liquidation_pdf_task(self, kind: str, beneficiary_id: str, sem_year: int, sem_half: int):
    session_db = SessionLocal()
    bid = to_uuid(beneficiary_id)
    if not bid:
        raise ValueError("Beneficiario inválido")

    sem_start, sem_end = _semester_range(int(sem_year), int(sem_half))
    kind = (kind or "").strip().upper()

    try:
        now_dt = datetime.now(TZ_MADRID)
        rec = _get_royalty_liquidation_record(session_db, kind, bid, sem_start)
        if not rec:
            rec = RoyaltyLiquidation(
                beneficiary_kind=kind,
                beneficiary_id=bid,
                period_start=sem_start,
                period_end=sem_end,
                status="GENERATED",
                pdf_status="RUNNING",
                generated_at=None,
                updated_at=now_dt,
            )
            session_db.add(rec)
            session_db.flush()

        rec.period_end = sem_end
        if not getattr(rec, "status", None):
            rec.status = "GENERATED"
        rec.pdf_status = "RUNNING"
        rec.pdf_started_at = now_dt
        rec.pdf_finished_at = None
        rec.pdf_error = None
        rec.pdf_job_id = getattr(self.request, "id", None)
        rec.updated_at = now_dt
        session_db.commit()

        with flask_app.app_context():
            with flask_app.test_request_context("/", base_url=_task_base_url()):
                pdf_bytes, filename, _beneficiary = _build_royalty_liquidation_pdf_bytes(
                    session_db,
                    kind,
                    bid,
                    int(sem_year),
                    int(sem_half),
                    touch_liquidation=True,
                )

        storage_key = _storage_key_for_pdf(kind, bid, int(sem_year), int(sem_half), filename)
        upload_bytes(pdf_bytes, storage_key, "application/pdf", upsert=True)

        done_dt = datetime.now(TZ_MADRID)
        rec = _get_royalty_liquidation_record(session_db, kind, bid, sem_start)
        if not rec:
            raise RuntimeError("No se encontró el registro de liquidación al finalizar la tarea.")
        rec.period_end = sem_end
        rec.pdf_status = "READY"
        rec.pdf_storage_path = storage_key
        rec.pdf_finished_at = done_dt
        rec.pdf_error = None
        rec.updated_at = done_dt
        if not getattr(rec, "generated_at", None):
            rec.generated_at = done_dt
        session_db.commit()
        return {"ok": True, "storage_key": storage_key}

    except Exception as exc:
        session_db.rollback()
        fail_dt = datetime.now(TZ_MADRID)
        rec = _get_royalty_liquidation_record(session_db, kind, bid, sem_start)
        if rec:
            rec.period_end = sem_end
            rec.pdf_status = "FAILED"
            rec.pdf_error = str(exc)
            rec.pdf_finished_at = fail_dt
            rec.updated_at = fail_dt
            session_db.commit()
        raise
    finally:
        session_db.close()
