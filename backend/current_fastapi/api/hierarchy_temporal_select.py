"""
Temporal matching for demande/campagne (120 / 7 day rules) used by ensure_hierarchy (PMT, SC).

Kept free of FastAPI/Pydantic so offline tools (e.g. tools/audit_hierarchy_temporal.py) can import it.

Provisional import labels on created rows (demande.nature, etc.) are documented in import_essais_base;
a future recompute_aggregate_hierarchy_labels pass may replace them with aggregated wording (e.g. DE+PMT).
"""

from __future__ import annotations

import re
import sqlite3
from datetime import date, datetime
from typing import Any, Optional

# Same semantics as ensure_hierarchy defaults in import_essais_base.
HIERARCHY_TEMPORAL_DEMANDE_GAP_DAYS = 120
HIERARCHY_TEMPORAL_CAMPAGNE_GAP_DAYS = 7


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _normalize_affaire_nge(value: str) -> str:
    return re.sub(r"\W+", "", _clean(value)).upper()


def parse_iso_date(value: Any) -> Optional[date]:
    """Parse ISO date (YYYY-MM-DD) or datetime.date (for audits / callers)."""
    if isinstance(value, date):
        return value
    text = _clean(value)
    if not text or len(text) < 10:
        return None
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _parse_iso_date(value: Any) -> Optional[date]:
    return parse_iso_date(value)


def _find_demandes_by_affaire(
    conn: sqlite3.Connection,
    affaire_nge: str,
    affaire_rst_id: int = 0,
) -> list[dict[str, Any]]:
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

    demande_cols = {row[1] for row in conn.execute("PRAGMA table_info(demandes)").fetchall()}
    if "affaire_nge" in demande_cols:
        rows = conn.execute(
            """
            SELECT id, reference, statut, annee, date_reception, created_at, affaire_nge
            FROM demandes
            ORDER BY created_at DESC
            """
        ).fetchall()
        legacy_matches = [
            dict(row)
            for row in rows
            if _normalize_affaire_nge(_clean(row["affaire_nge"])) == normalized_target
        ]
        if legacy_matches:
            return legacy_matches

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


def _demande_activity_bounds(conn: sqlite3.Connection, demande_id: int) -> tuple[Optional[date], Optional[date]]:
    dates: list[date] = []
    for row in conn.execute(
        """
        SELECT date_intervention
        FROM interventions
        WHERE demande_id = ?
          AND date_intervention IS NOT NULL
          AND TRIM(date_intervention) != ''
        """,
        (demande_id,),
    ).fetchall():
        parsed = _parse_iso_date(row["date_intervention"])
        if parsed:
            dates.append(parsed)
    try:
        for row in conn.execute(
            """
            SELECT date_essai_debut
            FROM pmt_essais
            WHERE demande_id = ?
              AND date_essai_debut IS NOT NULL
              AND TRIM(date_essai_debut) != ''
            """,
            (demande_id,),
        ).fetchall():
            parsed = _parse_iso_date(row["date_essai_debut"])
            if parsed:
                dates.append(parsed)
    except sqlite3.OperationalError:
        pass
    if not dates:
        return None, None
    return min(dates), max(dates)


def select_demande_id_for_anchor(
    conn: sqlite3.Connection,
    affaire_nge: str,
    affaire_rst_id: int,
    anchor_date: date,
    demande_gap_days: int,
) -> Optional[int]:
    """Read-only Step-1: which existing demande ensure_hierarchy would pick (no explicit bind)."""
    demandes = _find_demandes_by_affaire(conn, affaire_nge, affaire_rst_id)
    best_demande: Optional[dict[str, Any]] = None
    best_gap: Optional[int] = None
    safe_gap = max(0, int(demande_gap_days or 0))

    for d in demandes:
        did = int(d["id"])
        d_date = _parse_iso_date(d.get("date_reception") or d.get("created_at"))
        span_lo, span_hi = _demande_activity_bounds(conn, did)
        gap: Optional[int] = None
        if span_lo and span_hi and span_lo <= anchor_date <= span_hi:
            gap = 0
        elif d_date is not None:
            gap = abs((anchor_date - d_date).days)
        else:
            continue
        if gap > safe_gap:
            continue
        if best_gap is None or gap < best_gap:
            best_gap = gap
            best_demande = d
        elif best_demande is not None and gap == best_gap and did < int(best_demande["id"]):
            best_demande = d

    return int(best_demande["id"]) if best_demande else None


def select_campagne_id_for_anchor(
    conn: sqlite3.Connection,
    demande_id: int,
    anchor_date: date,
    campagne_gap_days: int,
) -> Optional[int]:
    """Read-only Step-2: which existing campagne ensure_hierarchy would pick for this demande."""
    if not demande_id:
        return None
    campagnes = _find_campagnes_by_demande(conn, int(demande_id))
    best_campagne: Optional[dict[str, Any]] = None
    best_gap: Optional[int] = None
    safe_gap = max(0, int(campagne_gap_days or 0))

    for c in campagnes:
        start = _parse_iso_date(c.get("date_debut"))
        end = _parse_iso_date(c.get("date_fin"))
        if start and end and start <= anchor_date <= end:
            best_campagne = c
            best_gap = 0
            break
        candidates = [d for d in [start, end] if d is not None]
        if not candidates:
            continue
        gap = min(abs((anchor_date - d).days) for d in candidates)
        if gap <= safe_gap and (best_gap is None or gap < best_gap):
            best_gap = gap
            best_campagne = c

    return int(best_campagne["id"]) if best_campagne else None


