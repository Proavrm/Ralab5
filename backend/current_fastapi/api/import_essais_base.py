"""
GLOBAL ESSAI IMPORTER ENGINE (Base Module)

This is the unified core for importing all essai types (DE, SC, Triaxial, IPI, etc.).
It provides the common orchestration pattern:
  1. Resolve affaire context
  2. Find or create Demande/Campagne/Intervention hierarchy
  3. Predict references (sequence generation)
  4. Filter already-imported data
  5. Propose grouping based on temporal gaps

Type-specific extractors (DE, SC, etc.) inherit from this base and provide only:
  - Header extraction for their sheet format
  - Payload building for their data structure
  - Type-specific essai creation logic

This architecture ensures:
  - NO duplicate hierarchy logic between types
  - NEW types reuse the entire engine (just plug in an extractor)
  - CONSISTENT preview/filtering across all types
"""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, date
from typing import Any, Optional

from app.core.database import get_db_path
from app.repositories.demandes_rst_repository import DemandesRstRepository


def _clean(value: Any) -> str:
    """Normalize string value."""
    return "" if value is None else str(value).strip()


def _normalize_affaire_nge(value: str) -> str:
    """Normalize affaire NGE: remove spaces/hyphens, uppercase (e.g. RA L1EC -> RAL1EC)."""
    return re.sub(r"\W+", "", _clean(value)).upper()


def _parse_iso_date(value: Any) -> Optional[date]:
    """Parse ISO date string (YYYY-MM-DD) or datetime.date object."""
    if isinstance(value, date):
        return value
    text = _clean(value)
    if not text or len(text) < 10:
        return None
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _extract_year(value: Any) -> int:
    """Extract year from mixed date inputs; fallback to current year."""
    parsed = _parse_iso_date(value)
    if parsed:
        return parsed.year

    text = _clean(value)
    if text:
        # Accept noisy strings such as "Nuit 12/03/2024".
        match = re.search(r"(?:19|20)\d{2}", text)
        if match:
            try:
                return int(match.group(0))
            except ValueError:
                pass
    return datetime.now().year


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 0: AFFAIRE CONTEXT RESOLUTION
# ──────────────────────────────────────────────────────────────────────────────


