"""
reconcile_rebuilt_lab_history.py
Create a cleaned copy of the current RaLab database by reconciling it with the
rebuilt 2025-2026 laboratory database.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.database import ensure_ralab4_schema


DATA_DIR = PROJECT_ROOT / "data"
DEFAULT_SOURCE_DB = DATA_DIR / "ralab3.db"
DEFAULT_REBUILT_DB = DATA_DIR / "ralab_rebuilt_2025_2026_v1.db"
DEFAULT_OUTPUT_DB = DATA_DIR / f"ralab3_reconciled_{datetime.now().strftime('%Y%m%d')}.db"
UI_FORM_CODES = {"WE", "GR", "EL", "CFE", "VBS", "BM", "MB", "MBF", "LCP", "PN", "IPI", "IM", "CBRI", "CBR", "ID", "MVA"}
UI_FORM_EQUIVALENTS = {
    "IM": "CBRI",
}
KNOWN_CODES = {
    "WE": "Teneur en eau",
    "EL": "Extraction de liant",
    "ID": "Identification",
    "LCP": "Limites d'Atterberg",
    "IPI - PR": "Proctor / IPI",
    "IM": "CBRi",
    "CFE": "Controle de fabrication enrobes",
    "SC": "Coupe de sondage carotte",
    "SO": "Coupes de sondages",
    "DE": "Densites enrobes",
    "DF": "Deflexion",
    "MVA": "Masse volumique des enrobes",
    "PMT": "Mesure de la profondeur de macrotexture",
    "PLD": "Portances des plates-formes Dynaplaque",
    "SOL": "Analyses pollution",
    "FTP": "Fiche technique produit",
}
ASPHALT_SAMPLE_CODES = {"CFE", "DE", "DF", "EL", "GR", "MVA", "PMT"}
SOIL_SAMPLE_CODES = {"BM", "CBR", "CBRI", "ID", "IM", "IPI", "LCP", "MB", "MBF", "PN", "VBS", "WE"}


@dataclass(slots=True)
class Paths:
    source_db: Path
    rebuilt_db: Path
    output_db: Path
    report_json: Path
    report_md: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create a reconciled RaLab database copy from the current and rebuilt databases."
    )
    parser.add_argument("--source-db", default=str(DEFAULT_SOURCE_DB), help="Current RaLab database")
    parser.add_argument("--rebuilt-db", default=str(DEFAULT_REBUILT_DB), help="Rebuilt 2025-2026 database")
    parser.add_argument("--output-db", default=str(DEFAULT_OUTPUT_DB), help="Output reconciled database copy")
    parser.add_argument("--force", action="store_true", help="Overwrite output and report files if they already exist")
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Apply the reconciliation directly to --source-db. Requires --output-db to match --source-db.",
    )
    return parser.parse_args()


def build_paths(args: argparse.Namespace) -> Paths:
    output_db = Path(args.output_db).expanduser().resolve()
    report_json = output_db.with_suffix(".report.json")
    report_md = output_db.with_suffix(".report.md")
    return Paths(
        source_db=Path(args.source_db).expanduser().resolve(),
        rebuilt_db=Path(args.rebuilt_db).expanduser().resolve(),
        output_db=output_db,
        report_json=report_json,
        report_md=report_md,
    )


def assert_paths(paths: Paths, force: bool, in_place: bool) -> None:
    for db_path in (paths.source_db, paths.rebuilt_db):
        if not db_path.exists():
            raise FileNotFoundError(f"Missing database: {db_path}")
    if in_place and paths.output_db != paths.source_db:
        raise ValueError("--in-place requires --output-db to match --source-db exactly.")
    checked_paths = (paths.report_json, paths.report_md) if in_place else (paths.output_db, paths.report_json, paths.report_md)
    for path in checked_paths:
        if path.exists() and not force:
            raise FileExistsError(f"Path already exists, use --force to overwrite: {path}")


def copy_database(source_db: Path, output_db: Path, force: bool, in_place: bool) -> None:
    if in_place and source_db == output_db:
        return
    output_db.parent.mkdir(parents=True, exist_ok=True)
    if output_db.exists():
        if not force:
            raise FileExistsError(f"Output database already exists: {output_db}")
        output_db.unlink()
    with sqlite3.connect(source_db) as src_conn, sqlite3.connect(output_db) as dst_conn:
        src_conn.backup(dst_conn)


def connect_db(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def fetch_rows(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
    return conn.execute(sql, params).fetchall()


def fetch_reference_id_map(conn: sqlite3.Connection, table_name: str) -> dict[str, int]:
    rows = fetch_rows(conn, f"SELECT id, reference FROM {table_name} WHERE COALESCE(reference, '') <> ''")
    return {str(row["reference"]): int(row["id"]) for row in rows}


def fetch_demande_ref_by_id(conn: sqlite3.Connection) -> dict[int, str]:
    rows = fetch_rows(conn, "SELECT id, reference FROM demandes")
    return {int(row["id"]): str(row["reference"]) for row in rows}


def to_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_json_dict(raw_value: Any) -> dict[str, Any]:
    if isinstance(raw_value, dict):
        return raw_value
    text = str(raw_value or "").strip()
    if not text.startswith("{"):
        return {}
    try:
        payload = json.loads(text)
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def normalize_essai_code(raw_value: str) -> str:
    code = re.sub(r"\s+", " ", str(raw_value or "").strip()).upper()
    if not code:
        return ""
    if re.fullmatch(r"IPI\s*[-/]?\s*PR", code, re.IGNORECASE):
        return "IPI - PR"
    if code == "MVE":
        return "MVA"
    if re.fullmatch(r"DE(?:\s+N[°ºO]?\s*\d+)?", code, re.IGNORECASE):
        return "DE"
    return code


def extract_essai_code(observations: Any) -> str:
    if not isinstance(observations, str):
        return ""
    raw = observations.strip()
    if not raw:
        return ""
    payload: dict[str, Any] | None = None
    if raw.startswith("{"):
        try:
            maybe_payload = json.loads(raw)
        except Exception:
            maybe_payload = None
        if isinstance(maybe_payload, dict):
            payload = maybe_payload
    if payload:
        for key in ("essai_code", "code_essai", "source_essai_code"):
            value = normalize_essai_code(str(payload.get(key) or ""))
            if value:
                return value
        signature = str(payload.get("signature") or "")
        match = re.search(r"(?:^|\|)CODE=([^|]+)", signature)
        if match:
            return normalize_essai_code(match.group(1))
    match = re.search(r"(?:^|\|)CODE=([^|]+)", raw)
    if match:
        return normalize_essai_code(match.group(1))
    return ""


def choose_essai_code_from_type(type_essai: str) -> str:
    normalized = str(type_essai or "").strip().lower()
    mapping = {
        "teneur en eau": "WE",
        "teneur en eau naturelle": "WE",
        "identification": "ID",
        "granulometrie d'identification": "ID",
        "classification gtr": "ID",
        "parametres d'identification": "ID",
        "limites d'atterberg": "LCP",
        "extraction de liant": "EL",
        "controle de fabrication enrobes": "CFE",
        "proctor / ipi": "IPI - PR",
        "cbri": "IM",
        "masse volumique des enrobes": "MVA",
        "granulometrie": "GR",
        "bleu de methylene (sols)": "VBS",
        "valeur au bleu 0/2mm": "MB",
        "proctor normal": "PN",
        "ipi - indice portant immediat": "IPI",
    }
    ascii_key = (
        normalized.replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
        .replace("à", "a")
        .replace("î", "i")
        .replace("ï", "i")
        .replace("ô", "o")
        .replace("ù", "u")
    )
    return mapping.get(ascii_key, "")


def normalize_resultats_payload(essai_code: str, resultats_raw: str) -> tuple[str, bool]:
    code = normalize_essai_code(essai_code)
    payload = parse_json_dict(resultats_raw)
    if not payload:
        return resultats_raw, False

    changed = False
    if code == "LCP":
        for key in ("wp", "wnat"):
            value = payload.get(key)
            if isinstance(value, (int, float)) and 0 < float(value) <= 1:
                payload[key] = round(float(value) * 100, 6)
                changed = True

    if not changed:
        return resultats_raw, False
    return json.dumps(payload, ensure_ascii=False), True


def round_float(value: Any, digits: int) -> float | None:
    number = to_float(value)
    if number is None:
        return None
    return round(number, digits)


def build_ipi_pr_split_payloads(source_payload: dict[str, Any], pn_essai_id: int) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    raw_series = source_payload.get("series")
    if not isinstance(raw_series, list):
        return None, None

    pn_points: list[dict[str, Any]] = []
    ipi_tests: list[dict[str, Any]] = []
    for index, item in enumerate(raw_series, start=1):
        if not isinstance(item, dict):
            continue
        water_percent = round_float(item.get("w_essai"), 3)
        rho_d = round_float(item.get("rho_d"), 3)
        ipi_value = round_float(item.get("ipi"), 1)
        if water_percent is None and rho_d is None and ipi_value is None:
            continue

        pn_points.append(
            {
                "id": index,
                "actif": True,
                "moule_ref": "",
                "m_moule": "",
                "v_moule": "",
                "w": water_percent if water_percent is not None else "",
                "m1": "",
                "m2": "",
                "m3": "",
                "m_tot": "",
                "rho_d": rho_d,
            }
        )
        ipi_tests.append(
            {
                "id": index,
                "actif": True,
                "pn_point_id": str(index),
                "pn_point_w": water_percent,
                "pn_point_rho_d": rho_d,
                "moule_ref": "",
                "delta0": 0,
                "anneau_ref": "",
                "facteur_k": None,
                "mode_saisie": "kn",
                "lectures": [],
                "cbr25": None,
                "cbr50": None,
                "cbr25c": None,
                "cbr50c": None,
                "ipiRaw": ipi_value,
                "ipiCorr": ipi_value,
                "ipi": ipi_value,
                "controlling": None,
                "f_kn": None,
            }
        )

    if not pn_points:
        return None, None

    natural_water_percent = round_float(source_payload.get("natural_water_percent"), 3)
    opn_rho_d = round_float(source_payload.get("opn_rho_d"), 3)
    opn_water_percent = round_float(source_payload.get("opn_water_percent"), 3)
    global_ipi = max((test["ipi"] for test in ipi_tests if test.get("ipi") is not None), default=None)

    pn_payload = {
        "historical_mode": "result_only",
        "source_essai_code": "IPI - PR",
        "natural_water_percent": natural_water_percent,
        "moule_preset": "grand_cbr",
        "moule_ref": "",
        "m_moule": "",
        "v_moule": "2131",
        "gs_fin": "2.70",
        "gs_gros": "2.65",
        "type_proctor": "normal",
        "points": pn_points,
        "wOPN": opn_water_percent,
        "rho_d_OPN": opn_rho_d,
        "wOPN_corr": None,
        "rho_d_OPN_corr": None,
    }
    ipi_payload = {
        "mode": "IPI",
        "historical_mode": "result_only",
        "source_essai_code": "IPI - PR",
        "natural_water_percent": natural_water_percent,
        "opn_rho_d": opn_rho_d,
        "opn_water_percent": opn_water_percent,
        "pn_uid": str(pn_essai_id),
        "tests": ipi_tests,
        "ipi": global_ipi,
    }
    return pn_payload, ipi_payload


def extract_year_from_text(value: Any) -> int:
    match = re.search(r"(20\d{2})", str(value or ""))
    return int(match.group(1)) if match else datetime.now().year


def next_echantillon_reference(conn: sqlite3.Connection, year_value: int, labo_code: str = "SP") -> tuple[str, int]:
    prefix = f"{year_value}-{labo_code}-E"
    rows = fetch_rows(conn, "SELECT reference FROM echantillons WHERE reference LIKE ?", (f"{prefix}%",))
    numbers: list[int] = []
    for row in rows:
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", str(row["reference"] or ""))
        if match:
            numbers.append(int(match.group(1)))
    number = max(numbers, default=0) + 1
    return f"{prefix}{number:04d}", number


def next_reference(conn: sqlite3.Connection, table_name: str, prefix: str) -> str:
    rows = fetch_rows(conn, f"SELECT reference FROM {table_name} WHERE reference LIKE ?", (f"{prefix}%",))
    numbers: list[int] = []
    for row in rows:
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", str(row["reference"] or ""))
        if match:
            numbers.append(int(match.group(1)))
    return f"{prefix}{max(numbers, default=0) + 1:04d}"


def pick_first_text(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def normalize_spaces(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def split_subject_parts(value: Any) -> list[str]:
    return [part for part in (normalize_spaces(item) for item in str(value or "").split("/")) if part]


def normalize_year_value(raw_value: str) -> int | None:
    text = str(raw_value or "").strip()
    if not text:
        return None
    try:
        value = int(text)
    except ValueError:
        return None
    if value < 100:
        return 2000 + value
    return value


def build_iso_date(year_value: Any, month_value: Any, day_value: Any) -> str:
    year_number = normalize_year_value(str(year_value or ""))
    month_number = to_float(month_value)
    day_number = to_float(day_value)
    if year_number is None or month_number is None or day_number is None:
        return ""
    month_int = int(month_number)
    day_int = int(day_number)
    if month_int < 1 or month_int > 12 or day_int < 1 or day_int > 31:
        return ""
    return f"{year_number:04d}-{month_int:02d}-{day_int:02d}"


def canonicalize_legacy_raw_date(raw_value: Any) -> str:
    text = normalize_spaces(raw_value)
    if not text:
        return ""
    if re.fullmatch(r"20\d{2}-\d{2}-\d{2}", text):
        return text

    match = re.search(r"(\d{1,2})/(\d{1,2})\s+et\s+(\d{1,2})/(\d{1,2})/(\d{2,4})", text)
    if match:
        return build_iso_date(match.group(5), match.group(4), match.group(3))

    match = re.search(r"(\d{1,2})\s+et\s+(\d{1,2})/(\d{1,2})/(\d{2,4})", text)
    if match:
        return build_iso_date(match.group(4), match.group(3), match.group(2))

    match = re.search(r"(\d{1,2})[-/](\d{1,2})/(\d{1,2})/(\d{2,4})", text)
    if match:
        return build_iso_date(match.group(4), match.group(3), match.group(1))

    match = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", text)
    if match:
        return build_iso_date(match.group(3), match.group(2), match.group(1))

    match = re.search(r"(\d{1,2})-(\d{1,2})-(\d{2,4})", text)
    if match:
        return build_iso_date(match.group(3), match.group(2), match.group(1))

    return ""


def normalize_cache_token(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]+", "-", str(value or "").upper()).strip("-")


def merge_comment(current: Any, addition: str) -> str:
    base = normalize_spaces(current)
    extra = normalize_spaces(addition)
    if not extra:
        return base
    if not base:
        return extra
    if extra in base:
        return base
    return f"{base} | {extra}"


def get_raw_intervention_observations_payload(raw_row: sqlite3.Row) -> tuple[dict[str, Any], dict[str, Any]]:
    observations_payload = parse_json_dict(raw_row["observations"])
    payload = observations_payload.get("payload") if isinstance(observations_payload.get("payload"), dict) else {}
    return observations_payload, payload


def infer_legacy_raw_nature(essai_code: str) -> str:
    mapping = {
        "DE": "Essai terrain",
        "CFE": "Intervention",
        "PLD": "Essai terrain",
        "PMT": "Essai terrain",
        "DF": "Essai terrain",
        "SC": "Sondage",
        "SO": "Sondage",
    }
    return mapping.get(essai_code, "")


def infer_legacy_raw_route(essai_code: str) -> str:
    if essai_code in {"DE", "CFE", "PLD", "PMT", "DF", "SC", "SO"}:
        return "direct"
    return ""


def infer_legacy_raw_intervention_type(
    raw_row: sqlite3.Row,
    essai_code: str,
) -> str:
    if essai_code == "DE":
        return pick_first_text(raw_row["type_intervention"], "Contrôle densité enrobés")
    if essai_code == "DF":
        return "Essai terrain groupé"
    return pick_first_text(raw_row["type_intervention"])


def infer_legacy_raw_intervention_zone(
    raw_row: sqlite3.Row,
    observations_payload: dict[str, Any],
    payload: dict[str, Any],
    essai_code: str,
) -> str:
    subject_parts = split_subject_parts(raw_row["sujet"])
    if essai_code == "DE":
        return pick_first_text(payload.get("section_controlee"), subject_parts[0] if subject_parts else "", raw_row["sujet"])
    if essai_code == "CFE":
        return pick_first_text(payload.get("destination"), payload.get("section_controlee"), subject_parts[0] if subject_parts else "", raw_row["sujet"])
    if essai_code == "PLD":
        combined = " / ".join(
            [value for value in [normalize_spaces(payload.get("partie_ouvrage")), normalize_spaces(payload.get("nature_materiau"))] if value]
        )
        return pick_first_text(raw_row["sujet"], combined, observations_payload.get("sheet_name"), raw_row["reference"])
    if essai_code == "PMT":
        return pick_first_text(payload.get("section_controlee"), subject_parts[0] if subject_parts else "", raw_row["sujet"], observations_payload.get("sheet_name"))
    if essai_code in {"SC", "SO"}:
        return pick_first_text(raw_row["sujet"], observations_payload.get("sheet_name"), raw_row["reference"])
    if essai_code == "DF":
        return pick_first_text(raw_row["sujet"], observations_payload.get("sheet_name"), raw_row["reference"])
    return pick_first_text(raw_row["sujet"], observations_payload.get("sheet_name"), raw_row["reference"])


def infer_legacy_raw_finalite(raw_row: sqlite3.Row, payload: dict[str, Any], essai_code: str) -> str:
    subject_parts = split_subject_parts(raw_row["sujet"])
    if essai_code == "DE":
        return pick_first_text(payload.get("couche"), subject_parts[1] if len(subject_parts) >= 2 else "")
    if essai_code == "CFE":
        return pick_first_text(payload.get("couche"), subject_parts[-1] if len(subject_parts) >= 2 else "")
    return ""


def infer_legacy_raw_prelevement_material(raw_row: sqlite3.Row, payload: dict[str, Any]) -> str:
    subject_parts = split_subject_parts(raw_row["sujet"])
    return pick_first_text(
        payload.get("nature_produit"),
        payload.get("appellation_francaise"),
        payload.get("appellation_europeenne"),
        subject_parts[2] if len(subject_parts) >= 3 else "",
        raw_row["sujet"],
    )


def build_legacy_raw_intervention_cache_key(
    raw_row: sqlite3.Row,
    essai_code: str,
    canonical_date: str,
    zone_value: str,
    finalite_value: str,
) -> tuple[int, str, str, str, str]:
    return (
        int(raw_row["demande_id"]),
        normalize_cache_token(canonical_date or raw_row["date_intervention"]),
        normalize_cache_token(infer_legacy_raw_intervention_type(raw_row, essai_code)),
        normalize_cache_token(zone_value),
        normalize_cache_token(finalite_value),
    )


def find_or_create_legacy_intervention_reelle(
    output_conn: sqlite3.Connection,
    raw_row: sqlite3.Row,
    essai_code: str,
    observations_payload: dict[str, Any],
    payload: dict[str, Any],
    now: str,
    cache: dict[tuple[int, str, str, str, str], int],
) -> tuple[int, bool, str, str, str]:
    canonical_date = canonicalize_legacy_raw_date(raw_row["date_intervention"])
    type_intervention = infer_legacy_raw_intervention_type(raw_row, essai_code)
    zone_value = infer_legacy_raw_intervention_zone(raw_row, observations_payload, payload, essai_code)
    finalite_value = infer_legacy_raw_finalite(raw_row, payload, essai_code)
    cache_key = build_legacy_raw_intervention_cache_key(raw_row, essai_code, canonical_date, zone_value, finalite_value)
    cached_id = cache.get(cache_key)
    if cached_id is not None:
        return cached_id, False, canonical_date, zone_value, finalite_value

    existing = output_conn.execute(
        """
        SELECT id
        FROM interventions_reelles
        WHERE demande_id = ?
          AND COALESCE(date_intervention, '') = ?
          AND COALESCE(type_intervention, '') = ?
          AND COALESCE(zone, '') = ?
          AND COALESCE(finalite, '') = ?
        ORDER BY id ASC
        LIMIT 1
        """,
        (
            int(raw_row["demande_id"]),
            canonical_date,
            type_intervention,
            zone_value,
            finalite_value,
        ),
    ).fetchone()
    if existing:
        new_id = int(existing["id"])
        cache[cache_key] = new_id
        return new_id, False, canonical_date, zone_value, finalite_value

    source_year = extract_year_from_text(canonical_date or raw_row["date_intervention"] or raw_row["reference"])
    reference = next_reference(output_conn, "interventions_reelles", f"{source_year}-RA-INT")
    cursor = output_conn.execute(
        """
        INSERT INTO interventions_reelles (
            reference, demande_id, source_year, date_intervention, type_intervention,
            zone, technicien, finalite, notes, statut, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reference,
            int(raw_row["demande_id"]),
            source_year,
            canonical_date,
            type_intervention,
            zone_value,
            raw_row["technicien"] or "",
            finalite_value,
            f"Auto-created from raw intervention {raw_row['reference']} via legacy historical backfill ({essai_code})",
            "Préparée",
            raw_row["created_at"] or now,
            now,
        ),
    )
    new_id = int(cursor.lastrowid)
    cache[cache_key] = new_id
    return new_id, True, canonical_date, zone_value, finalite_value


