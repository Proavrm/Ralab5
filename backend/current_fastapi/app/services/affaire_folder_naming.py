"""
app/services/affaire_folder_naming.py
Format: Reference - Affaire NGE/Etude/Autre - Chantier - Client_Site
"""
from __future__ import annotations

import re

from app.models.affaire_rst import AffaireRstRecord


def clean_piece(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text.replace("\n", " ").replace("\r", " ")).strip()
    invalid = {"nan", "none", "null", "non communiqué", "non communique", "à qualifier", "a qualifier", "-"}
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
) -> str:
    parts: list[str] = []
    if ref := clean_piece(reference):
        parts.append(ref)

    if affaire_label := _build_affaire_label(affaire_nge, numero_etude, autre_reference):
        parts.append(affaire_label)

    if chantier_piece := clean_piece(chantier):
        parts.append(chantier_piece)

    if client_site_piece := _build_client_site_piece(client, site):
        parts.append(client_site_piece)

    return sanitize_folder_name(" - ".join(parts))


def build_affaire_folder_name_from_record(record: AffaireRstRecord) -> str:
    return build_affaire_folder_name(
        reference=record.reference,
        affaire_nge=record.affaire_nge,
        numero_etude=record.numero_etude,
        autre_reference=record.autre_reference,
        chantier=record.chantier,
        client=record.client,
        site=record.site,
    )


def is_auto_affaire_folder_name(folder_name: str, record: AffaireRstRecord) -> bool:
    current = clean_piece(folder_name)
    if not current:
        return True

    auto_name = clean_piece(build_affaire_folder_name_from_record(record))
    reference = clean_piece(record.reference)
    return current == auto_name or (reference and current == reference)


def _build_affaire_label(affaire_nge: str, numero_etude: str, autre_reference: str) -> str:
    for value in (affaire_nge, numero_etude, autre_reference):
        if piece := clean_piece(value):
            return piece
    return ""


def _build_client_site_piece(client: str, site: str) -> str:
    client_value = clean_piece(client)
    site_value = clean_piece(site)
    if not client_value:
        return site_value
    if not site_value:
        return client_value

    client_norm = normalize_for_compare(client_value)
    site_norm = normalize_for_compare(site_value)
    if site_norm.startswith(client_norm) or client_norm in site_norm:
        return site_value
    return f"{client_value}_{site_value}"