def _resolve_affaire_context(
    conn: sqlite3.Connection,
    affaire_reference: str = "",
    affaire_nge: str = "",
) -> dict[str, Any]:
    """
    Resolve affaire context for import preview/materialization.
    Returns structure with selected affaire and match mode ('reference', 'nge', or 'none').
    """
    by_reference: Optional[sqlite3.Row] = None
    by_nge: Optional[sqlite3.Row] = None

    if affaire_reference:
        ref_clean = _clean(affaire_reference).upper()
        by_reference = conn.execute(
            """
            SELECT id, reference, affaire_nge, chantier, statut
            FROM affaires_rst
            WHERE UPPER(reference) = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (ref_clean,),
        ).fetchone()

    if affaire_nge and by_reference is None:
        nge_norm = _normalize_affaire_nge(affaire_nge)
        if nge_norm:
            rows = conn.execute(
                """
                SELECT id, reference, affaire_nge, chantier, statut
                FROM affaires_rst
                ORDER BY id DESC
                """
            ).fetchall()
            for row in rows:
                if _normalize_affaire_nge(_clean(row["affaire_nge"])) == nge_norm:
                    by_nge = row
                    break

    selected = by_reference or by_nge
    match_mode = "reference" if by_reference else ("affaire_nge" if by_nge else "none")

    return {
        "by_reference": dict(by_reference) if by_reference else None,
        "by_affaire_nge": dict(by_nge) if by_nge else None,
        "selected": dict(selected) if selected else None,
        "match_mode": match_mode,
    }


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 1: HIERARCHY FIND/CREATE
# ──────────────────────────────────────────────────────────────────────────────


def _find_demandes_by_affaire(
    conn: sqlite3.Connection,
    affaire_nge: str,
    affaire_rst_id: int = 0,
) -> list[dict[str, Any]]:
    """Find demandes linked to an affaire (by NGE or by affaire_rst_id)."""
    if affaire_rst_id:
        rows = conn.execute(
            """
            SELECT id, reference, statut, annee, date_reception, created_at
            FROM demandes
            WHERE affaire_rst_id = ?
            ORDER BY created_at DESC
            """,
            (affaire_rst_id,),
        ).fetchall()
        if rows:
            return [dict(row) for row in rows]

    normalized_target = _normalize_affaire_nge(affaire_nge)
    if not normalized_target:
        return []

    # Fallback 1: if demandes.affaire_nge exists, use it for legacy rows not linked by affaire_rst_id.
    demande_cols = {row[1] for row in conn.execute("PRAGMA table_info(demandes)").fetchall()}
    if "affaire_nge" in demande_cols:
        rows = conn.execute(
            """
            SELECT id, reference, statut, annee, date_reception, created_at, affaire_nge
            FROM demandes
            ORDER BY created_at DESC
            """
        ).fetchall()
        legacy_matches = [dict(row) for row in rows if _normalize_affaire_nge(_clean(row["affaire_nge"])) == normalized_target]
        if legacy_matches:
            return legacy_matches

    # Fallback 2: resolve affaire_rst by normalized NGE and fetch demandes by FK.
    aff_rows = conn.execute(
        """
        SELECT id, affaire_nge
        FROM affaires_rst
        ORDER BY id DESC
        """
    ).fetchall()
    matched_affaire_id: Optional[int] = None
    for aff_row in aff_rows:
        if _normalize_affaire_nge(_clean(aff_row["affaire_nge"])) == normalized_target:
            matched_affaire_id = int(aff_row["id"])
            break
    if matched_affaire_id is None:
        return []

    rows = conn.execute(
        """
        SELECT id, reference, statut, annee, date_reception, created_at
        FROM demandes
        WHERE affaire_rst_id = ?
        ORDER BY created_at DESC
        """,
        (matched_affaire_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def _find_campagnes_by_demande(
    conn: sqlite3.Connection,
    demande_id: int,
) -> list[dict[str, Any]]:
    """Find campagnes under a demande."""
    if not demande_id:
        return []

    rows = conn.execute(
        """
        SELECT
            id,
            reference,
            statut,
            date_debut_prevue AS date_debut,
            date_fin_prevue AS date_fin
        FROM campagnes
        WHERE demande_id = ?
        ORDER BY created_at DESC
        """,
        (demande_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def _find_interventions_by_campagne(
    conn: sqlite3.Connection,
    campagne_id: int,
) -> list[dict[str, Any]]:
    """Find interventions under a campagne."""
    if not campagne_id:
        return []

    rows = conn.execute(
        """
        SELECT id, reference, statut
        FROM interventions
        WHERE campagne_id = ?
        ORDER BY created_at DESC
        """,
        (campagne_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def _next_demande_reference(
    conn: sqlite3.Connection,
    labo_code: str = "SP",
    annee: Optional[int] = None,
) -> tuple[str, int, int]:
    year = annee or datetime.now().year
    normalized_labo = (_clean(labo_code) or "SP").upper()

    repo_reference = DemandesRstRepository().next_reference(normalized_labo, year)
    match = re.match(rf"^{re.escape(str(year))}-{re.escape(normalized_labo)}-D(\d+)$", repo_reference)
    number = int(match.group(1)) if match else 1

    candidate = f"{year}-{normalized_labo}-D{number:04d}"
    while conn.execute("SELECT 1 FROM demandes WHERE reference = ? LIMIT 1", (candidate,)).fetchone():
        number += 1
        candidate = f"{year}-{normalized_labo}-D{number:04d}"

    return candidate, year, number


def _next_campaign_reference(conn: sqlite3.Connection, demande_id: int) -> str:
    row = conn.execute("SELECT annee, labo_code FROM demandes WHERE id = ?", (demande_id,)).fetchone()
    annee = row["annee"] if row and row["annee"] else datetime.now().year
    labo = row["labo_code"] if row and row["labo_code"] else "SP"
    prefix = f"{annee}-{labo}-C"
    rows = conn.execute("SELECT reference FROM campagnes WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
    numbers: list[int] = []
    for item in rows:
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", _clean(item["reference"]))
        if match:
            numbers.append(int(match.group(1)))
    return f"{prefix}{max(numbers, default=0) + 1:03d}"


def _next_intervention_reference(conn: sqlite3.Connection, demande_id: int) -> tuple[str, int, str, int]:
    row = conn.execute("SELECT annee, labo_code FROM demandes WHERE id = ?", (demande_id,)).fetchone()
    annee = row["annee"] if row and row["annee"] else datetime.now().year
    labo = row["labo_code"] if row and row["labo_code"] else "SP"
    prefix = f"{annee}-{labo}-I"
    rows = conn.execute("SELECT reference FROM interventions WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
    nums: list[int] = []
    for item in rows:
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", _clean(item["reference"]))
        if match:
            nums.append(int(match.group(1)))
    number = max(nums, default=0) + 1
    return f"{prefix}{number:04d}", annee, labo, number


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 1B: REFERENCE PREDICTION
# ──────────────────────────────────────────────────────────────────────────────


def _predict_references(
    conn: sqlite3.Connection,
    demande_groups: list[list[dict[str, Any]]],
    campagne_gap_days: int,
    labo_code: str = "SP",
) -> list[dict[str, Any]]:
    """
    Generate predicted references for demandes/campagnes/interventions.
    This is shared logic for ALL essai types.
    
    Args:
        demande_groups: List of demande groups (each is list of sheet_rows)
        campagne_gap_days: Gap threshold for campagne grouping
        labo_code: Lab code (default 'SP')
    
    Returns:
        List of predictions [{ predicted_demande_reference, campagnes: [...] }]
    """
    d_max: dict[tuple[int, str], int] = {}
    c_max: dict[tuple[int, str], int] = {}
    i_max: dict[tuple[int, str], int] = {}
    d_alloc: dict[tuple[int, str], int] = {}
    c_alloc: dict[tuple[int, str], int] = {}
    i_alloc: dict[tuple[int, str], int] = {}

    def _d_next(year: int) -> int:
        key = (year, labo_code)
        if key not in d_max:
            prefix = f"{year}-{labo_code}-D"
            rows = conn.execute("SELECT reference FROM demandes WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
            nums = [int(r["reference"][len(prefix) :]) for r in rows if _clean(r["reference"])[len(prefix) :].isdigit()]
            d_max[key] = max(nums, default=0)
        d_alloc[key] = d_alloc.get(key, 0) + 1
        return d_max[key] + d_alloc[key]

    def _c_next(year: int) -> int:
        key = (year, labo_code)
        if key not in c_max:
            prefix = f"{year}-{labo_code}-C"
            rows = conn.execute("SELECT reference FROM campagnes WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
            nums: list[int] = []
            for row in rows:
                match = re.match(rf"^{re.escape(prefix)}(\d+)$", _clean(row["reference"]))
                if match:
                    nums.append(int(match.group(1)))
            c_max[key] = max(nums, default=0)
        c_alloc[key] = c_alloc.get(key, 0) + 1
        return c_max[key] + c_alloc[key]

    def _i_next(year: int) -> int:
        key = (year, labo_code)
        if key not in i_max:
            prefix = f"{year}-{labo_code}-I"
            rows = conn.execute("SELECT reference FROM interventions WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
            nums: list[int] = []
            for row in rows:
                match = re.match(rf"^{re.escape(prefix)}(\d+)$", _clean(row["reference"]))
                if match:
                    nums.append(int(match.group(1)))
            i_max[key] = max(nums, default=0)
        i_alloc[key] = i_alloc.get(key, 0) + 1
        return i_max[key] + i_alloc[key]

    result: list[dict[str, Any]] = []
    for group in demande_groups:
        year = _extract_year(group[0].get("date_sondage") if group else None)
        d_num = _d_next(year)
        d_ref = f"{year}-{labo_code}-D{d_num:04d}"

        # Reuse same gap split for campagnes
        campagne_groups: list[list[dict[str, Any]]] = []
        current: list[dict[str, Any]] = []
        prev_date: Optional[date] = None
        for row in group:
            date_val = _parse_iso_date(row.get("date_sondage"))
            if not current:
                current = [row]
                prev_date = date_val
                continue
            if prev_date and date_val and abs((date_val - prev_date).days) <= max(0, int(campagne_gap_days or 0)):
                current.append(row)
            else:
                campagne_groups.append(current)
                current = [row]
            prev_date = date_val
        if current:
            campagne_groups.append(current)

        c_preds: list[dict[str, Any]] = []
        for c_group in campagne_groups:
            c_num = _c_next(year)
            c_ref = f"{year}-{labo_code}-C{c_num:03d}"
            i_preds: list[dict[str, Any]] = []
            for sheet_row in c_group:
                i_num = _i_next(year)
                i_ref = f"{year}-{labo_code}-I{i_num:04d}"
                i_preds.append({"sheet_name": sheet_row.get("sheet_name"), "predicted_intervention_reference": i_ref})
            c_preds.append({"predicted_campagne_reference": c_ref, "interventions": i_preds})

        result.append({"predicted_demande_reference": d_ref, "campagnes": c_preds})

    return result


# ──────────────────────────────────────────────────────────────────────────────
# MODULE ACTIVATION HELPER
# ──────────────────────────────────────────────────────────────────────────────


def ensure_modules_enabled(
    conn: sqlite3.Connection,
    demande_id: int,
    module_codes: list[str],
) -> None:
    """Enable given modules for a demande (upsert, idempotent)."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for code in module_codes:
        conn.execute(
            """
            INSERT INTO demande_enabled_modules (demande_id, module_code, is_enabled, created_at, updated_at)
            VALUES (?, ?, 1, ?, ?)
            ON CONFLICT(demande_id, module_code) DO UPDATE SET is_enabled = 1, updated_at = excluded.updated_at
            """,
            (int(demande_id), code, now, now),
        )


# ──────────────────────────────────────────────────────────────────────────────
# PHASE 1C: TEMPORAL GROUPING (for preview grouping)
# ──────────────────────────────────────────────────────────────────────────────


def ensure_hierarchy(
    conn: sqlite3.Connection,
    affaire_context: dict[str, Any],
    anchor_date: date,
    demande_gap_days: int = 120,
    campagne_gap_days: int = 7,
    demande_id: Optional[int] = None,
    campagne_id: Optional[int] = None,
    intervention_id: Optional[int] = None,
    labo_code: str = "SP",
    hierarchy_type_hint: str = "",
) -> dict[str, Any]:
    """
    UNIFIED ORCHESTRATOR: Find or create Demande/Campagne/Intervention hierarchy.
    
    This function centralizes the find-or-create logic for ALL essai types (DE, SC, future types).
    It eliminates duplicate hierarchy creation code across extractors.
    
    Args:
        conn: SQLite connection
        affaire_context: Result from _resolve_affaire_context()
        anchor_date: Reference date for grouping (e.g. date_sondage for SC, date_essai for DE)
        demande_gap_days: Max days gap for grouping into same demande (default 120)
        campagne_gap_days: Max days gap for grouping into same campagne (default 7)
        demande_id: If provided, skip demande lookup/creation and use this ID
        campagne_id: If provided, skip campagne lookup/creation and use this ID
        intervention_id: If provided, skip intervention lookup/creation and use this ID
        labo_code: Lab code for reference generation (default "SP")
        hierarchy_type_hint: Optional note (e.g. "SC sondage carotte", "DE densités") for audit trail
    
    Returns:
        {
            "affaire_id": int,
            "demande_id": int,
            "campagne_id": int,
            "intervention_id": int,
            "created": {
                "demande": bool,
                "campagne": bool,
                "intervention": bool,
            }
        }
    """
    selected_affaire = affaire_context.get("selected")
    if not selected_affaire:
        raise ValueError("No affaire found in context")

    affaire_rst_id = int(selected_affaire["id"])
    affaire_nge = _clean(selected_affaire.get("affaire_nge", ""))

    demande_created = False
    campagne_created = False
    intervention_created = False

    # ─────────────────────────────────────────────────────────────────
    # STEP 1: Find or create DEMANDE
    # ─────────────────────────────────────────────────────────────────
    if not demande_id:
        demandes = _find_demandes_by_affaire(conn, affaire_nge, affaire_rst_id)
        best_demande: Optional[dict[str, Any]] = None
        best_gap: Optional[int] = None

        for d in demandes:
            d_date = _parse_iso_date(d.get("date_reception") or d.get("created_at"))
            if not d_date:
                continue
            gap = abs((anchor_date - d_date).days)
            if gap <= max(0, int(demande_gap_days)) and (best_gap is None or gap < best_gap):
                best_gap = gap
                best_demande = d

        if best_demande:
            demande_id = int(best_demande["id"])
        else:
            # Create new demande
            ref, annee, numero = _next_demande_reference(conn, labo_code=labo_code, annee=anchor_date.year)
            demandes_cols = {row[1] for row in conn.execute("PRAGMA table_info(demandes)").fetchall()}
            values: dict[str, Any] = {
                "reference": ref,
                "affaire_rst_id": affaire_rst_id,
                "date_reception": anchor_date.isoformat(),
            }
            optional = {
                "annee": annee,
                "labo_code": labo_code,
                "numero": numero,
                "nature": f"Import {hierarchy_type_hint}" if hierarchy_type_hint else "Import automatique",
                "description": f"Import automatique {hierarchy_type_hint}",
                "demandeur": "Import Outils",
                "statut": "en_cours",
                "priorite": "normale",
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
            for key, val in optional.items():
                if key in demandes_cols:
                    values[key] = val
            cols = list(values.keys())
            placeholders = ", ".join(["?"] * len(cols))
            conn.execute(
                f"INSERT INTO demandes ({', '.join(cols)}) VALUES ({placeholders})",
                tuple(values[c] for c in cols),
            )
            demande_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
            demande_created = True

    # ─────────────────────────────────────────────────────────────────
    # STEP 2: Find or create CAMPAGNE
    # ─────────────────────────────────────────────────────────────────
    if not campagne_id:
        campagnes = _find_campagnes_by_demande(conn, int(demande_id))
        best_campagne: Optional[dict[str, Any]] = None
        best_gap = None

        for c in campagnes:
            start = _parse_iso_date(c.get("date_debut"))
            end = _parse_iso_date(c.get("date_fin"))
            # Exact match: date within campagne's range
            if start and end and start <= anchor_date <= end:
                best_campagne = c
                best_gap = 0
                break
            # Proximity match: closest endpoint
            candidates = [d for d in [start, end] if d is not None]
            if not candidates:
                continue
            gap = min(abs((anchor_date - d).days) for d in candidates)
            if gap <= max(0, int(campagne_gap_days)) and (best_gap is None or gap < best_gap):
                best_gap = gap
                best_campagne = c

        if best_campagne:
            campagne_id = int(best_campagne["id"])
        else:
            # Create new campagne
            ref = _next_campaign_reference(conn, int(demande_id))
            campagnes_cols = {row[1] for row in conn.execute("PRAGMA table_info(campagnes)").fetchall()}
            values: dict[str, Any] = {
                "reference": ref,
                "demande_id": int(demande_id),
            }
            optional = {
                "code": labo_code,
                "designation": f"Import {hierarchy_type_hint}" if hierarchy_type_hint else "Import automatique",
                "date_debut_prevue": anchor_date.isoformat(),
                "date_fin_prevue": anchor_date.isoformat(),
                "notes": f"Import automatique {hierarchy_type_hint}",
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
            for key, val in optional.items():
                if key in campagnes_cols:
                    values[key] = val
            cols = list(values.keys())
            placeholders = ", ".join(["?"] * len(cols))
            conn.execute(
                f"INSERT INTO campagnes ({', '.join(cols)}) VALUES ({placeholders})",
                tuple(values[c] for c in cols),
            )
            campagne_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
            campagne_created = True

    # ─────────────────────────────────────────────────────────────────
    # STEP 3: Find or create INTERVENTION
    # ─────────────────────────────────────────────────────────────────
    if not intervention_id:
        interventions = _find_interventions_by_campagne(conn, int(campagne_id))
        for inv in interventions:
            row = conn.execute("SELECT id, date_intervention FROM interventions WHERE id = ?", (inv["id"],)).fetchone()
            if row and _parse_iso_date(row["date_intervention"]) == anchor_date:
                intervention_id = int(row["id"])
                break

        if not intervention_id:
            # Create new intervention
            ref, annee, labo, numero = _next_intervention_reference(conn, int(demande_id))
            interventions_cols = {row[1] for row in conn.execute("PRAGMA table_info(interventions)").fetchall()}
            values: dict[str, Any] = {
                "reference": ref,
                "demande_id": int(demande_id),
                "date_intervention": anchor_date.isoformat(),
            }
            optional = {
                "annee": annee,
                "labo_code": labo,
                "numero": numero,
                "campagne_id": int(campagne_id),
                "type_intervention": hierarchy_type_hint if hierarchy_type_hint else "Import",
                "sujet": f"Import automatique {hierarchy_type_hint}",
                "statut": "Réalisée",
                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }
            for key, val in optional.items():
                if key in interventions_cols:
                    values[key] = val
            cols = list(values.keys())
            placeholders = ", ".join(["?"] * len(cols))
            conn.execute(
                f"INSERT INTO interventions ({', '.join(cols)}) VALUES ({placeholders})",
                tuple(values[c] for c in cols),
            )
            intervention_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
            intervention_created = True

    return {
        "affaire_id": affaire_rst_id,
        "demande_id": int(demande_id),
        "campagne_id": int(campagne_id),
        "intervention_id": int(intervention_id),
        "created": {
            "demande": demande_created,
            "campagne": campagne_created,
            "intervention": intervention_created,
        },
    }


def group_rows_by_temporal_gap(
    rows: list[dict[str, Any]],
    gap_days: int,
    date_field: str = "date_sondage",
) -> list[list[dict[str, Any]]]:
    """
    Group rows by temporal proximity (e.g., by date_sondage with max gap of gap_days).
    Used for demande grouping (120 days), campagne grouping (7 days), etc.
    """
    if not rows:
        return []

    groups: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []
    prev_date: Optional[date] = None
    safe_gap = max(0, int(gap_days or 0))

    for row in rows:
        date_val = _parse_iso_date(row.get(date_field))
        if not current:
            current = [row]
            prev_date = date_val
            continue
        if prev_date and date_val and abs((date_val - prev_date).days) <= safe_gap:
            current.append(row)
        else:
            groups.append(current)
            current = [row]
        prev_date = date_val

    if current:
        groups.append(current)

    return groups
