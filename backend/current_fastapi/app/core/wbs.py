from __future__ import annotations

import re
from typing import Optional


def join_wbs_display(*parts: Optional[str]) -> str:
    cleaned = [str(part or "").strip() for part in parts if str(part or "").strip()]
    return " > ".join(cleaned)


def _num_from_pattern(value: str, pattern: str) -> str:
    match = re.match(pattern, str(value or "").strip())
    if not match:
        return "0"
    return str(int(match.group(1)))


def build_sc_wbs_short(
    affaire_ref: str,
    demande_ref: str,
    campagne_ref: str,
    intervention_ref: str,
    sc_reference: str,
    sc_code: str,
) -> str:
    # SC compact short WBS, aligned with DE compact style.
    m_aff = re.match(r"\d{4}-([A-Z]+)-(\d+)", str(affaire_ref or "").strip())
    affaire_lab = m_aff.group(1) if m_aff else ""
    affaire_num = str(int(m_aff.group(2))) if m_aff else "0"

    m_dem = re.match(r"\d{4}-([A-Z]+)-D(\d+)", str(demande_ref or "").strip())
    demande_lab = m_dem.group(1) if m_dem else ""
    demande_num = str(int(m_dem.group(2))) if m_dem else "0"

    camp_num = _num_from_pattern(str(campagne_ref or "").strip(), r"\d{4}-[A-Z]+-C(\d+)")
    int_num = _num_from_pattern(str(intervention_ref or "").strip(), r"\d{4}-[A-Z]+-I(\d+)")
    sc_num = _num_from_pattern(str(sc_reference or "").strip(), r"\d{4}-[A-Z]+-SC(\d+)")
    point_num = _num_from_pattern(str(sc_code or "").strip().upper(), r"SC(\d+)")

    return f"{affaire_lab}-{demande_lab}-A{affaire_num}-D{demande_num}-C{camp_num}-I{int_num}-SC{sc_num}-P{point_num}"