def find_or_create_legacy_prelevement(
    output_conn: sqlite3.Connection,
    raw_row: sqlite3.Row,
    intervention_reelle_id: int,
    canonical_date: str,
    zone_value: str,
    finalite_value: str,
    payload: dict[str, Any],
    now: str,
) -> tuple[int, bool, str]:
    unique_note = f"Auto-created from raw intervention {raw_row['reference']} via legacy historical backfill (DE)"
    existing = output_conn.execute(
        """
        SELECT id
        FROM prelevements
        WHERE COALESCE(notes, '') = ?
        LIMIT 1
        """,
        (unique_note,),
    ).fetchone()
    material_value = infer_legacy_raw_prelevement_material(raw_row, payload)
    if existing:
        prelevement_id = int(existing["id"])
        output_conn.execute(
            "UPDATE prelevements SET intervention_reelle_id = ?, updated_at = ? WHERE id = ?",
            (intervention_reelle_id, now, prelevement_id),
        )
        return prelevement_id, False, material_value

    source_year = extract_year_from_text(canonical_date or raw_row["date_intervention"] or raw_row["reference"])
    reference = next_reference(output_conn, "prelevements", f"{source_year}-RA-PRL")
    cursor = output_conn.execute(
        """
        INSERT INTO prelevements (
            reference, demande_id, intervention_reelle_id, source_year, date_prelevement,
            zone, materiau, technicien, finalite, notes, statut, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reference,
            int(raw_row["demande_id"]),
            intervention_reelle_id,
            source_year,
            canonical_date,
            zone_value,
            material_value,
            raw_row["technicien"] or "",
            finalite_value,
            unique_note,
            "Préparé",
            raw_row["created_at"] or now,
            now,
        ),
    )
    return int(cursor.lastrowid), True, material_value


def repair_legacy_de_as_terrain(output_conn: sqlite3.Connection) -> dict[str, Any]:
    stats = Counter()
    preview: list[dict[str, Any]] = []
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rows = fetch_rows(
        output_conn,
        """
        SELECT
            p.id AS prelevement_id,
            p.reference AS prelevement_reference,
            p.intervention_reelle_id AS prelevement_intervention_reelle_id,
            i.id AS raw_id,
            i.reference AS raw_reference,
            i.demande_id,
            i.type_intervention,
            i.sujet,
            i.date_intervention,
            i.technicien,
            i.observations,
            i.created_at,
            i.tri_comment,
            i.nature_reelle,
            i.intervention_reelle_id AS raw_intervention_reelle_id
        FROM prelevements p
        JOIN interventions i ON i.prelevement_id = p.id
        WHERE NOT EXISTS (
            SELECT 1
            FROM echantillons e
            WHERE e.prelevement_id = p.id
        )
        ORDER BY p.id, i.id
        """,
    )

    grouped_rows: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for row in rows:
        grouped_rows[int(row["prelevement_id"])].append(row)

    for prelevement_id, linked_rows in grouped_rows.items():
        essai_codes = {extract_essai_code(row["observations"]) for row in linked_rows}
        if essai_codes != {"DE"}:
            continue

        reclassified_refs: list[str] = []
        deleted_reference = str(linked_rows[0]["prelevement_reference"] or "")

        for row in linked_rows:
            intervention_reelle_id = None
            if row["raw_intervention_reelle_id"] not in (None, 0):
                intervention_reelle_id = int(row["raw_intervention_reelle_id"])
            elif row["prelevement_intervention_reelle_id"] not in (None, 0):
                intervention_reelle_id = int(row["prelevement_intervention_reelle_id"])

            if intervention_reelle_id is None:
                observations_payload, payload = get_raw_intervention_observations_payload(row)
                intervention_reelle_id, created_intervention, _canonical_date, _zone_value, _finalite_value = find_or_create_legacy_intervention_reelle(
                    output_conn,
                    row,
                    "DE",
                    observations_payload,
                    payload,
                    now,
                    {},
                )
                if created_intervention:
                    stats["legacy_de_interventions_reelles_created"] += 1

            output_conn.execute(
                "UPDATE interventions_reelles SET type_intervention = ?, updated_at = ? WHERE id = ?",
                (
                    infer_legacy_raw_intervention_type(row, "DE"),
                    now,
                    intervention_reelle_id,
                ),
            )

            tri_comment = merge_comment(row["tri_comment"], "Legacy DE reclassified as Essai terrain")
            output_conn.execute(
                """
                UPDATE interventions
                SET nature_reelle = ?,
                    prelevement_id = NULL,
                    intervention_reelle_id = ?,
                    tri_comment = ?,
                    tri_updated_at = ?
                WHERE id = ?
                """,
                (
                    "Essai terrain",
                    intervention_reelle_id,
                    tri_comment,
                    now,
                    int(row["raw_id"]),
                ),
            )
            stats["legacy_de_rows_reclassified"] += 1
            reclassified_refs.append(str(row["raw_reference"] or ""))

        output_conn.execute("DELETE FROM prelevements WHERE id = ?", (prelevement_id,))
        stats["legacy_de_prelevements_deleted"] += 1
        preview.append(
            {
                "prelevement_reference": deleted_reference,
                "raw_references": reclassified_refs,
            }
        )

    return {
        "stats": dict(stats),
        "preview": preview[:100],
        "total": len(preview),
    }


def backfill_legacy_raw_interventions(output_conn: sqlite3.Connection) -> dict[str, Any]:
    stats = Counter()
    unresolved: list[dict[str, Any]] = []
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    intervention_cache: dict[tuple[int, str, str, str, str], int] = {}
    rows = fetch_rows(
        output_conn,
        """
        SELECT id, reference, demande_id, type_intervention, sujet, date_intervention,
               technicien, observations, created_at, tri_comment,
               nature_reelle, prelevement_id, intervention_reelle_id
        FROM interventions
        WHERE COALESCE(nature_reelle, '') = ''
          AND COALESCE(prelevement_id, 0) = 0
          AND COALESCE(intervention_reelle_id, 0) = 0
        ORDER BY id
        """,
    )

    for row in rows:
        essai_code = extract_essai_code(row["observations"])
        route = infer_legacy_raw_route(essai_code)
        desired_nature = infer_legacy_raw_nature(essai_code)
        if not route or not desired_nature:
            stats["unresolved"] += 1
            unresolved.append(
                {
                    "reference": str(row["reference"] or ""),
                    "type_intervention": str(row["type_intervention"] or ""),
                    "date_intervention": str(row["date_intervention"] or ""),
                    "essai_code": essai_code,
                    "reason": "unsupported_or_missing_essai_code",
                }
            )
            continue

        observations_payload, payload = get_raw_intervention_observations_payload(row)
        intervention_reelle_id, created_intervention, canonical_date, zone_value, finalite_value = find_or_create_legacy_intervention_reelle(
            output_conn,
            row,
            essai_code,
            observations_payload,
            payload,
            now,
            intervention_cache,
        )
        if created_intervention:
            stats["legacy_interventions_reelles_created"] += 1

        prelevement_id = None
        if route == "via_prelevement":
            prelevement_id, created_prelevement, _material_value = find_or_create_legacy_prelevement(
                output_conn,
                row,
                intervention_reelle_id,
                canonical_date,
                zone_value,
                finalite_value,
                payload,
                now,
            )
            if created_prelevement:
                stats["legacy_prelevements_created"] += 1

        tri_comment = merge_comment(
            row["tri_comment"],
            f"Legacy historical auto-backfill via essai_code {essai_code}",
        )
        output_conn.execute(
            """
            UPDATE interventions
            SET nature_reelle = ?,
                prelevement_id = ?,
                intervention_reelle_id = ?,
                tri_comment = ?,
                tri_updated_at = ?
            WHERE id = ?
            """,
            (
                desired_nature,
                prelevement_id,
                intervention_reelle_id,
                tri_comment,
                now,
                int(row["id"]),
            ),
        )
        stats["legacy_rows_updated"] += 1
        stats[f"legacy_rows_updated_{essai_code}"] += 1

    return {
        "stats": dict(stats),
        "unresolved_preview": unresolved[:100],
        "unresolved_total": len(unresolved),
    }


def get_echantillon_observations_payload(echantillon_row: sqlite3.Row) -> dict[str, Any]:
    return parse_json_dict(echantillon_row["observations"])


def get_echantillon_sample_local_ref(echantillon_row: sqlite3.Row, observations_payload: dict[str, Any]) -> str:
    return pick_first_text(
        observations_payload.get("sample_local_ref"),
        echantillon_row["designation"],
        echantillon_row["reference"],
    )


def get_echantillon_source_code(observations_payload: dict[str, Any]) -> str:
    return normalize_essai_code(
        str(
            observations_payload.get("source_essai_code")
            or observations_payload.get("essai_code")
            or observations_payload.get("code_essai")
            or ""
        )
    )


def get_parent_intervention_observations_payload(parent_row: sqlite3.Row | None) -> tuple[dict[str, Any], dict[str, Any]]:
    if not parent_row:
        return {}, {}
    observations_payload = parse_json_dict(parent_row["observations"])
    payload = observations_payload.get("payload") if isinstance(observations_payload.get("payload"), dict) else {}
    return observations_payload, payload


def infer_echantillon_intervention_type(
    echantillon_row: sqlite3.Row,
    observations_payload: dict[str, Any],
    parent_row: sqlite3.Row | None = None,
) -> str:
    if parent_row:
        parent_type = pick_first_text(parent_row["type_intervention"])
        if parent_type:
            return parent_type

    sample_local_ref = get_echantillon_sample_local_ref(echantillon_row, observations_payload)
    compact_ref = sample_local_ref.upper().replace(" ", "")
    source_code = get_echantillon_source_code(observations_payload)

    if compact_ref.startswith("SC"):
        return "Suivi carottages"
    if compact_ref.startswith("SO") or re.fullmatch(r"S\d+.*", compact_ref):
        return "Reconnaissance geotechnique"
    if source_code == "CFE":
        return "Controle fabrication enrobes"
    if source_code in ASPHALT_SAMPLE_CODES:
        return "Suivi carottages"
    if source_code in SOIL_SAMPLE_CODES:
        return "Reconnaissance geotechnique"
    return "Campagne prelevements labo"


def infer_echantillon_intervention_zone(
    echantillon_row: sqlite3.Row,
    observations_payload: dict[str, Any],
    parent_row: sqlite3.Row | None = None,
) -> str:
    parent_observations_payload, parent_payload = get_parent_intervention_observations_payload(parent_row)
    return pick_first_text(
        echantillon_row["localisation"],
        parent_observations_payload.get("zone_intervention"),
        parent_payload.get("lieu_fabrication"),
        parent_payload.get("section_controlee"),
        get_echantillon_sample_local_ref(echantillon_row, observations_payload),
    )


def infer_echantillon_prelevement_zone(echantillon_row: sqlite3.Row, observations_payload: dict[str, Any]) -> str:
    return pick_first_text(
        observations_payload.get("sample_local_ref"),
        echantillon_row["designation"],
        echantillon_row["localisation"],
        echantillon_row["reference"],
    )


def infer_echantillon_material(
    echantillon_row: sqlite3.Row,
    observations_payload: dict[str, Any],
    parent_row: sqlite3.Row | None = None,
) -> str:
    parent_observations_payload, parent_payload = get_parent_intervention_observations_payload(parent_row)
    return pick_first_text(
        observations_payload.get("nature_materiau"),
        parent_observations_payload.get("nature_materiau"),
        parent_payload.get("nature_produit"),
        parent_payload.get("appellation_francaise"),
        parent_payload.get("appellation_europeenne"),
        echantillon_row["designation"],
    )


def infer_echantillon_finalite(
    echantillon_row: sqlite3.Row,
    observations_payload: dict[str, Any],
    parent_row: sqlite3.Row | None = None,
) -> str:
    parent_observations_payload, _parent_payload = get_parent_intervention_observations_payload(parent_row)
    return pick_first_text(
        parent_observations_payload.get("finalite_intervention"),
        observations_payload.get("source_essai_code"),
        observations_payload.get("sheet_name"),
        echantillon_row["designation"],
    )


def build_echantillon_intervention_cache_key(
    echantillon_row: sqlite3.Row,
    observations_payload: dict[str, Any],
    parent_row: sqlite3.Row | None = None,
) -> tuple[int, str, str, str]:
    date_value = pick_first_text(parent_row["date_intervention"] if parent_row else "", echantillon_row["date_prelevement"])
    type_intervention = infer_echantillon_intervention_type(echantillon_row, observations_payload, parent_row)
    zone_value = infer_echantillon_intervention_zone(echantillon_row, observations_payload, parent_row)
    return (
        int(echantillon_row["demande_id"]),
        normalize_cache_token(date_value),
        normalize_cache_token(type_intervention),
        normalize_cache_token(zone_value),
    )


def build_echantillon_prelevement_cache_key(
    echantillon_row: sqlite3.Row,
    observations_payload: dict[str, Any],
    intervention_reelle_id: int | None,
    parent_row: sqlite3.Row | None = None,
) -> tuple[int, int, str, str, str]:
    date_value = pick_first_text(parent_row["date_intervention"] if parent_row else "", echantillon_row["date_prelevement"])
    prelevement_zone = infer_echantillon_prelevement_zone(echantillon_row, observations_payload)
    material = infer_echantillon_material(echantillon_row, observations_payload, parent_row)
    return (
        int(echantillon_row["demande_id"]),
        int(intervention_reelle_id or 0),
        normalize_cache_token(date_value),
        normalize_cache_token(prelevement_zone),
        normalize_cache_token(material),
    )


def find_or_create_intervention_reelle_for_echantillon(
    output_conn: sqlite3.Connection,
    echantillon_row: sqlite3.Row,
    observations_payload: dict[str, Any],
    parent_row: sqlite3.Row | None,
    now: str,
    cache: dict[tuple[int, str, str, str], int],
) -> tuple[int, bool]:
    cache_key = build_echantillon_intervention_cache_key(echantillon_row, observations_payload, parent_row)
    cached_id = cache.get(cache_key)
    if cached_id is not None:
        return cached_id, False

    date_value = pick_first_text(parent_row["date_intervention"] if parent_row else "", echantillon_row["date_prelevement"])
    type_intervention = infer_echantillon_intervention_type(echantillon_row, observations_payload, parent_row)
    zone_value = infer_echantillon_intervention_zone(echantillon_row, observations_payload, parent_row)
    demande_id = int(echantillon_row["demande_id"])

    existing = output_conn.execute(
        """
        SELECT id
        FROM interventions_reelles
        WHERE demande_id = ?
          AND COALESCE(date_intervention, '') = ?
          AND COALESCE(type_intervention, '') = ?
          AND COALESCE(zone, '') = ?
        ORDER BY id ASC
        LIMIT 1
        """,
        (demande_id, date_value, type_intervention, zone_value),
    ).fetchone()
    if existing:
        cache[cache_key] = int(existing["id"])
        return int(existing["id"]), False

    source_year = extract_year_from_text(date_value or echantillon_row["reference"])
    reference = next_reference(output_conn, "interventions_reelles", f"{source_year}-RA-INT")
    technicien = pick_first_text(parent_row["technicien"] if parent_row else "")
    finalite = infer_echantillon_finalite(echantillon_row, observations_payload, parent_row)
    notes = f"Auto-created from echantillon {echantillon_row['reference']}"
    created_at = pick_first_text(parent_row["created_at"] if parent_row else "", echantillon_row["created_at"], now)
    cursor = output_conn.execute(
        """
        INSERT INTO interventions_reelles (
            reference, demande_id, source_year, date_intervention, type_intervention,
            zone, technicien, finalite, notes, statut, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reference,
            demande_id,
            source_year,
            date_value,
            type_intervention,
            zone_value,
            technicien,
            finalite,
            notes,
            "A trier",
            created_at,
            now,
        ),
    )
    new_id = int(cursor.lastrowid)
    cache[cache_key] = new_id
    return new_id, True