# Aliases used inside import_essais_base.ensure_hierarchy
_select_demande_id_for_anchor = select_demande_id_for_anchor
_select_campagne_id_for_anchor = select_campagne_id_for_anchor


def _find_interventions_by_campagne(
    conn: sqlite3.Connection,
    campagne_id: int,
) -> list[dict[str, Any]]:
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


def _next_demande_reference_sql(
    conn: sqlite3.Connection,
    labo_code: str = "SP",
    annee: Optional[int] = None,
) -> tuple[str, int, int]:
    """Next D reference from SQLite only (no external repo)."""
    year = annee or datetime.now().year
    lab = (_clean(labo_code) or "SP").upper()
    prefix = f"{year}-{lab}-D"
    rows = conn.execute("SELECT reference FROM demandes WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
    nums: list[int] = []
    for r in rows:
        ref = _clean(r["reference"])
        tail = ref[len(prefix) :] if ref.startswith(prefix) else ""
        if tail.isdigit():
            nums.append(int(tail))
    number = max(nums, default=0) + 1
    candidate = f"{prefix}{number:04d}"
    while conn.execute("SELECT 1 FROM demandes WHERE reference = ? LIMIT 1", (candidate,)).fetchone():
        number += 1
        candidate = f"{prefix}{number:04d}"
    return candidate, year, number


def _next_campaign_reference_sql(conn: sqlite3.Connection, demande_id: int) -> str:
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


def _next_intervention_reference_sql(conn: sqlite3.Connection, demande_id: int) -> tuple[str, int, str, int]:
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


def ensure_hierarchy_sqlite(
    conn: sqlite3.Connection,
    affaire_context: dict[str, Any],
    anchor_date: date,
    demande_gap_days: int = HIERARCHY_TEMPORAL_DEMANDE_GAP_DAYS,
    campagne_gap_days: int = HIERARCHY_TEMPORAL_CAMPAGNE_GAP_DAYS,
    demande_id: Optional[int] = None,
    campagne_id: Optional[int] = None,
    intervention_id: Optional[int] = None,
    labo_code: str = "SP",
    import_profile_label: str = "",
) -> dict[str, Any]:
    """
    Same behaviour as import_essais_base.ensure_hierarchy but uses SQLite-only next-D reference
    (no Pydantic / DemandesRstRepository). For offline migrations and tools.
    """
    selected_affaire = affaire_context.get("selected")
    if not selected_affaire:
        raise ValueError("No affaire found in context")

    affaire_rst_id = int(selected_affaire["id"])
    affaire_nge = _clean(selected_affaire.get("affaire_nge", ""))

    demande_created = False
    campagne_created = False
    intervention_created = False

    if not demande_id:
        picked = select_demande_id_for_anchor(
            conn,
            affaire_nge,
            affaire_rst_id,
            anchor_date,
            int(demande_gap_days),
        )
        if picked is not None:
            demande_id = picked
        else:
            ref, annee, numero = _next_demande_reference_sql(conn, labo_code=labo_code, annee=anchor_date.year)
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
                "nature": f"Import {import_profile_label}" if import_profile_label else "Import automatique",
                "description": f"Import automatique {import_profile_label}",
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

    if not campagne_id:
        picked_c = select_campagne_id_for_anchor(
            conn,
            int(demande_id),
            anchor_date,
            int(campagne_gap_days),
        )
        if picked_c is not None:
            campagne_id = picked_c
        else:
            ref = _next_campaign_reference_sql(conn, int(demande_id))
            campagnes_cols = {row[1] for row in conn.execute("PRAGMA table_info(campagnes)").fetchall()}
            values = {
                "reference": ref,
                "demande_id": int(demande_id),
            }
            optional = {
                "code": labo_code,
                "designation": f"Import {import_profile_label}" if import_profile_label else "Import automatique",
                "date_debut_prevue": anchor_date.isoformat(),
                "date_fin_prevue": anchor_date.isoformat(),
                "notes": f"Import automatique {import_profile_label}",
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

    if not intervention_id:
        interventions = _find_interventions_by_campagne(conn, int(campagne_id))
        for inv in interventions:
            row = conn.execute(
                "SELECT id, date_intervention FROM interventions WHERE id = ?",
                (inv["id"],),
            ).fetchone()
            if row and _parse_iso_date(row["date_intervention"]) == anchor_date:
                intervention_id = int(row["id"])
                break

        if not intervention_id:
            ref, annee, labo, numero = _next_intervention_reference_sql(conn, int(demande_id))
            interventions_cols = {row[1] for row in conn.execute("PRAGMA table_info(interventions)").fetchall()}
            values = {
                "reference": ref,
                "demande_id": int(demande_id),
                "date_intervention": anchor_date.isoformat(),
            }
            optional = {
                "annee": annee,
                "labo_code": labo,
                "numero": numero,
                "campagne_id": int(campagne_id),
                "type_intervention": import_profile_label if import_profile_label else "Import",
                "sujet": f"Import automatique {import_profile_label}",
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
