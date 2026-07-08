#!/usr/bin/env python3
"""Simule section F passation : + Ajouter action + remplir + Enregistrer, ligne par ligne."""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import get_db_path
from app.models.passation import PassationActionSchema, PassationUpdateSchema
from app.repositories.passations_repository import PassationsRepository

PASSATION_ID = 2

INITIAL = [
    PassationActionSchema(
        action_label="Réflexe FDE – brief mission G3 Vienne",
        responsable="Baptiste H.",
        echeance=date(2026, 6, 1),
        priorite="Normale",
        statut="À lancer",
        commentaire="Brief FDE G3 — affaire Vienne RD1407",
    ),
    PassationActionSchema(
        action_label="Obtenir plans VRD et G2 auprès de SEGIC",
        responsable="Baptiste H.",
        echeance=date(2026, 6, 15),
        priorite="Haute",
        statut="À lancer",
        commentaire="Plans V0 + rapport G2 DCE (section C)",
    ),
    PassationActionSchema(
        action_label="Définir périmètre protection cyprès / MOE",
        responsable="Baptiste H.",
        echeance=date(2026, 7, 1),
        priorite="Haute",
        statut="À lancer",
        commentaire="Avant tout terrassement",
    ),
]

NEW_ROWS = [
    PassationActionSchema(
        action_label="Relancer SEGIC pour CCTP / CCAP",
        responsable="Baptiste H.",
        echeance=date(2026, 6, 1),
        priorite="Haute",
        statut="À lancer",
        commentaire="Document section C — à demander à SEGIC",
    ),
    PassationActionSchema(
        action_label="Confirmer calendrier OS prép. 18/05 et travaux 15/07 avec MOE",
        responsable="Baptiste H.",
        echeance=date(2026, 5, 15),
        priorite="Haute",
        statut="À lancer",
        commentaire="Contrainte Jazz à Vienne — mémoire technique GUINTOLI",
    ),
    PassationActionSchema(
        action_label="Valider cadrage planche RARx (PAQ enrobés, sections témoin / RARx)",
        responsable="Marco Costa Pereira",
        echeance=date(2026, 5, 20),
        priorite="Haute",
        statut="À lancer",
        commentaire="Avant génération demande RST",
    ),
    PassationActionSchema(
        action_label="Générer demande RST depuis passation",
        responsable="Marco Costa Pereira",
        echeance=date(2026, 5, 25),
        priorite="Normale",
        statut="À lancer",
        commentaire="Après sections B à F complètes en réunion de passation",
    ),
    PassationActionSchema(
        action_label="Préparer les campagnes DIAG-CH / Témoin / RARx / Suivi-CIRR",
        responsable="Marco Costa Pereira",
        echeance=date(2026, 6, 1),
        priorite="Normale",
        statut="À lancer",
        commentaire="Référent RST — cadrage Préparation après création demande",
    ),
]


def main() -> None:
    repo = PassationsRepository(get_db_path())
    actions: list[PassationActionSchema] = []

    def save(label: str) -> None:
        repo.update(PASSATION_ID, PassationUpdateSchema(actions=list(actions)))
        print(f"  [Enregistrer] {len(actions)} action(s) — {label}")

    def show() -> None:
        for index, item in enumerate(actions, 1):
            due = item.echeance.isoformat() if item.echeance else "—"
            comment = f" — {item.commentaire}" if item.commentaire else ""
            print(f"    {index}. {item.action_label} | {item.responsable} | {due} | {item.priorite}{comment}")

    print("=== Simulation manuelle — Section F ===\n")

    print("Etape 0 : repor les 3 actions initiales (reunion passation)")
    actions = list(INITIAL)
    save("3 actions affaire MOA")
    show()
    print()

    current = list(INITIAL)
    for step, row in enumerate(NEW_ROWS, 1):
        print(f"Etape {step} : [+ Ajouter action] -> remplir -> [Enregistrer]")
        print(f"  + {row.action_label}")
        current.append(row)
        actions = list(current)
        save(f"ajout action {step}/{len(NEW_ROWS)}")
        show()
        print()

    with repo._connect() as conn:
        linked = conn.execute(
            "SELECT id FROM demandes WHERE passation_source_id=?",
            (PASSATION_ID,),
        ).fetchone()
    print(f"Demande liee : {'non' if not linked else linked['id']}")


if __name__ == "__main__":
    main()
