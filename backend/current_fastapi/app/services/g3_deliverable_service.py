"""Génération HTML des livrables G3001 à G3008."""

from __future__ import annotations

import html
import re
from datetime import date

from app.models.g3 import G3MissionResponseSchema
from app.services.g3_programme_service import build_g3002_html


def _esc(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def _yes_no(value: bool) -> str:
    return "Oui" if value else "Non"


def _doc_style(title: str, mission: G3MissionResponseSchema) -> str:
    today = date.today().isoformat()
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>{_esc(title)} — {_esc(mission.reference)}</title>
  <style>
    body {{ font-family: Arial, sans-serif; color: #172033; margin: 24px; line-height: 1.45; }}
    h1 {{ color: #003170; font-size: 22px; margin-bottom: 4px; }}
    h2 {{ color: #003170; font-size: 16px; margin-top: 24px; border-bottom: 2px solid #ffcc00; padding-bottom: 4px; }}
    .meta {{ color: #69758a; font-size: 13px; margin-bottom: 20px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }}
    th, td {{ border: 1px solid #dbe1ea; padding: 6px 8px; vertical-align: top; }}
    th {{ background: #f3f6fb; text-align: left; }}
    ul {{ margin: 6px 0 0 18px; }}
    p {{ margin: 8px 0; }}
  </style>
</head>
<body>
  <h1>{_esc(title)}</h1>
  <div class="meta">
    Mission {_esc(mission.reference)} · Affaire {_esc(mission.affaire_ref)} · Demande {_esc(mission.demande_ref)}<br />
    {_esc(mission.title)} · {_esc(mission.chantier)} · Généré le {_esc(today)}
  </div>
"""


def deliverable_type_code(deliverable_type: str) -> str:
    match = re.match(r"^(G300\d)", str(deliverable_type or "").strip())
    return match.group(1) if match else ""


def build_g3001_html(mission: G3MissionResponseSchema) -> str:
    types = ", ".join(mission.mission_types or []) or "—"
    body = _doc_style("G3001 — Note de cadrage G3", mission)
    body += f"""
  <h2>Identification</h2>
  <table>
    <tr><th>Client</th><td>{_esc(mission.client)}</td></tr>
    <tr><th>Chantier</th><td>{_esc(mission.chantier)}</td></tr>
    <tr><th>Localisation</th><td>{_esc(mission.location)}</td></tr>
    <tr><th>Types de mission</th><td>{_esc(types)}</td></tr>
    <tr><th>Statut</th><td>{_esc(mission.status)}</td></tr>
    <tr><th>Période</th><td>{_esc(mission.start_date)} → {_esc(mission.end_date)}</td></tr>
  </table>

  <h2>Objectif principal</h2>
  <p>{_esc(mission.main_objective or mission.description or "—")}</p>

  <h2>Intervenants</h2>
  <table>
    <tr><th>Conducteur</th><td>{_esc(mission.conducteur)}</td></tr>
    <tr><th>Responsable RST</th><td>{_esc(mission.rst_responsible)}</td></tr>
    <tr><th>Laboratoire</th><td>{_esc(mission.laboratoire)}</td></tr>
    <tr><th>MOA / MOE</th><td>{_esc(mission.moa)} / {_esc(mission.moe)}</td></tr>
  </table>

  <h2>Objectifs G3 retenus</h2>
  <ul>
    {"".join(f"<li>{_esc(obj.label)} — {_esc(obj.status)}</li>" for obj in (mission.objectives or [])) or "<li>—</li>"}
  </ul>
</body></html>"""
    return body


def build_g3003_html(mission: G3MissionResponseSchema) -> str:
    visits = [
        row for row in (mission.realized_interventions or [])
        if "visite" in str(row.type or "").lower() or "réunion" in str(row.type or "").lower()
    ] or list(mission.realized_interventions or [])
    body = _doc_style("G3003 — Compte rendu de visite", mission)
    rows_html = ""
    for row in visits:
        rows_html += f"""
        <tr>
          <td>{_esc(row.number)}</td><td>{_esc(row.date)}</td><td>{_esc(row.type)}</td>
          <td>{_esc(row.zone_name)}</td><td>{_esc(row.responsible)}</td>
          <td>{_esc(row.findings)}</td><td>{_esc(row.decision)}</td>
        </tr>"""
    body += f"""
  <h2>Visites et reconnaissances terrain</h2>
  <table>
    <thead><tr>
      <th>N°</th><th>Date</th><th>Type</th><th>Zone</th><th>Responsable</th><th>Constats</th><th>Décision</th>
    </tr></thead>
    <tbody>{rows_html or '<tr><td colspan="7">Aucune visite réalisée.</td></tr>'}</tbody>
  </table>
</body></html>"""
    return body


def build_g3004_html(mission: G3MissionResponseSchema) -> str:
    body = _doc_style("G3004 — Avis G3", mission)
    for notice in (mission.notices or []):
        body += f"""
  <h2>{_esc(notice.reference or notice.title or notice.type)} — {_esc(notice.status)}</h2>
  <p><strong>Type :</strong> {_esc(notice.type)} · <strong>Zone :</strong> {_esc(notice.zone_name)} · <strong>Date :</strong> {_esc(notice.notice_date)}</p>
  <p>{_esc(notice.formulation)}</p>
  <p>{_esc(notice.content)}</p>
  <p><strong>Conditions / réserves :</strong> {_esc(notice.conditions)}</p>
  <p><strong>Recommandations :</strong> {_esc(notice.recommendations)}</p>
"""
    if not mission.notices:
        body += "<p>Aucun avis G3 enregistré.</p>"
    body += "</body></html>"
    return body


def build_g3005_html(mission: G3MissionResponseSchema) -> str:
    body = _doc_style("G3005 — Synthèse essais", mission)
    rows = ""
    for test in (mission.tests or []):
        rows += f"""
        <tr>
          <td>{_esc(test.type)}</td><td>{_esc(test.label)}</td><td>{_esc(test.test_date)}</td>
          <td>{_esc(test.zone_name)}</td><td>{_esc(test.result)}</td><td>{_esc(test.conformity)}</td>
          <td>{_esc(test.observations)}</td>
        </tr>"""
    conforme = sum(1 for t in (mission.tests or []) if t.conformity == "Conforme")
    non_conf = sum(1 for t in (mission.tests or []) if t.conformity == "Non conforme")
    body += f"""
  <p><strong>Synthèse :</strong> {conforme} conforme(s), {non_conf} non conforme(s), {len(mission.tests or [])} essai(s) au total.</p>
  <table>
    <thead><tr>
      <th>Type</th><th>Libellé</th><th>Date</th><th>Zone</th><th>Résultat</th><th>Conformité</th><th>Observations</th>
    </tr></thead>
    <tbody>{rows or '<tr><td colspan="7">Aucun essai enregistré.</td></tr>'}</tbody>
  </table>
</body></html>"""
    return body


def build_g3006_html(mission: G3MissionResponseSchema) -> str:
    rows_data = [
        row for row in (mission.realized_interventions or [])
        if "fond" in str(row.type or "").lower() or "fouille" in str(row.type or "").lower()
    ]
    body = _doc_style("G3006 — Fiche réception fond de fouille", mission)
    rows = ""
    for row in rows_data:
        rows += f"""
        <tr>
          <td>{_esc(row.number)}</td><td>{_esc(row.date)}</td><td>{_esc(row.zone_name)}</td>
          <td>{_esc(row.findings)}</td><td>{_esc(row.decision)}</td><td>{_esc(row.next_actions)}</td>
        </tr>"""
    body += f"""
  <table>
    <thead><tr>
      <th>N°</th><th>Date</th><th>Zone</th><th>Constats</th><th>Décision</th><th>Actions</th>
    </tr></thead>
    <tbody>{rows or '<tr><td colspan="6">Aucune réception enregistrée.</td></tr>'}</tbody>
  </table>
</body></html>"""
    return body


def build_g3007_html(mission: G3MissionResponseSchema) -> str:
    reuse_objectives = [
        obj for obj in (mission.objectives or [])
        if "réemploi" in str(obj.label or "").lower() or "matériau" in str(obj.label or "").lower()
    ]
    body = _doc_style("G3007 — Synthèse réemploi matériaux", mission)
    body += "<h2>Objectifs réemploi</h2><ul>"
    body += "".join(f"<li>{_esc(obj.label)} — {_esc(obj.status)}</li>" for obj in reuse_objectives) or "<li>—</li>"
    body += "</ul><h2>Essais matériaux</h2><ul>"
    material_tests = [
        t for t in (mission.tests or [])
        if any(k in str(t.type or "").lower() for k in ("granulo", "vbs", "ipi", "carottage", "matériau"))
    ]
    body += "".join(
        f"<li>{_esc(t.type)} — {_esc(t.label)} : {_esc(t.result)} ({_esc(t.conformity)})</li>"
        for t in material_tests
    ) or "<li>—</li>"
    body += "</ul></body></html>"
    return body


def build_g3008_html(mission: G3MissionResponseSchema) -> str:
    body = _doc_style("G3008 — Rapport final G3", mission)
    body += f"""
  <h2>1. Synthèse mission</h2>
  <p>{_esc(mission.description or mission.main_objective or "—")}</p>
  <p><strong>Statut mission :</strong> {_esc(mission.status)}</p>

  <h2>2. Ouvrages / zones</h2>
  <ul>{"".join(f"<li>{_esc(z.name)} ({_esc(z.type)}) — risque {_esc(z.risk_level)}</li>" for z in (mission.zones or [])) or "<li>—</li>"}</ul>

  <h2>3. Programme et reconnaissances</h2>
  <p>{len(mission.planned_interventions or [])} intervention(s) prévue(s), {len(mission.realized_interventions or [])} réalisée(s).</p>

  <h2>4. Essais et contrôles</h2>
  <p>{len(mission.tests or [])} essai(s) enregistré(s).</p>

  <h2>5. Avis G3</h2>
  <ul>{"".join(f"<li>{_esc(n.reference or n.type)} — {_esc(n.status)}</li>" for n in (mission.notices or [])) or "<li>—</li>"}</ul>

  <h2>6. Points d'arrêt</h2>
  <ul>{"".join(f"<li>{_esc(hp.code)} {_esc(hp.label)} — {_esc(hp.status)}</li>" for hp in (mission.hold_points or [])) or "<li>—</li>"}</ul>

  <h2>7. Photos rapport</h2>
  <ul>{"".join(f"<li>{_esc(p.caption)}</li>" for p in (mission.photos or []) if p.use_in_report) or "<li>—</li>"}</ul>

  <h2>8. Conclusion</h2>
  <p>Rapport généré automatiquement à partir des données saisies dans le dossier G3 RaLab.</p>
</body></html>"""
    return body


def build_deliverable_html(mission: G3MissionResponseSchema, deliverable_type: str) -> str:
    code = deliverable_type_code(deliverable_type)
    if code == "G3001":
        return build_g3001_html(mission)
    if code == "G3002":
        return build_g3002_html(mission)
    if code == "G3003":
        return build_g3003_html(mission)
    if code == "G3004":
        return build_g3004_html(mission)
    if code == "G3005":
        return build_g3005_html(mission)
    if code == "G3006":
        return build_g3006_html(mission)
    if code == "G3007":
        return build_g3007_html(mission)
    if code == "G3008":
        return build_g3008_html(mission)
    return build_g3008_html(mission)
