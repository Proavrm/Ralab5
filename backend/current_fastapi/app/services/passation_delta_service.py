"""
app/services/passation_delta_service.py
Shared business logic for passation organization, readiness, and demande preparation.
"""
from __future__ import annotations

from hashlib import sha1


AGENCY_ROLE_RULES = {
    "auvergne": {
        "roles": [
            {"role_code": "TECHNICIAN_ASSIGNER", "assignee": "Christelle", "assignment_status": "À confirmer", "comment": "Proposition agence Auvergne"},
            {"role_code": "LAB_COORDINATOR", "assignee": "", "assignment_status": "À confirmer", "comment": "À valider selon planning labo"},
        ],
        "startup_items": [
            {"item_code": "CCTP_STRUCTURE", "owner_role_code": "REFERENT_RST", "owner_name": "", "status": "À confirmer", "notes": "Structuration CCTP attendue"},
            {"item_code": "INITIAL_VISIT", "owner_role_code": "INITIAL_VISIT_OWNER", "owner_name": "", "status": "À confirmer", "notes": "Visite initiale à confirmer"},
        ],
    },
    "default": {
        "roles": [
            {"role_code": "INTERVENTION_PLANNER", "assignee": "", "assignment_status": "À confirmer", "comment": "Proposition standard"},
            {"role_code": "TECHNICIAN_ASSIGNER", "assignee": "", "assignment_status": "À confirmer", "comment": "Proposition standard"},
        ],
        "startup_items": [
            {"item_code": "CONTROL_PLAN", "owner_role_code": "CONTROL_PLAN_AUTHOR", "owner_name": "", "status": "À confirmer", "notes": "Préparer plan de contrôle"},
        ],
    },
}


def normalize_text(value: object) -> str:
    return str(value or "").strip()


def normalize_agency_key(value: object) -> str:
    text = normalize_text(value).casefold()
    if "auvergne" in text or "clermont" in text or text in {"auv", "clm", "pdc"}:
        return "auvergne"
    return "default"


def build_agency_proposal(agence: object) -> dict:
    key = normalize_agency_key(agence)
    rule = AGENCY_ROLE_RULES.get(key) or AGENCY_ROLE_RULES["default"]
    return {
        "agency_key": key,
        "roles": [dict(item) for item in rule["roles"]],
        "startup_items": [dict(item) for item in rule["startup_items"]],
    }


def infer_modules(passation) -> list[str]:
    explicit = []
    for item in (getattr(passation, "demande_preparation_items", None) or []):
        if getattr(item, "is_required", False) and normalize_text(getattr(item, "module_code", "")):
            explicit.append(normalize_text(getattr(item, "module_code", "")))
    if explicit:
        return sorted(set(explicit))

    modules = []
    if normalize_text(getattr(passation, "besoins_terrain", "")):
        modules.extend(["interventions", "essais_terrain"])
    if normalize_text(getattr(passation, "besoins_laboratoire", "")):
        modules.extend(["echantillons", "essais_laboratoire"])
    if normalize_text(getattr(passation, "besoins_etude", "")):
        modules.append("etude_technique")
    if normalize_text(getattr(passation, "besoins_g3", "")):
        modules.append("g3")
    if normalize_text(getattr(passation, "besoins_essais_externes", "")):
        modules.append("essais_externes")
    if normalize_text(getattr(passation, "notes", "")) or normalize_text(getattr(passation, "synthese", "")):
        modules.append("documents")
    modules.append("planning")
    return sorted(set(modules))


def is_protected_a432(passation) -> bool:
    values = [
        normalize_text(getattr(passation, "affaire_ref", "")),
        normalize_text(getattr(passation, "numero_affaire_nge", "")),
        normalize_text(getattr(passation, "chantier", "")),
    ]
    joined = " ".join(values).upper()
    return "A432" in joined


def build_readiness_blocks(passation) -> list[str]:
    blocks = []
    if not getattr(passation, "affaire_rst_id", None):
        blocks.append("Affaire liée non renseignée")
    if not normalize_text(getattr(passation, "synthese", "")):
        blocks.append("Synthèse de cadrage manquante")

    startup_items = list(getattr(passation, "startup_items", []) or [])
    required_startup_codes = {"CCTP_STRUCTURE", "CONTROL_PLAN", "INITIAL_VISIT"}
    for code in required_startup_codes:
        matching = [item for item in startup_items if normalize_text(getattr(item, "item_code", "")) == code]
        if not matching:
            blocks.append(f"Élément de démarrage manquant: {code}")
            continue
        confirmed = any(normalize_text(getattr(item, "status", "")).casefold() == "confirmé" for item in matching)
        if not confirmed:
            blocks.append(f"Élément de démarrage non confirmé: {code}")

    roles = list(getattr(passation, "role_assignments", []) or [])
    for required_role in {"INTERVENTION_PLANNER", "TECHNICIAN_ASSIGNER"}:
        matching = [item for item in roles if normalize_text(getattr(item, "role_code", "")) == required_role]
        confirmed = any(normalize_text(getattr(item, "assignment_status", "")).casefold() == "confirmé" for item in matching)
        if not confirmed:
            blocks.append(f"Rôle requis non confirmé: {required_role}")

    if is_protected_a432(passation):
        decision = normalize_text(getattr(passation, "workflow_decision", "")).casefold()
        if decision == "annuler":
            blocks.append("Protection A432: décision 'Annuler' non autorisée")

    return blocks


def build_demande_signature(passation_uid: int, affaire_rst_id: int, module_code: str, nature: str, description: str) -> str:
    raw = "|".join([
        str(passation_uid),
        str(affaire_rst_id),
        normalize_text(module_code),
        normalize_text(nature),
        normalize_text(description),
    ])
    return sha1(raw.encode("utf-8")).hexdigest()


def infer_labo_code(passation) -> str:
    agency_key = normalize_agency_key(getattr(passation, "agence", ""))
    if agency_key == "auvergne":
        return "AUV"
    return "SP"
