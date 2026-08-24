"""Seed prestations RST for demande 2026-SP-D0056 (id 426) — cadrage avant Alizé."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import ensure_ralab5_schema
from app.repositories.demande_prestations_repository import DemandePrestationsRepository

DEMANDE_ID = 426

PRESTATIONS = [
    {
        "need_code": "ETUDE_TECHNIQUE",
        "need_label": "Étude technique",
        "description": (
            "Dimensionnement de la structure de chaussée (Alizé) pour le raccordement du "
            "chemin du Carré de la Garenne : validation du couple PST/arase, couches de forme, "
            "portances, matériaux et variantes de structure (CAM 0,5 et CAM 1,0 — fiches A0 à F1). "
            "Résultat attendu : note de dimensionnement / annexe de calculs mécaniques exploitable "
            "pour l'avis G3 et le DCE."
        ),
        "quantity": "40 variantes Alizé (20 × CAM 0,5 + 20 × CAM 1,0)",
        "request_status": "Requis",
        "notes": (
            "Calculs déjà saisis sur la demande (CAM05 / CAM1). "
            "Synthèse Word / note à produire à partir de l'annexe NGE."
        ),
    },
    {
        "need_code": "MISSION_G3",
        "need_label": "Mission G3",
        "description": (
            "Mission G3 EXE — terrassements, plateformes et chaussées "
            "(Chemin du Carré de la Garenne) : contrôles et avis sur PST/arase, "
            "couches de forme, portances, matériaux et structure de chaussée."
        ),
        "quantity": "1 mission G3 EXE (2026-RA-049-D0056-G0001)",
        "request_status": "Requis",
        "notes": "Mission G3 déjà créée et liée à la demande.",
    },
]


def main() -> None:
    ensure_ralab5_schema()
    repo = DemandePrestationsRepository()
    existing = repo.list_for_demande(DEMANDE_ID)
    if existing:
        print(f"Déjà {len(existing)} prestation(s) — abandon (pas d'écrasement).")
        for item in existing:
            print(" ", item)
        return
    saved = repo.replace_for_demande(DEMANDE_ID, PRESTATIONS)
    print(f"OK — {len(saved)} prestation(s) enregistrée(s) pour demande {DEMANDE_ID}:")
    for item in saved:
        print(f"  [{item['request_status']}] {item['need_label']} ({item['need_code']})")


if __name__ == "__main__":
    main()
