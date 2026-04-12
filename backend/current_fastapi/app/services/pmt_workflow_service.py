from __future__ import annotations

import json
import sqlite3
import unicodedata
from datetime import datetime
from typing import Any

from app.core.database import connect_db, ensure_ralab4_schema, get_db_path

DB_PATH = get_db_path()

PMT_CODE = "PMT"
PMT_LABEL = "Campagne PMT"
PMT_DESIGNATION = "Macrotexture de chaussee"
PMT_WORKFLOW_LABEL = "Campagne -> Preparation de l'intervention -> Intervention -> Essai PMT -> Rapport"


def _conn() -> sqlite3.Connection:
    ensure_ralab4_schema(DB_PATH)
    return connect_db(DB_PATH)


def _now_sql() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_lookup(value: Any) -> str:
    text = _normalize_text(value).lower().replace("œ", "oe")
    normalized = unicodedata.normalize("NFD", text)
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return " ".join(normalized.split())


def _parse_json_text(value: Any) -> dict[str, Any]:
    raw = _normalize_text(value)
    if not raw or not raw.startswith("{"):
        return {}
    try:
        payload = json.loads(raw)
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _parse_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        parsed = float(value)
        return parsed if parsed == parsed else None
    cleaned = str(value).replace("\u00a0", " ").replace(",", ".").strip()
    if not cleaned:
        return None
    token = ""
    sign_allowed = True
    dot_allowed = True
    for char in cleaned:
        if char in "+-" and sign_allowed:
            token += char
            sign_allowed = False
            continue
        if char.isdigit():
            token += char
            sign_allowed = False
            continue
        if char == "." and dot_allowed:
            token += char
            sign_allowed = False
            dot_allowed = False
            continue
        if token:
            break
    if token in {"", "+", "-", ".", "+.", "-."}:
        return None
    try:
        return float(token)
    except Exception:
        return None


def _parse_optional_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    normalized = _normalize_lookup(value)
    if normalized in {"1", "true", "oui", "o", "conforme"}:
        return True
    if normalized in {"0", "false", "non", "n", "non conforme", "non-conforme"}:
        return False
    return None


def _collect_row_text(row: dict[str, Any]) -> str:
    return " ".join(f"{key} {_normalize_text(value)}" for key, value in row.items())


def _find_row_key(row: dict[str, Any], fragments: list[str]) -> str | None:
    targets = [_normalize_lookup(fragment) for fragment in fragments if _normalize_text(fragment)]
    if not targets:
        return None
    for key in row.keys():
        normalized_key = _normalize_lookup(key)
        if any(target in normalized_key for target in targets):
            return key
    return None


def _find_summary_number(rows: list[dict[str, Any]], row_fragments: list[str], value_fragments: list[str] | None = None) -> float | None:
    targets = [_normalize_lookup(fragment) for fragment in row_fragments if _normalize_text(fragment)]
    value_targets = value_fragments or []
    for row in rows:
        row_text = _normalize_lookup(_collect_row_text(row))
        if not any(target in row_text for target in targets):
            continue
        if value_targets:
            value_key = _find_row_key(row, value_targets)
            value = _parse_number(row.get(value_key)) if value_key else None
            if value is not None:
                return value
        for value in row.values():
            parsed = _parse_number(value)
            if parsed is not None:
                return parsed
    return None


def _normalize_point_value(value: float | None, fallback: int) -> int | float:
    if value is None:
        return fallback
    rounded = int(value)
    if abs(value - rounded) < 1e-9:
        return rounded
    return value


def _normalize_points(raw_points: Any) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    if not isinstance(raw_points, list):
        return cleaned
    for index, item in enumerate(raw_points, start=1):
        if not isinstance(item, dict):
            continue
        point_value = _normalize_point_value(_parse_number(item.get("point")), index)
        cleaned.append(
            {
                "point": point_value,
                "position": _normalize_text(item.get("position")),
                "diametre_mm": _parse_number(item.get("diametre_mm")),
                "macrotexture_mm": _parse_number(item.get("macrotexture_mm")),
                "is_conforme": _parse_optional_bool(item.get("is_conforme")),
            }
        )
    return cleaned


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def _compute_metrics(points: list[dict[str, Any]], fallback_conformity_percent: float | None = None) -> dict[str, Any]:
    macro_values = [float(item["macrotexture_mm"]) for item in points if item.get("macrotexture_mm") is not None]
    diameter_values = [float(item["diametre_mm"]) for item in points if item.get("diametre_mm") is not None]
    conformity_flags = [item["is_conforme"] for item in points if item.get("is_conforme") is not None]
    conformity_percent = None
    if conformity_flags:
        conformity_percent = (sum(1 for item in conformity_flags if item) / len(conformity_flags)) * 100.0
    elif fallback_conformity_percent is not None:
        conformity_percent = fallback_conformity_percent

    return {
        "measure_count": len(points),
        "macrotexture_average_mm": _average(macro_values),
        "macrotexture_min_mm": min(macro_values) if macro_values else None,
        "macrotexture_max_mm": max(macro_values) if macro_values else None,
        "diameter_average_mm": _average(diameter_values),
        "conformity_percent": conformity_percent,
    }


def _sanitize_resultats(raw_resultats: Any) -> dict[str, Any]:
    source = raw_resultats if isinstance(raw_resultats, dict) else {}
    manual_conformity_percent = _parse_number(source.get("manual_conformity_percent"))
    points = _normalize_points(source.get("points"))
    metrics = _compute_metrics(points, manual_conformity_percent)
    return {
        "points": points,
        "manual_conformity_percent": manual_conformity_percent,
        "metrics": metrics,
    }