def find_or_create_prelevement_for_echantillon(
    output_conn: sqlite3.Connection,
    echantillon_row: sqlite3.Row,
    observations_payload: dict[str, Any],
    intervention_reelle_id: int,
    parent_row: sqlite3.Row | None,
    now: str,
    cache: dict[tuple[int, int, str, str, str], int],
) -> tuple[int, bool]:
    cache_key = build_echantillon_prelevement_cache_key(
        echantillon_row,
        observations_payload,
        intervention_reelle_id,
        parent_row,
    )
    cached_id = cache.get(cache_key)
    if cached_id is not None:
        return cached_id, False

    date_value = pick_first_text(parent_row["date_intervention"] if parent_row else "", echantillon_row["date_prelevement"])
    prelevement_zone = infer_echantillon_prelevement_zone(echantillon_row, observations_payload)
    material = infer_echantillon_material(echantillon_row, observations_payload, parent_row)
    demande_id = int(echantillon_row["demande_id"])
    existing = output_conn.execute(
        """
        SELECT id
        FROM prelevements
        WHERE demande_id = ?
          AND COALESCE(intervention_reelle_id, 0) = ?
          AND COALESCE(date_prelevement, '') = ?
          AND COALESCE(zone, '') = ?
          AND COALESCE(materiau, '') = ?
        ORDER BY id ASC
        LIMIT 1
        """,
        (demande_id, intervention_reelle_id, date_value, prelevement_zone, material),
    ).fetchone()
    if existing:
        cache[cache_key] = int(existing["id"])
        return int(existing["id"]), False

    source_year = extract_year_from_text(date_value or echantillon_row["reference"])
    reference = next_reference(output_conn, "prelevements", f"{source_year}-RA-PRL")
    technicien = pick_first_text(parent_row["technicien"] if parent_row else "")
    finalite = infer_echantillon_finalite(echantillon_row, observations_payload, parent_row)
    location_hint = pick_first_text(echantillon_row["localisation"])
    notes = f"Auto-created from echantillon {echantillon_row['reference']}"
    if location_hint and location_hint != prelevement_zone:
        notes = f"{notes} | location={location_hint}"
    created_at = pick_first_text(parent_row["created_at"] if parent_row else "", echantillon_row["created_at"], now)
    cursor = output_conn.execute(
        """
        INSERT INTO prelevements (
            reference, demande_id, intervention_reelle_id, source_year, date_prelevement,
            zone, materiau, technicien, finalite, notes, statut, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reference,
            demande_id,
            intervention_reelle_id,
            source_year,
            date_value,
            prelevement_zone,
            material,
            technicien,
            finalite,
            notes,
            "A trier",
            created_at,
            now,
        ),
    )
    new_id = int(cursor.lastrowid)
    cache[cache_key] = new_id
    return new_id, True


def pick_passant_value(passants: dict[str, float], targets: tuple[float, ...]) -> float | None:
    for target in targets:
        for key, value in passants.items():
            diameter = to_float(key)
            passant = to_float(value)
            if diameter is None or passant is None:
                continue
            if abs(diameter - target) < 1e-9:
                return round(passant, 3)
    return None


def extract_cfe_temperature(payload: dict[str, Any]) -> float | None:
    moyenne = payload.get("moyenne") if isinstance(payload.get("moyenne"), dict) else {}
    if moyenne:
        value = round_float(moyenne.get("temperature_c"), 3)
        if value is not None:
            return value
    rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
    for row in rows:
        if not isinstance(row, dict):
            continue
        value = round_float(row.get("temperature_c"), 3)
        if value is not None:
            return value
    return None


def build_cfe_gr_resultats(payload: dict[str, Any]) -> dict[str, Any] | None:
    return build_cfe_gr_resultats_for_row(payload)


def has_cfe_granulo_row_data(row: dict[str, Any]) -> bool:
    granulometry = row.get("granulometrie_passants_percent") if isinstance(row.get("granulometrie_passants_percent"), dict) else {}
    return any(to_float(value) is not None for value in granulometry.values())


def has_cfe_liant_row_data(row: dict[str, Any]) -> bool:
    for key in ("teneur_liant_percent", "teneur_liant_ext_percent", "module_richesse", "module_richesse_ext"):
        value = round_float(row.get(key), 6)
        if value is not None and abs(value) > 1e-9:
            return True
    return False


def extract_cfe_valid_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
    valid_rows: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        if has_cfe_granulo_row_data(row) or has_cfe_liant_row_data(row):
            valid_rows.append(row)
    return valid_rows


def build_cfe_gr_resultats_for_row(
    payload: dict[str, Any],
    row: dict[str, Any] | None = None,
    replicate_index: int | None = None,
    replicate_total: int | None = None,
) -> dict[str, Any] | None:
    valid_rows = extract_cfe_valid_rows(payload)
    rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
    row_source = row if isinstance(row, dict) else (valid_rows[0] if valid_rows else (rows[0] if rows and isinstance(rows[0], dict) else {}))
    raw_passants = row_source.get("granulometrie_passants_percent") if isinstance(row_source.get("granulometrie_passants_percent"), dict) else {}
    if not raw_passants:
        return None

    passants: dict[str, float] = {}
    sortable: list[tuple[float, str, float]] = []
    for key, value in raw_passants.items():
        diameter = to_float(key)
        passant = to_float(value)
        if diameter is None or passant is None:
            continue
        label = str(key)
        passants[label] = round(passant, 3)
        sortable.append((diameter, label, round(passant, 3)))
    if not sortable:
        return None

    sortable.sort(key=lambda item: item[0], reverse=True)
    previous_passant = 100.0
    tamis: list[dict[str, Any]] = []
    dmax = None
    for diameter, _label, passant in sortable:
        refus = max(0.0, previous_passant - passant)
        tamis.append({"d": round(diameter, 6), "r": round(refus, 6)})
        previous_passant = passant
        if dmax is None and passant < 100.0:
            dmax = round(diameter, 6)
    tamis.sort(key=lambda item: float(item["d"]))

    result = {
        "historical_mode": "passants_only",
        "source_essai_code": "CFE",
        "modele": "Enrobés",
        "m1": "",
        "m2": "",
        "m3": "",
        "mh": 100,
        "w": 0,
        "ms": 100,
        "tamis": tamis,
        "passants_percent": passants,
        "passant_80": pick_passant_value(passants, (0.08, 0.063)),
        "passant_20": pick_passant_value(passants, (20.0,)),
        "dmax": dmax,
    }
    if replicate_index is not None:
        result["replicate_index"] = int(replicate_index)
        result["replicate_label"] = f"Essai {replicate_index}"
    if replicate_total is not None:
        result["replicate_total"] = int(replicate_total)
    source_row_no = str(row_source.get("essai_no") or "").strip()
    if source_row_no:
        result["source_row_no"] = source_row_no
    return result


def build_cfe_liant_resultats(payload: dict[str, Any]) -> dict[str, Any] | None:
    return build_cfe_liant_resultats_for_row(payload)


def build_cfe_liant_resultats_for_row(
    payload: dict[str, Any],
    row: dict[str, Any] | None = None,
    replicate_index: int | None = None,
    replicate_total: int | None = None,
) -> dict[str, Any] | None:
    valid_rows = extract_cfe_valid_rows(payload)
    rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
    row_source = row if isinstance(row, dict) else (valid_rows[0] if valid_rows else (rows[0] if rows and isinstance(rows[0], dict) else {}))
    moyenne = payload.get("moyenne") if isinstance(payload.get("moyenne"), dict) else {}
    theorique = payload.get("theorique") if isinstance(payload.get("theorique"), dict) else {}
    thresholds = payload.get("thresholds") if isinstance(payload.get("thresholds"), dict) else {}

    result = {
        "historical_mode": "result_only",
        "source_essai_code": "CFE",
        "hour": str(row_source.get("hour") or ""),
        "teneur_liant_percent": round_float(row_source.get("teneur_liant_percent"), 6),
        "teneur_liant_ext_percent": round_float(row_source.get("teneur_liant_ext_percent"), 6),
        "module_richesse": round_float(row_source.get("module_richesse"), 6),
        "module_richesse_ext": round_float(row_source.get("module_richesse_ext"), 6),
        "surface_specifique": round_float(row_source.get("surface_specifique"), 6),
        "moyenne": moyenne,
        "theorique": theorique,
        "thresholds": thresholds,
    }
    if result["teneur_liant_percent"] is None:
        result["teneur_liant_percent"] = round_float(moyenne.get("teneur_liant_percent"), 6)
    if result["teneur_liant_ext_percent"] is None:
        result["teneur_liant_ext_percent"] = round_float(moyenne.get("teneur_liant_ext_percent"), 6)
    if result["module_richesse"] is None:
        result["module_richesse"] = round_float(moyenne.get("module_richesse"), 6)
    if result["module_richesse_ext"] is None:
        result["module_richesse_ext"] = round_float(moyenne.get("module_richesse_ext"), 6)
    if result["surface_specifique"] is None:
        result["surface_specifique"] = round_float(moyenne.get("surface_specifique"), 6)
    if replicate_index is not None:
        result["replicate_index"] = int(replicate_index)
        result["replicate_label"] = f"Essai {replicate_index}"
    if replicate_total is not None:
        result["replicate_total"] = int(replicate_total)
    source_row_no = str(row_source.get("essai_no") or "").strip()
    if source_row_no:
        result["source_row_no"] = source_row_no
    has_value = any(result.get(key) not in (None, "") for key in (
        "teneur_liant_percent",
        "teneur_liant_ext_percent",
        "module_richesse",
        "module_richesse_ext",
        "surface_specifique",
    ))
    return result if has_value else None


def build_cfe_page_resultats(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        **payload,
        "historical_mode": "grouped",
        "temperature_prelevement_c": extract_cfe_temperature(payload),
    }


def build_cfe_echantillon_observations(
    raw_observations: Any,
    observations_payload: dict[str, Any],
    intervention_reference: str,
    sample_local_ref: str,
    temperature_c: float | None,
) -> str:
    existing_payload = parse_json_dict(raw_observations)
    merged = dict(existing_payload)

    if not merged and isinstance(raw_observations, str):
        raw_text = raw_observations.strip()
        if raw_text and not raw_text.startswith("{"):
            merged["notes"] = raw_observations

    merged.update(
        {
            "source_file": str(observations_payload.get("source_file") or merged.get("source_file") or ""),
            "sheet_name": str(observations_payload.get("sheet_name") or merged.get("sheet_name") or sample_local_ref),
            "sample_local_ref": sample_local_ref,
            "source_essai_code": "CFE",
            "cfe_signature": str(observations_payload.get("signature") or merged.get("cfe_signature") or intervention_reference),
            "cfe_parent_intervention_reference": intervention_reference,
        }
    )
    if temperature_c is not None:
        merged["temperature_prelevement_c"] = temperature_c
    return json.dumps(merged, ensure_ascii=False)


def find_or_create_cfe_echantillon(
    output_conn: sqlite3.Connection,
    intervention_row: sqlite3.Row,
    observations_payload: dict[str, Any],
    payload: dict[str, Any],
    now: str,
) -> tuple[int, bool, bool]:
    signature = str(observations_payload.get("signature") or f"CFE::{intervention_row['reference']}")
    sample_local_ref = str(observations_payload.get("sheet_name") or intervention_row["reference"] or "").strip() or str(intervention_row["reference"])
    temperature_c = extract_cfe_temperature(payload)
    existing = output_conn.execute(
        """
        SELECT id, observations
        FROM echantillons
        WHERE demande_id = ?
          AND (COALESCE(observations, '') LIKE ? OR COALESCE(designation, '') = ?)
        ORDER BY id ASC
        LIMIT 1
        """,
        (int(intervention_row["demande_id"]), f"%{signature}%", sample_local_ref),
    ).fetchone()

    merged_observations = build_cfe_echantillon_observations(
        existing["observations"] if existing else "",
        observations_payload,
        str(intervention_row["reference"]),
        sample_local_ref,
        temperature_c,
    )

    if existing:
        updated = False
        if str(existing["observations"] or "") != merged_observations:
            output_conn.execute(
                "UPDATE echantillons SET observations = ?, updated_at = ? WHERE id = ?",
                (merged_observations, now, int(existing["id"])),
            )
            updated = True
        return int(existing["id"]), False, updated

    year_value = extract_year_from_text(intervention_row["date_intervention"])
    reference, numero = next_echantillon_reference(output_conn, year_value, "SP")
    cursor = output_conn.execute(
        """
        INSERT INTO echantillons (
            reference, annee, labo_code, numero, demande_id,
            designation, date_prelevement, localisation, statut,
            date_reception_labo, observations, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reference,
            year_value,
            "SP",
            numero,
            int(intervention_row["demande_id"]),
            sample_local_ref,
            intervention_row["date_intervention"] or "",
            payload.get("destination") or intervention_row["sujet"] or "",
            "Importé",
            intervention_row["date_intervention"] or "",
            merged_observations,
            intervention_row["created_at"] or now,
            now,
        ),
    )
    return int(cursor.lastrowid), True, False


