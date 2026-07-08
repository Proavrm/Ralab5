"""
app/services/affaire_folder_naming.py
Format: Reference - Affaire NGE/Etude/Autre - Site - Acteur_Chantier

Acteur = Client (prioritaire) sinon Maître d'ouvrage.
Titulaire / filiale / maître d'œuvre n'entrent pas dans le nom de dossier.
"""
from __future__ import annotations

import re

from app.models.affaire_rst import AffaireRstRecord


def clean_piece(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text.replace("\n", " ").replace("\r", " ")).strip()
    invalid = {"nan", "none", "null", "non communiqué", "non communique", "non comuniqué", "non comunique", "à qualifier", "a qualifier", "-"}
    return "" if text.lower() in invalid else text


def sanitize_folder_name(value: str) -> str:
    text = clean_piece(value)
    for char in '<>:"/\\|?*':
        text = text.replace(char, "-")
    return re.sub(r"\s+", " ", text.rstrip(" .")).strip()


def normalize_for_compare(value: str) -> str:
    text = clean_piece(value).lower()
    return re.sub(r"\s+", " ", text.replace("`", "'")).strip()


def build_affaire_folder_name(
    reference: str,
    affaire_nge: str,
    numero_etude: str,
    autre_reference: str,
    chantier: str,
    client: str,
    site: str,
    maitre_ouvrage: str = "",
) -> str:
    parts: list[str] = []
    if ref := clean_piece(reference):
        parts.append(ref)

    if affaire_label := _build_affaire_label(affaire_nge, numero_etude, autre_reference):
        parts.append(affaire_label)

    if site_piece := clean_piece(site):
        parts.append(site_piece)

    acteur = _resolve_folder_acteur(client, maitre_ouvrage)
    if acteur_piece := _build_client_chantier_piece(acteur, chantier):
        parts.append(acteur_piece)

    return sanitize_folder_name(" - ".join(parts))


def _resolve_folder_acteur(client: str, maitre_ouvrage: str) -> str:
    """Client en priorité ; MOA si client absent ou générique."""
    client_value = clean_piece(client)
    if client_value:
        return client_value
    return clean_piece(maitre_ouvrage)


def build_affaire_folder_name_from_record(record: AffaireRstRecord) -> str:
    return build_affaire_folder_name(
        reference=record.reference,
        affaire_nge=record.affaire_nge,
        numero_etude=record.numero_etude,
        autre_reference=record.autre_reference,
        chantier=record.chantier,
        client=record.client,
        site=record.site,
        maitre_ouvrage=record.maitre_ouvrage,
    )


def is_auto_affaire_folder_name(folder_name: str, record: AffaireRstRecord) -> bool:
    current = clean_piece(folder_name)
    if not current:
        return True

    auto_name = clean_piece(build_affaire_folder_name_from_record(record))
    reference = clean_piece(record.reference)
    if current == auto_name or (reference and current == reference):
        return True

    old_name = clean_piece(_build_old_format_name(record))
    return bool(old_name and current == old_name)


def _build_old_format_name(record: AffaireRstRecord) -> str:
    """Old format: Reference - AffaireNGE - Chantier - Client_Site"""
    parts: list[str] = []
    if ref := clean_piece(record.reference):
        parts.append(ref)
    if label := _build_affaire_label(record.affaire_nge, record.numero_etude, record.autre_reference):
        parts.append(label)
    if chantier := clean_piece(record.chantier):
        parts.append(chantier)
    client_value = clean_piece(record.client)
    site_value = clean_piece(record.site)
    if client_value and site_value:
        client_norm = normalize_for_compare(client_value)
        site_norm = normalize_for_compare(site_value)
        if site_norm.startswith(client_norm) or client_norm in site_norm:
            parts.append(site_value)
        else:
            parts.append(f"{client_value}_{site_value}")
    elif client_value:
        parts.append(client_value)
    elif site_value:
        parts.append(site_value)
    return sanitize_folder_name(" - ".join(parts))


def _build_affaire_label(affaire_nge: str, numero_etude: str, autre_reference: str) -> str:
    for value in (affaire_nge, numero_etude, autre_reference):
        if piece := clean_piece(value):
            return piece
    return ""


def _build_client_chantier_piece(client: str, chantier: str) -> str:
    client_value = clean_piece(client)
    chantier_value = clean_piece(chantier)
    if not client_value:
        return chantier_value
    if not chantier_value:
        return client_value

    client_norm = normalize_for_compare(client_value)
    chantier_norm = normalize_for_compare(chantier_value)
    if chantier_norm.startswith(client_norm) or client_norm in chantier_norm:
        return chantier_value
    return f"{client_value}_{chantier_value}"