def _extract_pmt_prefill_from_intervention(intervention: dict[str, Any]) -> dict[str, Any]:
    observations = _parse_json_text(intervention.get("observations"))
    payload = observations.get("payload") if isinstance(observations.get("payload"), dict) else {}
    base_rows = payload.get("rows") if isinstance(payload.get("rows"), list) else payload.get("points")
    rows = [row for row in (base_rows or []) if isinstance(row, dict)]

    points: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        row_text = _normalize_lookup(_collect_row_text(row))
        if any(
            fragment in row_text
            for fragment in (
                "pourcentage de valeurs conformes",
                "profondeur de macrotexture generale",
                "nb d essais",
                "conclusions",
                "commentaires",
                "visa",
            )
        ):
            continue
        point_key = _find_row_key(row, ["essai", "point"])
        position_key = _find_row_key(row, ["position", "localisation"])
        diameter_key = _find_row_key(row, ["diametre"])
        macrotexture_key = _find_row_key(row, ["macrotexture", "profondeur"])

        macrotexture = _parse_number(row.get(macrotexture_key)) if macrotexture_key else None
        if macrotexture is None:
            continue

        point = _normalize_point_value(_parse_number(row.get(point_key)) if point_key else None, index)
        points.append(
            {
                "point": point,
                "position": _normalize_text(row.get(position_key)),
                "diametre_mm": _parse_number(row.get(diameter_key)) if diameter_key else None,
                "macrotexture_mm": macrotexture,
                "is_conforme": None,
            }
        )

    manual_conformity_percent = _find_summary_number(rows, ["pourcentage de valeurs conformes"], ["macrotexture"]) if rows else None
    resultats = {
        "points": points,
        "manual_conformity_percent": manual_conformity_percent,
    }
    sanitized = _sanitize_resultats(resultats)
    return {
        **sanitized,
        "meta": {
            "section_controlee": _normalize_text(payload.get("section_controlee")),
            "couche": _normalize_text(payload.get("couche")),
            "nature_support": _normalize_text(payload.get("nature_materiau") or payload.get("nature_produit")),
            "source_sheet": _normalize_text(observations.get("sheet_name") or (payload.get("source_sheets") or [""])[0]),
        },
    }


def _is_pmt_intervention(intervention: dict[str, Any]) -> bool:
    type_text = _normalize_lookup(intervention.get("type_intervention"))
    subject_text = _normalize_lookup(intervention.get("sujet"))
    if "pmt" in type_text or "macrotexture" in type_text or "macrotexture" in subject_text:
        return True
    observations = _parse_json_text(intervention.get("observations"))
    essai_code = _normalize_lookup(observations.get("essai_code") or observations.get("source_essai_code"))
    return essai_code == "pmt"


def _campaign_reference(demande_reference: str, demande_id: int) -> str:
    return f"{demande_reference}-PMT" if demande_reference else f"PMT-{demande_id}"


def _essai_reference_base(intervention_reference: str, intervention_id: int) -> str:
    return f"{intervention_reference}-PMT" if intervention_reference else f"PMT-ESSAI-{intervention_id}"


def _next_essai_reference(conn: sqlite3.Connection, intervention: sqlite3.Row) -> str:
    base = _essai_reference_base(_normalize_text(intervention["reference"]), int(intervention["id"]))
    count_row = conn.execute(
        "SELECT COUNT(*) AS essai_count FROM pmt_essais WHERE intervention_id = ?",
        (int(intervention["id"]),),
    ).fetchone()
    next_index = int(count_row["essai_count"] or 0) + 1
    return f"{base}-{next_index:02d}"


def _report_reference(prefix: str, scope: str) -> str:
    suffix = "RPT" if scope == "campagne" else "RP"
    return f"{prefix}-{suffix}"


def _load_demande_row(conn: sqlite3.Connection, demande_id: int) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT
            d.id,
            d.reference,
            d.rapport_ref,
            COALESCE(a.chantier, '') AS chantier,
            COALESCE(a.site, '') AS site,
            a.reference AS affaire_reference,
            a.client AS client
        FROM demandes d
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        WHERE d.id = ?
        """,
        (demande_id,),
    ).fetchone()


def _load_intervention_row(conn: sqlite3.Connection, intervention_id: int) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT
            i.id,
            i.reference,
            i.demande_id,
            i.type_intervention,
            i.sujet,
            i.date_intervention,
            i.technicien,
            i.observations,
            i.statut,
            d.reference AS demande_reference,
            COALESCE(a.chantier, '') AS chantier,
            COALESCE(a.site, '') AS site,
            a.reference AS affaire_reference,
            a.client AS client
        FROM interventions i
        JOIN demandes d ON d.id = i.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
        WHERE i.id = ?
        """,
        (intervention_id,),
    ).fetchone()


def _list_pmt_interventions_for_demande(conn: sqlite3.Connection, demande_id: int) -> list[sqlite3.Row]:
    rows = conn.execute(
        """
        SELECT
            i.id,
            i.reference,
            i.demande_id,
            i.type_intervention,
            i.sujet,
            i.date_intervention,
            i.technicien,
            i.observations,
            i.statut
        FROM interventions i
        WHERE i.demande_id = ?
        ORDER BY COALESCE(i.date_intervention, ''), COALESCE(i.reference, ''), i.id
        """,
        (demande_id,),
    ).fetchall()
    return [row for row in rows if _is_pmt_intervention(dict(row))]


