#!/usr/bin/env python3
"""Simule section C passation : + Ajouter document + Enregistrer, ligne par ligne."""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import get_db_path
from app.models.passation import PassationDocumentSchema, PassationUpdateSchema
from app.repositories.passations_repository import PassationsRepository

PASSATION_ID = 2

ORIGINAL = [
    PassationDocumentSchema(document_type="CCTP / CCAP", comment="Demander à SEGIC"),
    PassationDocumentSchema(document_type="Plans VRD", version="V0"),
    PassationDocumentSchema(document_type="Rapport G2 DCE"),
    PassationDocumentSchema(document_type="Plan protection végétation", comment="Arbres cyprès"),
]

NEW_ROWS = [
    PassationDocumentSchema(
        document_type="Mémoire technique GUINTOLI",
        is_received=True,
        version="AO",
        document_date=date(2025, 11, 24),
        comment="Lot 1 VRD — Aménagement BD du Rhône RD1407",
    ),
    PassationDocumentSchema(
        document_type="Plan de phasage",
        comment="Annexe 2 mémoire technique (circulation CEREMA)",
    ),
    PassationDocumentSchema(
        document_type="CR visite site",
        comment="Annexe 1 mémoire technique",
    ),
    PassationDocumentSchema(
        document_type="Planning prévisionnel",
        comment="Annexe 8 mémoire — OS prép. 18/05/2026, travaux 15/07/2026",
    ),
    PassationDocumentSchema(
        document_type="Programme essais / PAQ enrobés",
        comment="Planche d'essai MOA + mission RST planche RARx (CCTP, PAQ)",
    ),
]


def main() -> None:
    repo = PassationsRepository(get_db_path())

    def save(label: str, docs: list[PassationDocumentSchema]) -> None:
        repo.update(PASSATION_ID, PassationUpdateSchema(documents=docs))
        print(f"  [Enregistrer] {len(docs)} ligne(s) — {label}")

    def show() -> None:
        with repo._connect() as conn:
            rows = conn.execute(
                """
                SELECT document_type, is_received, version, document_date
                FROM passation_documents WHERE passation_id=? ORDER BY id
                """,
                (PASSATION_ID,),
            ).fetchall()
        for index, row in enumerate(rows, 1):
            status = "reçu" if row["is_received"] else "attendu"
            extra = row["version"] or row["document_date"] or ""
            suffix = f" ({extra})" if extra else ""
            print(f"    {index}. {row['document_type']} — {status}{suffix}")

    print("=== Simulation manuelle — Section C ===\n")
    print("Étape 0 : repor les 4 documents initiaux (avant bulk script)")
    save("état initial UI", list(ORIGINAL))
    show()
    print()

    current = list(ORIGINAL)
    for step, row in enumerate(NEW_ROWS, 1):
        print(f"Etape {step} : [+ Ajouter document] -> remplir -> [Enregistrer]")
        print(f"  + {row.document_type}")
        current.append(row)
        save(f"après ajout {step}/5", list(current))
        show()
        print()

    with repo._connect() as conn:
        linked = conn.execute(
            "SELECT id FROM demandes WHERE passation_source_id=?",
            (PASSATION_ID,),
        ).fetchone()
    print(f"Demande liée : {'non' if not linked else linked['id']}")


if __name__ == "__main__":
    main()
