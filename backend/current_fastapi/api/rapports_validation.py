from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict

from app.core.database import get_db_path
from app.services.dossier_emails_service import collect_dossier_emails

router = APIRouter(tags=["Rapports validation"])
DB_PATH = get_db_path()
VALIDATED_FEUILLE_CODES = ("DE", "SC", "SO", "VC")
VALIDATED_FEUILLE_CODES_SQL = ", ".join(f"'{code}'" for code in VALIDATED_FEUILLE_CODES)


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


def _validation_history_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    raw = payload.get("validation_history")
    if not isinstance(raw, list):
        return []

    items: list[dict[str, Any]] = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        items.append(
            {
                "id": _clean(item.get("id")) or f"hist-{index}",
                "user": _clean(item.get("user") or item.get("utilisateur") or item.get("created_by")),
                "action": _clean(item.get("action") or item.get("label") or item.get("event_type")),
                "time": _clean(item.get("time") or item.get("created_at") or item.get("date")),
                "comment": _clean(item.get("comment")),
            }
        )
    return items


def _append_validation_history(payload: dict[str, Any], body: "UpdateStatusBody", next_status: str) -> None:
    history = payload.get("validation_history")
    if not isinstance(history, list):
        history = []

    entry: dict[str, Any] = {
        "id": f"hist-{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "user": _clean(body.user),
        "action": _clean(body.action) or next_status,
        "status": next_status,
        "comment": _clean(body.comment),
        "time": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    }
    if body.correction_reasons:
        entry["correction_reasons"] = list(body.correction_reasons)

    history.insert(0, entry)
    payload["validation_history"] = history[:30]


