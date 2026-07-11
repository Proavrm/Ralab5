"""Génération du document G3002 — Programme des reconnaissances G3."""

from __future__ import annotations

import html
from datetime import date

from app.models.g3 import G3MissionResponseSchema


def _esc(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def build_g3002_html(mission: G3MissionResponseSchema) -> str:
    today = date.today().isoformat()
    interventions = mission.planned_interventions or []
    means = sorted({row.means for row in interventions if row.means})
    prerequisites = sorted({row.prerequisites for row in interventions if row.prerequisites})
    deliverables = sorted({row.expected_deliverable for row in interventions if row.expected_deliverable})

    doc_rows = ""
    for doc in (mission.documents or []):
        if not doc.received and not doc.name:
            continue
        doc_rows += f"<li>{_esc(doc.type)} — {_esc(doc.name or doc.reference)} ({_esc(doc.version)})</li>"
    doc_list = doc_rows or "<li>Aucun document référencé pour l'instant.</li>"

    intervention_rows = ""
    for row in interventions:
        intervention_rows += f"""
        <tr>
          <td>{_esc(row.number)}</td>
          <td>{_esc(row.type)}</td>
          <td>{_esc(row.zone_name)}</td>
          <td>{_esc(row.objective)}</td>
          <td>{_esc(row.means)}</td>
          <td>{_esc(row.responsible)}</td>
          <td>{_esc(row.prerequisites)}</td>
          <td>{_esc(row.date)}</td>
          <td>{_esc(row.status)}</td>
          <td>{_esc(row.expected_deliverable)}</td>
        </tr>
        """

    means_list = "".join(f"<li>{_esc(item)}</li>" for item in means) or "<li>—</li>"
    prereq_list = "".join(f"<li>{_esc(item)}</li>" for item in prerequisites) or "<li>—</li>"
    deliverable_list = "".join(f"<li>{_esc(item)}</li>" for item in deliverables) or "<li>—</li>"

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Programme des reconnaissances G3 — {_esc(mission.reference)}</title>
  <style>
    body {{ font-family: Arial, sans-serif; color: #172033; margin: 24px; line-height: 1.45; }}
    h1 {{ color: #003170; font-size: 22px; margin-bottom: 4px; }}
    h2 {{ color: #003170; font-size: 16px; margin-top: 28px; border-bottom: 2px solid #ffcc00; padding-bottom: 4px; }}
    .meta {{ color: #69758a; font-size: 13px; margin-bottom: 20px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }}
    th, td {{ border: 1px solid #dbe1ea; padding: 6px 8px; vertical-align: top; }}
    th {{ background: #f3f6fb; text-align: left; }}
    ul {{ margin: 6px 0 0 18px; }}
    .section {{ margin-bottom: 18px; }}
  </style>
</head>
<body>
  <h1>Programme des reconnaissances G3</h1>
  <div class="meta">
    Mission {_esc(mission.reference)} · Affaire {_esc(mission.affaire_ref)} · Demande {_esc(mission.demande_ref)}<br />
    {_esc(mission.title)} · {_esc(mission.chantier)} · Document généré le {_esc(today)}
  </div>

  <div class="section">
    <h2>1. Objet</h2>
    <p>{_esc(mission.main_objective or mission.description or "Programme opérationnel des reconnaissances G3.")}</p>
  </div>

  <div class="section">
    <h2>2. Objectifs de la campagne</h2>
    <p>{_esc(mission.main_objective)}</p>
    <p>{_esc(mission.description)}</p>
  </div>

  <div class="section">
    <h2>3. Documents de référence</h2>
    <ul>{doc_list}</ul>
  </div>

  <div class="section">
    <h2>4. Interventions prévues</h2>
    <table>
      <thead>
        <tr>
          <th>N°</th><th>Type</th><th>Zone</th><th>Objectif</th><th>Moyens</th>
          <th>Responsable</th><th>Prérequis</th><th>Date</th><th>Statut</th><th>Livrable</th>
        </tr>
      </thead>
      <tbody>
        {intervention_rows or '<tr><td colspan="10">Aucune intervention prévue.</td></tr>'}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>5. Moyens à mobiliser</h2>
    <ul>{means_list}</ul>
  </div>

  <div class="section">
    <h2>6. Prérequis chantier</h2>
    <ul>{prereq_list}</ul>
  </div>

  <div class="section">
    <h2>7. Planning prévisionnel</h2>
    <p>Période mission : {_esc(mission.start_date)} → {_esc(mission.end_date)}</p>
  </div>

  <div class="section">
    <h2>8. Livrables attendus</h2>
    <ul>{deliverable_list}</ul>
  </div>

  <div class="section">
    <h2>9. Validation</h2>
    <p>RST responsable : {_esc(mission.rst_responsible)}</p>
    <p>Laboratoire : {_esc(mission.laboratoire)} — {_esc(mission.lab_intervenant)}</p>
  </div>
</body>
</html>"""
