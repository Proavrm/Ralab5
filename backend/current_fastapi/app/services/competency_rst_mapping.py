"""Association des codes essai opérationnels au référentiel competency_catalog."""

from __future__ import annotations

import re
import unicodedata

from app.services.essai_codes_catalog import (
    ESSAI_CODE_BY_CODE,
    ESSAI_CODE_CATALOG,
    ESSAI_CODE_SET,
    essai_code_catalog_payload,
    essai_code_label,
)

# Rétrocompatibilité API / consignes.
RST_CODE_CATALOG = ESSAI_CODE_CATALOG
RST_CODE_SET = ESSAI_CODE_SET
RST_CODE_BY_CODE = ESSAI_CODE_BY_CODE

# Termes pour inférence terrain/chantier (EXT = agrupamento operacional terrain uniquement).
TERRAIN_TERM_ENTRIES: tuple[dict[str, object], ...] = (
    {"code": "SC", "label": "Sondage carotté", "terms": ("sondage carott", "carotté", "carotte", "carottage", "sondage et prelevement", "sondage et prélèvement")},
    {"code": "SO", "label": "Coupe de sondage", "terms": ("coupe de sondage", "coupe sondage")},
    {"code": "PMT", "label": "Profondeur de macrotexture", "terms": ("macrotexture", "determination de la macrotexture", "profondeur de macrotexture", "essai pmt")},
    {"code": "FWD", "label": "FWD / déflexions lourdes", "terms": ("fwd", "deflectometre", "deflectomètre", "plaque de chargement", "falling weight")},
    {"code": "DF", "label": "Déflexions", "terms": ("deflexion", "déflexion", "benkelman", "charge roulante")},
    {"code": "DE", "label": "Densité enrobés", "terms": ("densite enrob", "densité enrob", "masse volumique apparente", "pavetracker", "gammadensimetre")},
    {"code": "ADH", "label": "Adhérence", "terms": ("adherence chauss", "adhérence chauss", "essai d'adherence", "essai d'adhérence"), "context_types": ("chantier",)},
    {"code": "ACO", "label": "Mesure acoustique", "terms": ("acoustique", "bruit de roulement"), "context_types": ("chantier",)},
    {"code": "HAP", "label": "Analyse HAP", "terms": ("hap", "hydrocarbures aromatiques", "hydrocarbures polycycliques")},
    {"code": "AMI", "label": "Diagnostic amiante", "terms": ("amiante",)},
    {"code": "CFE", "label": "Contrôle fabrication enrobés", "terms": ("controle fabrication", "contrôle fabrication", "fabrication enrob", "centrale enrob")},
    {"code": "EXT", "label": "Extraction / liant / granulo (terrain)", "terms": ("extraction liant granulo terrain", "essai ext terrain")},
    {"code": "PCG", "label": "Presse compactage giratoire", "terms": ("compactage giratoire", "presse a compactage giratoire", "presse à compactage giratoire")},
    {"code": "PLD", "label": "Dynaplaque", "terms": ("dynaplaque", "chargement dynamique")},
    {"code": "PL", "label": "Portances à la plaque", "terms": ("essai a la plaque", "essai à la plaque", "chargement statique", "portance a la plaque", "portance à la plaque")},
    {"code": "GPR", "label": "Radar chaussée", "terms": ("gpr", "georadar", "géoradar", "radar")},
    {"code": "ORN", "label": "Orniérage", "terms": ("ornierage", "orniérage")},
    {"code": "ITSR", "label": "Tenue à l'eau", "terms": ("itsr", "tenue a l'eau", "tenue à l'eau", "sensibilite a l'eau", "sensibilité à l'eau")},
    {"code": "SCB", "label": "Semi-circular bending", "terms": ("scb", "semi-circular", "semicircular", "semi circular")},
    {"code": "ARR", "label": "Arrachement", "terms": ("arrachement",)},
    {"code": "DS", "label": "Densité sols in situ", "terms": ("densite sol", "densité sol", "densite in situ", "densité in situ"), "context_types": ("chantier",)},
    {"code": "QS", "label": "Contrôle compactage GTR", "terms": ("penetrometre dynamique", "pénétromètre dynamique", "controle compactage", "contrôle compactage", "methode q/s", "méthode q/s")},
    {"code": "PA", "label": "Pénétromètre / PANDA", "terms": ("panda", "penetrometer", "penetrometre manuel")},
    {"code": "EAU", "label": "Essai d'eau / infiltration", "terms": ("essai d'eau", "essai d eau")},
    {"code": "PER", "label": "Percolation", "terms": ("percolation",)},
    {"code": "INF", "label": "Infiltration / perméabilité", "terms": ("permeabilite", "perméabilité", "perméabilité des éprouvettes", "perméabilité double anneau", "perméabilité simple anneau", "perméabilité en forage")},
    {"code": "EE", "label": "Étanchéité à l'eau", "terms": ("etancheite a l'eau", "étanchéité à l'eau")},
    {"code": "EA", "label": "Étanchéité à l'air", "terms": ("etancheite a l'air", "étanchéité à l'air")},
)

