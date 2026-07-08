"""Rattachement labos ↔ régions orga (ARS) et agences (RA, AUV)."""
from __future__ import annotations

from app.repositories.org_repository import DEFAULT_LAB_AGENCE, OrgRepository
from app.services.lab_geo_catalog import normalize_labo_code

_org_cache: dict | None = None


def _load_org_cache() -> dict:
    global _org_cache
    if _org_cache is not None:
        return _org_cache

    from app.repositories.laboratoires_repository import LaboratoiresRepository

    repo = OrgRepository()
    regions = {row.code.upper(): row for row in repo.list_regions()}
    agences = {row.code.upper(): row for row in repo.list_agences()}
    lab_agence = dict(DEFAULT_LAB_AGENCE)
    for record in LaboratoiresRepository().list_all():
        code = normalize_labo_code(record.code)
        if record.agence_code:
            lab_agence[code] = normalize_org_code(record.agence_code)
        elif code in lab_agence:
            continue
        elif code:
            lab_agence.setdefault(code, "")

    _org_cache = {
        "regions": regions,
        "agences": agences,
        "lab_agence": lab_agence,
    }
    return _org_cache


def invalidate_org_cache() -> None:
    global _org_cache
    _org_cache = None


def normalize_org_code(code: str | None) -> str:
    return str(code or "").strip().upper()


def is_org_region_code(code: str | None) -> bool:
    return normalize_org_code(code) in _load_org_cache()["regions"]


def is_agence_code(code: str | None) -> bool:
    return normalize_org_code(code) in _load_org_cache()["agences"]


def org_region_label(code: str | None) -> str:
    key = normalize_org_code(code)
    row = _load_org_cache()["regions"].get(key)
    return row.label if row else key


def agence_label(code: str | None) -> str:
    key = normalize_org_code(code)
    row = _load_org_cache()["agences"].get(key)
    return row.label if row else key


def agence_for_lab(lab_code: str | None, agence_code: str | None = None) -> str:
    if agence_code:
        return normalize_org_code(agence_code)
    normalized = normalize_labo_code(str(lab_code or "").strip())
    if not normalized:
        return ""
    return _load_org_cache()["lab_agence"].get(normalized, "")


def org_region_for_lab(lab_code: str | None, region: str | None = None) -> str:
    if region and is_org_region_code(region):
        return normalize_org_code(region)
    agence_code = agence_for_lab(lab_code)
    if agence_code:
        agence = _load_org_cache()["agences"].get(agence_code)
        if agence:
            return agence.region_code.upper()
    return ""


def lab_codes_for_org_region(code: str | None, labs: list[dict] | None = None) -> list[str]:
    key = normalize_org_code(code)
    if not key:
        return []
    if labs:
        return [
            normalize_labo_code(row.get("code"))
            for row in labs
            if normalize_org_code(row.get("region") or org_region_for_lab(row.get("code"), row.get("region")))
            == key
        ]
    agence_codes = {
        agence.code.upper()
        for agence in _load_org_cache()["agences"].values()
        if agence.region_code.upper() == key
    }
    return [
        normalize_labo_code(lab)
        for lab, agence in _load_org_cache()["lab_agence"].items()
        if agence in agence_codes
    ]


def lab_codes_for_agence(code: str | None, labs: list[dict] | None = None) -> list[str]:
    key = normalize_org_code(code)
    if not key:
        return []
    if labs:
        return [
            normalize_labo_code(row.get("code"))
            for row in labs
            if normalize_org_code(row.get("agence_code") or agence_for_lab(row.get("code"))) == key
        ]
    return [
        normalize_labo_code(lab)
        for lab, agence in _load_org_cache()["lab_agence"].items()
        if agence == key
    ]


def user_service_matches_lab(
    service_code: str | None,
    lab_code: str,
    lab_region: str | None = None,
    lab_agence_code: str | None = None,
) -> bool:
    user_code = normalize_org_code(service_code)
    if not user_code:
        return False

    target_lab = normalize_labo_code(lab_code)
    if not target_lab:
        return False

    region = lab_region or org_region_for_lab(target_lab, lab_region)
    agence = lab_agence_code or agence_for_lab(target_lab, lab_agence_code)

    if is_org_region_code(user_code):
        return normalize_org_code(region) == user_code

    if is_agence_code(user_code):
        return normalize_org_code(agence) == user_code

    return normalize_labo_code(user_code) == target_lab