def _persist_feuille_validation(conn: sqlite3.Connection, feuille_id: int, body: "UpdateStatusBody", next_status: str) -> bool:
    row = conn.execute(
        "SELECT resultats_json FROM feuilles_terrain WHERE id = ?",
        (feuille_id,),
    ).fetchone()
    if not row:
        return False

    payload = _parse_json_dict(row["resultats_json"])
    payload["rapport_status"] = next_status
    payload["validation_status"] = next_status
    payload["report_status"] = next_status

    comment = _clean(body.comment)
    if comment:
        payload["validation_comment"] = comment

    if body.correction_reasons:
        payload["correction_reasons"] = list(body.correction_reasons)
        payload["last_correction_at"] = datetime.now(timezone.utc).isoformat()

    _append_validation_history(payload, body, next_status)

    conn.execute(
        """
        UPDATE feuilles_terrain
        SET resultats_json = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (json.dumps(payload, ensure_ascii=False), feuille_id),
    )
    return True


def _persist_pmt_validation(conn: sqlite3.Connection, pmt_id: int, body: "UpdateStatusBody", next_status: str) -> bool:
    row = conn.execute(
        "SELECT resultats_json FROM pmt_essais WHERE id = ?",
        (pmt_id,),
    ).fetchone()
    if not row:
        return False

    payload = _parse_json_dict(row["resultats_json"])
    payload["rapport_status"] = next_status
    payload["validation_status"] = next_status
    payload["report_status"] = next_status

    comment = _clean(body.comment)
    if comment:
        payload["validation_comment"] = comment

    if body.correction_reasons:
        payload["correction_reasons"] = list(body.correction_reasons)
        payload["last_correction_at"] = datetime.now(timezone.utc).isoformat()

    _append_validation_history(payload, body, next_status)

    conn.execute(
        """
        UPDATE pmt_essais
        SET statut = ?, resultats_json = ?, updated_at = datetime('now')
        WHERE id = ?
        """,
        (next_status, json.dumps(payload, ensure_ascii=False), pmt_id),
    )
    return True


def _validation_fields_from_payload(payload: dict[str, Any], fallback_status: str = "") -> dict[str, Any]:
    status = _status_from_payload(payload) if payload else _clean(fallback_status)
    if not status:
        status = _clean(fallback_status) or "Brouillon"
    correction_reasons = payload.get("correction_reasons")
    return {
        "status": status,
        "validation_comment": _clean(payload.get("validation_comment")),
        "correction_reasons": list(correction_reasons)
        if isinstance(correction_reasons, list)
        else [],
        "history": _validation_history_from_payload(payload),
    }


def _find_sc_point(payload: dict[str, Any], point_uid: str, reference: str) -> dict[str, Any] | None:
    points = payload.get("points")
    if not isinstance(points, list):
        return None

    clean_uid = _clean(point_uid)
    if clean_uid:
        for point in points:
            if not isinstance(point, dict):
                continue
            if _clean(point.get("uid") or point.get("id")) == clean_uid:
                return point

    text = _clean(reference).upper()
    match = re.search(r"SC(\d+)$", text)
    wanted_code = f"SC{int(match.group(1))}" if match else ""
    if wanted_code:
        for point in points:
            if not isinstance(point, dict):
                continue
            point_code = _clean(point.get("point_code")).upper()
            if point_code == wanted_code:
                return point

    for point in points:
        if isinstance(point, dict):
            return point
    return None


def _carotte_coupes_count(point_payload: dict[str, Any]) -> int:
    coupes = point_payload.get("carotte_coupes")
    if isinstance(coupes, list) and coupes:
        return max(1, len(coupes))
    return 0


def _sc_report_pages(
    conn: sqlite3.Connection,
    feuille_id: str,
    payload: dict[str, Any],
    point_uid: str,
    reference: str,
) -> int:
    explicit = payload.get("pages")
    if explicit is not None:
        try:
            pages = int(explicit)
            if pages >= 1:
                return pages
        except (TypeError, ValueError):
            pass

    point = _find_sc_point(payload, point_uid, reference)
    if point:
        count = _carotte_coupes_count(point)
        if count:
            return count

    clean_point_uid = _clean(point_uid)
    if clean_point_uid.isdigit():
        row = conn.execute(
            "SELECT payload_json FROM points_terrain WHERE id = ?",
            (int(clean_point_uid),),
        ).fetchone()
        if row:
            count = _carotte_coupes_count(_parse_json_dict(row["payload_json"]))
            if count:
                return count

    clean_feuille_id = _clean(feuille_id)
    if clean_feuille_id.isdigit():
        row = conn.execute(
            """
            SELECT pt.payload_json
            FROM points_terrain pt
            INNER JOIN feuilles_terrain ft ON ft.serie_id = pt.serie_id
            WHERE ft.id = ?
            ORDER BY COALESCE(pt.ordre, 0), pt.id
            LIMIT 1
            """,
            (int(clean_feuille_id),),
        ).fetchone()
        if row:
            count = _carotte_coupes_count(_parse_json_dict(row["payload_json"]))
            if count:
                return count

    return 1


def _point_uid_from_reference(
    reference: str,
    payload: dict[str, Any],
    fallback_uid: str,
    point_prefix: str = "SC",
) -> str:
    text = _clean(reference).upper()
    prefix = _clean(point_prefix).upper() or "SC"
    match = re.search(rf"{re.escape(prefix)}(\d+)$", text)
    wanted_code = f"{prefix}{int(match.group(1))}" if match else ""
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
                f"""
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
                WHERE UPPER(COALESCE(ft.code_feuille, '')) IN ({VALIDATED_FEUILLE_CODES_SQL})
                  AND UPPER(COALESCE(ft.reference, '')) LIKE ?
                ORDER BY ft.updated_at DESC, ft.id DESC
                LIMIT ?
                """,
                (search_like, int(limit)),
            ).fetchall()
        else:
            terrain_rows = conn.execute(
                f"""
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
                WHERE UPPER(COALESCE(ft.code_feuille, '')) IN ({VALIDATED_FEUILLE_CODES_SQL})
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
            sc_point_uid = (
                _point_uid_from_reference(ref, payload, _clean(row["sc_point_uid"]), code)
                if code in {"SC", "SO"}
                else ""
            )
            contexte = payload.get("contexte") if isinstance(payload.get("contexte"), dict) else {}
            title = "Compte rendu visite chantier" if code == "VC" else f"Rapport {code}"
            site = _clean(
                contexte.get("zone")
                or payload.get("site")
                or payload.get("chantier")
                or row["intervention_label"]
            )
            items.append(
                {
                    "id": ref or f"{code}-{uid}",
                    "uid": f"{code}:{uid}",
                    "type": code,
                    "title": title,
                    "status": _status_from_payload(payload),
                    "author": _clean(payload.get("author") or payload.get("redacteur")),
                    "date": _clean(payload.get("date_rapport") or row["updated_at"] or row["created_at"]),
                    "pages": _sc_report_pages(conn, uid, payload, sc_point_uid, ref)
                    if code == "SC"
                    else max(1, int(payload.get("pages") or 1)),
                    "warnings": int(payload.get("warnings") or 0),
                    "blockers": int(payload.get("blockers") or 0),
                    "source": _clean(payload.get("criteria_source") or payload.get("source_criteres")),
                    "model": _clean(payload.get("model_version") or payload.get("template_version")),
                    "affair": _clean(row["affaire_reference"]),
                    "client": _clean(row["affaire_client"]),
                    "site": site,
                    "source_uid": uid,
                    "source_id": ref,
                    "essai_reference": ref,
                    "point_uid": sc_point_uid,
                    "validation_comment": _clean(payload.get("validation_comment")),
                    "correction_reasons": list(payload.get("correction_reasons") or [])
                    if isinstance(payload.get("correction_reasons"), list)
                    else [],
                    "history": _validation_history_from_payload(payload),
                }
            )

        if search:
            pmt_rows = conn.execute(
                """
                SELECT
                    p.id,
                    p.reference,
                    p.statut,
                    p.resultats_json,
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
                    p.resultats_json,
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
            pmt_payload = _parse_json_dict(row["resultats_json"])
            pmt_validation = _validation_fields_from_payload(pmt_payload, _clean(row["statut"]))
            items.append(
                {
                    "id": ref or f"PMT-{pmt_id}",
                    "uid": f"PMT:{pmt_id}",
                    "type": "PMT",
                    "title": "Rapport PMT",
                    "status": pmt_validation["status"],
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
                    "validation_comment": pmt_validation["validation_comment"],
                    "correction_reasons": pmt_validation["correction_reasons"],
                    "history": pmt_validation["history"],
                }
            )

    # Unified ordering across types (DE/SC/SO/VC/PMT): most recent first.
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
    user: str | None = None
    correction_reasons: list[str] | None = None


@router.post("/{report_id}/status")
def update_report_status(report_id: str, body: UpdateStatusBody):
    raw_id = _clean(report_id)
    next_status = _clean(body.status) or "Brouillon"
    persisted = False

    with _conn() as conn:
        upper_id = raw_id.upper()
        if upper_id.startswith("PMT:"):
            maybe_id = _clean(raw_id.split(":", 1)[1])
            if maybe_id.isdigit():
                persisted = _persist_pmt_validation(conn, int(maybe_id), body, next_status)
        elif any(upper_id.startswith(f"{code}:") for code in VALIDATED_FEUILLE_CODES):
            feuille_id = _clean(raw_id.split(":", 1)[1])
            if feuille_id.isdigit():
                persisted = _persist_feuille_validation(conn, int(feuille_id), body, next_status)

        if persisted:
            conn.commit()

    return {
        "ok": True,
        "persisted": persisted,
        "report_id": raw_id,
        "status": next_status,
        "action": _clean(body.action),
        "message": "Décision enregistrée." if persisted else "Décision mémorisée côté interface uniquement.",
    }


@router.post("/{report_id}/preview")
def refresh_report_preview(report_id: str):
    return {"ok": True, "report_id": _clean(report_id)}


@router.get("/{report_id}/dossier-emails")
def get_report_dossier_emails(report_id: str):
    with _conn() as conn:
        return collect_dossier_emails(conn, report_id)