def _load_campaign_row(conn: sqlite3.Connection, campaign_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM pmt_campaigns WHERE id = ?",
        (campaign_id,),
    ).fetchone()


def _load_campaign_for_demande(conn: sqlite3.Connection, demande_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM pmt_campaigns WHERE demande_id = ? AND code = ?",
        (demande_id, PMT_CODE),
    ).fetchone()


def _sync_campaign_links(conn: sqlite3.Connection, campaign_id: int, intervention_ids: list[int]) -> None:
    target_ids = {int(value) for value in intervention_ids if value}
    current_rows = conn.execute(
        "SELECT intervention_id FROM pmt_campaign_interventions WHERE campaign_id = ?",
        (campaign_id,),
    ).fetchall()
    current_ids = {int(row["intervention_id"]) for row in current_rows}

    for intervention_id in sorted(target_ids - current_ids):
        conn.execute(
            """
            INSERT OR IGNORE INTO pmt_campaign_interventions (campaign_id, intervention_id, created_at)
            VALUES (?, ?, ?)
            """,
            (campaign_id, intervention_id, _now_sql()),
        )

    stale_ids = current_ids - target_ids
    if stale_ids:
        placeholders = ",".join("?" for _ in stale_ids)
        conn.execute(
            f"DELETE FROM pmt_campaign_interventions WHERE campaign_id = ? AND intervention_id IN ({placeholders})",
            (campaign_id, *sorted(stale_ids)),
        )


def _upsert_campaign(conn: sqlite3.Connection, demande: sqlite3.Row, interventions: list[sqlite3.Row]) -> sqlite3.Row:
    now = _now_sql()
    reference = _campaign_reference(_normalize_text(demande["reference"]), int(demande["id"]))
    existing = _load_campaign_for_demande(conn, int(demande["id"]))
    if existing is None:
        conn.execute(
            """
            INSERT INTO pmt_campaigns (
                demande_id, code, reference, label, designation, workflow_label,
                source_mode, target_mode, statut, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'historique_importe', 'manuel', 'Active', '', ?, ?)
            """,
            (
                int(demande["id"]),
                PMT_CODE,
                reference,
                PMT_LABEL,
                PMT_DESIGNATION,
                PMT_WORKFLOW_LABEL,
                now,
                now,
            ),
        )
        campaign_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    else:
        campaign_id = int(existing["id"])
        conn.execute(
            """
            UPDATE pmt_campaigns
            SET reference = ?, label = ?, designation = ?, workflow_label = ?, updated_at = ?
            WHERE id = ?
            """,
            (reference, PMT_LABEL, PMT_DESIGNATION, PMT_WORKFLOW_LABEL, now, campaign_id),
        )

    _sync_campaign_links(conn, campaign_id, [int(item["id"]) for item in interventions])
    return _load_campaign_row(conn, campaign_id)


def _load_campaign_report_row(conn: sqlite3.Connection, campaign_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM pmt_reports WHERE campaign_id = ? AND scope = 'campagne' AND essai_id IS NULL",
        (campaign_id,),
    ).fetchone()


def _load_essai_row_by_intervention(conn: sqlite3.Connection, intervention_id: int) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT *
        FROM pmt_essais
        WHERE intervention_id = ?
        ORDER BY COALESCE(NULLIF(date_essai, ''), created_at) DESC, id DESC
        LIMIT 1
        """,
        (intervention_id,),
    ).fetchone()


def _list_essais_for_intervention(conn: sqlite3.Connection, intervention_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT *
        FROM pmt_essais
        WHERE intervention_id = ?
        ORDER BY COALESCE(NULLIF(date_essai, ''), created_at) DESC, id DESC
        """,
        (intervention_id,),
    ).fetchall()


def _load_essai_row(conn: sqlite3.Connection, essai_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM pmt_essais WHERE id = ?",
        (essai_id,),
    ).fetchone()


def _load_essai_report_row(conn: sqlite3.Connection, essai_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM pmt_reports WHERE essai_id = ? AND scope = 'essai'",
        (essai_id,),
    ).fetchone()


