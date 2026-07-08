from __future__ import annotations

import re
import sqlite3
from typing import Any

from app.repositories.security_repository import SecurityRepository

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _normalize_name(value: str) -> str:
    text = _clean(value).lower()
    text = re.sub(r"[^\w\s@.-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _extract_emails_from_text(text: str) -> set[str]:
    if not text:
        return set()
    return {match.group(0).lower() for match in EMAIL_RE.finditer(text)}


def _build_users_index() -> dict[str, str]:
    index: dict[str, str] = {}
    try:
        rows = SecurityRepository().list_active_users()
    except FileNotFoundError:
        return index

    for row in rows:
        email = _clean(row["email"]).lower()
        if not email:
            continue
        display = _normalize_name(row["display_name"])
        if display:
            index[display] = email
        prefix = email.split("@", 1)[0]
        if prefix:
            index[_normalize_name(prefix)] = email
    return index


def _lookup_name_email(name: str, users_index: dict[str, str]) -> str | None:
    text = _clean(name)
    if not text:
        return None

    direct = _extract_emails_from_text(text)
    if direct:
        return sorted(direct)[0]

    key = _normalize_name(text)
    if not key or len(key) < 3:
        return None

    if key in users_index:
        return users_index[key]

    for norm_name, email in users_index.items():
        if key == norm_name or key in norm_name or norm_name in key:
            return email
    return None


def _add_email(
    bucket: dict[str, dict[str, str]],
    email: str,
    *,
    label: str,
    source: str,
    matched_from: str = "",
) -> None:
    clean_email = _clean(email).lower()
    if not clean_email or "@" not in clean_email:
        return
    existing = bucket.get(clean_email)
    if existing:
        if label not in existing["label"]:
            existing["label"] = f"{existing['label']}, {label}"
        return
    bucket[clean_email] = {
        "email": clean_email,
        "label": label,
        "source": source,
        "matched_from": matched_from or label,
    }


def _scan_text_emails(
    bucket: dict[str, dict[str, str]],
    text: str,
    *,
    label: str,
    source: str,
) -> None:
    for email in sorted(_extract_emails_from_text(text)):
        _add_email(bucket, email, label=label, source=source, matched_from=text[:120])


def _scan_person_field(
    bucket: dict[str, dict[str, str]],
    value: str,
    *,
    label: str,
    source: str,
    users_index: dict[str, str],
) -> None:
    text = _clean(value)
    if not text:
        return

    for email in _extract_emails_from_text(text):
        _add_email(bucket, email, label=label, source=source, matched_from=text)

    resolved = _lookup_name_email(text, users_index)
    if resolved:
        _add_email(bucket, resolved, label=label, source=source, matched_from=text)


def _resolve_report_context(conn: sqlite3.Connection, report_id: str) -> dict[str, Any] | None:
    raw_id = _clean(report_id)
    upper_id = raw_id.upper()

    if upper_id.startswith("PMT:"):
        maybe_id = _clean(raw_id.split(":", 1)[1])
        if not maybe_id.isdigit():
            return None
        row = conn.execute(
            """
            SELECT
                p.demande_id,
                d.affaire_rst_id,
                p.intervention_id,
                p.reference AS report_reference,
                d.reference AS demande_reference,
                a.reference AS affaire_reference,
                a.client AS affaire_client
            FROM pmt_essais p
            LEFT JOIN demandes d ON d.id = p.demande_id
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            WHERE p.id = ?
            """,
            (int(maybe_id),),
        ).fetchone()
        return dict(row) if row else None

    if upper_id.startswith("SC:") or upper_id.startswith("SO:") or upper_id.startswith("DE:") or upper_id.startswith("VC:"):
        feuille_id = _clean(raw_id.split(":", 1)[1])
        if not feuille_id.isdigit():
            return None
        row = conn.execute(
            """
            SELECT
                ft.demande_id,
                d.affaire_rst_id,
                ft.intervention_id,
                ft.reference AS report_reference,
                d.reference AS demande_reference,
                a.reference AS affaire_reference,
                a.client AS affaire_client
            FROM feuilles_terrain ft
            LEFT JOIN demandes d ON d.id = ft.demande_id
            LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
            WHERE ft.id = ?
            """,
            (int(feuille_id),),
        ).fetchone()
        return dict(row) if row else None

    return None


def collect_dossier_emails(conn: sqlite3.Connection, report_id: str) -> dict[str, Any]:
    context = _resolve_report_context(conn, report_id)
    if not context:
        return {
            "ok": False,
            "report_id": _clean(report_id),
            "message": "Rapport introuvable ou dossier non lié.",
            "emails": [],
            "count": 0,
        }

    demande_id = context.get("demande_id")
    affaire_rst_id = context.get("affaire_rst_id")
    if demande_id is None:
        return {
            "ok": False,
            "report_id": _clean(report_id),
            "message": "Aucune demande liée à ce rapport.",
            "emails": [],
            "count": 0,
        }

    users_index = _build_users_index()
    bucket: dict[str, dict[str, str]] = {}

    demande = conn.execute(
        """
        SELECT
            demandeur,
            description,
            observations,
            suivi_notes,
            note_reconciliation,
            service_interne,
            societe_interne
        FROM demandes
        WHERE id = ?
        """,
        (int(demande_id),),
    ).fetchone()

    if demande:
        _scan_person_field(
            bucket,
            demande["demandeur"],
            label="Demandeur",
            source="demande.demandeur",
            users_index=users_index,
        )
        for field_name, label in (
            ("description", "Description demande"),
            ("observations", "Observations demande"),
            ("suivi_notes", "Suivi demande"),
            ("note_reconciliation", "Note réconciliation"),
            ("service_interne", "Service interne"),
            ("societe_interne", "Société interne"),
        ):
            _scan_text_emails(
                bucket,
                demande[field_name],
                label=label,
                source=f"demande.{field_name}",
            )

    if affaire_rst_id:
        affaire = conn.execute(
            """
            SELECT responsable, titulaire, client, chantier, site
            FROM affaires_rst
            WHERE id = ?
            """,
            (int(affaire_rst_id),),
        ).fetchone()
        if affaire:
            for field_name, label in (
                ("responsable", "Responsable affaire"),
                ("titulaire", "Titulaire affaire"),
                ("client", "Client affaire"),
            ):
                _scan_person_field(
                    bucket,
                    affaire[field_name],
                    label=label,
                    source=f"affaire.{field_name}",
                    users_index=users_index,
                )
            for field_name, label in (
                ("chantier", "Chantier affaire"),
                ("site", "Site affaire"),
            ):
                _scan_text_emails(
                    bucket,
                    affaire[field_name],
                    label=label,
                    source=f"affaire.{field_name}",
                )

        passations = conn.execute(
            """
            SELECT responsable, interlocuteurs_principaux, notes, description_generale, synthese
            FROM passations
            WHERE affaire_rst_id = ?
            """,
            (int(affaire_rst_id),),
        ).fetchall()
        for row in passations:
            _scan_person_field(
                bucket,
                row["responsable"],
                label="Responsable passation",
                source="passation.responsable",
                users_index=users_index,
            )
            for field_name, label in (
                ("interlocuteurs_principaux", "Interlocuteurs passation"),
                ("notes", "Notes passation"),
                ("description_generale", "Description passation"),
                ("synthese", "Synthèse passation"),
            ):
                _scan_text_emails(
                    bucket,
                    row[field_name],
                    label=label,
                    source=f"passation.{field_name}",
                )

    preparation = conn.execute(
        """
        SELECT
            responsable_referent,
            attribue_a,
            attentes_client,
            commentaires,
            remarques,
            points_vigilance,
            contexte_operationnel,
            objectifs,
            objectif_mission,
            ressources_notes
        FROM demande_preparations
        WHERE demande_id = ?
        """,
        (int(demande_id),),
    ).fetchone()
    if preparation:
        for field_name, label in (
            ("responsable_referent", "Responsable référent"),
            ("attribue_a", "Attribué à"),
        ):
            _scan_person_field(
                bucket,
                preparation[field_name],
                label=label,
                source=f"preparation.{field_name}",
                users_index=users_index,
            )
        for field_name, label in (
            ("attentes_client", "Attentes client"),
            ("commentaires", "Commentaires préparation"),
            ("remarques", "Remarques préparation"),
            ("points_vigilance", "Points de vigilance"),
            ("contexte_operationnel", "Contexte opérationnel"),
            ("objectifs", "Objectifs préparation"),
            ("objectif_mission", "Objectif mission"),
            ("ressources_notes", "Ressources préparation"),
        ):
            _scan_text_emails(
                bucket,
                preparation[field_name],
                label=label,
                source=f"preparation.{field_name}",
            )

    campagnes = conn.execute(
        """
        SELECT responsable_technique, attribue_a, notes, designation, label
        FROM campagnes
        WHERE demande_id = ?
        """,
        (int(demande_id),),
    ).fetchall()
    for row in campagnes:
        for field_name, label in (
            ("responsable_technique", "Responsable technique campagne"),
            ("attribue_a", "Attribué campagne"),
        ):
            _scan_person_field(
                bucket,
                row[field_name],
                label=label,
                source=f"campagne.{field_name}",
                users_index=users_index,
            )
        _scan_text_emails(bucket, row["notes"], label="Notes campagne", source="campagne.notes")

    interventions = conn.execute(
        """
        SELECT geotechnicien, technicien, observations, sujet, type_intervention
        FROM interventions
        WHERE demande_id = ?
        """,
        (int(demande_id),),
    ).fetchall()
    for row in interventions:
        for field_name, label in (
            ("geotechnicien", "Géotechnicien"),
            ("technicien", "Technicien intervention"),
        ):
            _scan_person_field(
                bucket,
                row[field_name],
                label=label,
                source=f"intervention.{field_name}",
                users_index=users_index,
            )
        _scan_text_emails(
            bucket,
            row["observations"],
            label="Observations intervention",
            source="intervention.observations",
        )

    essais = conn.execute(
        """
        SELECT es.operateur
        FROM essais es
        LEFT JOIN echantillons ech ON ech.id = es.echantillon_id
        LEFT JOIN interventions i ON i.id = es.intervention_id
        WHERE ech.demande_id = ? OR i.demande_id = ?
        """,
        (int(demande_id), int(demande_id)),
    ).fetchall()
    for row in essais:
        _scan_person_field(
            bucket,
            row["operateur"],
            label="Opérateur essai",
            source="essai.operateur",
            users_index=users_index,
        )

    feuilles = conn.execute(
        """
        SELECT operateur, observations
        FROM feuilles_terrain
        WHERE demande_id = ?
        """,
        (int(demande_id),),
    ).fetchall()
    for row in feuilles:
        _scan_person_field(
            bucket,
            row["operateur"],
            label="Opérateur feuille terrain",
            source="feuille.operateur",
            users_index=users_index,
        )
        _scan_text_emails(
            bucket,
            row["observations"],
            label="Observations feuille",
            source="feuille.observations",
        )

    prelevements = conn.execute(
        """
        SELECT receptionnaire, technicien, notes, description
        FROM prelevements
        WHERE demande_id = ?
        """,
        (int(demande_id),),
    ).fetchall()
    for row in prelevements:
        for field_name, label in (
            ("receptionnaire", "Réceptionnaire prélèvement"),
            ("technicien", "Technicien prélèvement"),
        ):
            _scan_person_field(
                bucket,
                row[field_name],
                label=label,
                source=f"prelevement.{field_name}",
                users_index=users_index,
            )
        for field_name, label in (
            ("notes", "Notes prélèvement"),
            ("description", "Description prélèvement"),
        ):
            _scan_text_emails(
                bucket,
                row[field_name],
                label=label,
                source=f"prelevement.{field_name}",
            )

    pmt_rows = conn.execute(
        """
        SELECT operateur, observations, conclusion_finale
        FROM pmt_essais
        WHERE demande_id = ?
        """,
        (int(demande_id),),
    ).fetchall()
    for row in pmt_rows:
        _scan_person_field(
            bucket,
            row["operateur"],
            label="Opérateur PMT",
            source="pmt.operateur",
            users_index=users_index,
        )
        for field_name, label in (
            ("observations", "Observations PMT"),
            ("conclusion_finale", "Conclusion PMT"),
        ):
            _scan_text_emails(
                bucket,
                row[field_name],
                label=label,
                source=f"pmt.{field_name}",
            )

    emails = sorted(bucket.values(), key=lambda item: item["email"])
    return {
        "ok": True,
        "report_id": _clean(report_id),
        "demande_id": int(demande_id),
        "demande_reference": _clean(context.get("demande_reference")),
        "affaire_reference": _clean(context.get("affaire_reference")),
        "report_reference": _clean(context.get("report_reference")),
        "emails": emails,
        "count": len(emails),
        "message": "Adresses trouvées dans le dossier complet."
        if emails
        else "Aucune adresse mail trouvée dans le dossier complet.",
    }
