"""
Lecture / mise à jour des essais PMT (table pmt_essais + pmt_essais_points).
Source unique pour la feuille runtime et le modèle — pas de duplication dans feuilles_terrain.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.database import get_db_path

router = APIRouter(tags=["PMT essais"])
DB_PATH = get_db_path()


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(DB_PATH))
    c.row_factory = sqlite3.Row
    return c


def _clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _as_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    text = _clean(value).replace(",", ".").replace(" ", "")
    try:
        n = float(text)
    except Exception:
        return None
    return n if n == n else None


def _normalize_position_codes(value: Any) -> list[str]:
    raw = value if isinstance(value, list) else []
    out: list[str] = []
    for item in raw:
        code = _clean(item).upper()
        if code in {"G", "A", "D"} and code not in out:
            out.append(code)
    return out


def _load_points_for_runtime(conn: sqlite3.Connection, pmt_id: int) -> list[dict[str, Any]]:
    cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(pmt_essais_points)").fetchall()}
    want = [
        "ordre",
        "numero_essai",
        "profil",
        "position",
        "position_g",
        "position_a",
        "position_d",
        "position_codes_json",
        "diametre_moyen_tache_mm",
        "profondeur_macrotexture_mm",
        "observation",
    ]
    select_cols = [c for c in want if c in cols]
    if not select_cols:
        select_cols = ["ordre", "numero_essai", "profondeur_macrotexture_mm", "observation"]
    sql = f"SELECT {', '.join(select_cols)} FROM pmt_essais_points WHERE pmt_id = ? ORDER BY ordre ASC, id ASC"
    rows = conn.execute(sql, (pmt_id,)).fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        position_codes: list[str] = []
        if "position_codes_json" in d:
            try:
                position_codes = _normalize_position_codes(json.loads(d.get("position_codes_json") or "[]"))
            except Exception:
                position_codes = []
        if not position_codes:
            if d.get("position_g") in (1, True, "1"):
                position_codes.append("G")
            if d.get("position_a") in (1, True, "1"):
                position_codes.append("A")
            if d.get("position_d") in (1, True, "1"):
                position_codes.append("D")
        out.append(
            {
                "ordre": d.get("ordre"),
                "numero_essai": _clean(d.get("numero_essai")),
                "profil": _clean(d.get("profil", "")),
                "position_codes": position_codes,
                "diametre_moyen_tache_mm": d.get("diametre_moyen_tache_mm"),
                "profondeur_macrotexture_mm": d.get("profondeur_macrotexture_mm"),
                "observation": _clean(d.get("observation", "")),
            }
        )
    if out:
        return out
    row = conn.execute("SELECT resultats_json FROM pmt_essais WHERE id = ?", (pmt_id,)).fetchone()
    if not row or not row["resultats_json"]:
        return []
    try:
        data = json.loads(row["resultats_json"])
    except Exception:
        return []
    pts = data.get("points") if isinstance(data, dict) else None
    return pts if isinstance(pts, list) else []


def _runtime_values_from_essai_row(sheet: dict[str, Any], points: list[dict[str, Any]]) -> dict[str, Any]:
    seuil = sheet.get("seuil_pmt_min_mm")
    epi = sheet.get("epaisseur_couche_cm")
    epi_str = "" if epi is None else str(epi).strip()
    if not epi_str:
        epi_str = _clean(sheet.get("epaisseur_couche_texte"))
    vol = sheet.get("volume_materiau_mm3")
    vol_str = "" if vol in (None, "") else str(vol).strip()
    if not vol_str:
        vol_str = _clean(sheet.get("volume_materiau_texte"))
    meta = {
        "reference_chantier": _clean(sheet.get("reference_affaire")),
        "chrono": _clean(sheet.get("chrono")),
        "date_essai": _clean(sheet.get("date_essai_debut") or sheet.get("date_essai")),
        "date_mise_en_oeuvre": _clean(
            sheet.get("date_mise_en_oeuvre_debut") or sheet.get("date_mise_en_oeuvre_texte") or ""
        ),
        "emplacement": _clean(sheet.get("section_controlee") or sheet.get("produit_controle")),
        "norme": _clean(sheet.get("norme")) or "NF EN 13036-1",
        "operateur": _clean(sheet.get("operateur")),
        "conditions_meteo": _clean(sheet.get("conditions_meteorologiques")),
        "section_controlee": _clean(sheet.get("section_controlee")),
        "lieu_fabrication": _clean(sheet.get("lieu_fabrication")),
        "numero_formule": _clean(sheet.get("numero_formule")),
        "produit_controle": _clean(sheet.get("produit_controle")),
        "couche": _clean(sheet.get("couche")),
        "epaisseur_couche_cm": epi_str,
        "atelier_mise_en_oeuvre": _clean(sheet.get("atelier_mise_en_oeuvre")),
        "volume_materiau_mm3": vol_str,
        "laboratoire": _clean(sheet.get("laboratoire")),
        "criteria_source": _clean(sheet.get("source_criteres")),
        "criteria_definition": _clean(sheet.get("definition_criteres")),
        "criteria_pmt_min": seuil if seuil is not None else "",
        "criteria_conformity_min_pct": sheet.get("pourcentage_conformite_min") or "",
        "conclusion_courte": _clean(sheet.get("conclusion_finale") or sheet.get("conclusion_excel_texte")),
        "commentaires": _clean(sheet.get("commentaire")),
    }
    rows: list[dict[str, Any]] = []
    for idx, p in enumerate(points):
        p = p if isinstance(p, dict) else {}
        num = _clean(p.get("numero_essai") or p.get("point"))
        prof = _clean(p.get("profil"))
        pos_codes = _normalize_position_codes(p.get("position_codes"))
        diam = p.get("diametre_moyen_tache_mm")
        prof_mm = p.get("profondeur_macrotexture_mm")
        obs = _clean(p.get("observations") or p.get("observation"))
        rows.append(
            {
                "id": int(p.get("id") or idx + 1),
                "point": num or f"P{idx + 1}",
                "profil": prof,
                "position_codes": pos_codes,
                "diametre_moyen_tache_mm": "" if diam is None else diam,
                "profondeur_macrotexture_mm": "" if prof_mm is None else prof_mm,
                "observation": obs,
                "observations": obs,
            }
        )
    return {"meta": meta, "points_rows": rows}


def _row_to_json_dict(row: sqlite3.Row) -> dict[str, Any]:
    d: dict[str, Any] = {}
    for k in row.keys():
        v = row[k]
        if isinstance(v, bytes):
            v = v.decode("utf-8", errors="replace")
        d[k] = v
    return d


@router.get("/by-reference")
def get_pmt_by_reference(reference: str):
    ref = _clean(reference)
    if not ref:
        raise HTTPException(status_code=400, detail="reference requis.")
    with _conn() as conn:
        row = conn.execute("SELECT * FROM pmt_essais WHERE reference = ?", (ref,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Essai PMT introuvable.")
        return _serialize_pmt(conn, int(row["id"]), row)


@router.get("/{pmt_id}")
def get_pmt(pmt_id: int):
    if pmt_id < 1:
        raise HTTPException(status_code=400, detail="pmt_id invalide.")
    with _conn() as conn:
        row = conn.execute("SELECT * FROM pmt_essais WHERE id = ?", (pmt_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Essai PMT introuvable.")
        return _serialize_pmt(conn, pmt_id, row)


def _serialize_pmt(conn: sqlite3.Connection, pmt_id: int, row: sqlite3.Row) -> dict[str, Any]:
    sheet = dict(row)
    pts = _load_points_for_runtime(conn, pmt_id)
    runtime_values = _runtime_values_from_essai_row(sheet, pts)
    return {
        "id": pmt_id,
        "reference": _clean(sheet.get("reference")),
        "demande_id": sheet.get("demande_id"),
        "campaign_id": sheet.get("campaign_id"),
        "intervention_id": sheet.get("intervention_id"),
        "statut": _clean(sheet.get("statut")),
        "essai": _row_to_json_dict(row),
        "runtime_values": runtime_values,
    }


class RuntimeValuesPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")

    meta: dict[str, Any] = Field(default_factory=dict)
    points_rows: list[dict[str, Any]] = Field(default_factory=list)


class PutRuntimeBody(BaseModel):
    model_config = ConfigDict(extra="ignore")

    runtime_values: RuntimeValuesPayload


@router.put("/{pmt_id}/runtime-values")
def put_runtime_values(pmt_id: int, body: PutRuntimeBody):
    if pmt_id < 1:
        raise HTTPException(status_code=400, detail="pmt_id invalide.")
    rv = body.runtime_values
    meta = rv.meta or {}
    rows_in = rv.points_rows or []
    now = datetime.utcnow().isoformat(timespec="seconds")

    points_for_json: list[dict[str, Any]] = []
    for i, r in enumerate(rows_in):
        num = _clean(r.get("point") or r.get("numero_essai")) or str(i + 1)
        profil = _clean(r.get("profil"))
        position_codes = _normalize_position_codes(r.get("position_codes"))
        diam = _as_float(r.get("diametre_moyen_tache_mm"))
        prof = _as_float(r.get("profondeur_macrotexture_mm"))
        obs = _clean(r.get("observation") or r.get("observations"))
        points_for_json.append(
            {
                "ordre": i + 1,
                "numero_essai": num,
                "profil": profil,
                "position_codes": position_codes,
                "diametre_moyen_tache_mm": diam,
                "profondeur_macrotexture_mm": prof,
                "observation": obs,
                "donnees_ligne_json": {},
            }
        )

    date_essai = _clean(meta.get("date_essai"))
    operateur = _clean(meta.get("operateur"))
    resultats = json.dumps({"points": points_for_json, "summary": {}}, ensure_ascii=False)

    with _conn() as conn:
        ex = conn.execute("SELECT id FROM pmt_essais WHERE id = ?", (pmt_id,)).fetchone()
        if ex is None:
            raise HTTPException(status_code=404, detail="Essai PMT introuvable.")
        conn.execute(
            """
            UPDATE pmt_essais SET
                date_essai = COALESCE(NULLIF(?, ''), date_essai),
                operateur = COALESCE(NULLIF(?, ''), operateur),
                section_controlee = COALESCE(NULLIF(?, ''), section_controlee),
                observations = COALESCE(NULLIF(?, ''), observations),
                seuil_pmt_min_mm = COALESCE(?, seuil_pmt_min_mm),
                resultats_json = ?,
                norme = COALESCE(NULLIF(?, ''), norme),
                reference_affaire = COALESCE(NULLIF(?, ''), reference_affaire),
                lieu_fabrication = COALESCE(NULLIF(?, ''), lieu_fabrication),
                numero_formule = COALESCE(NULLIF(?, ''), numero_formule),
                conditions_meteorologiques = COALESCE(NULLIF(?, ''), conditions_meteorologiques),
                updated_at = ?
            WHERE id = ?
            """,
            (
                date_essai,
                operateur,
                _clean(meta.get("section_controlee")),
                _clean(meta.get("observations")),
                _as_float(meta.get("criteria_pmt_min")),
                resultats,
                _clean(meta.get("norme")),
                _clean(meta.get("reference_chantier")),
                _clean(meta.get("lieu_fabrication")),
                _clean(meta.get("numero_formule")),
                _clean(meta.get("conditions_meteo")),
                now,
                pmt_id,
            ),
        )
        conn.execute("DELETE FROM pmt_essais_points WHERE pmt_id = ?", (pmt_id,))
        seuil = _as_float(meta.get("criteria_pmt_min"))
        for i, p in enumerate(points_for_json):
            prof = p.get("profondeur_macrotexture_mm")
            position_codes = _normalize_position_codes(p.get("position_codes"))
            position_g = 1 if "G" in position_codes else 0
            position_a = 1 if "A" in position_codes else 0
            position_d = 1 if "D" in position_codes else 0
            conforme = None
            ecart = None
            if isinstance(prof, (int, float)) and isinstance(seuil, (int, float)):
                conforme = 1 if prof >= seuil else 0
                ecart = float(prof) - float(seuil)
            conn.execute(
                """
                INSERT INTO pmt_essais_points (
                    pmt_id, ordre, numero_essai, profil, position, position_g, position_a, position_d, position_codes_json, localisation,
                    diametre_moyen_tache_mm, profondeur_macrotexture_mm, observation,
                    volume_materiau_mm3, seuil_pmt_min_mm, conforme, ecart_au_seuil_mm,
                    donnees_ligne_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pmt_id,
                    i + 1,
                    _clean(p.get("numero_essai")),
                    _clean(p.get("profil")),
                    ",".join(position_codes),
                    position_g,
                    position_a,
                    position_d,
                    json.dumps(position_codes, ensure_ascii=False),
                    "",
                    _as_float(p.get("diametre_moyen_tache_mm")),
                    prof,
                    _clean(p.get("observation")),
                    None,
                    seuil,
                    conforme,
                    ecart,
                    "{}",
                    now,
                ),
            )
        conn.commit()

    with _conn() as conn:
        row = conn.execute("SELECT * FROM pmt_essais WHERE id = ?", (pmt_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Essai PMT introuvable.")
        return _serialize_pmt(conn, pmt_id, row)
