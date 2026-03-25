from celery import Celery

from config import settings


if not settings.REDIS_URL:
    raise RuntimeError(
        "Falta REDIS_URL (o CELERY_BROKER_URL / KV_INTERNAL_URL) en variables de entorno."
    )


celery = Celery("radio_spins_app", broker=settings.REDIS_URL)
celery.conf.update(
    broker_connection_retry_on_startup=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    accept_content=["json"],
    task_serializer="json",
    result_serializer="json",
    timezone="Europe/Madrid",
    enable_utc=True,
)

# Registro de tareas
import tasks_royalties  # noqa: E402,F401