def _list_essais_for_campaign(conn: sqlite3.Connection, campaign_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT *
        FROM pmt_essais
        WHERE campaign_id = ?
        ORDER BY COALESCE(NULLIF(date_essai, ''), created_at) DESC, id DESC
        """,
        (campaign_id,),
    ).fetchall()


def _essai_summary_to_dict(essai: sqlite3.Row, essai_report: sqlite3.Row | None = None) -> dict[str, Any]:
    resultats = _sanitize_resultats(_parse_json_text(essai["resultats_json"]))
    metrics = resultats["metrics"]
    report_dict = _report_to_dict(essai_report)
    return {
        "uid": int(essai["id"]),
        "reference": _normalize_text(essai["reference"]),
        "statut": _normalize_text(essai["statut"]),
        "date_essai": _normalize_text(essai["date_essai"]),
        "section_controlee": _normalize_text(essai["section_controlee"]),
        "voie": _normalize_text(essai["voie"]),
        "sens": _normalize_text(essai["sens"]),
        "couche": _normalize_text(essai["couche"]),
        "nature_support": _normalize_text(essai["nature_support"]),
        "measure_count": int(metrics.get("measure_count") or 0),
        "macrotexture_average_mm": metrics.get("macrotexture_average_mm"),
        "report_uid": report_dict["uid"] if report_dict is not None else None,
        "report_reference": report_dict["reference"] if report_dict is not None else "",
        "report_status": report_dict["statut"] if report_dict is not None else "",
    }


def _report_generated_payload_for_essai(essai: sqlite3.Row, intervention: sqlite3.Row, campaign: sqlite3.Row) -> dict[str, Any]:
    resultats = _sanitize_resultats(_parse_json_text(essai["resultats_json"]))
    metrics = resultats["metrics"]
    measure_count = int(metrics.get("measure_count") or 0)
    macro_avg = metrics.get("macrotexture_average_mm")
    conformity = metrics.get("conformity_percent")
    summary = "Aucune mesure PMT n'est encore saisie pour cet essai."
    conclusions = "Saisie PMT a completer avant diffusion du rapport."
    statut = "A completer"
    if measure_count:
        summary_parts = [
            f"{measure_count} mesure(s) PMT relevee(s)",
            f"macrotexture moyenne {macro_avg:.2f} mm" if isinstance(macro_avg, (int, float)) else None,
            f"conformite {conformity:.1f} %" if isinstance(conformity, (int, float)) else None,
        ]
        summary = ", ".join(part for part in summary_parts if part) + "."
        if isinstance(conformity, (int, float)):
            conclusions = (
                "Essai PMT globalement conforme au vu des mesures saisies."
                if conformity >= 90.0
                else "Essai PMT a reprendre ou analyser compte tenu des ecarts de conformite."
            )
        else:
            conclusions = "Controle PMT saisi. Conclusion de conformite a finaliser."
        statut = "Genere"

    return {
        "title": f"Rapport PMT {essai['reference']}",
        "statut": statut,
        "summary": summary,
        "conclusions": conclusions,
        "generated_json": {
            "metrics": metrics,
            "demande_reference": _normalize_text(intervention["demande_reference"]),
            "campaign_reference": _normalize_text(campaign["reference"]),
            "intervention_reference": _normalize_text(intervention["reference"]),
        },
    }


def _report_generated_payload_for_campaign(conn: sqlite3.Connection, campaign: sqlite3.Row, demande: sqlite3.Row, interventions: list[sqlite3.Row]) -> dict[str, Any]:
    essais = _list_essais_for_campaign(conn, int(campaign["id"]))
    all_macro_values: list[float] = []
    total_measures = 0
    weighted_conformity_sum = 0.0
    weighted_conformity_count = 0

    for essai in essais:
        resultats = _sanitize_resultats(_parse_json_text(essai["resultats_json"]))
        metrics = resultats["metrics"]
        points = resultats["points"]
        all_macro_values.extend(float(item["macrotexture_mm"]) for item in points if item.get("macrotexture_mm") is not None)
        measure_count = int(metrics.get("measure_count") or 0)
        total_measures += measure_count
        conformity = metrics.get("conformity_percent")
        if isinstance(conformity, (int, float)) and measure_count > 0:
            weighted_conformity_sum += float(conformity) * measure_count
            weighted_conformity_count += measure_count

    macro_avg = _average(all_macro_values)
    conformity = (weighted_conformity_sum / weighted_conformity_count) if weighted_conformity_count else None
    essai_count = len(essais)
    intervention_count = len(interventions)

    summary = "Aucune saisie PMT n'est encore consolidee pour cette campagne."
    conclusions = "Consolidation de campagne a produire apres creation des essais PMT."
    statut = "A completer"
    if essai_count:
        summary_parts = [
            f"{essai_count} essai(s) PMT consolide(s)",
            f"sur {intervention_count} intervention(s)",
            f"{total_measures} mesure(s) exploitees" if total_measures else None,
            f"macrotexture moyenne campagne {macro_avg:.2f} mm" if isinstance(macro_avg, (int, float)) else None,
            f"conformite moyenne {conformity:.1f} %" if isinstance(conformity, (int, float)) else None,
        ]
        summary = ", ".join(part for part in summary_parts if part) + "."
        if isinstance(conformity, (int, float)):
            conclusions = (
                "Campagne PMT globalement conforme au vu des essais consolides."
                if conformity >= 90.0
                else "Des ecarts de conformite subsistent sur la campagne. Relecture terrain recommandee."
            )
        else:
            conclusions = "Campagne consolidee. Conclusion de conformite a finaliser."
        statut = "Genere"

    return {
        "title": f"Rapport campagne {campaign['reference']}",
        "statut": statut,
        "summary": summary,
        "conclusions": conclusions,
        "generated_json": {
            "metrics": {
                "intervention_count": intervention_count,
                "essai_count": essai_count,
                "measure_count": total_measures,
                "macrotexture_average_mm": macro_avg,
                "macrotexture_min_mm": min(all_macro_values) if all_macro_values else None,
                "macrotexture_max_mm": max(all_macro_values) if all_macro_values else None,
                "conformity_percent": conformity,
            },
            "demande_reference": _normalize_text(demande["reference"]),
            "campaign_reference": _normalize_text(campaign["reference"]),
        },
    }


def _upsert_report(conn: sqlite3.Connection, *, campaign: sqlite3.Row, scope: str, essai: sqlite3.Row | None = None, demande: sqlite3.Row | None = None, intervention: sqlite3.Row | None = None, interventions: list[sqlite3.Row] | None = None) -> sqlite3.Row:
    now = _now_sql()
    if scope == "essai":
        assert essai is not None and intervention is not None
        generated = _report_generated_payload_for_essai(essai, intervention, campaign)
        existing = _load_essai_report_row(conn, int(essai["id"]))
        reference = _report_reference(_normalize_text(essai["reference"]), scope)
        essai_id = int(essai["id"])
    else:
        assert demande is not None and interventions is not None
        generated = _report_generated_payload_for_campaign(conn, campaign, demande, interventions)
        existing = _load_campaign_report_row(conn, int(campaign["id"]))
        reference = _report_reference(_normalize_text(campaign["reference"]), scope)
        essai_id = None

    generated_json = json.dumps(generated["generated_json"], ensure_ascii=False)
    if existing is None:
        conn.execute(
            """
            INSERT INTO pmt_reports (
                campaign_id, essai_id, scope, reference, title, statut,
                summary, conclusions, generated_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(campaign["id"]),
                essai_id,
                scope,
                reference,
                generated["title"],
                generated["statut"],
                generated["summary"],
                generated["conclusions"],
                generated_json,
                now,
                now,
            ),
        )
        report_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    else:
        report_id = int(existing["id"])
        conn.execute(
            """
            UPDATE pmt_reports
            SET reference = ?, title = ?, statut = ?, summary = ?, conclusions = ?, generated_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                reference,
                generated["title"],
                generated["statut"],
                generated["summary"],
                generated["conclusions"],
                generated_json,
                now,
                report_id,
            ),
        )

    return conn.execute("SELECT * FROM pmt_reports WHERE id = ?", (report_id,)).fetchone()


def _create_essai(conn: sqlite3.Connection, intervention: sqlite3.Row, campaign: sqlite3.Row, *, use_prefill: bool) -> sqlite3.Row:
    now = _now_sql()
    prefill = _extract_pmt_prefill_from_intervention(dict(intervention))
    resultats_payload = {
        "points": prefill["points"] if use_prefill else [],
        "manual_conformity_percent": prefill.get("manual_conformity_percent") if use_prefill else None,
        "metrics": prefill["metrics"] if use_prefill else {},
    }
    resultats_json = json.dumps(resultats_payload, ensure_ascii=False)
    reference = _next_essai_reference(conn, intervention)
    conn.execute(
        """
        INSERT INTO pmt_essais (
            campaign_id, demande_id, intervention_id, reference, statut, date_essai,
            operateur, section_controlee, voie, sens, couche, nature_support,
            observations, resultats_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, '', ?, ?, ?)
        """,
        (
            int(campaign["id"]),
            int(intervention["demande_id"]),
            int(intervention["id"]),
            reference,
            "A reprendre" if use_prefill and prefill["points"] else "Brouillon",
            _normalize_text(intervention["date_intervention"]),
            _normalize_text(intervention["technicien"]),
            prefill["meta"].get("section_controlee", ""),
            prefill["meta"].get("couche", ""),
            prefill["meta"].get("nature_support", ""),
            resultats_json,
            now,
            now,
        ),
    )
    essai_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    return _load_essai_row(conn, essai_id)


def _ensure_essai(conn: sqlite3.Connection, intervention: sqlite3.Row, campaign: sqlite3.Row) -> sqlite3.Row:
    existing = _load_essai_row_by_intervention(conn, int(intervention["id"]))
    if existing is None:
        return _create_essai(conn, intervention, campaign, use_prefill=True)

    current_resultats = _parse_json_text(existing["resultats_json"])
    prefill = _extract_pmt_prefill_from_intervention(dict(intervention))
    now = _now_sql()
    if not _normalize_points(current_resultats.get("points")) and prefill["points"]:
        refreshed_resultats = json.dumps(
            {
                "points": prefill["points"],
                "manual_conformity_percent": prefill.get("manual_conformity_percent"),
                "metrics": prefill["metrics"],
            },
            ensure_ascii=False,
        )
        conn.execute(
            """
            UPDATE pmt_essais
            SET campaign_id = ?, demande_id = ?, section_controlee = COALESCE(NULLIF(section_controlee, ''), ?),
                couche = COALESCE(NULLIF(couche, ''), ?), nature_support = COALESCE(NULLIF(nature_support, ''), ?),
                resultats_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                int(campaign["id"]),
                int(intervention["demande_id"]),
                prefill["meta"].get("section_controlee", ""),
                prefill["meta"].get("couche", ""),
                prefill["meta"].get("nature_support", ""),
                refreshed_resultats,
                now,
                int(existing["id"]),
            ),
        )
    else:
        conn.execute(
            "UPDATE pmt_essais SET campaign_id = ?, demande_id = ?, updated_at = ? WHERE id = ?",
            (int(campaign["id"]), int(intervention["demande_id"]), now, int(existing["id"])),
        )

    return _load_essai_row(conn, int(existing["id"]))


