#!/usr/bin/env python3
"""Simule section E passation : + prestation + remplir + Enregistrer, ligne par ligne."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import ensure_ralab4_schema, get_db_path
from app.models.passation import PassationStructuredNeedSchema, PassationUpdateSchema
from app.repositories.passations_repository import PassationsRepository

PASSATION_ID = 2

LEGACY_FIELD_BY_CODE = {
    "INTERVENTION_TERRAIN": "besoins_terrain",
    "ESSAIS_TERRAIN": "besoins_terrain",
    "PRELEVEMENTS_ECHANTILLONS": "besoins_laboratoire",
    "ESSAIS_LABO": "besoins_laboratoire",
    "ETUDE_TECHNIQUE": "besoins_etude",
    "MISSION_G3": "besoins_g3",
    "ESSAIS_EXTERNES": "besoins_essais_externes",
    "EQUIPEMENTS_SPECIFIQUES": "besoins_equipements_specifiques",
    "RESSOURCES_HUMAINES": "besoins_ressources_humaines",
}

ETUDE_TECHNIQUE = PassationStructuredNeedSchema(
    need_code="ETUDE_TECHNIQUE",
    need_label="Étude technique",
    description=(
        "Diagnostic des structures de chaussée existantes sur les tronçons VRD du boulevard du Rhône "
        "(RD1407) : carottages, identification des couches et état structural. Résultat attendu : "
        "note de diagnostic exploitable pour la conception enrobés et la planche RARx."
    ),
    quantity="15 à 25 carottages — 3 tronçons principaux",
    request_status="Requis",
    notes="Prévoir carottages et diagnostique de chaussée.",
)

INTERVENTION_TERRAIN = PassationStructuredNeedSchema(
    need_code="INTERVENTION_TERRAIN",
    need_label="Intervention terrain",
    description=(
        "Missions terrain pour la planche expérimentale BB-Perf RARx et le suivi des travaux VRD : "
        "implantation, prélèvements enrobés, contrôles compactage et relevés. Détail campagnes et "
        "affectations en Préparation."
    ),
    quantity="2 campagnes prévues (planche d'essai + suivi chantier)",
    request_status="Requis",
    notes="OS préparation 18/05/2026 — démarrage travaux 15/07/2026 (contrainte Jazz à Vienne).",
)

ESSAIS_TERRAIN = PassationStructuredNeedSchema(
    need_code="ESSAIS_TERRAIN",
    need_label="Essais terrain",
    description=(
        "Essais in situ pour le diagnostic chaussée et le suivi comparatif témoin / RARx : "
        "déflexions (FWD, DF), portance (PMT), texture (DE), adhérence, acoustique. "
        "Programmation des points et séries en Préparation / campagnes."
    ),
    quantity="Diagnostic initial + mesures planche + suivi chantier (3 phases)",
    request_status="Requis",
    notes="Aligné sur le comparatif RARx — détail des essais et critères en Préparation (référent RST).",
)

ESSAIS_LABO = PassationStructuredNeedSchema(
    need_code="ESSAIS_LABO",
    need_label="Essais laboratoire",
    description=(
        "Essais sur enrobés liés à la mission RARx et aux contrôles MOA (planche d'essai, BB-Perf) : "
        "caractérisation matériaux, essais de formulation et contrôles de réception. Programme détaillé "
        "en Préparation (PAQ enrobés)."
    ),
    quantity="Planche d'essai MOA + essais de suivi chantier",
    request_status="Requis",
    notes="Document « Programme essais / PAQ enrobés » reçu — voir section C.",
)


def summarize_need(item: PassationStructuredNeedSchema) -> str:
    parts: list[str] = []
    if item.need_label.strip():
        parts.append(item.need_label.strip())
    if item.description.strip():
        parts.append(item.description.strip())
    if item.quantity.strip():
        parts.append(f"Volume estimé : {item.quantity.strip()}")
    return " — ".join(parts)


def build_legacy_patch(items: list[PassationStructuredNeedSchema]) -> dict[str, str]:
    grouped: dict[str, list[str]] = {field: [] for field in set(LEGACY_FIELD_BY_CODE.values())}
    for item in items:
        legacy_field = LEGACY_FIELD_BY_CODE.get(item.need_code.strip())
        if not legacy_field:
            continue
        summary = summarize_need(item)
        if summary:
            grouped[legacy_field].append(summary)
    return {field: "\n".join(lines) for field, lines in grouped.items()}


def main() -> None:
    ensure_ralab4_schema()
    repo = PassationsRepository(get_db_path())
    needs: list[PassationStructuredNeedSchema] = []

    def save(label: str) -> None:
        patch = build_legacy_patch(needs)
        repo.update(
            PASSATION_ID,
            PassationUpdateSchema(
                structured_needs=list(needs),
                **patch,
            ),
        )
        print(f"  [Enregistrer] {len(needs)} prestation(s) — {label}")

    def show() -> None:
        row = repo.get_by_uid(PASSATION_ID)
        for index, item in enumerate(row.structured_needs, 1):
            print(
                f"    {index}. {item.need_label} ({item.need_code}) — {item.request_status}"
                f" | vol. {item.quantity or '—'}"
            )
            if item.description:
                print(f"       desc: {item.description[:90]}{'…' if len(item.description) > 90 else ''}")
            if item.notes:
                print(f"       notes: {item.notes[:80]}{'…' if len(item.notes) > 80 else ''}")

    print("=== Simulation manuelle — Section E ===\n")

    print("Étape 1 : + Étude technique — compléter description / volume / notes")
    needs = [ETUDE_TECHNIQUE]
    save("Étude technique complétée")
    show()
    print()

    print("Étape 2 : + Intervention terrain")
    needs = [ETUDE_TECHNIQUE, INTERVENTION_TERRAIN]
    save("Intervention terrain ajoutée")
    show()
    print()

    print("Étape 3 : + Essais terrain")
    needs = [ETUDE_TECHNIQUE, INTERVENTION_TERRAIN, ESSAIS_TERRAIN]
    save("Essais terrain ajoutés")
    show()
    print()

    print("Étape 4 : + Essais laboratoire")
    needs = [ETUDE_TECHNIQUE, INTERVENTION_TERRAIN, ESSAIS_TERRAIN, ESSAIS_LABO]
    save("Essais laboratoire ajoutés")
    show()
    print()

    row = repo.get_by_uid(PASSATION_ID)
    print("Besoins legacy (pour génération demande) :")
    print(f"  besoins_etude: {row.besoins_etude[:120]}…" if row.besoins_etude else "  besoins_etude: —")
    print(f"  besoins_terrain: {row.besoins_terrain[:120]}…" if row.besoins_terrain else "  besoins_terrain: —")
    print(f"  besoins_laboratoire: {row.besoins_laboratoire[:120]}…" if row.besoins_laboratoire else "  besoins_laboratoire: —")


if __name__ == "__main__":
    main()
