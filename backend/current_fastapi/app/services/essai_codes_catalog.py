"""Catalogue unifié des codes essai — miroir frontend essaiCodesCatalog.js."""

from __future__ import annotations

# Terrain — aligné directEssaiTemplates.js
TERRAIN_ESSAI_TEMPLATES: tuple[dict[str, str], ...] = (
    {"code": "GEN", "label": "Essai générique", "domain": "terrain"},
    {"code": "SC", "label": "Sondage carotté / carottage chaussée", "domain": "terrain"},
    {"code": "SO", "label": "Coupe de sondage", "domain": "terrain"},
    {"code": "PMT", "label": "Profondeur de macrotexture (PMT)", "domain": "terrain"},
    {"code": "ADH", "label": "Adhérence", "domain": "terrain"},
    {"code": "HAP", "label": "Analyse HAP", "domain": "terrain"},
    {"code": "AMI", "label": "Diagnostic amiante", "domain": "terrain"},
    {"code": "DF", "label": "Déflexions", "domain": "terrain"},
    {"code": "FWD", "label": "FWD / déflexions lourdes", "domain": "terrain"},
    {"code": "DE", "label": "Densité enrobés", "domain": "terrain"},
    {"code": "CFE", "label": "Contrôle fabrication enrobés", "domain": "terrain"},
    {"code": "EXT", "label": "Extraction / liant / granulo (terrain)", "domain": "terrain"},
    {"code": "PCG", "label": "Presse à compactage giratoire", "domain": "terrain"},
    {"code": "ORN", "label": "Orniérage", "domain": "terrain"},
    {"code": "ITSR", "label": "Tenue à l'eau", "domain": "terrain"},
    {"code": "SCB", "label": "Semi-circular bending", "domain": "terrain"},
    {"code": "ARR", "label": "Arrachement", "domain": "terrain"},
    {"code": "ACO", "label": "Mesure acoustique", "domain": "terrain"},
    {"code": "GPR", "label": "Radar chaussée", "domain": "terrain"},
    {"code": "PLD", "label": "Portances dynaplaque", "domain": "terrain"},
    {"code": "PL", "label": "Portances à la plaque", "domain": "terrain"},
    {"code": "DS", "label": "Densité sols in situ", "domain": "terrain"},
    {"code": "QS", "label": "Contrôle de compactage", "domain": "terrain"},
    {"code": "PA", "label": "Pénétromètre", "domain": "terrain"},
    {"code": "EAU", "label": "Essai d'eau / infiltration", "domain": "terrain"},
    {"code": "PER", "label": "Percolation", "domain": "terrain"},
    {"code": "INF", "label": "Infiltration / perméabilité", "domain": "terrain"},
    {"code": "EE", "label": "Étanchéité à l'eau", "domain": "terrain"},
    {"code": "EA", "label": "Étanchéité à l'air", "domain": "terrain"},
)

# Labo — aligné laboEssaiTypes.js
LABO_ESSAI_TYPES: tuple[dict[str, str], ...] = (
    {"code": "WE", "label": "Teneur en eau naturelle", "domain": "labo"},
    {"code": "GR", "label": "Granulométrie", "domain": "labo"},
    {"code": "EL", "label": "Extraction de liant", "domain": "labo"},
    {"code": "CFE", "label": "Contrôle de fabrication enrobés", "domain": "labo"},
    {"code": "LCP", "label": "Limites d'Atterberg", "domain": "labo"},
    {"code": "VBS", "label": "Prise d'essai au bleu (sols)", "domain": "labo"},
    {"code": "MB", "label": "Valeur au bleu 0/2mm", "domain": "labo"},
    {"code": "MBF", "label": "Valeur au bleu 0/0.125mm", "domain": "labo"},
    {"code": "ES", "label": "Équivalent de sable", "domain": "labo"},
    {"code": "PN", "label": "Proctor Normal", "domain": "labo"},
    {"code": "IPI", "label": "IPI — Indice Portant Immédiat", "domain": "labo"},
    {"code": "CBRI", "label": "CBRi — CBR immédiat", "domain": "labo"},
    {"code": "CBR", "label": "CBR — après immersion 4 jours", "domain": "labo"},
    {"code": "ID", "label": "Identification GTR", "domain": "labo"},
    {"code": "MVA", "label": "Masse volumique des enrobés", "domain": "labo"},
)

OPERATION_ESSAI_CODES: tuple[dict[str, str], ...] = (
    {"code": "PREP", "label": "Préparation d'échantillon / prise d'essai", "domain": "labo"},
    {"code": "PREL", "label": "Prélèvement / échantillonnage", "domain": "labo"},
)

# Documents / feuilles mission — zone source distincte, fusionnée dans le catalogue RST unifié.
MISSION_DOCUMENT_CODES: tuple[dict[str, str], ...] = (
    {"code": "VC", "label": "Feuille de visite chantier", "domain": "terrain"},
)


def _merge_catalog() -> tuple[dict[str, str], ...]:
    by_code: dict[str, dict[str, str]] = {}
    for entry in (*TERRAIN_ESSAI_TEMPLATES, *LABO_ESSAI_TYPES, *OPERATION_ESSAI_CODES, *MISSION_DOCUMENT_CODES):
        code = str(entry["code"])
        if code not in by_code:
            by_code[code] = {"code": code, "label": str(entry["label"]), "domain": str(entry["domain"])}
    return tuple(by_code[code] for code in sorted(by_code))


ESSAI_CODE_CATALOG: tuple[dict[str, str], ...] = _merge_catalog()
ESSAI_CODE_SET = frozenset(entry["code"] for entry in ESSAI_CODE_CATALOG)
ESSAI_CODE_BY_CODE = {entry["code"]: entry for entry in ESSAI_CODE_CATALOG}


def essai_code_label(code: str | None) -> str | None:
    normalized = str(code or "").strip().upper()
    if not normalized:
        return None
    entry = ESSAI_CODE_BY_CODE.get(normalized)
    if entry:
        return str(entry["label"])
    return normalized


def essai_code_catalog_payload() -> list[dict[str, str]]:
    return [
        {"code": entry["code"], "label": entry["label"], "domain": entry["domain"]}
        for entry in ESSAI_CODE_CATALOG
    ]


def terrain_essai_catalog_payload() -> list[dict[str, str]]:
    return [
        {"code": entry["code"], "label": entry["label"], "domain": "terrain"}
        for entry in ESSAI_CODE_CATALOG
        if str(entry.get("domain") or "") == "terrain"
    ]
