"""Vue planning G3 — agrégation et alertes de retard."""

from __future__ import annotations

from datetime import date

from app.models.g3 import G3HoldPointSchema, G3MissionResponseSchema, G3PlanningItemSchema, G3PlanningOverviewSchema


def _parse_date(raw: str | None) -> date | None:
    value = str(raw or "").strip()
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _is_overdue(item_date: date | None, status: str, closed_statuses: set[str]) -> bool:
    if item_date is None:
        return False
    if str(status or "") in closed_statuses:
        return False
    return item_date < date.today()


def build_g3_planning_overview(mission: G3MissionResponseSchema) -> G3PlanningOverviewSchema:
    items: list[G3PlanningItemSchema] = []
    alerts: list[str] = []

    closed_intervention = {"Réalisé", "Annulé"}
    closed_hold = {"Validé", "Validé avec réserves", "Refusé", "Clos"}

    if mission.start_date:
        start = _parse_date(mission.start_date)
        overdue = _is_overdue(start, mission.status, {"Terminé", "Archivé"})
        if overdue:
            alerts.append("Date de début de mission dépassée.")
        items.append(G3PlanningItemSchema(
            kind="mission_start",
            item_id=mission.id,
            label="Début mission",
            date=mission.start_date,
            status=mission.status,
            zone_name="",
            overdue=overdue,
            alert="Retard démarrage" if overdue else "",
        ))

    if mission.end_date:
        end = _parse_date(mission.end_date)
        overdue = _is_overdue(end, mission.status, {"Terminé", "Archivé"})
        if overdue:
            alerts.append("Date de fin de mission dépassée.")
        items.append(G3PlanningItemSchema(
            kind="mission_end",
            item_id=mission.id,
            label="Fin mission",
            date=mission.end_date,
            status=mission.status,
            zone_name="",
            overdue=overdue,
            alert="Retard clôture" if overdue else "",
        ))

    for row in mission.planned_interventions:
        overdue = _is_overdue(_parse_date(row.date), row.status or "", closed_intervention)
        if overdue:
            alerts.append(f"Intervention prévue en retard : {row.number} {row.type}")
        items.append(G3PlanningItemSchema(
            kind="planned_intervention",
            item_id=int(row.id or 0),
            label=f"{row.number} — {row.type}",
            date=row.date,
            status=row.status or "",
            zone_name=row.zone_name or "",
            overdue=overdue,
            alert="Retard programme" if overdue else "",
        ))

    for row in mission.realized_interventions:
        if str(row.status or "") in {"Brouillon", "À compléter"}:
            items.append(G3PlanningItemSchema(
                kind="realized_intervention",
                item_id=int(row.id or 0),
                label=f"{row.number} — {row.type} (à compléter)",
                date=row.date,
                status=row.status or "",
                zone_name=row.zone_name or "",
                overdue=False,
                alert="Compte rendu à finaliser",
            ))

    for row in mission.hold_points:
        overdue = _is_overdue(_parse_date(row.due_date), row.status or "", closed_hold)
        point_alerts = list(row.alerts or [])
        if overdue:
            point_alerts.append("Échéance dépassée")
            alerts.append(f"Point d'arrêt en retard : {row.code} {row.label}")
        items.append(G3PlanningItemSchema(
            kind="hold_point",
            item_id=int(row.id or 0),
            label=f"{row.code} — {row.label}",
            date=row.due_date,
            status=row.status or "",
            zone_name=row.zone_name or "",
            overdue=overdue,
            alert=" · ".join(point_alerts),
        ))

    for notice in mission.notices:
        if str(notice.status or "") in {"Brouillon", "À relire"}:
            items.append(G3PlanningItemSchema(
                kind="notice",
                item_id=int(notice.id or 0),
                label=f"{notice.type} — {notice.reference or notice.title or 'Sans ref.'}",
                date=notice.notice_date,
                status=notice.status or "",
                zone_name=notice.zone_name or "",
                overdue=False,
                alert="Avis à finaliser",
            ))

    items.sort(key=lambda item: (item.date or "9999-12-31", item.label))
    overdue_count = sum(1 for item in items if item.overdue)

    return G3PlanningOverviewSchema(
        items=items,
        alerts=alerts,
        overdue_count=overdue_count,
    )


def compute_hold_point_alerts(
    hold_point: G3HoldPointSchema,
    mission: G3MissionResponseSchema,
) -> list[str]:
    alerts: list[str] = []
    status = str(hold_point.status or "")

    if hold_point.requires_tests and status in {"Ouvert", "En attente essais", "À venir"}:
        pending = [t for t in mission.tests if str(t.conformity or "") in {"", "En attente"}]
        if pending:
            alerts.append(f"{len(pending)} essai(s) en attente")

    if hold_point.requires_notice and status in {"Ouvert", "En attente avis", "À venir"}:
        linked = None
        if hold_point.notice_id:
            linked = next((n for n in mission.notices if n.id == hold_point.notice_id), None)
        if not linked or str(linked.status or "") not in {"Validé", "Transmis"}:
            alerts.append("Avis G3 manquant ou non validé")

    due = _parse_date(hold_point.due_date)
    if due and due < date.today() and status not in {"Validé", "Validé avec réserves", "Refusé", "Clos"}:
        alerts.append("Échéance dépassée")

    return alerts
