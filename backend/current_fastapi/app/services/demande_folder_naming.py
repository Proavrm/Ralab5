"""
app/services/demande_folder_naming.py
Formato: N° demande - AFFAIRE/ETUDE - Chantier - Client_Titre
"""
from __future__ import annotations
import re


def clean_piece(value: str) -> str:
    text = (value or "").strip()
    if not text: return ""
    text = re.sub(r"\s+", " ", text.replace("\n", " ").replace("\r", " ")).strip()
    invalid = {"nan","none","null","non communiqué","non communique","à qualifier","a qualifier","-"}
    return "" if text.lower() in invalid else text


def sanitize_folder_name(value: str) -> str:
    text = clean_piece(value)
    for char in '<>:"/\\|?*': text = text.replace(char, "-")
    return re.sub(r"\s+", " ", text.rstrip(" .")).strip()


def normalize_for_compare(value: str) -> str:
    text = clean_piece(value).lower()
    return re.sub(r"\s+", " ", text.replace("'","'").replace("`","'")).strip()


def build_demande_folder_name(
    numero_demande: str,
    affaire_etude: str,
    chantier: str,
    client: str,
    titre: str,
) -> str:
    parts: list[str] = []
    if n := clean_piece(numero_demande): parts.append(n)
    parts.append(clean_piece(affaire_etude) or "non communiqué")

    ch  = clean_piece(chantier)
    cv  = clean_piece(client)
    tv  = clean_piece(titre)
    tn  = normalize_for_compare(tv)
    chn = normalize_for_compare(ch)
    cvn = normalize_for_compare(cv)

    if ch and cv and chn in tn and cvn in tn:
        # Titre contém chantier + client → usa só titre
        parts.append(tv)
    elif ch and chn in tn:
        # Titre contém chantier → não duplicar chantier
        if cv and not tn.startswith(cvn): parts.append(f"{cv}_{tv}")
        else: parts.append(tv)
    else:
        if ch: parts.append(ch)
        if cv and tv:
            if tn.startswith(cvn): parts.append(tv)
            else: parts.append(f"{cv}_{tv}")
        elif tv: parts.append(tv)
        elif cv: parts.append(cv)

    return sanitize_folder_name(" - ".join(parts))
