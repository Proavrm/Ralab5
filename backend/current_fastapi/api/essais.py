"""
api/essais.py — RaLab4
Gestion des échantillons + essais laboratoire

GET    /api/essais/echantillons?demande_id=X
GET    /api/essais/echantillons/{uid}
POST   /api/essais/echantillons
PUT    /api/essais/echantillons/{uid}
DELETE /api/essais/echantillons/{uid}

GET    /api/essais?echantillon_id=X
GET    /api/essais/{uid}
POST   /api/essais
PUT    /api/essais/{uid}
DELETE /api/essais/{uid}
"""
from __future__ import annotations
import json
import re, sqlite3
from datetime import date, datetime
from typing import Optional
from app.core.database import ensure_ralab4_schema, get_db_path
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter()
DB_PATH = get_db_path()

STATUTS_ECH = ["Reçu", "En attente", "En cours", "Terminé", "Rejeté"]
TYPES_ESSAI = [
    "Teneur en eau", "Granulométrie", "Limites d'Atterberg", "Proctor",
    "CBR", "Identification GTR", "Masse volumique des enrobés",
    "Extraction de liant", "Contrôle de fabrication enrobés",
    "Compression simple", "Triaxial", "Cisaillement direct",
    "Perméabilité", "Consolidation", "Oedométrique", "Autre",
]
STATUTS_ESSAI = ["Programmé", "En cours", "Terminé", "Annulé"]

INTERVENTION_ESSAI_LABELS = {
    "PMT": "Macrotexture PMT",
    "PLD": "Portances des plates-formes Dynaplaque",
    "DE": "Masse volumique des enrobés",
    "DF": "Déflexion",
    "CFE": "Contrôle de fabrication enrobés",
    "SO": "Coupe de sondage",
    "SC": "Coupe de sondage carotté",
}


class EchantillonCreate(BaseModel):
    demande_id: int
    prelevement_id: Optional[int] = Field(None)
    intervention_reelle_id: Optional[int] = Field(None)
    designation: str = Field("")
    profondeur_haut: Optional[float] = Field(None)
    profondeur_bas: Optional[float] = Field(None)
    date_prelevement: Optional[date] = Field(None)
    localisation: str = Field("")
    statut: str = Field("Reçu")
    date_reception_labo: Optional[date] = Field(None)
    observations: str = Field("")


class EchantillonUpdate(BaseModel):
    prelevement_id: Optional[int] = None
    intervention_reelle_id: Optional[int] = None
    designation: Optional[str] = None
    profondeur_haut: Optional[float] = None
    profondeur_bas: Optional[float] = None
    date_prelevement: Optional[date] = None
    localisation: Optional[str] = None
    statut: Optional[str] = None
    date_reception_labo: Optional[date] = None
    observations: Optional[str] = None


class EssaiCreate(BaseModel):
    echantillon_id: Optional[int] = Field(None)
    intervention_id: Optional[int] = Field(None)
    essai_code: str = Field("")
    type_essai: str = Field("")
    norme: str = Field("")
    statut: str = Field("Programmé")
    date_debut: Optional[date] = Field(None)
    date_fin: Optional[date] = Field(None)
    resultats: str = Field("{}")
    operateur: str = Field("")
    observations: str = Field("")
    source_signature: str = Field("")
    source_label: str = Field("")


class EssaiUpdate(BaseModel):
    essai_code: Optional[str] = None
    type_essai: Optional[str] = None
    norme: Optional[str] = None
    statut: Optional[str] = None
    date_debut: Optional[date] = None
    date_fin: Optional[date] = None
    resultats: Optional[str] = None
    operateur: Optional[str] = None
    observations: Optional[str] = None
    source_label: Optional[str] = None