def enrich_laboratoire_dict(payload: dict) -> dict:
    lab_code = payload.get("code")
    region_code = normalize_org_code(
        payload.get("region") or org_region_for_lab(lab_code, payload.get("region"))
    )
    agence_code = agence_for_lab(lab_code, payload.get("agence_code"))

    payload["region"] = region_code
    payload["region_label"] = org_region_label(region_code) if region_code else ""
    payload["agence_code"] = agence_code
    payload["agence_label"] = agence_label(agence_code) if agence_code else ""
    # Compatibilité API existante
    payload["rst_region"] = region_code
    payload["rst_region_label"] = payload["region_label"]
    payload["agency_code"] = agence_code
    return payload


def list_org_regions_payload(labs: list[dict] | None = None) -> list[dict]:
    lab_rows = labs or []
    cache = _load_org_cache()
    items: list[dict] = []

    for region in sorted(cache["regions"].values(), key=lambda row: row.code):
        region_code = region.code.upper()
        region_labs = [
            row for row in lab_rows
            if normalize_org_code(row.get("region") or org_region_for_lab(row.get("code"), row.get("region")))
            == region_code
        ]
        agence_items: list[dict] = []
        for agence in sorted(cache["agences"].values(), key=lambda row: row.code):
            if agence.region_code.upper() != region_code:
                continue
            attached = [
                row for row in region_labs
                if normalize_org_code(row.get("agence_code") or agence_for_lab(row.get("code"))) == agence.code.upper()
            ]
            agence_items.append(
                {
                    "code": agence.code,
                    "label": agence.label,
                    "region_code": agence.region_code,
                    "laboratoires": attached,
                    "lab_codes": [row.get("code") for row in attached],
                }
            )
        items.append(
            {
                "code": region.code,
                "label": region.label,
                "agences": agence_items,
                "laboratoires": region_labs,
                "lab_codes": [row.get("code") for row in region_labs],
            }
        )
    return items


def build_user_org_association(service_code: str | None, labs: list[dict] | None = None) -> dict:
    code = normalize_org_code(service_code)
    lab_rows = labs or []

    if is_org_region_code(code):
        region = _load_org_cache()["regions"][code]
        attached = [
            row for row in lab_rows
            if normalize_org_code(row.get("region") or org_region_for_lab(row.get("code"))) == code
        ]
        return {
            "kind": "org_region",
            "code": region.code,
            "label": region.label,
            "laboratoires": attached,
        }

    if is_agence_code(code):
        agence = _load_org_cache()["agences"][code]
        attached = [
            row for row in lab_rows
            if normalize_org_code(row.get("agence_code") or agence_for_lab(row.get("code"))) == code
        ]
        return {
            "kind": "agence",
            "code": agence.code,
            "label": agence.label,
            "region_code": agence.region_code,
            "region_label": org_region_label(agence.region_code),
            "laboratoires": attached,
        }

    lab = next(
        (row for row in lab_rows if normalize_labo_code(row.get("code")) == normalize_labo_code(code)),
        None,
    )
    if lab:
        region_code = normalize_org_code(lab.get("region") or org_region_for_lab(lab.get("code")))
        agence_code = normalize_org_code(lab.get("agence_code") or agence_for_lab(lab.get("code")))
        return {
            "kind": "laboratoire",
            "code": lab.get("code"),
            "label": lab.get("name"),
            "region": region_code,
            "region_label": org_region_label(region_code),
            "agence_code": agence_code,
            "agence_label": agence_label(agence_code),
            "laboratoire": lab,
        }

    if code:
        return {"kind": "unknown", "code": code, "label": code, "laboratoires": []}
    return {"kind": "none", "code": "", "label": "", "laboratoires": []}


# Alias compatibilité imports legacy
list_rst_regions_payload = list_org_regions_payload
build_user_rst_association = build_user_org_association
is_rst_region_code = is_org_region_code
rst_region_label = org_region_label
rst_region_for_lab = org_region_for_lab
lab_codes_for_rst_region = lab_codes_for_org_region
lab_agency_code = agence_for_lab