def insert_cfe_child_essai(
    output_conn: sqlite3.Connection,
    echantillon_id: int,
    intervention_row: sqlite3.Row,
    observations_payload: dict[str, Any],
    essai_code: str,
    type_essai: str,
    norme: str,
    subcode: str,
    resultats: dict[str, Any],
    now: str,
) -> bool:
    signature = f"{observations_payload.get('signature') or intervention_row['reference']}|SUB={subcode}"
    existing = output_conn.execute(
        """
        SELECT id
        FROM essais
        WHERE echantillon_id = ?
          AND COALESCE(essai_code, '') = ?
          AND COALESCE(observations, '') LIKE ?
        LIMIT 1
        """,
        (echantillon_id, essai_code, f"%{signature}%"),
    ).fetchone()
    if existing:
        return False

    observations = json.dumps(
        {
            "source_file": str(observations_payload.get("source_file") or ""),
            "sheet_name": str(observations_payload.get("sheet_name") or ""),
            "signature": signature,
            "import_mode": "composite",
            "parent_essai_code": "CFE",
            "parent_essai_label": str(observations_payload.get("essai_label") or "Contrôle de fabrication enrobés"),
            "subcode": subcode,
            "source_intervention_reference": str(intervention_row["reference"] or ""),
        },
        ensure_ascii=False,
    )
    output_conn.execute(
        """
        INSERT INTO essais (
            echantillon_id, type_essai, norme, statut, date_debut, date_fin,
            resultats, operateur, observations,
            resultat_principal, resultat_unite, resultat_label,
            created_at, updated_at, essai_code
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            echantillon_id,
            type_essai,
            norme,
            "Importé",
            intervention_row["date_intervention"] or "",
            intervention_row["date_intervention"] or "",
            json.dumps(resultats, ensure_ascii=False),
            intervention_row["technicien"] or "",
            observations,
            None,
            "",
            "",
            intervention_row["created_at"] or now,
            now,
            essai_code,
        ),
    )
    return True


def materialize_cfe_composites(output_conn: sqlite3.Connection) -> dict[str, Any]:
    stats = Counter()
    skipped: list[dict[str, Any]] = []
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rows = fetch_rows(
        output_conn,
        """
        SELECT id, reference, demande_id, sujet, date_intervention, technicien, observations, created_at
        FROM interventions
        WHERE COALESCE(observations, '') LIKE '%"essai_code": "CFE"%'
        ORDER BY id
        """,
    )

    for row in rows:
        observations_payload = parse_json_dict(row["observations"])
        payload = observations_payload.get("payload") if isinstance(observations_payload.get("payload"), dict) else {}
        if not payload:
            skipped.append(
                {
                    "intervention_id": int(row["id"]),
                    "reference": str(row["reference"]),
                    "reason": "missing_payload",
                }
            )
            stats["skipped_missing_payload"] += 1
            continue

        echantillon_id, created_echantillon, updated_echantillon = find_or_create_cfe_echantillon(
            output_conn,
            row,
            observations_payload,
            payload,
            now,
        )
        if created_echantillon:
            stats["created_echantillons"] += 1
        if updated_echantillon:
            stats["updated_echantillons"] += 1

        inserted_any = False
        valid_rows = extract_cfe_valid_rows(payload)
        granulo_rows = [entry for entry in valid_rows if has_cfe_granulo_row_data(entry)]
        liant_rows = [entry for entry in valid_rows if has_cfe_liant_row_data(entry)]

        if granulo_rows:
            replicate_total = min(len(granulo_rows), 2)
            for index, granulo_row in enumerate(granulo_rows[:2], start=1):
                gr_resultats = build_cfe_gr_resultats_for_row(payload, row=granulo_row, replicate_index=index, replicate_total=replicate_total)
                if gr_resultats and insert_cfe_child_essai(
                    output_conn,
                    echantillon_id,
                    row,
                    observations_payload,
                    "GR",
                    "Granulométrie",
                    "NF EN 12697-2",
                    f"CFE-GRANULO-{index}",
                    gr_resultats,
                    now,
                ):
                    inserted_any = True
                    stats["inserted_gr_siblings"] += 1
        else:
            gr_resultats = build_cfe_gr_resultats(payload)
            if gr_resultats and insert_cfe_child_essai(
                output_conn,
                echantillon_id,
                row,
                observations_payload,
                "GR",
                "Granulométrie",
                "NF EN 12697-2",
                "CFE-GRANULO-1",
                gr_resultats,
                now,
            ):
                inserted_any = True
                stats["inserted_gr_siblings"] += 1

        if liant_rows:
            replicate_total = min(len(liant_rows), 2)
            for index, liant_row in enumerate(liant_rows[:2], start=1):
                liant_resultats = build_cfe_liant_resultats_for_row(payload, row=liant_row, replicate_index=index, replicate_total=replicate_total)
                if liant_resultats and insert_cfe_child_essai(
                    output_conn,
                    echantillon_id,
                    row,
                    observations_payload,
                    "EL",
                    "Extraction de liant",
                    "NF EN 12697-1",
                    f"CFE-LIANT-{index}",
                    liant_resultats,
                    now,
                ):
                    inserted_any = True
                    stats["inserted_el_siblings"] += 1
        else:
            liant_resultats = build_cfe_liant_resultats(payload)
            if liant_resultats and insert_cfe_child_essai(
                output_conn,
                echantillon_id,
                row,
                observations_payload,
                "EL",
                "Extraction de liant",
                "NF EN 12697-1",
                "CFE-LIANT-1",
                liant_resultats,
                now,
            ):
                inserted_any = True
                stats["inserted_el_siblings"] += 1

        if insert_cfe_child_essai(
            output_conn,
            echantillon_id,
            row,
            observations_payload,
            "CFE",
            "Contrôle de fabrication enrobés",
            "",
            "CFE-GROUP",
            build_cfe_page_resultats(payload),
            now,
        ):
            inserted_any = True
            stats["inserted_cfe_pages"] += 1

        if not inserted_any and not created_echantillon and not updated_echantillon:
            stats["already_materialized"] += 1

    return {
        "stats": dict(stats),
        "skipped_preview": skipped[:100],
        "skipped_total": len(skipped),
    }


def build_rebuilt_essai_lookup(conn: sqlite3.Connection) -> dict[tuple[str, str, str, str], str]:
    rows = fetch_rows(
        conn,
        """
        SELECT
            ech.reference AS echantillon_reference,
            COALESCE(e.type_essai, '') AS type_essai,
            COALESCE(e.date_debut, '') AS date_debut,
            COALESCE(e.date_fin, '') AS date_fin,
            e.observations
        FROM essais e
        JOIN echantillons ech ON ech.id = e.echantillon_id
        """,
    )
    lookup: dict[tuple[str, str, str, str], str] = {}
    for row in rows:
        code = extract_essai_code(row["observations"])
        if not code:
            code = choose_essai_code_from_type(str(row["type_essai"] or ""))
        if not code:
            continue
        key = (
            str(row["echantillon_reference"]),
            str(row["type_essai"] or ""),
            str(row["date_debut"] or ""),
            str(row["date_fin"] or ""),
        )
        lookup[key] = code
    return lookup


def insert_interventions_reelles(
    output_conn: sqlite3.Connection,
    rebuilt_conn: sqlite3.Connection,
    rebuilt_demande_ref_by_id: dict[int, str],
    output_demande_id_by_ref: dict[str, int],
) -> tuple[dict[int, int], Counter[str]]:
    report = Counter()
    output_id_by_ref = fetch_reference_id_map(output_conn, "interventions_reelles")
    rebuilt_id_to_output_id: dict[int, int] = {}
    rows = fetch_rows(rebuilt_conn, "SELECT * FROM interventions_reelles ORDER BY id")
    for row in rows:
        reference = str(row["reference"])
        existing_id = output_id_by_ref.get(reference)
        if existing_id is not None:
            rebuilt_id_to_output_id[int(row["id"])] = existing_id
            report["already_present"] += 1
            continue
        demande_ref = rebuilt_demande_ref_by_id.get(int(row["demande_id"])) if row["demande_id"] is not None else None
        demande_id = output_demande_id_by_ref.get(demande_ref or "")
        cursor = output_conn.execute(
            """
            INSERT INTO interventions_reelles (
                reference, demande_id, source_year, date_intervention, type_intervention,
                zone, technicien, finalite, notes, statut, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                reference,
                demande_id,
                row["year"],
                row["canonical_date"] or "",
                row["type_intervention"] or "",
                row["zone"] or "",
                row["technicien"] or "",
                row["finalite"] or "",
                row["notes"] or "",
                row["statut"] or "A trier",
                row["created_at"] or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                row["updated_at"] or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            ),
        )
        new_id = int(cursor.lastrowid)
        output_id_by_ref[reference] = new_id
        rebuilt_id_to_output_id[int(row["id"])] = new_id
        report["inserted"] += 1
    return rebuilt_id_to_output_id, report


