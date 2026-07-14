#!/usr/bin/env python3
"""
Repare pmt_campaigns rows missing from the main RaLab DB.

Historical PMT imports store campagnes.id in pmt_essais.campaign_id while the FK
targets pmt_campaigns(id). This tool backfills pmt_campaigns from campagnes so
FK checks pass without changing pmt_essais rows.
"""
from __future__ import annotations

import argparse
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _default_db_path() -> Path:
    import sys

    sys.path.insert(0, str(ROOT))
    from app.core.database import get_db_path

    return get_db_path()


def repair(db_path: Path, *, dry_run: bool = False) -> dict:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    orphan_ids = [
        row[0]
        for row in conn.execute(
            """
            SELECT DISTINCT pe.campaign_id
            FROM pmt_essais pe
            LEFT JOIN pmt_campaigns pc ON pc.id = pe.campaign_id
            WHERE pe.campaign_id IS NOT NULL AND pc.id IS NULL
            ORDER BY pe.campaign_id
            """
        )
    ]

    report = {"orphan_campaign_ids": orphan_ids, "inserted": [], "skipped": [], "errors": []}

    if not orphan_ids:
        conn.close()
        return report

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    for camp_id in orphan_ids:
        camp = conn.execute(
            "SELECT id, demande_id, reference, label, code, designation FROM campagnes WHERE id = ?",
            (camp_id,),
        ).fetchone()

        if camp is None:
            # Fallback from pmt_essais if campagne row missing
            pe = conn.execute(
                """
                SELECT demande_id, MIN(reference) AS sample_ref
                FROM pmt_essais
                WHERE campaign_id = ?
                GROUP BY demande_id
                """,
                (camp_id,),
            ).fetchone()
            if pe is None:
                report["errors"].append(f"campaign_id={camp_id}: no campagne and no pmt_essais")
                continue
            demande_id = int(pe["demande_id"])
            pmt_ref = f"PMT-C{camp_id:03d}"
            label = f"Campagne PMT (reconstruida id={camp_id})"
            designation = "Macrotexture de chaussee"
            code = f"PMT-C{camp_id:03d}"
            note = (
                f"Backfill {now}: campagne id={camp_id} ausente; "
                f"demande_id={demande_id} from pmt_essais."
            )
        else:
            demande_id = int(camp["demande_id"])
            pmt_ref = f"PMT-{camp['reference']}" if camp["reference"] else f"PMT-C{camp_id:03d}"
            label = f"PMT — {camp['label'] or camp['reference'] or camp_id}"
            designation = camp["designation"] or "Macrotexture de chaussee"
            code = f"PMT-C{camp_id:03d}"
            note = (
                f"Backfill {now}: espelho de campagnes.id={camp_id} "
                f"({camp['reference']}) para satisfazer FK pmt_essais.campaign_id."
            )

        existing = conn.execute("SELECT id FROM pmt_campaigns WHERE id = ?", (camp_id,)).fetchone()
        if existing:
            report["skipped"].append(camp_id)
            continue

        payload = (
            camp_id,
            demande_id,
            code,
            pmt_ref,
            label,
            designation,
            note,
            now,
            now,
        )

        if dry_run:
            report["inserted"].append({"id": camp_id, "reference": pmt_ref, "demande_id": demande_id, "dry_run": True})
            continue

        conn.execute(
            """
            INSERT INTO pmt_campaigns (
                id, demande_id, code, reference, label, designation,
                workflow_label, source_mode, target_mode, statut, notes,
                created_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                'Campagne -> Preparation de l''intervention -> Intervention -> Essai PMT -> Rapport',
                'historique_importe', 'manuel', 'Active', ?,
                ?, ?
            )
            """,
            payload,
        )
        report["inserted"].append({"id": camp_id, "reference": pmt_ref, "demande_id": demande_id})

    if not dry_run and report["inserted"]:
        max_id = conn.execute("SELECT MAX(id) FROM pmt_campaigns").fetchone()[0] or 0
        conn.execute("DELETE FROM sqlite_sequence WHERE name = 'pmt_campaigns'")
        conn.execute("INSERT INTO sqlite_sequence (name, seq) VALUES ('pmt_campaigns', ?)", (max_id,))
        conn.commit()

        violations = conn.execute("PRAGMA foreign_key_check").fetchall()
        report["fk_violations_after"] = [tuple(v) for v in violations if v[0] == "pmt_essais"]
        report["fk_violations_total"] = len(violations)

    conn.close()
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill pmt_campaigns from campagnes.id references.")
    parser.add_argument("--db", type=Path, default=None, help="Path to main SQLite DB (default: get_db_path())")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--backup", action="store_true", help="Copy .db to .backup_pmt_repair_TIMESTAMP.db first")
    args = parser.parse_args()

    db_path = (args.db or _default_db_path()).resolve()
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    if args.backup and not args.dry_run:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = db_path.with_suffix(f".backup_pmt_repair_{stamp}.db")
        shutil.copy2(db_path, backup_path)
        print(f"[OK] Backup: {backup_path}")

    report = repair(db_path, dry_run=args.dry_run)

    print(f"Orphan campaign_ids: {report['orphan_campaign_ids']}")
    for row in report["inserted"]:
        print(f"  INSERT id={row['id']} ref={row['reference']} demande_id={row['demande_id']}" + (" (dry-run)" if row.get("dry_run") else ""))
    for cid in report["skipped"]:
        print(f"  SKIP id={cid} (already exists)")
    for err in report["errors"]:
        print(f"  ERROR: {err}")

    if "fk_violations_total" in report:
        print(f"FK violations after repair: {report['fk_violations_total']} total, pmt_essais: {len(report.get('fk_violations_after', []))}")

    if args.dry_run:
        print("\nDry-run only — no changes written.")


if __name__ == "__main__":
    main()