def _report_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    generated = _parse_json_text(row["generated_json"])
    return {
        "uid": int(row["id"]),
        "reference": _normalize_text(row["reference"]),
        "scope": _normalize_text(row["scope"]),
        "title": _normalize_text(row["title"]),
        "statut": _normalize_text(row["statut"]),
        "summary": _normalize_text(row["summary"]),
        "conclusions": _normalize_text(row["conclusions"]),
        "generated": generated,
    }


def _intervention_to_dict(intervention: sqlite3.Row) -> dict[str, Any]:
    row = dict(intervention)
    return {
        "uid": int(row["id"]),
        "reference": _normalize_text(row.get("reference")),
        "demande_id": int(row["demande_id"]),
        "demande_reference": _normalize_text(row.get("demande_reference")),
        "type_intervention": _normalize_text(row.get("type_intervention")),
        "sujet": _normalize_text(row.get("sujet")),
        "date_intervention": _normalize_text(row.get("date_intervention")),
        "technicien": _normalize_text(row.get("technicien")),
        "statut": _normalize_text(row.get("statut")),
        "chantier": _normalize_text(row.get("chantier")),
        "site": _normalize_text(row.get("site")),
        "client": _normalize_text(row.get("client")),
        "affaire_reference": _normalize_text(row.get("affaire_reference")),
    }


