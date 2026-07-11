"""Génération HTML des tableaux documents G3."""

from __future__ import annotations

import html
from datetime import date

from app.models.g3 import G3MissionResponseSchema


def _esc(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def _yes_no(value: bool) -> str:
    return "Oui" if value else "Non"


def build_g3_documents_table_html(mission: G3MissionResponseSchema) -> str:
    today = date.today().isoformat()
    documents = mission.documents or []
    rows = ""
    for doc in documents:
        rows += f"""
        <tr>
          <td>{_esc(doc.type)}</td>
          <td>{_esc(doc.name)}</td>
          <td>{_esc(doc.reference)}</td>
          <td>{_esc(doc.version)}</td>
          <td>{_esc(doc.document_date)}</td>
          <td>{_esc(doc.author)}</td>
          <td>{_yes_no(doc.received)}</td>
          <td>{_yes_no(doc.analyzed)}</td>
          <td>{_yes_no(doc.used_in_report)}</td>
          <td>{_esc(doc.zone_name)}</td>
          <td>{_esc(doc.observations)}</td>
        </tr>
        """

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Tableau documents G3 — {_esc(mission.reference)}</title>
  <style>
    body {{ font-family: Arial, sans-serif; color: #172033; margin: 24px; line-height: 1.45; }}
    h1 {{ color: #003170; font-size: 20px; }}
    .meta {{ color: #69758a; font-size: 13px; margin-bottom: 20px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 11px; }}
    th, td {{ border: 1px solid #dbe1ea; padding: 6px 8px; vertical-align: top; }}
    th {{ background: #f3f6fb; text-align: left; }}
  </style>
</head>
<body>
  <h1>Tableau des documents — Mission G3</h1>
  <div class="meta">
    Mission {_esc(mission.reference)} · {_esc(mission.chantier)} · Généré le {_esc(today)}
  </div>
  <table>
    <thead>
      <tr>
        <th>Type</th><th>Nom</th><th>Référence</th><th>Version</th><th>Date</th>
        <th>Auteur</th><th>Reçu</th><th>Analysé</th><th>Rapport</th><th>Zone</th><th>Observations</th>
      </tr>
    </thead>
    <tbody>
      {rows or '<tr><td colspan="11">Aucun document enregistré.</td></tr>'}
    </tbody>
  </table>
</body>
</html>"""
