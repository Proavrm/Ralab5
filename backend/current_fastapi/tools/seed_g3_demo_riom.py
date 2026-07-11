#!/usr/bin/env python3
"""Seed optionnel d'une mission G3 de démonstration.

Usage:
  python tools/seed_g3_demo_riom.py --demande-id 123
  python tools/seed_g3_demo_riom.py --demande-ref 2026-SP-D0054

Les libellés chantier/zones sont passés en arguments — aucune donnée hardcodée dans l'UI.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import get_db_path
from app.models.g3 import G3MissionCreateSchema
from app.repositories.g3_repository import G3Repository


def _resolve_demande_id(conn: sqlite3.Connection, demande_id: int | None, demande_ref: str | None) -> int:
    if demande_id:
        row = conn.execute("SELECT id FROM demandes WHERE id = ?", (demande_id,)).fetchone()
        if not row:
            raise SystemExit(f"Demande #{demande_id} introuvable")
        return int(row[0])
    ref = str(demande_ref or "").strip()
    if not ref:
        raise SystemExit("Indiquez --demande-id ou --demande-ref")
    row = conn.execute("SELECT id FROM demandes WHERE reference = ?", (ref,)).fetchone()
    if not row:
        raise SystemExit(f"Demande {ref} introuvable")
    return int(row[0])


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed mission G3 de démonstration")
    parser.add_argument("--demande-id", type=int, default=None)
    parser.add_argument("--demande-ref", type=str, default=None)
    parser.add_argument("--chantier-label", type=str, default="Chantier démo G3")
    parser.add_argument("--zone-a", type=str, default="Plateforme démo A")
    parser.add_argument("--zone-b", type=str, default="Voirie démo B")
    args = parser.parse_args()

    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    demande_id = _resolve_demande_id(conn, args.demande_id, args.demande_ref)
    conn.close()

    repo = G3Repository(db_path)
    mission = repo.create_mission(G3MissionCreateSchema(
        demande_id=demande_id,
        title=f"Mission G3 démo — {args.chantier_label}",
        chantier=args.chantier_label,
        status="Reconnaissances planifiées",
    ), user_name="seed_g3_demo")

    repo.create_default_programme(mission.id, user_name="seed_g3_demo")
    repo.create_default_objectives(mission.id, user_name="seed_g3_demo")
    repo.create_default_hold_points(mission.id, user_name="seed_g3_demo")
    repo.create_default_deliverables(mission.id, user_name="seed_g3_demo")
    repo.create_zone(mission.id, {"name": args.zone_a, "type": "Plateforme"}, user_name="seed_g3_demo")
    repo.create_zone(mission.id, {"name": args.zone_b, "type": "Voirie PL"}, user_name="seed_g3_demo")

    reloaded = repo.get_mission(mission.id)
    print(f"Mission G3 créée: {reloaded.reference} (id={reloaded.id})")
    print(f"  Programme: {len(reloaded.planned_interventions)} interventions")
    print(f"  Objectifs: {len(reloaded.objectives)}")
    print(f"  Points d'arrêt: {len(reloaded.hold_points)}")
    print(f"  Livrables: {len(reloaded.deliverables)}")


if __name__ == "__main__":
    main()