def _campaign_to_dict(conn: sqlite3.Connection, campaign: sqlite3.Row, demande: sqlite3.Row, interventions: list[sqlite3.Row], preparation_phase: str) -> dict[str, Any]:
    essais = _list_essais_for_campaign(conn, int(campaign["id"]))
    essais_by_intervention: dict[int, list[sqlite3.Row]] = {}
    for row in essais:
        essais_by_intervention.setdefault(int(row["intervention_id"]), []).append(row)
    essai_reports = {
        int(row["essai_id"]): row
        for row in conn.execute(
            "SELECT * FROM pmt_reports WHERE scope = 'essai' AND essai_id IN (SELECT id FROM pmt_essais WHERE campaign_id = ?)",
            (int(campaign["id"]),),
        ).fetchall()
        if row["essai_id"] is not None
    }
    campaign_report = _load_campaign_report_row(conn, int(campaign["id"]))

    intervention_items: list[dict[str, Any]] = []
    interventions_with_essais = 0
    for intervention in interventions:
        intervention_essais = essais_by_intervention.get(int(intervention["id"]), [])
        essai_items = [
            _essai_summary_to_dict(essai, essai_reports.get(int(essai["id"])))
            for essai in intervention_essais
        ]
        latest_essai = essai_items[0] if essai_items else None
        total_measure_count = sum(int(item["measure_count"] or 0) for item in essai_items)
        if essai_items:
            interventions_with_essais += 1
        intervention_items.append(
            {
                "uid": int(intervention["id"]),
                "reference": _normalize_text(intervention["reference"]),
                "date_intervention": _normalize_text(intervention["date_intervention"]),
                "type_intervention": _normalize_text(intervention["type_intervention"]),
                "sujet": _normalize_text(intervention["sujet"]),
                "statut": _normalize_text(intervention["statut"]),
                "pmt_essai_count": len(essai_items),
                "pmt_essais": essai_items,
                "pmt_essai_uid": latest_essai["uid"] if latest_essai is not None else None,
                "pmt_essai_reference": latest_essai["reference"] if latest_essai is not None else "",
                "pmt_essai_status": latest_essai["statut"] if latest_essai is not None else "",
                "pmt_measure_count": total_measure_count,
                "pmt_macrotexture_average_mm": latest_essai["macrotexture_average_mm"] if latest_essai is not None else None,
                "pmt_report_uid": latest_essai["report_uid"] if latest_essai is not None else None,
                "pmt_report_reference": latest_essai["report_reference"] if latest_essai is not None else "",
            }
        )

    intervention_count = len(intervention_items)
    essai_count = len(essais)
    pending_intervention_count = max(intervention_count - interventions_with_essais, 0)
    report_dict = _report_to_dict(campaign_report)
    report_status = report_dict["reference"] if report_dict and report_dict["reference"] else "Consolidation a produire"
    essai_status = f"{essai_count} essai(s) PMT saisi(s)" if essai_count else "Aucune saisie PMT encore creee"
    next_step = (
        "Ouvrir chaque intervention PMT pour creer l'essai et generer son rapport."
        if pending_intervention_count > 0
        else "Relire le rapport consolide de campagne et finaliser la diffusion."
    )

    return {
        "uid": int(campaign["id"]),
        "code": _normalize_text(campaign["code"]),
        "reference": _normalize_text(campaign["reference"]),
        "label": _normalize_text(campaign["label"]),
        "designation": _normalize_text(campaign["designation"]),
        "workflow_label": _normalize_text(campaign["workflow_label"]),
        "source_mode": _normalize_text(campaign["source_mode"]),
        "source_label": "Historique importe",
        "target_mode": _normalize_text(campaign["target_mode"]),
        "target_label": "Cible manuelle",
        "intervention_count": intervention_count,
        "essai_count": essai_count,
        "pending_intervention_count": pending_intervention_count,
        "intervention_uids": [item["uid"] for item in intervention_items],
        "interventions": intervention_items,
        "report_uid": report_dict["uid"] if report_dict else None,
        "report_ref": report_dict["reference"] if report_dict else "",
        "report_status": report_dict["statut"] if report_dict else "A completer",
        "preparation_status": _normalize_text(preparation_phase) or "A cadrer",
        "next_step": next_step,
        "steps": [
            {"code": "campagne", "label": "Campagne", "status": "Campagne PMT persistee"},
            {"code": "preparation", "label": "Preparation", "status": _normalize_text(preparation_phase) or "A cadrer"},
            {"code": "intervention", "label": "Interventions", "status": f"{intervention_count} intervention(s) liee(s)"},
            {"code": "essai", "label": "Essai PMT", "status": essai_status},
            {"code": "rapport", "label": "Rapport", "status": report_status},
        ],
        "demande_uid": int(demande["id"]),
        "demande_reference": _normalize_text(demande["reference"]),
    }


