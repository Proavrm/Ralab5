#!/usr/bin/env python3
"""
Offline audit: compare stored PMT/SC hierarchy vs ensure_hierarchy temporal rules
(HIERARCHY_TEMPORAL_DEMANDE_GAP_DAYS / HIERARCHY_TEMPORAL_CAMPAGNE_GAP_DAYS).

Does not modify the database. Run from backend/current_fastapi:

  python tools/audit_hierarchy_temporal.py
  python tools/audit_hierarchy_temporal.py path/to/other.db
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from api.hierarchy_temporal_select import (  # noqa: E402
    HIERARCHY_TEMPORAL_CAMPAGNE_GAP_DAYS,
    HIERARCHY_TEMPORAL_DEMANDE_GAP_DAYS,
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


from tools.tool_db_path import get_tool_db_path


def main() -> int:
    db_path = get_tool_db_path()
    if len(sys.argv) > 1:
        db_path = Path(sys.argv[1])
    if not db_path.is_file():
        print(f"DB not found: {db_path}")
        return 1

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    d_gap = HIERARCHY_TEMPORAL_DEMANDE_GAP_DAYS
    c_gap = HIERARCHY_TEMPORAL_CAMPAGNE_GAP_DAYS

    lines: list[str] = []
    lines.append(f"DB: {db_path}")
    lines.append(f"Rules: demande_gap_days={d_gap}, campagne_gap_days={c_gap}")
    lines.append("")

    # --- PMT ---
    pmt_changes: list[str] = []
    if _table_exists(conn, "pmt_essais") and _table_exists(conn, "demandes"):
        pcols = _cols(conn, "pmt_essais")
        camp_col = "campaign_id" if "campaign_id" in pcols else ("campagne_id" if "campagne_id" in pcols else None)
        date_col = "date_essai_debut" if "date_essai_debut" in pcols else None
        if camp_col and date_col:
            sql = f"""
                SELECT p.id AS pmt_id, p.reference AS pmt_ref, p.demande_id AS cur_demande,
                       p.{camp_col} AS cur_campagne, d.affaire_rst_id, a.affaire_nge AS affaire_nge,
                       p.{date_col} AS anchor_txt, d.reference AS demande_ref
                FROM pmt_essais p
                JOIN demandes d ON d.id = p.demande_id
                LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
                WHERE p.demande_id IS NOT NULL
            """
            for row in conn.execute(sql).fetchall():
                anchor = parse_iso_date(row["anchor_txt"])
                if anchor is None:
                    continue
                aff_id = int(row["affaire_rst_id"] or 0)
                nge = (row["affaire_nge"] or "").strip()
                pred_d = select_demande_id_for_anchor(conn, nge, aff_id, anchor, d_gap)
                cur_d = int(row["cur_demande"])
                if pred_d is None or pred_d != cur_d:
                    pred_c = (
                        select_campagne_id_for_anchor(conn, pred_d, anchor, c_gap)
                        if pred_d is not None
                        else None
                    )
                    cur_c = row["cur_campagne"]
                    cur_c_i = int(cur_c) if cur_c is not None else None
                    note = " (reimport criaria nova demande)" if pred_d is None else ""
                    pmt_changes.append(
                        f"  PMT id={row['pmt_id']} ref={row['pmt_ref']!r} | "
                        f"demande {cur_d} ({row['demande_ref']}) -> pred {pred_d}{note} | "
                        f"campagne {cur_c_i} -> pred {pred_c} | anchor={anchor.isoformat()}"
                    )
                else:
                    pred_c = select_campagne_id_for_anchor(conn, cur_d, anchor, c_gap)
                    cur_c = row["cur_campagne"]
                    cur_c_i = int(cur_c) if cur_c is not None else None
                    if pred_c is not None and cur_c_i is not None and pred_c != cur_c_i:
                        pmt_changes.append(
                            f"  PMT id={row['pmt_id']} ref={row['pmt_ref']!r} | "
                            f"demande OK {cur_d} | campagne {cur_c_i} -> pred {pred_c} | anchor={anchor.isoformat()}"
                        )

    lines.append("=== A MUDAR / REIMPORTAR (PMT: demande ou campagne != regle actuelle) ===")
    lines.extend(pmt_changes if pmt_changes else ["  (nenhum)"])
    lines.append("")

    # --- SC (series_essais_terrain) ---
    sc_changes: list[str] = []
    if _table_exists(conn, "series_essais_terrain"):
        scols = _cols(conn, "series_essais_terrain")
        if "demande_id" in scols and "date_essai" in scols and "campagne_id" in scols:
            sql = """
                SELECT s.id AS sc_id, s.reference AS sc_ref, s.demande_id AS cur_demande,
                       s.campagne_id AS cur_campagne, s.date_essai AS anchor_txt,
                       s.code_essai, d.affaire_rst_id, a.affaire_nge AS affaire_nge, d.reference AS demande_ref
                FROM series_essais_terrain s
                JOIN demandes d ON d.id = s.demande_id
                LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
                WHERE s.demande_id IS NOT NULL
                  AND (s.code_essai = 'SC' OR s.code_essai LIKE 'SC%')
            """
            for row in conn.execute(sql).fetchall():
                anchor = parse_iso_date(row["anchor_txt"])
                if anchor is None:
                    continue
                aff_id = int(row["affaire_rst_id"] or 0)
                nge = (row["affaire_nge"] or "").strip()
                pred_d = select_demande_id_for_anchor(conn, nge, aff_id, anchor, d_gap)
                cur_d = int(row["cur_demande"])
                if pred_d is None or pred_d != cur_d:
                    pred_c = (
                        select_campagne_id_for_anchor(conn, pred_d, anchor, c_gap)
                        if pred_d is not None
                        else None
                    )
                    cur_c_i = int(row["cur_campagne"]) if row["cur_campagne"] is not None else None
                    note = " (reimport criaria nova demande)" if pred_d is None else ""
                    sc_changes.append(
                        f"  SC series id={row['sc_id']} ref={row['sc_ref']!r} | "
                        f"demande {cur_d} ({row['demande_ref']}) -> pred {pred_d}{note} | "
                        f"campagne {cur_c_i} -> pred {pred_c} | anchor={anchor.isoformat()}"
                    )
                else:
                    pred_c = select_campagne_id_for_anchor(conn, cur_d, anchor, c_gap)
                    cur_c_i = int(row["cur_campagne"]) if row["cur_campagne"] is not None else None
                    if pred_c is not None and cur_c_i is not None and pred_c != cur_c_i:
                        sc_changes.append(
                            f"  SC series id={row['sc_id']} ref={row['sc_ref']!r} | "
                            f"demande OK {cur_d} | campagne {cur_c_i} -> pred {pred_c} | anchor={anchor.isoformat()}"
                        )

    lines.append("=== A MUDAR / REIMPORTAR (SC series: demande ou campagne != regle actuelle) ===")
    lines.extend(sc_changes if sc_changes else ["  (nenhum)"])
    lines.append("")

    # --- DELETE candidates (empty demande: no campagnes, no known children) ---
    delete_sql = """
        SELECT d.id, d.reference, d.nature
        FROM demandes d
        WHERE NOT EXISTS (SELECT 1 FROM campagnes c WHERE c.demande_id = d.id)
          AND NOT EXISTS (SELECT 1 FROM interventions i WHERE i.demande_id = d.id)
          AND NOT EXISTS (SELECT 1 FROM pmt_essais p WHERE p.demande_id = d.id)
          AND NOT EXISTS (SELECT 1 FROM series_essais_terrain s WHERE s.demande_id = d.id)
          AND NOT EXISTS (SELECT 1 FROM prelevements pr WHERE pr.demande_id = d.id)
    """
    if _table_exists(conn, "demande_preparations"):
        delete_sql += (
            " AND NOT EXISTS (SELECT 1 FROM demande_preparations dp WHERE dp.demande_id = d.id)"
        )
    if _table_exists(conn, "demande_enabled_modules"):
        delete_sql += (
            " AND NOT EXISTS (SELECT 1 FROM demande_enabled_modules m WHERE m.demande_id = d.id)"
        )
    orphans: list[str] = []
    try:
        for r in conn.execute(delete_sql).fetchall():
            orphans.append(f"  demande id={r['id']} ref={r['reference']!r} nature={r['nature']!r}")
    except sqlite3.OperationalError as e:
        orphans.append(f"  (query failed: {e})")

    lines.append("=== CANDIDATOS A APAGAR (demande sem campagnes/interventions/PMT/SC/prelevements/preparations) ===")
    lines.extend(orphans if orphans else ["  (nenhum)"])
    lines.append("")

    # Campagnes sans interventions (souvent résidu import)
    camp_orphans: list[str] = []
    if _table_exists(conn, "campagnes") and _table_exists(conn, "interventions"):
        try:
            for r in conn.execute(
                """
                SELECT c.id, c.reference, c.demande_id
                FROM campagnes c
                WHERE NOT EXISTS (SELECT 1 FROM interventions i WHERE i.campagne_id = c.id)
                ORDER BY c.id
                """
            ).fetchall():
                camp_orphans.append(
                    f"  campagne id={r['id']} ref={r['reference']!r} demande_id={r['demande_id']}"
                )
        except sqlite3.OperationalError as e:
            camp_orphans.append(f"  (query failed: {e})")

    lines.append("=== CANDIDATOS A APAGAR / REVOIR (campagne sans interventions) ===")
    lines.extend(camp_orphans[:200] if camp_orphans else ["  (nenhum)"])
    if len(camp_orphans) > 200:
        lines.append(f"  ... ({len(camp_orphans) - 200} more)")
    lines.append("")
    lines.append("Nota: nao executar DELETE sem rever FKs (feuilles_terrain, essais, etc.).")

    report = "\n".join(lines)
    print(report)
    out = Path(__file__).with_name("audit_hierarchy_temporal_report.txt")
    out.write_text(report, encoding="utf-8")
    print(f"\nWrote: {out}")
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
