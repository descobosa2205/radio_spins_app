#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Diagnóstico: POR QUÉ a un autor no se le aplica el reparto editorial de su contrato.

Recorre la cadena entera y dice en qué punto se corta. **Solo LEE**: no escribe nada.

    python3 tools/diag_reparto_editorial.py "Pol Gutiérrez Molina"
    python3 tools/diag_reparto_editorial.py "Pol Gutiérrez Molina" --cancion "Nombre del tema"

⚠️ Pone los cerrojos del bootstrap ANTES de importar `app`, así el hilo que crea el esquema sale
sin hacer nada y esto no toca la base más que para leer.
"""

import os
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
_tmp = pathlib.Path(tempfile.gettempdir())
for _n in ("app33_schema_bootstrap.lock", "app33_personnel_bootstrap.lock"):
    try:
        (_tmp / _n).write_text("x")
    except Exception:
        pass

import app as A                      # noqa: E402
import models as M                   # noqa: E402


def _p(texto=""):
    print(texto)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        _p("Uso: python3 tools/diag_reparto_editorial.py \"Nombre del autor\" [--cancion \"Título\"]")
        return 1
    nombre = args[0]
    titulo = ""
    if "--cancion" in sys.argv:
        i = sys.argv.index("--cancion")
        if i + 1 < len(sys.argv):
            titulo = sys.argv[i + 1]

    s = M.SessionLocal()
    try:
        clave = A._norm_text_key(nombre)
        terceros = [p for p in s.query(M.Promoter).all()
                    if clave in A._norm_text_key(
                        " ".join([p.nick or "", p.first_name or "", p.last_name or ""]))]
        _p("1) FICHAS DE TERCERO con ese nombre: %d" % len(terceros))
        if not terceros:
            _p("   ✗ No hay ninguna. El autor no existe como tercero: nada que aplicar.")
            return 0
        if len(terceros) > 1:
            _p("   ⚠️ HAY DUPLICADOS: el autor de la canción apunta a UNA de ellas, y solo esa cuenta.")
        for p in terceros:
            ids = A._promoter_member_artist_ids(s, p.id)
            artistas = [s.get(M.Artist, A.to_uuid(x)) for x in ids]
            _p("   · %s | nick=%r nombre=%r %r | DNI=%r"
               % (p.id, p.nick, p.first_name, p.last_name, p.tax_id))
            _p("     integrante de: %s" % ([a.name for a in artistas if a] or "NADIE ⚠️"))
            for a in artistas:
                if not a:
                    continue
                cons = s.query(M.ArtistContract).filter_by(artist_id=a.id).all()
                _p("     contratos de %s: %d" % (a.name, len(cons)))
                for c in cons:
                    coms = s.query(M.ArtistContractCommitment).filter_by(contract_id=c.id).all()
                    for m in coms:
                        casa = A._norm_text_key(m.concept or "")
                        vale = any(v in casa or casa in v
                                   for v in [A._norm_text_key(x) for x in A.EDITORIAL_CONTRACT_CONCEPTS])
                        _p("       - %r firmado=%s | concepto=%r %s | artista=%s%% oficina=%s%% | ámbito=%s"
                           % (c.name, c.signed_date, m.concept,
                              "(EDITORIAL ✓)" if vale else "(no editorial)",
                              m.pct_artist, m.pct_office, getattr(m, "material_scope", None)))

        _p()
        _p("2) SUS PARTES AUTORALES")
        q = s.query(M.SongEditorialShare).filter(
            M.SongEditorialShare.promoter_id.in_([p.id for p in terceros]))
        filas = q.all()
        if titulo:
            filas = [sh for sh in filas
                     if titulo.lower() in ((s.get(M.Song, sh.song_id).title or "").lower())]
        if not filas:
            _p("   ✗ No figura como autor en ninguna canción%s." % (" con ese título" if titulo else ""))
            return 0
        for sh in filas[:20]:
            song = s.get(M.Song, sh.song_id)
            editorial = A._share_publisher(sh)
            _p("   · %s (%s)" % (song.title, song.release_date))
            _p("       editorial del REGISTRO: %r | de la FICHA del autor: %r"
               % (getattr(s.get(M.PublishingCompany, sh.publishing_company_id), "name", None)
                  if sh.publishing_company_id else None,
                  getattr(s.get(M.PublishingCompany, s.get(M.Promoter, sh.promoter_id).publishing_company_id),
                          "name", None) if s.get(M.Promoter, sh.promoter_id).publishing_company_id else None))
            _p("       ¿es Plataforma?: %s" % A._publisher_is_platform(editorial))
            _p("       ¿congelado?: %s (autor=%s plataforma=%s) | ¿especial?: %s"
               % (A._share_split_frozen(sh), sh.split_pct_author, sh.split_pct_platform,
                  bool(getattr(sh, "special_split", False))))
            _p("       ¿se puede calcular hoy?: %s" % A._share_split_applies_live(sh))
            info = A._editorial_split_for_author(s, song, sh)
            _p("       contrato: encontrado=%s | autor=%s%% plataforma=%s%% (%s)"
               % (info["found"], info["pct_author"], info["pct_platform"], info["contract_name"]))
            mapa = A._song_editorial_split_map(s, song)
            fila = mapa.get(str(sh.id))
            _p("       LO QUE SE PINTA EN LA FICHA: %s"
               % ({k: fila.get(k) for k in ("pct", "pct_author", "pct_platform", "source")}
                  if fila else "NADA ⚠️ (la parte se descarta antes de pintarse)"))
        return 0
    finally:
        s.close()


if __name__ == "__main__":
    raise SystemExit(main())