def get_pmt_campaigns_for_demande(demande_id: int, preparation_phase: str = "") -> list[dict[str, Any]]:
    with _conn() as conn:
        demande = _load_demande_row(conn, demande_id)
        if demande is None:
            raise LookupError(f"Demande #{demande_id} introuvable")
        interventions = _list_pmt_interventions_for_demande(conn, demande_id)
        if not interventions:
            return []
        campaign = _upsert_campaign(conn, demande, interventions)
        _upsert_report(conn, campaign=campaign, scope="campagne", demande=demande, interventions=interventions)
        conn.commit()
        refreshed_campaign = _load_campaign_row(conn, int(campaign["id"]))
        return [_campaign_to_dict(conn, refreshed_campaign, demande, interventions, preparation_phase)]


def get_pmt_intervention_workflow(intervention_id: int, preparation_phase: str = "") -> dict[str, Any]:
    with _conn() as conn:
        intervention = _load_intervention_row(conn, intervention_id)
        if intervention is None:
            raise LookupError(f"Intervention #{intervention_id} introuvable")
        intervention_dict = _intervention_to_dict(intervention)
        if not _is_pmt_intervention(dict(intervention)):
            return {"is_pmt": False, "intervention": intervention_dict}

        demande = _load_demande_row(conn, int(intervention["demande_id"]))
        interventions = _list_pmt_interventions_for_demande(conn, int(intervention["demande_id"]))
        campaign = _upsert_campaign(conn, demande, interventions)
        campaign_report = _upsert_report(conn, campaign=campaign, scope="campagne", demande=demande, interventions=interventions)
        essais = _list_essais_for_intervention(conn, intervention_id)
        essai_reports = {
            int(row["essai_id"]): row
            for row in conn.execute(
                "SELECT * FROM pmt_reports WHERE scope = 'essai' AND essai_id IN (SELECT id FROM pmt_essais WHERE intervention_id = ?)",
                (intervention_id,),
            ).fetchall()
            if row["essai_id"] is not None
        }
        conn.commit()

        campaign_dict = _campaign_to_dict(conn, campaign, demande, interventions, preparation_phase)
        current_item = next((item for item in campaign_dict["interventions"] if item["uid"] == intervention_id), None)
        essai_items = [_essai_summary_to_dict(essai, essai_reports.get(int(essai["id"]))) for essai in essais]
        latest_essai = essai_items[0] if essai_items else None
        return {
            "is_pmt": True,
            "intervention": intervention_dict,
            "campaign": {
                "uid": campaign_dict["uid"],
                "reference": campaign_dict["reference"],
                "label": campaign_dict["label"],
                "designation": campaign_dict["designation"],
                "report_uid": campaign_dict["report_uid"],
                "report_ref": campaign_dict["report_ref"],
                "report_status": campaign_dict["report_status"],
                "essai_count": campaign_dict["essai_count"],
                "intervention_count": campaign_dict["intervention_count"],
            },
            "current_intervention": current_item,
            "essai_count": len(essai_items),
            "essais": essai_items,
            "latest_essai": latest_essai,
            "essai": {
                "uid": latest_essai["uid"],
                "reference": latest_essai["reference"],
                "statut": latest_essai["statut"],
            } if latest_essai is not None else None,
            "essai_report": _report_to_dict(essai_reports.get(latest_essai["uid"])) if latest_essai is not None else None,
            "campaign_report": _report_to_dict(campaign_report),
        }


def ensure_pmt_essai_for_intervention(intervention_id: int) -> dict[str, Any]:
    with _conn() as conn:
        intervention = _load_intervention_row(conn, intervention_id)
        if intervention is None:
            raise LookupError(f"Intervention #{intervention_id} introuvable")
        if not _is_pmt_intervention(dict(intervention)):
            raise ValueError("Cette intervention ne releve pas du flux PMT.")

        demande = _load_demande_row(conn, int(intervention["demande_id"]))
        interventions = _list_pmt_interventions_for_demande(conn, int(intervention["demande_id"]))
        campaign = _upsert_campaign(conn, demande, interventions)
        essai = _ensure_essai(conn, intervention, campaign)
        _upsert_report(conn, campaign=campaign, scope="essai", essai=essai, intervention=intervention)
        _upsert_report(conn, campaign=campaign, scope="campagne", demande=demande, interventions=interventions)
        conn.commit()
        return get_pmt_essai(int(essai["id"]))


def create_pmt_essai_for_intervention(intervention_id: int) -> dict[str, Any]:
    with _conn() as conn:
        intervention = _load_intervention_row(conn, intervention_id)
        if intervention is None:
            raise LookupError(f"Intervention #{intervention_id} introuvable")
        if not _is_pmt_intervention(dict(intervention)):
            raise ValueError("Cette intervention ne releve pas du flux PMT.")

        demande = _load_demande_row(conn, int(intervention["demande_id"]))
        interventions = _list_pmt_interventions_for_demande(conn, int(intervention["demande_id"]))
        campaign = _upsert_campaign(conn, demande, interventions)
        existing_essais = _list_essais_for_intervention(conn, intervention_id)
        essai = _create_essai(conn, intervention, campaign, use_prefill=not bool(existing_essais))
        _upsert_report(conn, campaign=campaign, scope="essai", essai=essai, intervention=intervention)
        _upsert_report(conn, campaign=campaign, scope="campagne", demande=demande, interventions=interventions)
        conn.commit()
        return get_pmt_essai(int(essai["id"]))