def insert_prelevements(
    output_conn: sqlite3.Connection,
    rebuilt_conn: sqlite3.Connection,
    rebuilt_demande_ref_by_id: dict[int, str],
    output_demande_id_by_ref: dict[str, int],
    rebuilt_intervention_reelle_to_output: dict[int, int],
) -> tuple[dict[int, int], Counter[str]]:
    report = Counter()
    output_id_by_ref = fetch_reference_id_map(output_conn, "prelevements")
    rebuilt_id_to_output_id: dict[int, int] = {}
    rows = fetch_rows(rebuilt_conn, "SELECT * FROM prelevements ORDER BY id")
    for row in rows:
        reference = str(row["reference"])
        existing_id = output_id_by_ref.get(reference)
        if existing_id is not None:
            rebuilt_id_to_output_id[int(row["id"])] = existing_id
            report["already_present"] += 1
            continue
        demande_ref = rebuilt_demande_ref_by_id.get(int(row["demande_id"])) if row["demande_id"] is not None else None
        demande_id = output_demande_id_by_ref.get(demande_ref or "")
        intervention_reelle_id = None
        if row["intervention_reelle_id"] is not None:
            intervention_reelle_id = rebuilt_intervention_reelle_to_output.get(int(row["intervention_reelle_id"]))
        cursor = output_conn.execute(
            """
            INSERT INTO prelevements (
                reference, demande_id, intervention_reelle_id, source_year, date_prelevement,
                zone, materiau, technicien, finalite, notes, statut, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                reference,
                demande_id,
                intervention_reelle_id,
                row["year"],
                row["canonical_date"] or "",
                row["zone"] or "",
                row["materiau"] or "",
                row["technicien"] or "",
                row["finalite"] or "",
                row["notes"] or "",
                row["statut"] or "A trier",
                row["created_at"] or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                row["updated_at"] or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            ),
        )
        new_id = int(cursor.lastrowid)
        output_id_by_ref[reference] = new_id
        rebuilt_id_to_output_id[int(row["id"])] = new_id
        report["inserted"] += 1
    return rebuilt_id_to_output_id, report


def build_rebuilt_echantillon_link_lookup(rebuilt_conn: sqlite3.Connection) -> dict[str, dict[str, str]]:
    rows = fetch_rows(
        rebuilt_conn,
        """
        SELECT
            e.reference AS echantillon_reference,
            COALESCE(p.reference, '') AS prelevement_reference,
            COALESCE(ir.reference, '') AS intervention_reelle_reference,
            COALESCE(e.auto_reason, '') AS auto_reason
        FROM echantillons e
        LEFT JOIN prelevements p ON p.id = e.prelevement_id
        LEFT JOIN interventions_reelles ir ON ir.id = e.intervention_reelle_id
        WHERE COALESCE(e.reference, '') <> ''
        ORDER BY e.id
        """,
    )
    return {
        str(row["echantillon_reference"]): {
            "prelevement_reference": str(row["prelevement_reference"] or ""),
            "intervention_reelle_reference": str(row["intervention_reelle_reference"] or ""),
            "auto_reason": str(row["auto_reason"] or ""),
        }
        for row in rows
    }


def fetch_prelevement_intervention_reelle_id(output_conn: sqlite3.Connection, prelevement_id: int | None) -> int | None:
    if not prelevement_id:
        return None
    row = output_conn.execute(
        "SELECT intervention_reelle_id FROM prelevements WHERE id = ?",
        (prelevement_id,),
    ).fetchone()
    if not row or row["intervention_reelle_id"] in (None, 0):
        return None
    return int(row["intervention_reelle_id"])


def fetch_raw_intervention_by_reference(
    output_conn: sqlite3.Connection,
    cache: dict[str, sqlite3.Row | None],
    reference: str,
) -> sqlite3.Row | None:
    ref = str(reference or "").strip()
    if not ref:
        return None
    if ref not in cache:
        cache[ref] = output_conn.execute(
            """
            SELECT id, reference, demande_id, type_intervention, sujet, date_intervention,
                   technicien, observations, prelevement_id, intervention_reelle_id, created_at
            FROM interventions
            WHERE reference = ?
            LIMIT 1
            """,
            (ref,),
        ).fetchone()
    return cache[ref]


def reconcile_echantillon_links(
    output_conn: sqlite3.Connection,
    rebuilt_conn: sqlite3.Connection,
) -> dict[str, Any]:
    stats = Counter()
    created_interventions_preview: list[dict[str, Any]] = []
    created_prelevements_preview: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rebuilt_lookup = build_rebuilt_echantillon_link_lookup(rebuilt_conn)
    output_prelevement_id_by_ref = fetch_reference_id_map(output_conn, "prelevements")
    output_intervention_reelle_id_by_ref = fetch_reference_id_map(output_conn, "interventions_reelles")
    raw_intervention_cache: dict[str, sqlite3.Row | None] = {}
    intervention_cache: dict[tuple[int, str, str, str], int] = {}
    prelevement_cache: dict[tuple[int, int, str, str, str], int] = {}

    rows = fetch_rows(
        output_conn,
        """
        SELECT
            id, reference, demande_id, designation, date_prelevement, localisation,
            observations, created_at, prelevement_id, intervention_reelle_id, auto_reason
        FROM echantillons
        ORDER BY id
        """,
    )

    for row in rows:
        current_prelevement_id = int(row["prelevement_id"]) if row["prelevement_id"] not in (None, 0) else None
        current_intervention_reelle_id = int(row["intervention_reelle_id"]) if row["intervention_reelle_id"] not in (None, 0) else None
        current_auto_reason = str(row["auto_reason"] or "")
        observations_payload = get_echantillon_observations_payload(row)
        desired_prelevement_id = current_prelevement_id
        desired_intervention_reelle_id = current_intervention_reelle_id
        auto_reason = current_auto_reason
        resolution_source = ""

        rebuilt_match = rebuilt_lookup.get(str(row["reference"] or ""))
        if rebuilt_match:
            mapped_prelevement_id = output_prelevement_id_by_ref.get(rebuilt_match["prelevement_reference"] or "")
            mapped_intervention_reelle_id = output_intervention_reelle_id_by_ref.get(
                rebuilt_match["intervention_reelle_reference"] or ""
            )
            if desired_prelevement_id is None and mapped_prelevement_id is not None:
                desired_prelevement_id = mapped_prelevement_id
            if desired_intervention_reelle_id is None and mapped_intervention_reelle_id is not None:
                desired_intervention_reelle_id = mapped_intervention_reelle_id
            if mapped_prelevement_id is not None or mapped_intervention_reelle_id is not None:
                auto_reason = rebuilt_match["auto_reason"] or "rebuilt_reference_match"
                resolution_source = "rebuilt"

        parent_row = None
        parent_reference = str(observations_payload.get("cfe_parent_intervention_reference") or "").strip()
        if parent_reference:
            parent_row = fetch_raw_intervention_by_reference(output_conn, raw_intervention_cache, parent_reference)
            if parent_row is not None:
                parent_prelevement_id = int(parent_row["prelevement_id"]) if parent_row["prelevement_id"] not in (None, 0) else None
                parent_intervention_reelle_id = (
                    int(parent_row["intervention_reelle_id"])
                    if parent_row["intervention_reelle_id"] not in (None, 0)
                    else None
                )
                if desired_prelevement_id is None and parent_prelevement_id is not None:
                    desired_prelevement_id = parent_prelevement_id
                if parent_intervention_reelle_id is not None:
                    current_is_synthetic = current_auto_reason.startswith("synthetic_") or current_auto_reason == "cfe_parent_intervention"
                    if desired_intervention_reelle_id is None or (
                        current_is_synthetic and desired_intervention_reelle_id != parent_intervention_reelle_id
                    ):
                        desired_intervention_reelle_id = parent_intervention_reelle_id
                if desired_prelevement_id is not None or desired_intervention_reelle_id is not None:
                    auto_reason = "cfe_parent_intervention" if observations_payload.get("source_essai_code") == "CFE" else (auto_reason or "parent_intervention")
                    resolution_source = "parent_intervention"

        if desired_prelevement_id is not None and desired_intervention_reelle_id is None:
            desired_intervention_reelle_id = fetch_prelevement_intervention_reelle_id(output_conn, desired_prelevement_id)

        synthetic_intervention_created = False
        if desired_intervention_reelle_id is None:
            desired_intervention_reelle_id, synthetic_intervention_created = find_or_create_intervention_reelle_for_echantillon(
                output_conn,
                row,
                observations_payload,
                parent_row,
                now,
                intervention_cache,
            )
            if synthetic_intervention_created:
                stats["created_interventions_reelles"] += 1
                created_interventions_preview.append(
                    {
                        "echantillon_reference": str(row["reference"] or ""),
                        "intervention_reelle_id": desired_intervention_reelle_id,
                        "reason": "synthetic_from_echantillon",
                    }
                )
            auto_reason = auto_reason or "synthetic_intervention_from_echantillon"
            if not resolution_source:
                resolution_source = "synthetic"

        synthetic_prelevement_created = False
        if desired_prelevement_id is None:
            desired_prelevement_id, synthetic_prelevement_created = find_or_create_prelevement_for_echantillon(
                output_conn,
                row,
                observations_payload,
                int(desired_intervention_reelle_id),
                parent_row,
                now,
                prelevement_cache,
            )
            if synthetic_prelevement_created:
                stats["created_prelevements"] += 1
                created_prelevements_preview.append(
                    {
                        "echantillon_reference": str(row["reference"] or ""),
                        "prelevement_id": desired_prelevement_id,
                        "reason": "synthetic_from_echantillon",
                    }
                )
            auto_reason = auto_reason or "synthetic_prelevement_from_echantillon"
            if not resolution_source:
                resolution_source = "synthetic"

        if desired_prelevement_id is not None and desired_intervention_reelle_id is None:
            desired_intervention_reelle_id = fetch_prelevement_intervention_reelle_id(output_conn, desired_prelevement_id)

        if desired_prelevement_id is None:
            unresolved.append(
                {
                    "echantillon_id": int(row["id"]),
                    "echantillon_reference": str(row["reference"] or ""),
                    "demande_id": int(row["demande_id"]),
                    "designation": str(row["designation"] or ""),
                    "date_prelevement": str(row["date_prelevement"] or ""),
                }
            )
            stats["unresolved"] += 1
            continue

        prelevement_row = output_conn.execute(
            "SELECT intervention_reelle_id FROM prelevements WHERE id = ?",
            (desired_prelevement_id,),
        ).fetchone()
        prelevement_intervention_reelle_id = None
        if prelevement_row and prelevement_row["intervention_reelle_id"] not in (None, 0):
            prelevement_intervention_reelle_id = int(prelevement_row["intervention_reelle_id"])
        should_override_prelevement_intervention = (
            desired_intervention_reelle_id is not None
            and prelevement_intervention_reelle_id != int(desired_intervention_reelle_id)
            and resolution_source == "parent_intervention"
        )
        if prelevement_row and desired_intervention_reelle_id is not None and (
            prelevement_intervention_reelle_id is None or should_override_prelevement_intervention
        ):
            output_conn.execute(
                "UPDATE prelevements SET intervention_reelle_id = ?, updated_at = ? WHERE id = ?",
                (desired_intervention_reelle_id, now, desired_prelevement_id),
            )
            output_conn.execute(
                "UPDATE interventions SET intervention_reelle_id = ?, tri_updated_at = ? WHERE prelevement_id = ? AND COALESCE(intervention_reelle_id, 0) = 0",
                (desired_intervention_reelle_id, now, desired_prelevement_id),
            )
            if should_override_prelevement_intervention:
                stats["prelevement_intervention_realigned_from_parent"] += 1
            else:
                stats["prelevement_intervention_backfilled"] += 1

        updates: dict[str, Any] = {}
        if current_prelevement_id != desired_prelevement_id:
            updates["prelevement_id"] = desired_prelevement_id
        if current_intervention_reelle_id != desired_intervention_reelle_id:
            updates["intervention_reelle_id"] = desired_intervention_reelle_id
        if auto_reason and auto_reason != current_auto_reason:
            updates["auto_reason"] = auto_reason

        if not updates:
            stats["already_linked"] += 1
            continue

        updates["updated_at"] = now
        clause = ", ".join(f"{column} = ?" for column in updates)
        output_conn.execute(
            f"UPDATE echantillons SET {clause} WHERE id = ?",
            tuple(updates.values()) + (int(row["id"]),),
        )
        stats["rows_updated"] += 1
        if resolution_source:
            stats[f"linked_from_{resolution_source}"] += 1

    return {
        "stats": dict(stats),
        "created_interventions_preview": created_interventions_preview[:100],
        "created_prelevements_preview": created_prelevements_preview[:100],
        "unresolved_preview": unresolved[:100],
        "unresolved_total": len(unresolved),
    }


def cleanup_orphan_synthetic_interventions_reelles(output_conn: sqlite3.Connection) -> dict[str, Any]:
    stats = Counter()
    preview: list[dict[str, Any]] = []
    rows = fetch_rows(
        output_conn,
        """
        SELECT id, reference, notes
        FROM interventions_reelles ir
        WHERE COALESCE(notes, '') LIKE 'Auto-created from echantillon %'
          AND NOT EXISTS (SELECT 1 FROM prelevements p WHERE p.intervention_reelle_id = ir.id)
          AND NOT EXISTS (SELECT 1 FROM interventions i WHERE i.intervention_reelle_id = ir.id)
          AND NOT EXISTS (SELECT 1 FROM echantillons e WHERE e.intervention_reelle_id = ir.id)
        ORDER BY id
        """,
    )
    for row in rows:
        output_conn.execute("DELETE FROM interventions_reelles WHERE id = ?", (int(row["id"]),))
        stats["deleted_orphan_synthetic_interventions_reelles"] += 1
        preview.append(
            {
                "reference": str(row["reference"] or ""),
                "notes": str(row["notes"] or ""),
            }
        )
    return {
        "stats": dict(stats),
        "deleted_preview": preview[:100],
        "deleted_total": len(preview),
    }


def reconcile_interventions(
    output_conn: sqlite3.Connection,
    rebuilt_conn: sqlite3.Connection,
    rebuilt_prelevement_to_output: dict[int, int],
    rebuilt_intervention_reelle_to_output: dict[int, int],
) -> dict[str, Any]:
    rows = fetch_rows(
        rebuilt_conn,
        "SELECT reference, nature_reelle, prelevement_id, intervention_reelle_id FROM interventions WHERE COALESCE(reference, '') <> ''",
    )
    stats = Counter()
    conflicts: list[dict[str, Any]] = []
    for row in rows:
        current = output_conn.execute(
            "SELECT id, nature_reelle, prelevement_id, intervention_reelle_id FROM interventions WHERE reference = ?",
            (row["reference"],),
        ).fetchone()
        if not current:
            stats["missing_in_output"] += 1
            continue

        desired_nature = str(row["nature_reelle"] or "").strip()
        desired_prelevement_id = None
        if row["prelevement_id"] is not None:
            desired_prelevement_id = rebuilt_prelevement_to_output.get(int(row["prelevement_id"]))
        desired_intervention_reelle_id = None
        if row["intervention_reelle_id"] is not None:
            desired_intervention_reelle_id = rebuilt_intervention_reelle_to_output.get(int(row["intervention_reelle_id"]))

        updates: dict[str, Any] = {}

        current_nature = str(current["nature_reelle"] or "").strip()
        if desired_nature:
            if not current_nature:
                updates["nature_reelle"] = desired_nature
                stats["nature_backfilled"] += 1
            elif current_nature != desired_nature:
                conflicts.append(
                    {
                        "reference": row["reference"],
                        "field": "nature_reelle",
                        "current": current_nature,
                        "rebuilt": desired_nature,
                    }
                )
                stats["conflicts"] += 1

        current_prelevement_id = current["prelevement_id"]
        if desired_prelevement_id is not None:
            if current_prelevement_id in (None, 0):
                updates["prelevement_id"] = desired_prelevement_id
                stats["prelevement_link_backfilled"] += 1
            elif int(current_prelevement_id) != int(desired_prelevement_id):
                conflicts.append(
                    {
                        "reference": row["reference"],
                        "field": "prelevement_id",
                        "current": current_prelevement_id,
                        "rebuilt": desired_prelevement_id,
                    }
                )
                stats["conflicts"] += 1

        current_intervention_reelle_id = current["intervention_reelle_id"]
        if desired_intervention_reelle_id is not None:
            if current_intervention_reelle_id in (None, 0):
                updates["intervention_reelle_id"] = desired_intervention_reelle_id
                stats["intervention_reelle_link_backfilled"] += 1
            elif int(current_intervention_reelle_id) != int(desired_intervention_reelle_id):
                conflicts.append(
                    {
                        "reference": row["reference"],
                        "field": "intervention_reelle_id",
                        "current": current_intervention_reelle_id,
                        "rebuilt": desired_intervention_reelle_id,
                    }
                )
                stats["conflicts"] += 1

        if updates:
            updates["tri_updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            clause = ", ".join(f"{column} = ?" for column in updates)
            output_conn.execute(
                f"UPDATE interventions SET {clause} WHERE id = ?",
                tuple(updates.values()) + (current["id"],),
            )
            stats["rows_updated"] += 1
    de_repair_report = repair_legacy_de_as_terrain(output_conn)
    for key, value in de_repair_report["stats"].items():
        stats[key] += int(value)
    legacy_report = backfill_legacy_raw_interventions(output_conn)
    for key, value in legacy_report["stats"].items():
        stats[key] += int(value)
    return {
        "stats": dict(stats),
        "conflicts_preview": conflicts[:100],
        "conflicts_total": len(conflicts),
        "legacy_de_repair_preview": de_repair_report["preview"],
        "legacy_de_repair_total": de_repair_report["total"],
        "legacy_unresolved_preview": legacy_report["unresolved_preview"],
        "legacy_unresolved_total": legacy_report["unresolved_total"],
    }


def reconcile_essai_codes(output_conn: sqlite3.Connection, rebuilt_lookup: dict[tuple[str, str, str, str], str]) -> dict[str, Any]:
    stats = Counter()
    unresolved: list[dict[str, Any]] = []
    rows = fetch_rows(
        output_conn,
        """
        SELECT
            e.id,
            COALESCE(e.essai_code, '') AS essai_code,
            COALESCE(e.type_essai, '') AS type_essai,
            COALESCE(e.date_debut, '') AS date_debut,
            COALESCE(e.date_fin, '') AS date_fin,
            COALESCE(e.observations, '') AS observations,
            ech.reference AS echantillon_reference
        FROM essais e
        JOIN echantillons ech ON ech.id = e.echantillon_id
        ORDER BY e.id
        """,
    )
    for row in rows:
        if str(row["essai_code"] or "").strip():
            stats["already_coded"] += 1
            continue
        code = extract_essai_code(row["observations"])
        origin = "observations"
        if not code:
            key = (
                str(row["echantillon_reference"]),
                str(row["type_essai"]),
                str(row["date_debut"]),
                str(row["date_fin"]),
            )
            code = rebuilt_lookup.get(key, "")
            origin = "rebuilt"
        if not code:
            code = choose_essai_code_from_type(str(row["type_essai"] or ""))
            origin = "type_fallback"
        if code:
            output_conn.execute("UPDATE essais SET essai_code = ?, updated_at = ? WHERE id = ?", (
                code,
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                row["id"],
            ))
            stats[f"backfilled_from_{origin}"] += 1
        else:
            unresolved.append(
                {
                    "essai_id": int(row["id"]),
                    "echantillon_reference": str(row["echantillon_reference"]),
                    "type_essai": str(row["type_essai"]),
                    "date_debut": str(row["date_debut"]),
                    "date_fin": str(row["date_fin"]),
                }
            )
            stats["unresolved"] += 1
            continue

        current_resultats = output_conn.execute("SELECT resultats FROM essais WHERE id = ?", (row["id"],)).fetchone()
        if current_resultats:
            normalized_resultats, changed = normalize_resultats_payload(code, str(current_resultats["resultats"] or ""))
            if changed:
                output_conn.execute(
                    "UPDATE essais SET resultats = ?, updated_at = ? WHERE id = ?",
                    (normalized_resultats, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), row["id"]),
                )
                stats["normalized_resultats_payload"] += 1
        continue
    return {
        "stats": dict(stats),
        "unresolved_preview": unresolved[:100],
        "unresolved_total": len(unresolved),
    }


def split_ipi_pr_essais(output_conn: sqlite3.Connection) -> dict[str, Any]:
    stats = Counter()
    skipped: list[dict[str, Any]] = []
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rows = fetch_rows(
        output_conn,
        """
        SELECT
            id,
            echantillon_id,
            statut,
            date_debut,
            date_fin,
            resultats,
            operateur,
            observations,
            created_at
        FROM essais
        WHERE essai_code = 'IPI - PR'
        ORDER BY id
        """,
    )
    for row in rows:
        payload = parse_json_dict(row["resultats"])
        pn_payload, ipi_payload = build_ipi_pr_split_payloads(payload, int(row["id"]))
        if pn_payload is None or ipi_payload is None:
            skipped.append(
                {
                    "essai_id": int(row["id"]),
                    "echantillon_id": int(row["echantillon_id"]),
                    "reason": "missing_or_invalid_series",
                }
            )
            stats["skipped_missing_or_invalid_series"] += 1
            continue

        output_conn.execute(
            """
            UPDATE essais
            SET essai_code = ?, type_essai = ?, norme = ?, resultats = ?,
                resultat_principal = NULL, resultat_unite = '', resultat_label = '', updated_at = ?
            WHERE id = ?
            """,
            (
                "PN",
                "Proctor Normal",
                "NF P 94-093",
                json.dumps(pn_payload, ensure_ascii=False),
                now,
                row["id"],
            ),
        )
        output_conn.execute(
            """
            INSERT INTO essais (
                echantillon_id, type_essai, norme, statut, date_debut, date_fin,
                resultats, operateur, observations,
                resultat_principal, resultat_unite, resultat_label,
                created_at, updated_at, essai_code
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["echantillon_id"],
                "IPI - Indice portant immediat",
                "NF P 94-078",
                row["statut"] or "",
                row["date_debut"] or "",
                row["date_fin"] or "",
                json.dumps(ipi_payload, ensure_ascii=False),
                row["operateur"] or "",
                row["observations"] or "",
                None,
                "",
                "",
                row["created_at"] or now,
                now,
                "IPI",
            ),
        )
        stats["converted_to_pn"] += 1
        stats["inserted_ipi_siblings"] += 1
    return {
        "stats": dict(stats),
        "skipped_preview": skipped[:100],
        "skipped_total": len(skipped),
    }


