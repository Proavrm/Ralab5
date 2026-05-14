from __future__ import annotations

import json
import re
import sqlite3
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict

from app.core.database import get_db_path

router = APIRouter(tags=["Rapports validation"])
DB_PATH = get_db_path()


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(DB_PATH))
    c.row_factory = sqlite3.Row
    return c


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _parse_json_dict(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    text = _clean(raw)
    if not text:
        return {}
    try:
        data = json.loads(text)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _status_from_payload(payload: dict[str, Any]) -> str:
    return _clean(
        payload.get("rapport_status")
        or payload.get("validation_status")
        or payload.get("report_status")
        or "Brouillon"
    )


def _point_uid_from_reference(reference: str, payload: dict[str, Any], fallback_uid: str) -> str:
    text = _clean(reference).upper()
    match = re.search(r"SC(\d+)$", text)
    wanted_code = f"SC{int(match.group(1))}" if match else ""
    points = payload.get("points")
    if isinstance(points, list) and wanted_code:
        for point in points:
            if not isinstance(point, dict):
                continue
            point_code = _clean(point.get("point_code")).upper()
            if point_code == wanted_code:
                point_uid = _clean(point.get("uid") or point.get("id"))
                if point_uid:
                    return point_uid
    return _clean(fallback_uid)


@router.get("")
def list_validation_reports(
    q: str | None = Query(default=None),
    reference: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    search = _clean(reference or q).upper()
    search_like = f"%{search}%"
    items: list[dict[str, Any]] = []

    with _conn() as conn:
        if search:
            terrain_rows = conn.execute(
                """
                SELECT
                    ft.id,
                    ft.code_feuille,
                    ft.reference,
                    ft.resultats_json,
                    ft.demande_id,
                    ft.intervention_id,
                    ft.campagne_id,
                    ft.created_at,
                    ft.updated_at,
                    (
                        SELECT CAST(pt.id AS TEXT)
                        FROM points_terrain pt
                        WHERE pt.serie_id = ft.serie_id
                        ORDER BY COALESCE(pt.ordre, 0), pt.id
                        LIMIT 1
                    ) AS sc_point_uid,
                    d.reference AS demande_reference,
                    a.reference AS affaire_reference,
                    a.client AS affaire_client,
                    COALESCE(i.sujet, i.type_intervention, '') AS intervention_label
                FROM feuilles_terrain ft
                LEFT JOIN demandes d ON d.id = ft.demande_id
                LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
                LEFT JOIN interventions i ON i.id = ft.intervention_id
                WHERE UPPER(COALESCE(ft.code_feuille, '')) IN ('DE', 'SC')
                  AND UPPER(COALESCE(ft.reference, '')) LIKE ?
                ORDER BY ft.updated_at DESC, ft.id DESC
                LIMIT ?
                """,
                (search_like, int(limit)),
            ).fetchall()
        else:
            terrain_rows = conn.execute(
                """
                SELECT
                    ft.id,
                    ft.code_feuille,
                    ft.reference,
                    ft.resultats_json,
                    ft.demande_id,
                    ft.intervention_id,
                    ft.campagne_id,
                    ft.created_at,
                    ft.updated_at,
                    (
                        SELECT CAST(pt.id AS TEXT)
                        FROM points_terrain pt
                        WHERE pt.serie_id = ft.serie_id
                        ORDER BY COALESCE(pt.ordre, 0), pt.id
                        LIMIT 1
                    ) AS sc_point_uid,
                    d.reference AS demande_reference,
                    a.reference AS affaire_reference,
                    a.client AS affaire_client,
                    COALESCE(i.sujet, i.type_intervention, '') AS intervention_label
                FROM feuilles_terrain ft
                LEFT JOIN demandes d ON d.id = ft.demande_id
                LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
                LEFT JOIN interventions i ON i.id = ft.intervention_id
                WHERE UPPER(COALESCE(ft.code_feuille, '')) IN ('DE', 'SC')
                ORDER BY ft.updated_at DESC, ft.id DESC
                LIMIT ?
                """,
                (int(limit),),
            ).fetchall()

        for row in terrain_rows:
            code = _clean(row["code_feuille"]).upper()
            ref = _clean(row["reference"])
            payload = _parse_json_dict(row["resultats_json"])
            uid = _clean(row["id"])
            sc_point_uid = _point_uid_from_reference(ref, payload, _clean(row["sc_point_uid"])) if code == "SC" else ""
            items.append(
                {
                    "id": ref or f"{code}-{uid}",
                    "uid": f"{code}:{uid}",
                    "type": code,
                    "title": f"Rapport {code}",
                    "status": _status_from_payload(payload),
                    "author": _clean(payload.get("author") or payload.get("redacteur")),
                    "date": _clean(payload.get("date_rapport") or row["updated_at"] or row["created_at"]),
                    "pages": int(payload.get("pages") or 1),
                    "warnings": int(payload.get("warnings") or 0),
                    "blockers": int(payload.get("blockers") or 0),
                    "source": _clean(payload.get("criteria_source") or payload.get("source_criteres")),
                    "model": _clean(payload.get("model_version") or payload.get("template_version")),
                    "affair": _clean(row["affaire_reference"]),
                    "client": _clean(row["affaire_client"]),
                    "site": _clean(payload.get("site") or payload.get("chantier") or row["intervention_label"]),
                    "source_uid": uid,
                    "source_id": ref,
                    "essai_reference": ref,
                    "point_uid": sc_point_uid,
                    "history": [],
                }
            )

        if search:
            pmt_rows = conn.execute(
                """
                SELECT
                    p.id,
                    p.reference,
                    p.statut,
                    p.demande_id,
                    p.intervention_id,
                    p.created_at,
                    p.updated_at,
                    d.reference AS demande_reference,
                    a.reference AS affaire_reference,
                    a.client AS affaire_client,
                    COALESCE(i.sujet, i.type_intervention, '') AS intervention_label
                FROM pmt_essais p
                LEFT JOIN demandes d ON d.id = p.demande_id
                LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
                LEFT JOIN interventions i ON i.id = p.intervention_id
                WHERE UPPER(COALESCE(p.reference, '')) LIKE ?
                ORDER BY p.updated_at DESC, p.id DESC
                LIMIT ?
                """,
                (search_like, int(limit)),
            ).fetchall()
        else:
            pmt_rows = conn.execute(
                """
                SELECT
                    p.id,
                    p.reference,
                    p.statut,
                    p.demande_id,
                    p.intervention_id,
                    p.created_at,
                    p.updated_at,
                    d.reference AS demande_reference,
                    a.reference AS affaire_reference,
                    a.client AS affaire_client,
                    COALESCE(i.sujet, i.type_intervention, '') AS intervention_label
                FROM pmt_essais p
                LEFT JOIN demandes d ON d.id = p.demande_id
                LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
                LEFT JOIN interventions i ON i.id = p.intervention_id
                ORDER BY p.updated_at DESC, p.id DESC
                LIMIT ?
                """,
                (int(limit),),
            ).fetchall()

        for row in pmt_rows:
            ref = _clean(row["reference"])
            pmt_id = int(row["id"])
            items.append(
                {
                    "id": ref or f"PMT-{pmt_id}",
                    "uid": f"PMT:{pmt_id}",
                    "type": "PMT",
                    "title": "Rapport PMT",
                    "status": _clean(row["statut"]) or "Brouillon",
                    "author": "",
                    "date": _clean(row["updated_at"] or row["created_at"]),
                    "pages": 1,
                    "warnings": 0,
                    "blockers": 0,
                    "source": "NF EN 13036-1",
                    "model": "",
                    "affair": _clean(row["affaire_reference"]),
                    "client": _clean(row["affaire_client"]),
                    "site": _clean(row["intervention_label"]),
                    "pmt_essai_id": str(pmt_id),
                    "source_id": str(pmt_id),
                    "essai_reference": ref,
                    "history": [],
                }
            )

    # Unified ordering across types (DE/SC/PMT): most recent first.
    # Keep exact-match reference pinned first when a search term is provided.
    if search:
        items.sort(
            key=lambda item: (
                0 if _clean(item.get("id")).upper() == search else 1,
                _clean(item.get("date")),
            ),
            reverse=False,
        )
        exact = [item for item in items if _clean(item.get("id")).upper() == search]
        non_exact = [item for item in items if _clean(item.get("id")).upper() != search]
        non_exact.sort(key=lambda item: _clean(item.get("date")), reverse=True)
        return exact + non_exact

    items.sort(key=lambda item: _clean(item.get("date")), reverse=True)
    return items


class UpdateStatusBody(BaseModel):
    model_config = ConfigDict(extra="allow")
    action: str | None = None
    status: str | None = None
    comment: str | None = None


@router.post("/{report_id}/status")
def update_report_status(report_id: str, body: UpdateStatusBody):
    raw_id = _clean(report_id)
    next_status = _clean(body.status) or "Brouillon"
    # PMT: canonical status persistence on pmt_essais.
    if raw_id.upper().startswith("PMT:"):
        maybe_id = _clean(raw_id.split(":", 1)[1])
        if maybe_id.isdigit():
            with _conn() as conn:
                conn.execute(
                    "UPDATE pmt_essais SET statut = ?, updated_at = datetime('now') WHERE id = ?",
                    (next_status, int(maybe_id)),
                )
                conn.commit()
    return {
        "ok": True,
        "report_id": raw_id,
        "status": next_status,
        "action": _clean(body.action),
    }


@router.post("/{report_id}/preview")
def refresh_report_preview(report_id: str):
    return {"ok": True, "report_id": _clean(report_id)}

