#!/usr/bin/env python3
"""
Re-align PMT + SC terrain rows with ensure_hierarchy (120 / 7) without Excel reimport.

Usage (from backend/current_fastapi):
  python tools/apply_hierarchy_temporal_fixes.py              # dry-run
  python tools/apply_hierarchy_temporal_fixes.py --apply    # backup + apply

Optional DB path:
  python tools/apply_hierarchy_temporal_fixes.py path/to.db --apply

Skips rows where no target demande is predicted (pred_d is None).
Does NOT delete orphan demandes.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.hierarchy_temporal_select import (  # noqa: E402
    HIERARCHY_TEMPORAL_CAMPAGNE_GAP_DAYS,
    HIERARCHY_TEMPORAL_DEMANDE_GAP_DAYS,
    _clean,
    _normalize_affaire_nge,
    ensure_hierarchy_sqlite,
    parse_iso_date,
    select_campagne_id_for_anchor,
    select_demande_id_for_anchor,
)


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return (
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
            (name,),
        ).fetchone()
        is not None
    )


def _cols(conn: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _affaire_context_from_rst_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(row)
    return {
        "by_reference": None,
        "by_affaire_nge": None,
        "selected": {
            "id": d["id"],
            "reference": d.get("reference") or "",
            "affaire_nge": d.get("affaire_nge") or "",
            "chantier": d.get("chantier") or "",
            "statut": d.get("statut") or "",
        },
        "match_mode": "migration",
    }


def _resolve_affaire_for_demande_row(conn: sqlite3.Connection, affaire_rst_id: Any, affaire_nge_hint: str) -> Optional[dict[str, Any]]:
    aid = int(affaire_rst_id or 0)
    if aid > 0:
        row = conn.execute(
            """
            SELECT id, reference, affaire_nge, chantier, statut
            FROM affaires_rst
            WHERE id = ?
            LIMIT 1
            """,
            (aid,),
        ).fetchone()
        if row:
            return _affaire_context_from_rst_row(row)
    n = (affaire_nge_hint or "").strip()
    if not n:
        return None
    rows = conn.execute(
        """
        SELECT id, reference, affaire_nge, chantier, statut
        FROM affaires_rst
        ORDER BY id DESC
        """
    ).fetchall()
    target = _normalize_affaire_nge(n)
    for row in rows:
        if _normalize_affaire_nge(_clean(row["affaire_nge"])) == target:
            return _affaire_context_from_rst_row(row)
    return None


def _backup_sqlite(src: Path, dest: Path) -> None:
    src_conn = sqlite3.connect(str(src))
    try:
        dst_conn = sqlite3.connect(str(dest))
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()
    finally:
        src_conn.close()


def _fix_pmt(conn: sqlite3.Connection, apply: bool) -> tuple[int, int, list[str]]:
    log: list[str] = []
    ok = skip = 0
    if not (_table_exists(conn, "pmt_essais") and _table_exists(conn, "demandes")):
        return 0, 0, ["(skip: pmt_essais or demandes missing)"]
    pcols = _cols(conn, "pmt_essais")
    camp_col = "campaign_id" if "campaign_id" in pcols else ("campagne_id" if "campagne_id" in pcols else None)
    date_col = "date_essai_debut" if "date_essai_debut" in pcols else None
    if not camp_col or not date_col:
        return 0, 0, ["(skip: pmt_essais columns)"]
    d_gap = HIERARCHY_TEMPORAL_DEMANDE_GAP_DAYS
    c_gap = HIERARCHY_TEMPORAL_CAMPAGNE_GAP_DAYS
    sql = f"""
        SELECT p.id AS pmt_id, p.reference AS pmt_ref, p.demande_id AS cur_demande,
               p.{camp_col} AS cur_campagne, p.intervention_id AS cur_intervention,
               d.affaire_rst_id, a.affaire_nge AS affaire_nge,
               p.{date_col} AS anchor_txt, d.reference AS demande_ref
        FROM pmt_essais p
        JOIN demandes d ON d.id = p.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        WHERE p.demande_id IS NOT NULL
    """
    for row in conn.execute(sql).fetchall():
        anchor = parse_iso_date(row["anchor_txt"])
        if anchor is None:
            skip += 1
            log.append(f"PMT id={row['pmt_id']}: skip (no anchor date)")
            continue
        aff_id = int(row["affaire_rst_id"] or 0)
        nge = (row["affaire_nge"] or "").strip()
        pred_d = select_demande_id_for_anchor(conn, nge, aff_id, anchor, d_gap)
        cur_d = int(row["cur_demande"])
        cur_c = int(row["cur_campagne"]) if row["cur_campagne"] is not None else None
        cur_i = int(row["cur_intervention"]) if row["cur_intervention"] is not None else None
        if pred_d is None:
            skip += 1
            log.append(
                f"PMT id={row['pmt_id']} ref={row['pmt_ref']!r}: skip (no pred demande; check affaire)"
            )
            continue
        ctx = _resolve_affaire_for_demande_row(conn, row["affaire_rst_id"], nge)
        if not ctx:
            skip += 1
            log.append(f"PMT id={row['pmt_id']}: skip (cannot resolve affaire context)")
            continue
        pred_c = select_campagne_id_for_anchor(conn, pred_d, anchor, c_gap)
        if not apply:
            if pred_d == cur_d and pred_c == cur_c:
                continue
            log.append(
                f"PMT id={row['pmt_id']} {row['pmt_ref']!r}: dry-run — pred D={pred_d} C={pred_c} "
                f"(current D={cur_d} C={cur_c} I={cur_i}); --apply runs ensure_hierarchy + UPDATE"
            )
            ok += 1
            continue
        h = ensure_hierarchy_sqlite(
            conn,
            ctx,
            anchor,
            demande_gap_days=d_gap,
            campagne_gap_days=c_gap,
            demande_id=None,
            campagne_id=None,
            intervention_id=None,
            labo_code="SP",
            import_profile_label="PMT import",
        )
        nd, nc, ni = int(h["demande_id"]), int(h["campagne_id"]), int(h["intervention_id"])
        if nd == cur_d and nc == cur_c and ni == cur_i:
            continue
        log.append(
            f"PMT id={row['pmt_id']} {row['pmt_ref']!r}: D {cur_d}->{nd}, C {cur_c}->{nc}, I {cur_i}->{ni}"
        )
        pmt_cols = _cols(conn, "pmt_essais")
        usets = ["demande_id = ?", f"{camp_col} = ?", "intervention_id = ?"]
        uvals: list[Any] = [nd, nc, ni]
        if "updated_at" in pmt_cols:
            usets.append("updated_at = ?")
            uvals.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        uvals.append(int(row["pmt_id"]))
        # pmt_essais.campaign_id FK targets pmt_campaigns in this schema, but imports store lab campagnes.id —
        # SQLite rejects the UPDATE with FK ON; align semantics without requiring pmt_campaigns rows.
        conn.execute("PRAGMA foreign_keys = OFF")
        try:
            conn.execute(f"UPDATE pmt_essais SET {', '.join(usets)} WHERE id = ?", tuple(uvals))
        finally:
            conn.execute("PRAGMA foreign_keys = ON")
        conn.commit()
        ok += 1
    return ok, skip, log


def _fix_sc_series(conn: sqlite3.Connection, apply: bool) -> tuple[int, int, list[str]]:
    log: list[str] = []
    ok = skip = 0
    if not _table_exists(conn, "series_essais_terrain"):
        return 0, 0, ["(skip: series_essais_terrain missing)"]
    scols = _cols(conn, "series_essais_terrain")
    if "demande_id" not in scols or "date_essai" not in scols or "campagne_id" not in scols:
        return 0, 0, ["(skip: series columns)"]
    d_gap = HIERARCHY_TEMPORAL_DEMANDE_GAP_DAYS
    c_gap = HIERARCHY_TEMPORAL_CAMPAGNE_GAP_DAYS
    sql = """
        SELECT s.id AS sc_id, s.reference AS sc_ref, s.demande_id AS cur_demande,
               s.campagne_id AS cur_campagne, s.intervention_id AS cur_intervention,
               s.date_essai AS anchor_txt, s.code_essai,
               d.affaire_rst_id, a.affaire_nge AS affaire_nge, d.reference AS demande_ref
        FROM series_essais_terrain s
        JOIN demandes d ON d.id = s.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        WHERE s.demande_id IS NOT NULL
          AND (s.code_essai = 'SC' OR s.code_essai LIKE 'SC%')
    """
    for row in conn.execute(sql).fetchall():
        anchor = parse_iso_date(row["anchor_txt"])
        if anchor is None:
            skip += 1
            log.append(f"SC series id={row['sc_id']}: skip (no anchor date)")
            continue
        aff_id = int(row["affaire_rst_id"] or 0)
        nge = (row["affaire_nge"] or "").strip()
        pred_d = select_demande_id_for_anchor(conn, nge, aff_id, anchor, d_gap)
        cur_d = int(row["cur_demande"])
        cur_c = int(row["cur_campagne"]) if row["cur_campagne"] is not None else None
        cur_i = int(row["cur_intervention"]) if row["cur_intervention"] is not None else None
        if pred_d is None:
            skip += 1
            log.append(f"SC series id={row['sc_id']} ref={row['sc_ref']!r}: skip (no pred demande)")
            continue
        ctx = _resolve_affaire_for_demande_row(conn, row["affaire_rst_id"], nge)
        if not ctx:
            skip += 1
            log.append(f"SC series id={row['sc_id']}: skip (cannot resolve affaire context)")
            continue
        pred_c = select_campagne_id_for_anchor(conn, pred_d, anchor, c_gap)
        sid = int(row["sc_id"])
        if not apply:
            if pred_d == cur_d and pred_c == cur_c:
                continue
            log.append(
                f"SC series id={sid} {row['sc_ref']!r}: dry-run — pred D={pred_d} C={pred_c} "
                f"(current D={cur_d} C={cur_c} I={cur_i}); --apply runs ensure_hierarchy + UPDATE"
            )
            ok += 1
            continue
        h = ensure_hierarchy_sqlite(
            conn,
            ctx,
            anchor,
            demande_gap_days=d_gap,
            campagne_gap_days=c_gap,
            demande_id=None,
            campagne_id=None,
            intervention_id=None,
            labo_code="SP",
            import_profile_label="Sondage carotté",
        )
        nd, nc, ni = int(h["demande_id"]), int(h["campagne_id"]), int(h["intervention_id"])
        if nd == cur_d and nc == cur_c and ni == cur_i:
            continue
        log.append(
            f"SC series id={sid} {row['sc_ref']!r}: D {cur_d}->{nd}, C {cur_c}->{nc}, I {cur_i}->{ni}"
        )
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        scols2 = _cols(conn, "series_essais_terrain")
        ssets = ["demande_id = ?", "campagne_id = ?", "intervention_id = ?"]
        svals: list[Any] = [nd, nc, ni]
        if "updated_at" in scols2:
            ssets.append("updated_at = ?")
            svals.append(now)
        svals.append(sid)
        conn.execute(
            f"UPDATE series_essais_terrain SET {', '.join(ssets)} WHERE id = ?",
            tuple(svals),
        )
        if _table_exists(conn, "feuilles_terrain") and "serie_id" in _cols(conn, "feuilles_terrain"):
            fcols = _cols(conn, "feuilles_terrain")
            fsets = ["demande_id = ?", "campagne_id = ?", "intervention_id = ?"]
            fvals: list[Any] = [nd, nc, ni]
            if "updated_at" in fcols:
                fsets.append("updated_at = ?")
                fvals.append(now)
            fvals.append(sid)
            conn.execute(
                f"UPDATE feuilles_terrain SET {', '.join(fsets)} WHERE serie_id = ?",
                tuple(fvals),
            )
        if _table_exists(conn, "points_terrain") and "serie_id" in _cols(conn, "points_terrain"):
            pcols2 = _cols(conn, "points_terrain")
            psets = ["demande_id = ?", "campagne_id = ?", "intervention_id = ?"]
            pvals: list[Any] = [nd, nc, ni]
            if "updated_at" in pcols2:
                psets.append("updated_at = ?")
                pvals.append(now)
            pvals.append(sid)
            conn.execute(
                f"UPDATE points_terrain SET {', '.join(psets)} WHERE serie_id = ?",
                tuple(pvals),
            )
        conn.commit()
        ok += 1
    return ok, skip, log


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply 120/7 hierarchy fixes to PMT + SC series.")
    parser.add_argument("db", nargs="?", default=str(ROOT / "data" / "ralab3.db"), help="Path to SQLite DB")
    parser.add_argument("--apply", action="store_true", help="Write changes (default: dry-run)")
    args = parser.parse_args()
    db_path = Path(args.db)
    if not db_path.is_file():
        print(f"DB not found: {db_path}")
        return 1
    apply = bool(args.apply)

    if apply:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = db_path.parent / f"ralab3.backup.{stamp}.db"
        print(f"Backup -> {backup_path}")
        _backup_sqlite(db_path, backup_path)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    mode = "APPLY" if apply else "DRY-RUN"
    print(f"Mode: {mode}  DB: {db_path}")
    p_ok, p_skip, p_log = _fix_pmt(conn, apply)
    s_ok, s_skip, s_log = _fix_sc_series(conn, apply)

    print("\n--- PMT ---")
    for line in p_log:
        print(line)
    print(f"PMT: would fix / fixed = {p_ok}, skipped = {p_skip}")

    print("\n--- SC series ---")
    for line in s_log:
        print(line)
    print(f"SC: would fix / fixed = {s_ok}, skipped = {s_skip}")

    if not apply:
        print("\n(No writes.) Re-run with --apply to persist.")

    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