def build_forms_report(output_conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = fetch_rows(
        output_conn,
        """
        SELECT COALESCE(essai_code, '') AS essai_code, COALESCE(type_essai, '') AS type_essai, COUNT(*) AS count
        FROM essais
        GROUP BY COALESCE(essai_code, ''), COALESCE(type_essai, '')
        ORDER BY COUNT(*) DESC, essai_code ASC, type_essai ASC
        """,
    )
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        code = normalize_essai_code(str(row["essai_code"] or ""))
        type_essai = str(row["type_essai"] or "")
        if not code:
            code = f"(blank)::{type_essai}"
        item = grouped.setdefault(
            code,
            {
                "essai_code": code,
                "label": KNOWN_CODES.get(code, type_essai or code),
                "count": 0,
                "types": [],
            },
        )
        item["count"] += int(row["count"])
        if type_essai and type_essai not in item["types"]:
            item["types"].append(type_essai)

    items: list[dict[str, Any]] = []
    for code, item in grouped.items():
        normalized_code = code.split("::", 1)[0] if code.startswith("(blank)::") else code
        exact_supported = normalized_code in UI_FORM_CODES
        equivalent_code = UI_FORM_EQUIVALENTS.get(normalized_code)
        equivalent_supported = equivalent_code in UI_FORM_CODES if equivalent_code else False
        item["exact_form_available"] = exact_supported
        item["equivalent_form_code"] = equivalent_code or ""
        item["equivalent_form_available"] = equivalent_supported
        item["needs_new_form"] = not exact_supported and not equivalent_supported and not code.startswith("(blank)::")
        items.append(item)
    items.sort(key=lambda value: (-int(value["count"]), value["essai_code"]))
    return items


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Rebuilt Reconciliation Report",
        "",
        f"- Source DB: {report['paths']['source_db']}",
        f"- Rebuilt DB: {report['paths']['rebuilt_db']}",
        f"- Output DB: {report['paths']['output_db']}",
        "",
        "## Applied",
        f"- Inserted interventions_reelles: {report['interventions_reelles']['stats'].get('inserted', 0)}",
        f"- Inserted prelevements: {report['prelevements']['stats'].get('inserted', 0)}",
        f"- Updated interventions: {report['interventions']['stats'].get('rows_updated', 0)}",
        f"- Backfilled intervention nature_reelle: {report['interventions']['stats'].get('nature_backfilled', 0)}",
        f"- Backfilled intervention -> prelevement links: {report['interventions']['stats'].get('prelevement_link_backfilled', 0)}",
        f"- Backfilled intervention -> intervention_reelle links: {report['interventions']['stats'].get('intervention_reelle_link_backfilled', 0)}",
        f"- Legacy raw interventions backfilled: {report['interventions']['stats'].get('legacy_rows_updated', 0)}",
        f"- Legacy intervention_reelles created: {report['interventions']['stats'].get('legacy_interventions_reelles_created', 0)}",
        f"- Legacy prelevements created: {report['interventions']['stats'].get('legacy_prelevements_created', 0)}",
        f"- Backfilled essai_code from observations: {report['essais']['stats'].get('backfilled_from_observations', 0)}",
        f"- Backfilled essai_code from rebuilt match: {report['essais']['stats'].get('backfilled_from_rebuilt', 0)}",
        f"- Backfilled essai_code from type fallback: {report['essais']['stats'].get('backfilled_from_type_fallback', 0)}",
        f"- Split IPI - PR -> PN: {report['ipi_pr_split']['stats'].get('converted_to_pn', 0)}",
        f"- Inserted IPI siblings from split: {report['ipi_pr_split']['stats'].get('inserted_ipi_siblings', 0)}",
        f"- Materialized CFE échantillons: {report['cfe_materialization']['stats'].get('created_echantillons', 0)}",
        f"- Inserted GR siblings from CFE: {report['cfe_materialization']['stats'].get('inserted_gr_siblings', 0)}",
        f"- Inserted EL siblings from CFE: {report['cfe_materialization']['stats'].get('inserted_el_siblings', 0)}",
        f"- Inserted CFE pages: {report['cfe_materialization']['stats'].get('inserted_cfe_pages', 0)}",
        f"- Linked echantillons from rebuilt: {report['echantillons']['stats'].get('linked_from_rebuilt', 0)}",
        f"- Linked echantillons from parent intervention: {report['echantillons']['stats'].get('linked_from_parent_intervention', 0)}",
        f"- Created synthetic interventions_reelles for echantillons: {report['echantillons']['stats'].get('created_interventions_reelles', 0)}",
        f"- Created synthetic prelevements for echantillons: {report['echantillons']['stats'].get('created_prelevements', 0)}",
        f"- Realigned prelevements to parent intervention: {report['echantillons']['stats'].get('prelevement_intervention_realigned_from_parent', 0)}",
        f"- Deleted orphan synthetic interventions_reelles: {report['synthetic_cleanup']['stats'].get('deleted_orphan_synthetic_interventions_reelles', 0)}",
        f"- Remaining echantillons without prelevement: {report['echantillons']['unresolved_total']}",
        f"- Remaining blank essai_code rows: {report['essais']['unresolved_total']}",
        f"- Remaining legacy raw interventions unresolved: {report['interventions'].get('legacy_unresolved_total', 0)}",
        "",
        "## Forms Missing",
        "",
        "| Code | Label | Count | UI status | Types |",
        "| --- | --- | ---: | --- | --- |",
    ]
    for item in report["forms"]:
        if not item["needs_new_form"]:
            continue
        types_value = ", ".join(item["types"][:4])
        lines.append(
            f"| {item['essai_code']} | {item['label']} | {item['count']} | missing | {types_value} |"
        )
    if lines[-1] == "| --- | --- | ---: | --- | --- |":
        lines.append("| none | none | 0 | n/a | n/a |")
    if report["interventions"]["conflicts_total"]:
        lines.extend(
            [
                "",
                "## Intervention Conflicts",
                f"- Total conflicts skipped: {report['interventions']['conflicts_total']}",
            ]
        )
    return "\n".join(lines) + "\n"


