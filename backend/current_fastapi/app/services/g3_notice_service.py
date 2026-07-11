"""Génération de formulations d'avis G3 à partir du contexte mission."""

from __future__ import annotations

from app.models.g3 import G3MissionResponseSchema, G3NoticeDraftSchema
from app.models.g3_catalogs import G3_NOTICE_FORMULATION_TEMPLATES


def _zone_name(mission: G3MissionResponseSchema, zone_id: int | None) -> str:
    if zone_id is None:
        return "—"
    for zone in mission.zones:
        if zone.id == zone_id:
            return str(zone.name or zone.type or f"Zone #{zone_id}")
    return f"Zone #{zone_id}"


def _intervention_label(mission: G3MissionResponseSchema, intervention_id: int | None) -> str:
    if intervention_id is None:
        return ""
    for row in [*mission.planned_interventions, *mission.realized_interventions]:
        if row.id == intervention_id:
            return f"{row.number} — {row.type}".strip(" —")
    return f"Intervention #{intervention_id}"


def build_notice_draft(
    mission: G3MissionResponseSchema,
    *,
    notice_type: str,
    zone_id: int | None = None,
    intervention_id: int | None = None,
) -> G3NoticeDraftSchema:
    zone = _zone_name(mission, zone_id)
    intervention = _intervention_label(mission, intervention_id)
    template = G3_NOTICE_FORMULATION_TEMPLATES.get(
        notice_type,
        "Dans le cadre de la mission {reference}, concernant le chantier {chantier}, zone {zone}.",
    )
    formulation = template.format(
        reference=mission.reference or "—",
        chantier=mission.chantier or mission.title or "—",
        zone=zone,
        client=mission.client or "—",
    )

    pending_tests = [
        t for t in mission.tests
        if str(t.conformity or "") in {"", "En attente"}
    ]
    non_conforme = [t for t in mission.tests if t.conformity == "Non conforme"]

    content_parts = [
        f"Objet : {notice_type or 'Avis G3'}",
        f"Mission : {mission.reference}",
        f"Chantier : {mission.chantier or '—'}",
        f"Zone : {zone}",
    ]
    if intervention:
        content_parts.append(f"Intervention liée : {intervention}")
    if mission.main_objective:
        content_parts.append(f"Objectif mission : {mission.main_objective}")

    conditions = ""
    if pending_tests:
        conditions = (
            "Essais en attente de résultat : "
            + ", ".join(f"{t.type or t.label}" for t in pending_tests[:5])
        )
    elif non_conforme:
        conditions = (
            "Points de vigilance — essais non conformes : "
            + ", ".join(f"{t.type or t.label}" for t in non_conforme[:5])
        )

    recommendations = (
        "Poursuivre le suivi géotechnique conformément au programme des reconnaissances "
        "et aux prescriptions de l'étude G2/G4."
    )

    return G3NoticeDraftSchema(
        formulation=formulation,
        content="\n".join(content_parts),
        conditions=conditions,
        recommendations=recommendations,
    )