def _conn():
    ensure_ralab4_schema(DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    _ensure_essais_result_columns(conn)
    return conn


def _get_prelevement_row(conn: sqlite3.Connection, prelevement_id: Optional[int]):
    if not prelevement_id:
        return None
    return conn.execute(
        "SELECT id, demande_id, intervention_reelle_id, date_prelevement, zone FROM prelevements WHERE id = ?",
        (prelevement_id,),
    ).fetchone()


def _get_intervention_reelle_row(conn: sqlite3.Connection, intervention_reelle_id: Optional[int]):
    if not intervention_reelle_id:
        return None
    return conn.execute(
        "SELECT id, demande_id, date_intervention, zone FROM interventions_reelles WHERE id = ?",
        (intervention_reelle_id,),
    ).fetchone()


def _get_intervention_row(conn: sqlite3.Connection, intervention_id: Optional[int]):
    if not intervention_id:
        return None
    return conn.execute(
        """
        SELECT
            i.id,
            i.demande_id,
            i.reference,
            i.type_intervention,
            i.sujet,
            i.date_intervention,
            i.technicien,
            i.observations,
            d.reference AS demande_reference,
            a.reference AS affaire_reference,
            a.client AS client,
            a.chantier AS chantier,
            a.site AS site
        FROM interventions i
        JOIN demandes d ON d.id = i.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        WHERE i.id = ?
        """,
        (intervention_id,),
    ).fetchone()


def _resolve_echantillon_links(
    conn: sqlite3.Connection,
    demande_id: int,
    prelevement_id: Optional[int],
    intervention_reelle_id: Optional[int],
):
    linked_prelevement_id = int(prelevement_id) if prelevement_id else None
    linked_intervention_reelle_id = int(intervention_reelle_id) if intervention_reelle_id else None

    linked_prelevement = _get_prelevement_row(conn, linked_prelevement_id)
    if linked_prelevement_id and not linked_prelevement:
        raise HTTPException(404, f"Prélèvement #{linked_prelevement_id} introuvable")
    if linked_prelevement and linked_prelevement["demande_id"] not in (None, demande_id):
        raise HTTPException(400, "Le prélèvement sélectionné appartient à une autre demande")

    if linked_prelevement:
        derived_intervention_reelle_id = linked_prelevement["intervention_reelle_id"]
        if (
            linked_intervention_reelle_id
            and derived_intervention_reelle_id
            and linked_intervention_reelle_id != derived_intervention_reelle_id
        ):
            raise HTTPException(400, "Le prélèvement et l'intervention sélectionnés ne correspondent pas")
        linked_intervention_reelle_id = derived_intervention_reelle_id

    linked_intervention_reelle = _get_intervention_reelle_row(conn, linked_intervention_reelle_id)
    if linked_intervention_reelle_id and not linked_intervention_reelle:
        raise HTTPException(404, f"Intervention #{linked_intervention_reelle_id} introuvable")
    if linked_intervention_reelle and linked_intervention_reelle["demande_id"] not in (None, demande_id):
        raise HTTPException(400, "L'intervention sélectionnée appartient à une autre demande")

    return (
        linked_prelevement_id,
        linked_prelevement,
        linked_intervention_reelle_id,
        linked_intervention_reelle,
    )


def _ensure_essais_result_columns(conn: sqlite3.Connection) -> None:
    cols = {str(r["name"]) for r in conn.execute("PRAGMA table_info(essais)").fetchall()}
    if "resultat_principal" not in cols:
        conn.execute("ALTER TABLE essais ADD COLUMN resultat_principal REAL")
    if "resultat_unite" not in cols:
        conn.execute("ALTER TABLE essais ADD COLUMN resultat_unite TEXT NOT NULL DEFAULT ''")
    if "resultat_label" not in cols:
        conn.execute("ALTER TABLE essais ADD COLUMN resultat_label TEXT NOT NULL DEFAULT ''")


def _safe_parse_results(raw):
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return raw
    value = raw
    for _ in range(3):
        if not isinstance(value, str):
            break
        s = value.strip()
        if not s:
            return {}
        try:
            value = json.loads(s)
        except Exception:
            break
    return value if isinstance(value, dict) else {}


def _safe_parse_json_text(raw):
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return {}
    text = raw.strip()
    if not text.startswith("{"):
        return {}
    try:
        payload = json.loads(text)
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _to_float(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        x = float(v)
        return None if x != x else x
    s = str(v).strip().replace(",", ".")
    try:
        return float(s)
    except Exception:
        m = re.search(r"-?\d+(?:\.\d+)?", s)
        if not m:
            return None
        try:
            return float(m.group(0))
        except Exception:
            return None


def _first_float(*values):
    for value in values:
        parsed = _to_float(value)
        if parsed is not None:
            return parsed
    return None


def _average_defined(values):
    cleaned = [float(value) for value in values if value is not None]
    if not cleaned:
        return None
    return sum(cleaned) / len(cleaned)


def _extract_echantillon_observation_text(raw) -> str:
    if not isinstance(raw, str):
        return ""
    payload = _safe_parse_json_text(raw)
    if not payload:
        return raw
    for key in ("notes", "notes_terrain", "observations_text", "text"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _extract_echantillon_temperature(raw) -> Optional[float]:
    payload = _safe_parse_json_text(raw)
    if not payload:
        return None
    for key in ("temperature_prelevement_c", "temperature_enrobes_c", "temperature_c"):
        value = _to_float(payload.get(key))
        if value is not None:
            return value
    return None


def _get_echantillon_temperature(conn: sqlite3.Connection, echantillon_id: Optional[int]) -> Optional[float]:
    if not echantillon_id:
        return None
    row = conn.execute(
        "SELECT observations FROM echantillons WHERE id = ?",
        (echantillon_id,),
    ).fetchone()
    if not row:
        return None
    return _extract_echantillon_temperature(row["observations"])


def _get_sibling_result_payload(
    conn: sqlite3.Connection,
    echantillon_id: Optional[int],
    essai_id: Optional[int],
    codes: set[str],
    type_fragments: tuple[str, ...] = (),
):
    payloads = _get_sibling_result_payloads(conn, echantillon_id, essai_id, codes, type_fragments)
    return payloads[0] if payloads else None


def _get_sibling_result_payloads(
    conn: sqlite3.Connection,
    echantillon_id: Optional[int],
    essai_id: Optional[int],
    codes: set[str],
    type_fragments: tuple[str, ...] = (),
):
    if not echantillon_id:
        return []
    rows = conn.execute(
        """
        SELECT id, essai_code, type_essai, resultats
        FROM essais
        WHERE echantillon_id = ?
          AND (? IS NULL OR id <> ?)
        ORDER BY id ASC
        """,
        (echantillon_id, essai_id, essai_id),
    ).fetchall()
    payloads = []
    for row in rows:
        code = str(row["essai_code"] or "").upper()
        typ = str(row["type_essai"] or "").lower()
        if code in codes or any(fragment in typ for fragment in type_fragments):
            payload = _safe_parse_results(row["resultats"])
            if payload:
                payloads.append(payload)
    return payloads


def _extract_liant_metrics(resultats_raw):
    r = _safe_parse_results(resultats_raw)
    moyenne = r.get("moyenne") if isinstance(r.get("moyenne"), dict) else {}
    return {
        "binder": _first_float(r.get("teneur_liant_percent"), moyenne.get("teneur_liant_percent")),
        "binder_ext": _first_float(r.get("teneur_liant_ext_percent"), moyenne.get("teneur_liant_ext_percent")),
        "richness": _first_float(r.get("module_richesse"), moyenne.get("module_richesse")),
        "richness_ext": _first_float(r.get("module_richesse_ext"), moyenne.get("module_richesse_ext")),
    }


def _calc_coeff_vbs_from_gr_resultats(resultats_raw) -> Optional[float]:
    r = _safe_parse_results(resultats_raw)
    ms = _to_float(r.get("ms"))
    tamis = r.get("tamis") if isinstance(r.get("tamis"), list) else []
    if ms is None or ms <= 0 or not tamis:
        return _to_float(r.get("coeff_vbs"))

    rc = 0.0
    p5 = None
    p50 = None
    sortable = []
    for t in tamis:
        if not isinstance(t, dict):
            continue
        d = _to_float(t.get("d"))
        if d is None:
            continue
        sortable.append({"d": d, "r": _to_float(t.get("r")) or 0.0})

    for t in sorted(sortable, key=lambda x: x["d"], reverse=True):
        rc += t["r"]
        passant = max(0.0, 100.0 - ((rc / ms) * 100.0))
        if abs(t["d"] - 5.0) < 1e-9:
            p5 = passant
        if abs(t["d"] - 50.0) < 1e-9:
            p50 = passant

    if p5 is None or p50 is None or p50 <= 0:
        return _to_float(r.get("coeff_vbs"))
    return round(p5 / p50, 3)


def _get_coeff_vbs_from_sibling_gr(conn: sqlite3.Connection, echantillon_id: Optional[int], essai_id: Optional[int]) -> Optional[float]:
    if not echantillon_id:
        return None
    rows = conn.execute(
        """
        SELECT id, resultats
        FROM essais
        WHERE echantillon_id = ?
          AND UPPER(COALESCE(essai_code, '')) = 'GR'
          AND (? IS NULL OR id <> ?)
        ORDER BY id ASC
        """,
        (echantillon_id, essai_id, essai_id),
    ).fetchall()
    for row in rows:
        coeff = _calc_coeff_vbs_from_gr_resultats(row["resultats"])
        if coeff is not None:
            return coeff
    return None


def _calc_mb_value_from_resultats(resultats_raw, essai_code: str = "") -> tuple[Optional[float], str]:
    r = _safe_parse_results(resultats_raw)
    code = str(essai_code or "").upper()
    material = str(r.get("type_materiau") or "").lower()
    is_mbf = code == "MBF" or material == "mbf_0_0125"
    label = "MBF" if is_mbf else "MB"
    value = _to_float(r.get("mbf" if is_mbf else "mb"))

    if value is None:
        ms = _to_float(r.get("ms"))
        v1 = _to_float(r.get("v1"))
        use_kaolinite = bool(r.get("use_kaolinite"))
        v_prime = _to_float(r.get("v_prime")) if use_kaolinite else 0.0
        if ms is not None and ms > 0 and v1 is not None:
            value = ((v1 - (v_prime or 0.0)) * 10.0) / ms

    return (round(value, 3), label) if value is not None else (None, label)


def _compute_result_summary(
    essai_code: str,
    type_essai: str,
    resultats_raw,
    conn: Optional[sqlite3.Connection] = None,
    echantillon_id: Optional[int] = None,
    essai_id: Optional[int] = None,
) -> tuple[Optional[float], str, str]:
    r = _safe_parse_results(resultats_raw)
    code = str(essai_code or "").upper()
    typ = str(type_essai or "").lower()

    if code == "WE" or "teneur en eau" in typ:
        w = _to_float(r.get("w_moyen"))
        if w is not None:
            return round(w, 2), "%", f"w = {w:.2f} %"
        return None, "", ""

    if code == "GR" or "granulométrie" in typ:
        p80 = _to_float(r.get("passant_80"))
        if p80 is not None:
            return round(p80, 2), "%", f"P80µm = {p80:.2f} %"
        return None, "", ""

    if code in {"MB", "MBF"} or str(r.get("type_materiau") or "").lower() in {"mb_0_2", "mbf_0_0125"}:
        value, label = _calc_mb_value_from_resultats(r, code)
        if value is not None:
            return value, "g/kg", f"{label} = {value:.2f} g/kg"
        return None, "", ""

    is_blue = code in {"VBS", "BM", "VB"} or "bleu" in typ or "vbs" in typ
    if is_blue:
        material = r.get("type_materiau")
        if not material:
            if code == "BM":
                material = "granulats"
            elif code in {"VBS", "VB"}:
                material = "sols"

        vbs_mean = _to_float(r.get("vbs_moyen"))
        vb_mean = _to_float(r.get("vb_moyen"))
        dets = r.get("determinations") if isinstance(r.get("determinations"), list) else []
        vals = []

        if material == "sols":
            coeff = _to_float(r.get("coeff_vbs"))
            if coeff is None and conn is not None:
                coeff = _get_coeff_vbs_from_sibling_gr(conn, echantillon_id, essai_id)
            if coeff is None:
                coeff = 1.0
            w = _to_float(r.get("w"))

            for d in dets:
                if not isinstance(d, dict) or d.get("actif") is False:
                    continue
                v = _to_float(d.get("v_bleu"))
                mh = _to_float(d.get("m_humide"))
                m0 = None
                if mh is not None and w is not None and (100.0 + w) > 0:
                    m0 = (100.0 * mh) / (100.0 + w)
                if m0 is None:
                    m0 = _to_float(d.get("m_seche"))
                if v is not None and m0 is not None and m0 > 0:
                    vals.append((coeff * v) / m0)

        elif material == "granulats":
            for d in dets:
                if not isinstance(d, dict) or d.get("actif") is False:
                    continue
                v = _to_float(d.get("v_bleu"))
                c = _to_float(d.get("c_bleu"))
                m = _to_float(d.get("m_echantillon"))
                if v is not None and c is not None and m is not None and m > 0:
                    vals.append((v * c) / m)

        value = sum(vals) / len(vals) if vals else None
        if value is None:
            value = vbs_mean if vbs_mean is not None else vb_mean

        if value is None:
            return None, "", ""

        unit = "g/kg" if material == "granulats" else "g/100g"
        return round(value, 3), unit, f"VBS = {value:.2f} {unit}"

    if code == "LCP" or "atterberg" in typ:
        wl = _to_float(r.get("wl"))
        wp = _to_float(r.get("wp"))
        ip = _to_float(r.get("ip"))
        if ip is None and wl is not None and wp is not None:
            ip = wl - wp
        if ip is not None:
            return round(ip, 2), "%", f"Ip = {ip:.2f} %"
        if wl is not None:
            return round(wl, 2), "%", f"wL = {wl:.2f} %"
        if wp is not None:
            return round(wp, 2), "%", f"wP = {wp:.2f} %"
        return None, "", ""

    if code == "EL" or ("liant" in typ and "enrob" in typ):
        metrics = _extract_liant_metrics(r)
        binder_ext = metrics["binder_ext"]
        binder = metrics["binder"]
        richness_ext = metrics["richness_ext"]
        richness = metrics["richness"]

        if binder_ext is not None:
            return round(binder_ext, 2), "%", f"Liant ext = {binder_ext:.2f} %"
        if binder is not None:
            return round(binder, 2), "%", f"Liant = {binder:.2f} %"
        if richness_ext is not None:
            return round(richness_ext, 2), "", f"Mr ext = {richness_ext:.2f}"
        if richness is not None:
            return round(richness, 2), "", f"Mr = {richness:.2f}"
        return None, "", ""

    if code == "ID" or "identification" in typ:
        gtr_class = str(r.get("gtr_class") or "").strip()
        gtr_state = str(r.get("gtr_state") or "").strip()
        if gtr_class:
            label = f"GTR = {gtr_class}"
            if gtr_state:
                label += f" ({gtr_state})"
            return None, "", label
        ipi = _to_float(r.get("ipi"))
        if ipi is not None:
            return round(ipi, 2), "%", f"IPI = {ipi:.2f} %"
        vbs = _to_float(r.get("vbs"))
        if vbs is not None:
            return round(vbs, 2), "g/100g", f"VBS = {vbs:.2f} g/100g"
        return None, "", ""

    if code == "MVA" or "masse volumique" in typ:
        density = _to_float(r.get("masse_volumique_eprouvette_kg_m3"))
        if density is not None:
            return round(density, 1), "kg/m3", f"rho = {density:.1f} kg/m3"
        compacite = _to_float(r.get("compacite_percent"))
        if compacite is not None:
            return round(compacite, 2), "%", f"Compacite = {compacite:.2f} %"
        vides = _to_float(r.get("vides_percent"))
        if vides is not None:
            return round(vides, 2), "%", f"Vides = {vides:.2f} %"
        return None, "", ""

    if code == "CFE" or ("fabrication" in typ and "enrob" in typ):
        moyenne = r.get("moyenne") if isinstance(r.get("moyenne"), dict) else {}
        binder_ext = _first_float(moyenne.get("teneur_liant_ext_percent"), r.get("teneur_liant_ext_percent"))
        binder = _first_float(moyenne.get("teneur_liant_percent"), r.get("teneur_liant_percent"))

        temp = _to_float(r.get("temperature_prelevement_c"))
        if temp is None:
            temp = _to_float(moyenne.get("temperature_c"))
        if conn is not None and temp is None:
            temp = _get_echantillon_temperature(conn, echantillon_id)

        if conn is not None:
            liant_payloads = _get_sibling_result_payloads(conn, echantillon_id, essai_id, {"EL"}, ("liant",))
            if liant_payloads:
                sibling_metrics = [_extract_liant_metrics(payload) for payload in liant_payloads]
                averaged_binder_ext = _average_defined(metric["binder_ext"] for metric in sibling_metrics)
                averaged_binder = _average_defined(metric["binder"] for metric in sibling_metrics)
                if averaged_binder_ext is not None:
                    binder_ext = averaged_binder_ext
                if averaged_binder is not None:
                    binder = averaged_binder

        binder_value = binder_ext if binder_ext is not None else binder
        binder_label = "Liant ext" if binder_ext is not None else "Liant"

        if binder_value is not None and temp is not None:
            temp_text = f"{temp:.1f}".rstrip("0").rstrip(".")
            return round(binder_value, 2), "%", f"T = {temp_text} °C · {binder_label} = {binder_value:.2f} %"
        if binder_value is not None:
            return round(binder_value, 2), "%", f"{binder_label} = {binder_value:.2f} %"
        if temp is not None:
            temp_text = f"{temp:.1f}".rstrip("0").rstrip(".")
            return round(temp, 1), "°C", f"T = {temp_text} °C"

        formula_code = str(r.get("formula_code") or "").strip()
        if formula_code:
            return None, "", formula_code
        return None, "", ""

    return None, "", ""


def _backfill_summary_if_missing(conn: sqlite3.Connection, row: sqlite3.Row) -> None:
    rp, ru, rl = _compute_result_summary(
        row["essai_code"],
        row["type_essai"],
        row["resultats"],
        conn=conn,
        echantillon_id=row["echantillon_id"] if "echantillon_id" in row.keys() else None,
        essai_id=row["id"] if "id" in row.keys() else None,
    )
    conn.execute(
        "UPDATE essais SET resultat_principal = ?, resultat_unite = ?, resultat_label = ? WHERE id = ?",
        (rp, ru, rl, row["id"]),
    )


def _enabled_module_codes(conn: sqlite3.Connection, demande_id: int) -> set[str]:
    rows = conn.execute(
        "SELECT module_code FROM demande_enabled_modules WHERE demande_id = ? AND is_enabled = 1",
        (demande_id,),
    ).fetchall()
    return {str(row["module_code"]) for row in rows}


def _echantillons_enabled(conn: sqlite3.Connection, demande_id: int) -> bool:
    enabled_codes = _enabled_module_codes(conn, demande_id)
    return any(code in enabled_codes for code in ("echantillons", "essais_laboratoire"))


def _essais_enabled(conn: sqlite3.Connection, demande_id: int) -> bool:
    return "essais_laboratoire" in _enabled_module_codes(conn, demande_id)


def _terrain_essais_enabled(conn: sqlite3.Connection, demande_id: int) -> bool:
    enabled_codes = _enabled_module_codes(conn, demande_id)
    return "essais_terrain" in enabled_codes or "interventions" in enabled_codes


def _require_echantillons_enabled(conn: sqlite3.Connection, demande_id: int):
    if not _echantillons_enabled(conn, demande_id):
        raise HTTPException(403, "Le module laboratoire / échantillons n'est pas activé sur cette demande")


def _require_essais_enabled(conn: sqlite3.Connection, demande_id: int):
    if not _essais_enabled(conn, demande_id):
        raise HTTPException(403, "Le module Essais laboratoire n'est pas activé sur cette demande")


def _require_terrain_essais_enabled(conn: sqlite3.Connection, demande_id: int):
    if not _terrain_essais_enabled(conn, demande_id):
        raise HTTPException(403, "Le module Essais terrain / in situ n'est pas activé sur cette demande")


def _require_essai_module_for_parent(
    conn: sqlite3.Connection,
    demande_id: int,
    *,
    echantillon_id: Optional[int] = None,
    intervention_id: Optional[int] = None,
):
    if echantillon_id:
        _require_essais_enabled(conn, demande_id)
        return
    if intervention_id:
        _require_terrain_essais_enabled(conn, demande_id)
        return
    raise HTTPException(400, "Parent d'essai introuvable")


def _demande_id_for_echantillon(conn: sqlite3.Connection, uid: int) -> Optional[int]:
    row = conn.execute("SELECT demande_id FROM echantillons WHERE id = ?", (uid,)).fetchone()
    return int(row["demande_id"]) if row else None


def _demande_id_for_essai(conn: sqlite3.Connection, uid: int) -> Optional[int]:
    row = conn.execute(
        """
        SELECT COALESCE(ech.demande_id, i.demande_id) AS demande_id
        FROM essais e
        LEFT JOIN echantillons ech ON ech.id = e.echantillon_id
        LEFT JOIN interventions i ON i.id = e.intervention_id
        WHERE e.id = ?
        """,
        (uid,),
    ).fetchone()
    return int(row["demande_id"]) if row else None


def _demande_id_from_echantillon_id(conn: sqlite3.Connection, echantillon_id: int) -> Optional[int]:
    return _demande_id_for_echantillon(conn, echantillon_id)


def _demande_id_from_intervention_id(conn: sqlite3.Connection, intervention_id: int) -> Optional[int]:
    row = conn.execute("SELECT demande_id FROM interventions WHERE id = ?", (intervention_id,)).fetchone()
    return int(row["demande_id"]) if row else None


def _resolve_essai_parent(conn: sqlite3.Connection, echantillon_id: Optional[int], intervention_id: Optional[int]) -> tuple[str, int, int]:
    if echantillon_id:
        demande_id = _demande_id_from_echantillon_id(conn, int(echantillon_id))
        if demande_id is None:
            raise HTTPException(404, f"Échantillon #{echantillon_id} introuvable")
        return ("echantillon", int(echantillon_id), demande_id)

    if intervention_id:
        demande_id = _demande_id_from_intervention_id(conn, int(intervention_id))
        if demande_id is None:
            raise HTTPException(404, f"Intervention #{intervention_id} introuvable")
        return ("intervention", int(intervention_id), demande_id)

    raise HTTPException(400, "Un essai doit être rattaché à un échantillon ou à une intervention")


def _intervention_import_entries(intervention_row: sqlite3.Row) -> list[dict]:
    observations = _safe_parse_json_text(intervention_row["observations"])
    essai_code = str(observations.get("essai_code") or observations.get("source_essai_code") or "").strip().upper()
    if not essai_code:
        return []

    essai_label = str(
        observations.get("essai_label")
        or INTERVENTION_ESSAI_LABELS.get(essai_code)
        or intervention_row["type_intervention"]
        or intervention_row["sujet"]
        or essai_code
    ).strip()
    payload = observations.get("payload") if isinstance(observations.get("payload"), dict) else {}
    source_candidates = observations.get("source_candidates") if isinstance(observations.get("source_candidates"), list) else []
    source_sheets = payload.get("source_sheets") if isinstance(payload.get("source_sheets"), list) else []

    entries: list[dict] = []
    if source_candidates:
        for index, item in enumerate(source_candidates, start=1):
            if not isinstance(item, dict):
                continue
            source_label = str(item.get("sample_local_ref") or item.get("sheet_name") or f"Source {index}").strip()
            signature = "|".join([
                str(item.get("file_hash") or "").strip(),
                str(item.get("sheet_name") or "").strip(),
                str(item.get("sample_local_ref") or "").strip(),
            ]).strip("|") or f"{intervention_row['id']}|{essai_code}|{index}"
            entries.append(
                {
                    "essai_code": essai_code,
                    "type_essai": essai_label,
                    "source_signature": signature,
                    "source_label": source_label,
                    "date_debut": item.get("date_essai") or item.get("date_prelevement") or item.get("date_mise_en_oeuvre") or intervention_row["date_intervention"],
                    "operateur": intervention_row["technicien"],
                    "resultats": json.dumps(payload if len(source_candidates) == 1 else {}, ensure_ascii=False),
                    "observations": json.dumps(
                        {
                            "import_context": {
                                "kind": "intervention_import",
                                "essai_code": essai_code,
                                "essai_label": essai_label,
                                "source_label": source_label,
                                "source_signature": signature,
                                "source_candidate": item,
                                "intervention_id": int(intervention_row["id"]),
                                "intervention_reference": str(intervention_row["reference"] or ""),
                                "grouped_payload": payload if len(source_candidates) == 1 else {},
                                "group_source_count": len(source_candidates),
                            }
                        },
                        ensure_ascii=False,
                    ),
                }
            )

    elif source_sheets:
        for index, sheet_name in enumerate(source_sheets, start=1):
            source_label = str(sheet_name or f"Source {index}").strip()
            signature = f"{intervention_row['id']}|{essai_code}|sheet|{source_label}"
            entries.append(
                {
                    "essai_code": essai_code,
                    "type_essai": essai_label,
                    "source_signature": signature,
                    "source_label": source_label,
                    "date_debut": intervention_row["date_intervention"],
                    "operateur": intervention_row["technicien"],
                    "resultats": json.dumps(payload if len(source_sheets) == 1 else {}, ensure_ascii=False),
                    "observations": json.dumps(
                        {
                            "import_context": {
                                "kind": "intervention_import",
                                "essai_code": essai_code,
                                "essai_label": essai_label,
                                "source_label": source_label,
                                "source_signature": signature,
                                "sheet_name": source_label,
                                "intervention_id": int(intervention_row["id"]),
                                "intervention_reference": str(intervention_row["reference"] or ""),
                                "grouped_payload": payload if len(source_sheets) == 1 else {},
                                "group_source_count": len(source_sheets),
                            }
                        },
                        ensure_ascii=False,
                    ),
                }
            )

    else:
        source_label = str(observations.get("sheet_name") or essai_label or essai_code).strip()
        signature = f"{intervention_row['id']}|{essai_code}|single|{source_label}"
        entries.append(
            {
                "essai_code": essai_code,
                "type_essai": essai_label,
                "source_signature": signature,
                "source_label": source_label,
                "date_debut": intervention_row["date_intervention"],
                "operateur": intervention_row["technicien"],
                "resultats": json.dumps(payload, ensure_ascii=False),
                "observations": json.dumps(
                    {
                        "import_context": {
                            "kind": "intervention_import",
                            "essai_code": essai_code,
                            "essai_label": essai_label,
                            "source_label": source_label,
                            "source_signature": signature,
                            "intervention_id": int(intervention_row["id"]),
                            "intervention_reference": str(intervention_row["reference"] or ""),
                            "grouped_payload": payload,
                            "group_source_count": 1,
                        }
                    },
                    ensure_ascii=False,
                ),
            }
        )

    return entries


def _next_ech_ref(conn, demande_id: int) -> tuple[str, int, str, int]:
    row = conn.execute("SELECT annee, labo_code FROM demandes WHERE id = ?", (demande_id,)).fetchone()
    annee = row["annee"] if row else datetime.now().year
    labo = row["labo_code"] if row else "SP"
    prefix = f"{annee}-{labo}-E"
    rows = conn.execute("SELECT reference FROM echantillons WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
    nums = []
    for row in rows:
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", row[0])
        if match:
            nums.append(int(match.group(1)))
    number = max(nums, default=0) + 1
    return f"{prefix}{number:04d}", annee, labo, number


def _row(row) -> dict:
    data = dict(row)
    data["uid"] = data.pop("id")
    is_essai_row = "echantillon_id" in data or "type_essai" in data

    data["essai_code"] = data.get("essai_code") or ""
    has_persisted_essai_code = bool(str(data["essai_code"]).strip())
    data["code_essai"] = data["essai_code"]
    data["essai_label"] = ""
    data["nature"] = data.get("nature") or ""
    data["date_display"] = ""

    observations = data.get("observations") or ""
    data["observations_text"] = _extract_echantillon_observation_text(observations)
    data["temperature_prelevement_c"] = _extract_echantillon_temperature(observations)
    if is_essai_row and isinstance(observations, str) and observations.strip().startswith("{"):
        try:
            payload = json.loads(observations)
            signature = str(payload.get("signature") or "")

            essai_code = str(
                payload.get("source_essai_code")
                or payload.get("essai_code")
                or payload.get("code_essai")
                or ""
            ).strip()
            if not essai_code:
                match = re.search(r"(^|\|)CODE=([^|]+)", signature)
                if match:
                    essai_code = match.group(2).strip()

            essai_label = str(
                payload.get("essai_label")
                or payload.get("libelle")
                or payload.get("label")
                or ""
            ).strip()

            nature = str(
                payload.get("nature_materiau")
                or payload.get("nature")
                or ""
            ).strip()

            if essai_code and not has_persisted_essai_code:
                data["essai_code"] = essai_code
                data["code_essai"] = essai_code

            if essai_label:
                data["essai_label"] = essai_label

            if nature and not data.get("nature"):
                data["nature"] = nature
        except Exception:
            pass

    # Echantillons display helper
    date_prelevement = data.get("date_prelevement") or ""
    date_reception_labo = data.get("date_reception_labo") or ""
    if date_reception_labo and date_prelevement:
        data["date_display"] = f"{date_reception_labo} / {date_prelevement}"
    else:
        data["date_display"] = date_reception_labo or date_prelevement or data.get("date") or ""

    # Essais reference fallback
    if ("echantillon_id" in data or "type_essai" in data) and not data.get("reference"):
        data["reference"] = f"ESSAI-{data['uid']:04d}"

    if is_essai_row:
        parent_kind = "echantillon" if data.get("echantillon_id") else "intervention" if data.get("intervention_id") else ""
        data["parent_kind"] = parent_kind
        data["source_signature"] = data.get("source_signature") or ""
        data["source_label"] = data.get("source_label") or ""
        data["intervention_ref"] = data.get("intervention_ref") or data.get("intervention_reference") or ""
        data["intervention_reference"] = data["intervention_ref"]
        data["intervention_subject"] = data.get("intervention_subject") or data.get("intervention_sujet") or ""
        data["intervention_type"] = data.get("intervention_type") or ""

        if not data.get("type_essai") and data.get("essai_code"):
            data["type_essai"] = INTERVENTION_ESSAI_LABELS.get(str(data.get("essai_code") or "").upper(), data.get("essai_code"))

    return data


def _sync_intervention_essais(conn: sqlite3.Connection, intervention_id: int) -> list[dict]:
    intervention = _get_intervention_row(conn, intervention_id)
    if not intervention:
        raise HTTPException(404, f"Intervention #{intervention_id} introuvable")
    _require_terrain_essais_enabled(conn, int(intervention["demande_id"]))

    entries = _intervention_import_entries(intervention)
    if not entries:
        return []

    existing_rows = conn.execute(
        "SELECT id, source_signature, resultats FROM essais WHERE intervention_id = ? ORDER BY id",
        (intervention_id,),
    ).fetchall()
    existing_by_signature = {str(row["source_signature"] or ""): row for row in existing_rows if str(row["source_signature"] or "").strip()}
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    for entry in entries:
        existing = existing_by_signature.get(entry["source_signature"])
        rp, ru, rl = _compute_result_summary(
            entry["essai_code"],
            entry["type_essai"],
            entry["resultats"],
            conn=conn,
            echantillon_id=None,
            essai_id=int(existing["id"]) if existing else None,
        )

        if existing is None:
            conn.execute(
                """
                INSERT INTO essais (
                    echantillon_id, intervention_id, essai_code, type_essai, norme, statut, date_debut, date_fin,
                    resultats, operateur, observations, source_signature, source_label,
                    resultat_principal, resultat_unite, resultat_label, created_at, updated_at
                ) VALUES (?, ?, ?, ?, '', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    None,
                    intervention_id,
                    entry["essai_code"],
                    entry["type_essai"],
                    "Programmé",
                    entry["date_debut"],
                    entry["resultats"],
                    entry["operateur"],
                    entry["observations"],
                    entry["source_signature"],
                    entry["source_label"],
                    rp,
                    ru,
                    rl,
                    now,
                    now,
                ),
            )
            continue

        existing_resultats = str(existing["resultats"] or "").strip()
        next_resultats = entry["resultats"] if not existing_resultats or existing_resultats == "{}" else existing_resultats
        rp, ru, rl = _compute_result_summary(
            entry["essai_code"],
            entry["type_essai"],
            next_resultats,
            conn=conn,
            echantillon_id=None,
            essai_id=int(existing["id"]),
        )
        conn.execute(
            """
            UPDATE essais
            SET intervention_id = ?, essai_code = ?, type_essai = ?, date_debut = COALESCE(NULLIF(date_debut, ''), ?),
                operateur = COALESCE(NULLIF(operateur, ''), ?), observations = ?, source_label = ?,
                resultats = ?, resultat_principal = ?, resultat_unite = ?, resultat_label = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                intervention_id,
                entry["essai_code"],
                entry["type_essai"],
                entry["date_debut"],
                entry["operateur"],
                entry["observations"],
                entry["source_label"],
                next_resultats,
                rp,
                ru,
                rl,
                now,
                int(existing["id"]),
            ),
        )

    conn.commit()
    rows = conn.execute(
        "SELECT id FROM essais WHERE intervention_id = ? ORDER BY COALESCE(date_debut, created_at), id",
        (intervention_id,),
    ).fetchall()
    return [get_essai(int(row["id"])) for row in rows]


@router.post("/interventions/{intervention_id}/sync")
def sync_intervention_essais(intervention_id: int):
    with _conn() as conn:
        return _sync_intervention_essais(conn, intervention_id)


def _fmt(value):
    if value is None:
        return None
    if isinstance(value, date):
        return value.isoformat()
    return value


@router.get("/echantillons")
def list_echantillons(
    demande_id: Optional[int] = Query(None),
    intervention_reelle_id: Optional[int] = Query(None),
    annee: Optional[int] = Query(None),
    labo_code: Optional[str] = Query(None),
    statut: Optional[str] = Query(None),
):
    sql = """
        SELECT
            ech.*,
            d.id AS demande_id,
            d.reference AS demande_ref,
            d.reference AS demande_reference,
            d.affaire_rst_id AS affaire_rst_id,
            a.reference AS affaire_ref,
            a.reference AS affaire_reference,
            a.client AS client,
            a.chantier AS chantier,
            a.site AS site,
            COALESCE((SELECT COUNT(*) FROM essais es WHERE es.echantillon_id = ech.id), 0) AS essai_count,
            p.reference AS prelevement_reference,
            ir.reference AS intervention_reelle_reference,
            ir.type_intervention AS intervention_reelle_type
        FROM echantillons ech
        JOIN demandes d ON d.id = ech.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        LEFT JOIN prelevements p ON p.id = ech.prelevement_id
        LEFT JOIN interventions_reelles ir ON ir.id = ech.intervention_reelle_id
        WHERE 1=1
    """
    params = []
    with _conn() as conn:
        if demande_id and not _echantillons_enabled(conn, demande_id):
            return []
        if demande_id:
            sql += " AND ech.demande_id = ?"
            params.append(demande_id)
        else:
            sql += """
                AND EXISTS (
                    SELECT 1
                    FROM demande_enabled_modules dem
                    WHERE dem.demande_id = ech.demande_id
                      AND dem.is_enabled = 1
                      AND dem.module_code IN ('echantillons', 'essais_laboratoire')
                )
            """
        if intervention_reelle_id is not None:
            sql += " AND ech.intervention_reelle_id = ?"
            params.append(intervention_reelle_id)
        if annee is not None:
            sql += " AND substr(COALESCE(ech.date_prelevement, ''), 1, 4) = ?"
            params.append(str(annee))
        if labo_code:
            sql += " AND ech.labo_code = ?"
            params.append(labo_code)
        if statut:
            sql += " AND ech.statut = ?"
            params.append(statut)
        sql += " ORDER BY ech.date_prelevement DESC, ech.id DESC"
        rows = conn.execute(sql, params).fetchall()
    return [_row(row) for row in rows]



@router.get("/echantillons/{uid}")
def get_echantillon(uid: int):
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT
                ech.*,
                d.id AS demande_id,
                d.reference AS demande_ref,
                d.reference AS demande_reference,
                d.affaire_rst_id AS affaire_rst_id,
                a.reference AS affaire_ref,
                a.reference AS affaire_reference,
                a.client AS client,
                a.chantier AS chantier,
                a.site AS site,
                COALESCE((SELECT COUNT(*) FROM essais es WHERE es.echantillon_id = ech.id), 0) AS essai_count,
                p.reference AS prelevement_reference,
                ir.reference AS intervention_reelle_reference,
                ir.type_intervention AS intervention_reelle_type
            FROM echantillons ech
            JOIN demandes d ON d.id = ech.demande_id
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            LEFT JOIN prelevements p ON p.id = ech.prelevement_id
            LEFT JOIN interventions_reelles ir ON ir.id = ech.intervention_reelle_id
            WHERE ech.id = ?
            """,
            (uid,),
        ).fetchone()
        if not row:
            raise HTTPException(404, f"Échantillon #{uid} introuvable")
        _require_echantillons_enabled(conn, int(row["demande_id"]))
    return _row(row)



@router.post("/echantillons", status_code=201)
def create_echantillon(body: EchantillonCreate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _conn() as conn:
        _require_echantillons_enabled(conn, body.demande_id)
        (
            linked_prelevement_id,
            linked_prelevement,
            linked_intervention_reelle_id,
            linked_intervention_reelle,
        ) = _resolve_echantillon_links(
            conn,
            body.demande_id,
            body.prelevement_id,
            body.intervention_reelle_id,
        )

        ref, annee, labo, numero = _next_ech_ref(conn, body.demande_id)
        conn.execute(
            """
            INSERT INTO echantillons
            (reference,annee,labo_code,numero,demande_id,prelevement_id,intervention_reelle_id,
             designation,profondeur_haut,profondeur_bas,date_prelevement,
             localisation,statut,date_reception_labo,observations,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                ref, annee, labo, numero, body.demande_id, linked_prelevement_id, linked_intervention_reelle_id,
                body.designation, body.profondeur_haut, body.profondeur_bas,
                _fmt(body.date_prelevement)
                or (linked_prelevement["date_prelevement"] if linked_prelevement else None)
                or (linked_intervention_reelle["date_intervention"] if linked_intervention_reelle else None),
                body.localisation
                or (linked_prelevement["zone"] if linked_prelevement else "")
                or (linked_intervention_reelle["zone"] if linked_intervention_reelle else ""),
                body.statut,
                _fmt(body.date_reception_labo), body.observations, now, now,
            ),
        )
        uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return get_echantillon(int(uid))


@router.put("/echantillons/{uid}")
def update_echantillon(uid: int, body: EchantillonUpdate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    fields = {key: value for key, value in body.model_dump().items() if value is not None}
    for key in ("date_prelevement", "date_reception_labo"):
        if key in fields and isinstance(fields[key], date):
            fields[key] = fields[key].isoformat()
    fields["updated_at"] = now
    with _conn() as conn:
        demande_id = _demande_id_for_echantillon(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Échantillon #{uid} introuvable")
        _require_echantillons_enabled(conn, demande_id)

        if "prelevement_id" in fields or "intervention_reelle_id" in fields:
            current = conn.execute(
                "SELECT prelevement_id, intervention_reelle_id FROM echantillons WHERE id = ?",
                (uid,),
            ).fetchone()
            requested_prelevement_id = fields.get(
                "prelevement_id",
                current["prelevement_id"] if current else None,
            )
            requested_intervention_reelle_id = fields.get(
                "intervention_reelle_id",
                current["intervention_reelle_id"] if current else None,
            )
            (
                linked_prelevement_id,
                linked_prelevement,
                linked_intervention_reelle_id,
                _linked_intervention_reelle,
            ) = _resolve_echantillon_links(
                conn,
                demande_id,
                requested_prelevement_id,
                requested_intervention_reelle_id,
            )
            fields["prelevement_id"] = linked_prelevement_id
            fields["intervention_reelle_id"] = linked_intervention_reelle_id

        clause = ", ".join(f"{key} = ?" for key in fields)
        conn.execute(f"UPDATE echantillons SET {clause} WHERE id = ?", list(fields.values()) + [uid])
    return get_echantillon(uid)


@router.delete("/echantillons/{uid}", status_code=204)
def delete_echantillon(uid: int):
    with _conn() as conn:
        demande_id = _demande_id_for_echantillon(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Échantillon #{uid} introuvable")
        _require_echantillons_enabled(conn, demande_id)
        cur = conn.execute("DELETE FROM echantillons WHERE id = ?", (uid,))
    if not cur.rowcount:
        raise HTTPException(404, f"Échantillon #{uid} introuvable")


@router.get("/meta")
def meta():
    return {"types_essai": TYPES_ESSAI, "statuts_ech": STATUTS_ECH, "statuts_essai": STATUTS_ESSAI}


@router.get("")
def list_essais(
    echantillon_id: Optional[int] = Query(None),
    intervention_id: Optional[int] = Query(None),
    annee: Optional[int] = Query(None),
    labo_code: Optional[str] = Query(None),
    statut: Optional[str] = Query(None),
):
    sql = """
        SELECT
            e.*,
            ech.id AS echantillon_id,
            ech.reference AS ech_ref,
            ech.reference AS echantillon_reference,
            ech.designation,
            i.id AS intervention_id,
            i.reference AS intervention_ref,
            i.reference AS intervention_reference,
            i.sujet AS intervention_subject,
            i.type_intervention AS intervention_type,
            i.date_intervention,
            COALESCE(ech.labo_code, d.labo_code) AS labo_code,
            d.id AS demande_id,
            d.reference AS demande_ref,
            d.reference AS demande_reference,
            d.affaire_rst_id AS affaire_rst_id,
            a.reference AS affaire_ref,
            a.reference AS affaire_reference,
            a.client AS client,
            a.chantier AS chantier,
            a.site AS site
        FROM essais e
        LEFT JOIN echantillons ech ON ech.id = e.echantillon_id
        LEFT JOIN interventions i ON i.id = e.intervention_id
        JOIN demandes d ON d.id = COALESCE(ech.demande_id, i.demande_id)
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        WHERE 1=1
    """
    params = []
    with _conn() as conn:
        if echantillon_id:
            demande_id = _demande_id_from_echantillon_id(conn, echantillon_id)
            if demande_id is not None and not _essais_enabled(conn, demande_id):
                return []
            sql += " AND e.echantillon_id = ?"
            params.append(echantillon_id)
        if intervention_id:
            demande_id = _demande_id_from_intervention_id(conn, intervention_id)
            if demande_id is not None and not _terrain_essais_enabled(conn, demande_id):
                return []
            sql += " AND e.intervention_id = ?"
            params.append(intervention_id)
        if annee is not None:
            sql += " AND substr(COALESCE(e.date_debut, e.date_fin, ''), 1, 4) = ?"
            params.append(str(annee))
        if labo_code:
            sql += " AND COALESCE(ech.labo_code, d.labo_code) = ?"
            params.append(labo_code)
        if statut:
            sql += " AND e.statut = ?"
            params.append(statut)
        sql += " ORDER BY e.id ASC"
        rows = conn.execute(sql, params).fetchall()
        items = []
        for row in rows:
            _backfill_summary_if_missing(conn, row)
            data = dict(row)
            rp, ru, rl = _compute_result_summary(
                data.get("essai_code"),
                data.get("type_essai"),
                data.get("resultats"),
                conn=conn,
                echantillon_id=data.get("echantillon_id"),
                essai_id=data.get("id"),
            )
            data["resultat_principal"] = rp
            data["resultat_unite"] = ru
            data["resultat_label"] = rl
            items.append(_row(data))
        if rows:
            conn.commit()
    return items



@router.get("/{uid}")
def get_essai(uid: int):
    with _conn() as conn:
        row = conn.execute(
            """
            SELECT
                e.*,
                ech.id AS echantillon_id,
                ech.reference AS ech_ref,
                ech.reference AS echantillon_reference,
                ech.designation,
                i.id AS intervention_id,
                i.reference AS intervention_ref,
                i.reference AS intervention_reference,
                i.sujet AS intervention_subject,
                i.type_intervention AS intervention_type,
                i.date_intervention,
                COALESCE(ech.labo_code, d.labo_code) AS labo_code,
                d.id AS demande_id,
                d.reference AS demande_ref,
                d.reference AS demande_reference,
                d.affaire_rst_id AS affaire_rst_id,
                a.reference AS affaire_ref,
                a.reference AS affaire_reference,
                a.client AS client,
                a.chantier AS chantier,
                a.site AS site
            FROM essais e
            LEFT JOIN echantillons ech ON ech.id = e.echantillon_id
            LEFT JOIN interventions i ON i.id = e.intervention_id
            JOIN demandes d ON d.id = COALESCE(ech.demande_id, i.demande_id)
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            WHERE e.id = ?
            """,
            (uid,),
        ).fetchone()
        if not row:
            raise HTTPException(404, f"Essai #{uid} introuvable")
        _backfill_summary_if_missing(conn, row)
        conn.commit()
        demande_id = _demande_id_for_essai(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Essai #{uid} introuvable")
        _require_essai_module_for_parent(conn, demande_id, echantillon_id=row["echantillon_id"], intervention_id=row["intervention_id"])
        data = dict(row)
        rp, ru, rl = _compute_result_summary(
            data.get("essai_code"),
            data.get("type_essai"),
            data.get("resultats"),
            conn=conn,
            echantillon_id=data.get("echantillon_id"),
            essai_id=data.get("id"),
        )
        data["resultat_principal"] = rp
        data["resultat_unite"] = ru
        data["resultat_label"] = rl
    return _row(data)



@router.post("", status_code=201)
def create_essai(body: EssaiCreate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _conn() as conn:
        parent_kind, parent_id, demande_id = _resolve_essai_parent(conn, body.echantillon_id, body.intervention_id)
        _require_essai_module_for_parent(
            conn,
            demande_id,
            echantillon_id=parent_id if parent_kind == "echantillon" else None,
            intervention_id=parent_id if parent_kind == "intervention" else None,
        )
        rp, ru, rl = _compute_result_summary(
            body.essai_code,
            body.type_essai,
            body.resultats,
            conn=conn,
            echantillon_id=body.echantillon_id,
            essai_id=None,
        )
        conn.execute(
            """
            INSERT INTO essais
            (echantillon_id,intervention_id,essai_code,type_essai,norme,statut,date_debut,date_fin,
             resultats,operateur,observations,source_signature,source_label,
             resultat_principal,resultat_unite,resultat_label,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                body.echantillon_id, body.intervention_id, body.essai_code, body.type_essai, body.norme, body.statut,
                _fmt(body.date_debut), _fmt(body.date_fin),
                body.resultats, body.operateur, body.observations, body.source_signature, body.source_label,
                rp, ru, rl, now, now,
            ),
        )
        uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    return get_essai(int(uid))


@router.put("/{uid}")
def update_essai(uid: int, body: EssaiUpdate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    fields = body.model_dump(exclude_unset=True)
    for key in ("date_debut", "date_fin"):
        if key in fields and isinstance(fields[key], date):
            fields[key] = fields[key].isoformat()
    fields["updated_at"] = now
    with _conn() as conn:
        current = conn.execute("SELECT essai_code, type_essai, resultats, echantillon_id, intervention_id FROM essais WHERE id = ?", (uid,)).fetchone()
        if not current:
            raise HTTPException(404, f"Essai #{uid} introuvable")
        essai_code = fields.get("essai_code", current["essai_code"])
        type_essai = fields.get("type_essai", current["type_essai"])
        resultats_raw = fields.get("resultats", current["resultats"])
        rp, ru, rl = _compute_result_summary(
            essai_code,
            type_essai,
            resultats_raw,
            conn=conn,
            echantillon_id=current["echantillon_id"],
            essai_id=uid,
        )
        fields["resultat_principal"] = rp
        fields["resultat_unite"] = ru
        fields["resultat_label"] = rl

        clause = ", ".join(f"{key} = ?" for key in fields)
        demande_id = _demande_id_for_essai(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Essai #{uid} introuvable")
        _require_essai_module_for_parent(conn, demande_id, echantillon_id=current["echantillon_id"], intervention_id=current["intervention_id"])
        conn.execute(f"UPDATE essais SET {clause} WHERE id = ?", list(fields.values()) + [uid])
    return get_essai(uid)


@router.delete("/{uid}", status_code=204)
def delete_essai(uid: int):
    with _conn() as conn:
        demande_id = _demande_id_for_essai(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Essai #{uid} introuvable")
        current = conn.execute("SELECT echantillon_id, intervention_id FROM essais WHERE id = ?", (uid,)).fetchone()
        if not current:
            raise HTTPException(404, f"Essai #{uid} introuvable")
        _require_essai_module_for_parent(conn, demande_id, echantillon_id=current["echantillon_id"], intervention_id=current["intervention_id"])
        cur = conn.execute("DELETE FROM essais WHERE id = ?", (uid,))
    if not cur.rowcount:
        raise HTTPException(404, f"Essai #{uid} introuvable")