def write_reports(paths: Paths, report: dict[str, Any], force: bool) -> None:
    for path in (paths.report_json, paths.report_md):
        if path.exists():
            if not force:
                raise FileExistsError(f"Report path already exists: {path}")
            path.unlink()
    paths.report_json.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    paths.report_md.write_text(render_markdown(report), encoding="utf-8")


def run(paths: Paths, force: bool, in_place: bool = False) -> dict[str, Any]:
    copy_database(paths.source_db, paths.output_db, force=force, in_place=in_place)
    ensure_ralab4_schema(paths.output_db)

    with connect_db(paths.output_db) as output_conn, connect_db(paths.rebuilt_db) as rebuilt_conn:
        rebuilt_demande_ref_by_id = fetch_demande_ref_by_id(rebuilt_conn)
        output_demande_id_by_ref = fetch_reference_id_map(output_conn, "demandes")
        rebuilt_essai_lookup = build_rebuilt_essai_lookup(rebuilt_conn)

        rebuilt_intervention_reelle_to_output, intervention_reelle_report = insert_interventions_reelles(
            output_conn,
            rebuilt_conn,
            rebuilt_demande_ref_by_id,
            output_demande_id_by_ref,
        )
        rebuilt_prelevement_to_output, prelevement_report = insert_prelevements(
            output_conn,
            rebuilt_conn,
            rebuilt_demande_ref_by_id,
            output_demande_id_by_ref,
            rebuilt_intervention_reelle_to_output,
        )
        interventions_report = reconcile_interventions(
            output_conn,
            rebuilt_conn,
            rebuilt_prelevement_to_output,
            rebuilt_intervention_reelle_to_output,
        )
        essais_report = reconcile_essai_codes(output_conn, rebuilt_essai_lookup)
        ipi_pr_split_report = split_ipi_pr_essais(output_conn)
        cfe_materialization_report = materialize_cfe_composites(output_conn)
        echantillons_report = reconcile_echantillon_links(output_conn, rebuilt_conn)
        synthetic_cleanup_report = cleanup_orphan_synthetic_interventions_reelles(output_conn)
        forms_report = build_forms_report(output_conn)
        output_conn.commit()

    report = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "paths": {
            "source_db": str(paths.source_db),
            "rebuilt_db": str(paths.rebuilt_db),
            "output_db": str(paths.output_db),
            "report_json": str(paths.report_json),
            "report_md": str(paths.report_md),
        },
        "interventions_reelles": {"stats": dict(intervention_reelle_report)},
        "prelevements": {"stats": dict(prelevement_report)},
        "interventions": interventions_report,
        "echantillons": echantillons_report,
        "essais": essais_report,
        "ipi_pr_split": ipi_pr_split_report,
        "cfe_materialization": cfe_materialization_report,
        "synthetic_cleanup": synthetic_cleanup_report,
        "forms": forms_report,
    }
    write_reports(paths, report, force=force)
    return report


