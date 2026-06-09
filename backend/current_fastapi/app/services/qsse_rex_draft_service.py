from __future__ import annotations

import json
from typing import Any

from app.core.database import connect_qsse_db

QSSE_REX_ELIGIBLE_REGISTER_CODES = {"FNC", "PASD", "BP", "FAE"}
QSSE_REX_PROVIDER = "assisted-template"
QSSE_REX_PROMPT_VERSION = "qsse-rex-template-v1"


def _text(value: Any) -> str:
    return str(value or "").strip()


def _json_object(value: Any) -> dict[str, Any]:
    if not value:
        return {}
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _unique_list(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = _text(value)
        lowered = cleaned.lower()
        if not cleaned or lowered in seen:
            continue
        seen.add(lowered)
        result.append(cleaned)
    return result


def _record_reference(record) -> str:
    register_code = _text(record["register_code"] or "QSSE").upper() or "QSSE"
    return f"{register_code}-{int(record['id'])}"


def _row_to_source_payload(record, documents: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "reference": _record_reference(record),
        "record_id": int(record["id"]),
        "register_code": _text(record["register_code"]).upper(),
        "record_kind": _text(record["record_kind"]).lower(),
        "agency": _text(record["agency"]),
        "entity": _text(record["entity"]),
        "person": _text(record["person"]),
        "site": _text(record["site"]),
        "theme": _text(record["theme"]),
        "title": _text(record["title"]),
        "description": _text(record["description"]),
        "cause": _text(record["cause"]),
        "treatment": _text(record["treatment"]),
        "corrective_action": _text(record["corrective_action"]),
        "action_label": _text(record["action_label"]),
        "pilot": _text(record["pilot"]),
        "status": _text(record["status"]),
        "severity": _text(record["severity"]),
        "date_event": _text(record["date_event"]),
        "date_closed": _text(record["date_closed"]),
        "date_saisie": _text(record["date_saisie"]),
        "document_reference": _text(record["document_reference"]),
        "metrics": _json_object(record["metrics_json"]),
        "documents": documents,
    }


def _target_audience(payload: dict[str, Any]) -> list[str]:
    register_code = _text(payload.get("register_code")).upper()
    audience = ["Encadrement chantier", "Qualite / QSSE"]
    if register_code in {"FNC", "PASD", "FAE"}:
        audience.append("Prevention")
    if register_code == "BP":
        audience.append("Animation 1/4h")
    if _text(payload.get("pilot")):
        audience.append("Pilotes d'action")
    return _unique_list(audience)


def _missing_information(payload: dict[str, Any], documents: list[dict[str, Any]]) -> list[str]:
    missing: list[str] = []
    if not _text(payload.get("description")):
        missing.append("Constat initial a completer.")
    if not _text(payload.get("cause")):
        missing.append("Cause racine non documentee.")
    if not _text(payload.get("treatment")) and not _text(payload.get("corrective_action")):
        missing.append("Traitement ou action corrective a preciser.")
    if not _text(payload.get("date_closed")):
        missing.append("Date de cloture absente ou non finalisee.")
    if not documents and not _text(payload.get("document_reference")):
        missing.append("Aucun support documentaire associe.")
    return missing


def _confidence_score(payload: dict[str, Any], documents: list[dict[str, Any]]) -> int:
    score = 24
    weighted_fields = {
        "title": 8,
        "description": 16,
        "cause": 18,
        "treatment": 12,
        "corrective_action": 12,
        "action_label": 8,
        "status": 6,
        "severity": 6,
        "date_closed": 5,
        "document_reference": 4,
    }
    for field, weight in weighted_fields.items():
        if _text(payload.get(field)):
            score += weight
    if documents:
        score += min(len(documents), 3) * 3
    return max(0, min(score, 96))


def _build_summary(payload: dict[str, Any]) -> str:
    register_code = _text(payload.get("register_code")).upper() or "QSSE"
    title = _text(payload.get("title")) or _text(payload.get("document_reference")) or "Evenement QSSE"
    site = _text(payload.get("site")) or _text(payload.get("agency")) or "site non renseigne"
    severity = _text(payload.get("severity"))
    event_date = _text(payload.get("date_event")) or _text(payload.get("date_saisie")) or "date non renseignee"
    if severity:
        return f"{register_code} signale sur {site} le {event_date}. Sujet: {title}. Niveau declare: {severity}."
    return f"{register_code} signale sur {site} le {event_date}. Sujet: {title}."


def _build_lesson(payload: dict[str, Any]) -> str:
    register_code = _text(payload.get("register_code")).upper()
    title = _text(payload.get("title")) or "cet evenement"
    cause = _text(payload.get("cause"))
    treatment = _text(payload.get("treatment")) or _text(payload.get("corrective_action")) or _text(payload.get("action_label"))

    if register_code == "BP":
        return f"La pratique observee autour de {title} peut etre standardisee et diffusee sur des chantiers comparables."
    if cause and treatment:
        return f"Le retour principal est de traiter plus tot les signaux du type '{cause.lower()}' en appliquant une reponse stable: {treatment}."
    if cause:
        return f"Le retour principal est d'anticiper les situations liees a '{cause.lower()}' et de formaliser le controle associe."
    return f"Le retour principal est de capitaliser sur {title} dans les routines QSSE avant repetition du cas."


def _build_preventive_action(payload: dict[str, Any]) -> str:
    action = _text(payload.get("corrective_action")) or _text(payload.get("action_label")) or _text(payload.get("treatment"))
    if action:
        return action
    title = _text(payload.get("title")) or "le point remonte"
    return f"Definir une action preventive standard, un pilote et un controle de verification autour de {title}."


def _build_diffusion_message(payload: dict[str, Any], audience: list[str]) -> str:
    title = _text(payload.get("title")) or _text(payload.get("document_reference")) or "ce retour"
    audience_text = ", ".join(audience[:3]).lower() if audience else "les equipes concernees"
    return f"Partager {title} en revue QSSE et en briefing terrain avec {audience_text}, avec rappel du point de vigilance et du controle attendu."


def _build_evidence(payload: dict[str, Any], documents: list[dict[str, Any]]) -> list[str]:
    evidence: list[str] = []
    if _text(payload.get("title")):
        evidence.append(f"Sujet: {_text(payload.get('title'))}")
    if _text(payload.get("description")):
        evidence.append(f"Constat: {_text(payload.get('description'))}")
    if _text(payload.get("cause")):
        evidence.append(f"Cause: {_text(payload.get('cause'))}")
    if _text(payload.get("treatment")):
        evidence.append(f"Traitement: {_text(payload.get('treatment'))}")
    elif _text(payload.get("corrective_action")):
        evidence.append(f"Action corrective: {_text(payload.get('corrective_action'))}")
    if documents:
        evidence.append("Documents: " + ", ".join(doc.get("original_name", "document") for doc in documents[:3]))
    elif _text(payload.get("document_reference")):
        evidence.append(f"Reference documentaire: {_text(payload.get('document_reference'))}")
    return evidence[:5]


def _build_draft(payload: dict[str, Any], documents: list[dict[str, Any]]) -> tuple[dict[str, Any], int]:
    audience = _target_audience(payload)
    draft = {
        "headline": _text(payload.get("title")) or _text(payload.get("document_reference")) or f"REX {_text(payload.get('register_code')) or 'QSSE'}",
        "summary": _build_summary(payload),
        "lesson_learned": _build_lesson(payload),
        "root_cause_synthesis": _text(payload.get("cause")) or "Cause racine non documentee dans la fiche actuelle.",
        "preventive_action": _build_preventive_action(payload),
        "diffusion_message": _build_diffusion_message(payload, audience),
        "target_audience": audience,
        "missing_information": _missing_information(payload, documents),
        "evidence": _build_evidence(payload, documents),
    }
    return draft, _confidence_score(payload, documents)


class QsseRexDraftService:
    def _record_row(self, conn, record_id: int):
        return conn.execute(
            """
            SELECT
                id,
                register_code,
                record_kind,
                agency,
                entity,
                person,
                site,
                theme,
                title,
                description,
                cause,
                treatment,
                corrective_action,
                action_label,
                pilot,
                status,
                severity,
                date_event,
                date_closed,
                date_saisie,
                document_reference,
                metrics_json,
                raw_json,
                updated_at
            FROM qsse_records
            WHERE id = ?
            """,
            (int(record_id),),
        ).fetchone()

    def _documents(self, conn, record_id: int) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT original_name, stored_name, content_type, file_size, created_at
            FROM qsse_documents
            WHERE qsse_record_id = ?
            ORDER BY created_at DESC, id DESC
            """,
            (int(record_id),),
        ).fetchall()
        return [
            {
                "original_name": _text(row["original_name"] or row["stored_name"]),
                "content_type": _text(row["content_type"]),
                "file_size": int(row["file_size"] or 0),
                "created_at": _text(row["created_at"]),
            }
            for row in rows
        ]

    def _assert_eligible(self, record) -> None:
        if record is None:
            raise ValueError("Enregistrement QSSE introuvable.")
        if _text(record["record_kind"]).lower() != "event" or _text(record["register_code"]).upper() not in QSSE_REX_ELIGIBLE_REGISTER_CODES:
            raise ValueError("Le draft REX assiste est active pour les enregistrements FNC, PASD, BP et FAE.")

    def _serialize_row(self, row) -> dict[str, Any]:
        if row is None:
            return {}
        return {
            "id": int(row["id"]),
            "record_id": int(row["qsse_record_id"]),
            "provider": _text(row["provider"]),
            "prompt_version": _text(row["prompt_version"]),
            "status": _text(row["status"]) or "draft",
            "confidence_score": int(row["confidence_score"] or 0),
            "source_payload": _json_object(row["source_payload_json"]),
            "draft": _json_object(row["draft_json"]),
            "generated_at": _text(row["generated_at"]),
            "reviewed_at": _text(row["reviewed_at"]),
            "approved_at": _text(row["approved_at"]),
            "created_at": _text(row["created_at"]),
            "updated_at": _text(row["updated_at"]),
        }

    def get_for_record(self, record_id: int) -> dict[str, Any] | None:
        with connect_qsse_db() as conn:
            record = self._record_row(conn, record_id)
            if record is None:
                raise ValueError("Enregistrement QSSE introuvable.")
            row = conn.execute(
                """
                SELECT
                    id,
                    qsse_record_id,
                    provider,
                    prompt_version,
                    status,
                    confidence_score,
                    source_payload_json,
                    draft_json,
                    generated_at,
                    reviewed_at,
                    approved_at,
                    created_at,
                    updated_at
                FROM qsse_rex_drafts
                WHERE qsse_record_id = ?
                """,
                (int(record_id),),
            ).fetchone()
        return self._serialize_row(row) if row else None

    def generate_for_record(self, record_id: int) -> dict[str, Any]:
        with connect_qsse_db() as conn:
            record = self._record_row(conn, record_id)
            self._assert_eligible(record)
            documents = self._documents(conn, record_id)
            payload = _row_to_source_payload(record, documents)
            draft, confidence_score = _build_draft(payload, documents)

            conn.execute(
                """
                INSERT INTO qsse_rex_drafts (
                    qsse_record_id,
                    provider,
                    prompt_version,
                    status,
                    confidence_score,
                    source_payload_json,
                    draft_json,
                    generated_at,
                    updated_at
                ) VALUES (?, ?, ?, 'draft', ?, ?, ?, datetime('now'), datetime('now'))
                ON CONFLICT(qsse_record_id) DO UPDATE SET
                    provider = excluded.provider,
                    prompt_version = excluded.prompt_version,
                    status = 'draft',
                    confidence_score = excluded.confidence_score,
                    source_payload_json = excluded.source_payload_json,
                    draft_json = excluded.draft_json,
                    generated_at = datetime('now'),
                    reviewed_at = '',
                    approved_at = '',
                    updated_at = datetime('now')
                """,
                (
                    int(record_id),
                    QSSE_REX_PROVIDER,
                    QSSE_REX_PROMPT_VERSION,
                    int(confidence_score),
                    json.dumps(payload, ensure_ascii=False),
                    json.dumps(draft, ensure_ascii=False),
                ),
            )

            row = conn.execute(
                """
                SELECT
                    id,
                    qsse_record_id,
                    provider,
                    prompt_version,
                    status,
                    confidence_score,
                    source_payload_json,
                    draft_json,
                    generated_at,
                    reviewed_at,
                    approved_at,
                    created_at,
                    updated_at
                FROM qsse_rex_drafts
                WHERE qsse_record_id = ?
                """,
                (int(record_id),),
            ).fetchone()

        return self._serialize_row(row)