# Priorité 1 — référence normative (ordre : motifs les plus spécifiques en premier).
REFERENCE_RST_RULES: tuple[tuple[str, str], ...] = (
    # Préparation / prélèvement
    ("nf en 12697-28", "PREP"),
    ("nf en 932-2", "PREP"),
    ("nf en 12594", "PREP"),
    ("nf en 932-1", "PREL"),
    ("nf en 58", "PREL"),
    # Liant
    ("nf en 12697-39", "EL"),
    ("nf en 12697-1", "EL"),
    # Granulométrie
    ("nf en 12697-2", "GR"),
    ("nf en iso 17892-4", "GR"),
    ("nf p 94-057", "GR"),
    ("nf p 94-056", "GR"),
    ("nf en 933-1", "GR"),
    # Terrain / chantier
    ("nf en 13036-01", "PMT"),
    ("nf en 13036-1", "PMT"),
    ("nf p98-200-6", "DF"),
    ("nf p98-200-2", "DF"),
    ("nf p94-117-2", "PLD"),
    ("nf p94-117-1", "PL"),
    ("nf p94-063", "QS"),
    ("nf p94-105", "QS"),
    ("nf en 12697-31", "PCG"),
    ("nf en 12697-22", "ORN"),
    ("nf en 12697-19", "INF"),
    ("nf en 12697-12", "ITSR"),
    ("nf x 30-418", "INF"),
    ("nf x 30-424", "INF"),
    ("nf x 30-420", "INF"),
    ("nf x 30-441", "INF"),
    ("nf p98-241-1", "DE"),
)

# Priorité 2 — libellés métier explicites.
LABEL_RST_RULES: tuple[tuple[str, str], ...] = (
    ("preparation des prises d'essai", "PREP"),
    ("préparation des prises d'essai", "PREP"),
    ("reduction d'un echantillon de laboratoire", "PREP"),
    ("réduction d'un échantillon de laboratoire", "PREP"),
    ("preparation des echantillons de liants", "PREP"),
    ("préparation des échantillons de liants", "PREP"),
    ("prelevement / echantillonnage des granulats", "PREL"),
    ("prélèvement / échantillonnage des granulats", "PREL"),
    ("prelevement / echantillonnage des liants", "PREL"),
    ("prélèvement / échantillonnage des liants", "PREL"),
    ("analyse granulometrique par tamisage", "GR"),
    ("analyse granulométrique par tamisage", "GR"),
    ("analyse granulometrique", "GR"),
    ("analyse granulométrique", "GR"),
    ("extraction de liant", "EL"),
    ("teneur en liant", "EL"),
    ("determination de la macrotexture", "PMT"),
    ("détermination de la macrotexture", "PMT"),
    ("profondeur de macrotexture", "PMT"),
    ("essai pmt", "PMT"),
    ("mesure de la deflexion", "DF"),
    ("mesure de la déflexion", "DF"),
    ("deflexion engendree par une charge roulante", "DF"),
    ("déflexion engendrée par une charge roulante", "DF"),
    ("essais a la dynaplaque", "PLD"),
    ("essais à la dynaplaque", "PLD"),
    ("essais a la plaque", "PL"),
    ("essais à la plaque", "PL"),
    ("sondage et prelevements", "SC"),
    ("sondage et prélèvements", "SC"),
    ("masse volumique apparente", "DE"),
    ("controle compactage au penetrometre dynamique", "QS"),
    ("contrôle compactage au pénétromètre dynamique", "QS"),
    ("essai d'ornierage", "ORN"),
    ("essai d'orniérage", "ORN"),
)