def get_pmt_essai(uid: int) -> dict[str, Any]:
    with _conn() as conn:
        essai = _load_essai_row(conn, uid)
        if essai is None:
            raise LookupError(f"Essai PMT #{uid} introuvable")

        intervention = _load_intervention_row(conn, int(essai["intervention_id"]))
        demande = _load_demande_row(conn, int(essai["demande_id"]))
        campaign = _load_campaign_row(conn, int(essai["campaign_id"]))
        essai_report = _load_essai_report_row(conn, uid)
        campaign_report = _load_campaign_report_row(conn, int(campaign["id"])) if campaign is not None else None
        resultats = _sanitize_resultats(_parse_json_text(essai["resultats_json"]))
        prefill = _extract_pmt_prefill_from_intervention(dict(intervention)) if intervention is not None else {"points": [], "meta": {}, "metrics": {}}
        return {
            "uid": int(essai["id"]),
            "reference": _normalize_text(essai["reference"]),
            "statut": _normalize_text(essai["statut"]),
            "date_essai": _normalize_text(essai["date_essai"]),
            "operateur": _normalize_text(essai["operateur"]),
            "section_controlee": _normalize_text(essai["section_controlee"]),
            "voie": _normalize_text(essai["voie"]),
            "sens": _normalize_text(essai["sens"]),
            "couche": _normalize_text(essai["couche"]),
            "nature_support": _normalize_text(essai["nature_support"]),
            "observations": _normalize_text(essai["observations"]),
            "resultats": resultats,
            "campaign": {
                "uid": int(campaign["id"]),
                "reference": _normalize_text(campaign["reference"]),
                "label": _normalize_text(campaign["label"]),
                "designation": _normalize_text(campaign["designation"]),
            } if campaign is not None else None,
            "intervention": _intervention_to_dict(intervention) if intervention is not None else None,
            "demande": {
                "uid": int(demande["id"]),
                "reference": _normalize_text(demande["reference"]),
                "chantier": _normalize_text(demande["chantier"]),
                "site": _normalize_text(demande["site"]),
                "client": _normalize_text(demande["client"]),
                "affaire_reference": _normalize_text(demande["affaire_reference"]),
            } if demande is not None else None,
            "essai_report": _report_to_dict(essai_report),
            "campaign_report": _report_to_dict(campaign_report),
            "imported_prefill": prefill,
        }


def update_pmt_essai(uid: int, data: dict[str, Any]) -> dict[str, Any]:
    with _conn() as conn:
        essai = _load_essai_row(conn, uid)
        if essai is None:
            raise LookupError(f"Essai PMT #{uid} introuvable")

        intervention = _load_intervention_row(conn, int(essai["intervention_id"]))
        if intervention is None:
            raise LookupError(f"Intervention #{essai['intervention_id']} introuvable")

        demande = _load_demande_row(conn, int(essai["demande_id"]))
        interventions = _list_pmt_interventions_for_demande(conn, int(essai["demande_id"]))
        campaign = _load_campaign_row(conn, int(essai["campaign_id"]))

        fields = dict(data or {})
        if "resultats" in fields:
            resultats = _sanitize_resultats(fields.get("resultats"))
            fields["resultats_json"] = json.dumps(resultats, ensure_ascii=False)
            del fields["resultats"]

        allowed_columns = {
            "statut",
            "date_essai",
            "operateur",
            "section_controlee",
            "voie",
            "sens",
            "couche",
            "nature_support",
            "observations",
            "resultats_json",
        }
        updates = {key: value for key, value in fields.items() if key in allowed_columns}
        updates["updated_at"] = _now_sql()
        if updates:
            assignments = ", ".join(f"{column} = ?" for column in updates.keys())
            conn.execute(
                f"UPDATE pmt_essais SET {assignments} WHERE id = ?",
                (*updates.values(), uid),
            )

        refreshed = _load_essai_row(conn, uid)
        _upsert_report(conn, campaign=campaign, scope="essai", essai=refreshed, intervention=intervention)
        _upsert_report(conn, campaign=campaign, scope="campagne", demande=demande, interventions=interventions)
        conn.commit()
        return get_pmt_essai(uid)


def get_pmt_rapport(uid: int) -> dict[str, Any]:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM pmt_reports WHERE id = ?", (uid,)).fetchone()
        if row is None:
            raise LookupError(f"Rapport PMT #{uid} introuvable")

        campaign = _load_campaign_row(conn, int(row["campaign_id"]))
        essai = _load_essai_row(conn, int(row["essai_id"])) if row["essai_id"] is not None else None
        intervention = _load_intervention_row(conn, int(essai["intervention_id"])) if essai is not None else None
        demande_id = int(essai["demande_id"]) if essai is not None else int(campaign["demande_id"])
        demande = _load_demande_row(conn, demande_id)
        report = _report_to_dict(row)
        return {
            **report,
            "campaign": {
                "uid": int(campaign["id"]),
                "reference": _normalize_text(campaign["reference"]),
                "label": _normalize_text(campaign["label"]),
                "designation": _normalize_text(campaign["designation"]),
            } if campaign is not None else None,
            "essai": {
                "uid": int(essai["id"]),
                "reference": _normalize_text(essai["reference"]),
                "statut": _normalize_text(essai["statut"]),
            } if essai is not None else None,
            "intervention": _intervention_to_dict(intervention) if intervention is not None else None,
            "demande": {
                "uid": int(demande["id"]),
                "reference": _normalize_text(demande["reference"]),
                "chantier": _normalize_text(demande["chantier"]),
                "site": _normalize_text(demande["site"]),
                "client": _normalize_text(demande["client"]),
                "affaire_reference": _normalize_text(demande["affaire_reference"]),
            } if demande is not None else None,
        }