def main() -> None:
    args = parse_args()
    paths = build_paths(args)
    assert_paths(paths, force=args.force, in_place=args.in_place)
    report = run(paths, force=args.force, in_place=args.in_place)
    print(json.dumps(
        {
            "output_db": report["paths"]["output_db"],
            "report_json": report["paths"]["report_json"],
            "report_md": report["paths"]["report_md"],
            "inserted_interventions_reelles": report["interventions_reelles"]["stats"].get("inserted", 0),
            "inserted_prelevements": report["prelevements"]["stats"].get("inserted", 0),
            "updated_interventions": report["interventions"]["stats"].get("rows_updated", 0),
            "legacy_raw_interventions_backfilled": report["interventions"]["stats"].get("legacy_rows_updated", 0),
            "legacy_interventions_reelles_created": report["interventions"]["stats"].get("legacy_interventions_reelles_created", 0),
            "legacy_prelevements_created": report["interventions"]["stats"].get("legacy_prelevements_created", 0),
            "legacy_de_rows_reclassified": report["interventions"]["stats"].get("legacy_de_rows_reclassified", 0),
            "legacy_de_prelevements_deleted": report["interventions"]["stats"].get("legacy_de_prelevements_deleted", 0),
            "essai_codes_backfilled": sum(
                int(value)
                for key, value in report["essais"]["stats"].items()
                if key.startswith("backfilled_from_")
            ),
            "split_ipi_pr_to_pn": report["ipi_pr_split"]["stats"].get("converted_to_pn", 0),
            "inserted_ipi_from_split": report["ipi_pr_split"]["stats"].get("inserted_ipi_siblings", 0),
            "inserted_gr_from_cfe": report["cfe_materialization"]["stats"].get("inserted_gr_siblings", 0),
            "inserted_el_from_cfe": report["cfe_materialization"]["stats"].get("inserted_el_siblings", 0),
            "inserted_cfe_pages": report["cfe_materialization"]["stats"].get("inserted_cfe_pages", 0),
            "linked_echantillons_from_rebuilt": report["echantillons"]["stats"].get("linked_from_rebuilt", 0),
            "linked_echantillons_from_parent_intervention": report["echantillons"]["stats"].get("linked_from_parent_intervention", 0),
            "created_interventions_reelles_for_echantillons": report["echantillons"]["stats"].get("created_interventions_reelles", 0),
            "created_prelevements_for_echantillons": report["echantillons"]["stats"].get("created_prelevements", 0),
            "realigned_prelevements_to_parent_intervention": report["echantillons"]["stats"].get("prelevement_intervention_realigned_from_parent", 0),
            "deleted_orphan_synthetic_interventions_reelles": report["synthetic_cleanup"]["stats"].get("deleted_orphan_synthetic_interventions_reelles", 0),
            "remaining_echantillons_without_prelevement": report["echantillons"]["unresolved_total"],
            "remaining_blank_essai_code": report["essais"]["unresolved_total"],
            "remaining_legacy_raw_interventions_unresolved": report["interventions"].get("legacy_unresolved_total", 0),
            "missing_form_codes": [
                item["essai_code"]
                for item in report["forms"]
                if item["needs_new_form"]
            ],
        },
        indent=2,
        ensure_ascii=False,
    ))


if __name__ == "__main__":
    main()