LABEL_RST_EXCLUSIONS: tuple[tuple[str, str], ...] = (
    ("PL", "compacteur de plaque"),
    ("PL", "confection d'eprouvette"),
    ("PL", "confection d'éprouvette"),
    ("ADH", "adhesivite passive"),
    ("ADH", "adhésivité passive"),
    ("ADH", "bitume flux"),
    ("ADH", "emulsion"),
    ("ADH", "immersion"),
    ("PMT", "deformation a la regle"),
    ("PMT", "déformation à la règle"),
    ("DF", "macrotexture"),
    ("GR", "identification"),
    ("GR", "granulometrie d'identification"),
    ("PREL", "stabilite au stockage"),
    ("PREL", "stabilité au stockage"),
)


def _normalize_text(value: str | None) -> str:
    raw = unicodedata.normalize("NFKD", (value or "").strip())
    ascii_only = raw.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_only).strip().lower()


def rst_code_label(code: str | None) -> str | None:
    return essai_code_label(code)


def _context_allowed(entry: dict[str, object], context_type: str | None) -> bool:
    allowed = entry.get("context_types")
    if not allowed:
        return True
    normalized = _normalize_text(context_type)
    return any(_normalize_text(value) == normalized for value in allowed)


def _is_excluded(code: str, label: str, reference: str | None = None) -> bool:
    haystack = _normalize_text(" ".join([label, reference or ""]))
    for excluded_code, term in LABEL_RST_EXCLUSIONS:
        if excluded_code != code:
            continue
        if _normalize_text(term) in haystack:
            return True
    return False


def _match_reference_rule(reference: str | None) -> str | None:
    normalized_reference = _normalize_text(reference)
    if not normalized_reference:
        return None
    compact_reference = normalized_reference.replace(" ", "")
    for pattern, code in REFERENCE_RST_RULES:
        normalized_pattern = pattern.replace(" ", "")
        if compact_reference.startswith(normalized_pattern) or normalized_pattern in compact_reference:
            return code
    return None


def _match_label_rule(label: str | None) -> str | None:
    normalized_label = _normalize_text(label)
    if not normalized_label:
        return None
    best_code: str | None = None
    best_length = 0
    for phrase, code in LABEL_RST_RULES:
        normalized_phrase = _normalize_text(phrase)
        if normalized_phrase and normalized_phrase in normalized_label and len(normalized_phrase) > best_length:
            if _is_excluded(code, label):
                continue
            best_code = code
            best_length = len(normalized_phrase)
    return best_code


def _match_term_rule(
    label: str | None,
    reference: str | None,
    domain: str | None,
    context_type: str | None,
) -> str | None:
    haystack = _normalize_text(" ".join([label or "", reference or "", domain or ""]))
    if not haystack:
        return None

    best_code: str | None = None
    best_score = 0
    for entry in TERRAIN_TERM_ENTRIES:
        code = str(entry["code"])
        if not _context_allowed(entry, context_type):
            continue
        if _is_excluded(code, label or "", reference):
            continue
        score = 0
        for term in entry["terms"]:
            normalized_term = _normalize_text(str(term))
            if normalized_term and normalized_term in haystack:
                score = max(score, len(normalized_term))
        if score > best_score:
            best_code = code
            best_score = score

    return best_code if best_score >= 3 else None


def infer_rst_code(
    label: str | None,
    reference: str | None = None,
    domain: str | None = None,
    context_type: str | None = None,
) -> str | None:
    label_text = str(label or "").strip()
    if not label_text:
        return None

    for match in re.finditer(r"\(([A-Z0-9][A-Z0-9/-]{0,12})\)", label_text, flags=re.IGNORECASE):
        candidate = match.group(1).strip().upper()
        if candidate in RST_CODE_SET and not _is_excluded(candidate, label_text, reference):
            return candidate

    reference_code = _match_reference_rule(reference)
    if reference_code and not _is_excluded(reference_code, label_text, reference):
        return reference_code

    label_code = _match_label_rule(label_text)
    if label_code and not _is_excluded(label_code, label_text, reference):
        return label_code

    return _match_term_rule(label_text, reference, domain, context_type)


def rst_code_catalog_payload() -> list[dict[str, str]]:
    return essai_code_catalog_payload()
