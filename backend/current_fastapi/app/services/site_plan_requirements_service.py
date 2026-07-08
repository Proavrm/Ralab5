"""Validation for mandatory site plan (plan de situation) and affaire address."""
from __future__ import annotations

PLAN_SITUATION_TYPE = "Plan de situation"


def _normalize_type(value: object) -> str:
    return str(value or "").strip().casefold()


def is_plan_situation_document_type(document_type: object) -> bool:
    return _normalize_type(document_type) == _normalize_type(PLAN_SITUATION_TYPE)


def has_plan_situation_file(documents: list[dict] | None) -> bool:
    for item in documents or []:
        if not isinstance(item, dict):
            continue
        if not is_plan_situation_document_type(item.get("document_type")):
            continue
        if str(item.get("stored_path") or "").strip():
            return True
    return False


def assert_adresse_ouvrage(adresse_ouvrage: str | None) -> None:
    if not str(adresse_ouvrage or "").strip():
        raise ValueError(
            "Adresse de l'ouvrage obligatoire sur l'affaire "
            "(rue, numéro, commune — pour le plan de situation)."
        )


def assert_plan_situation_file(documents: list[dict] | None) -> None:
    if has_plan_situation_file(documents):
        return
    raise ValueError(
        "Plan de situation obligatoire : déposez le fichier ou capturez la carte "
        "dans le quadro C (type « Plan de situation »)."
    )


def validate_passation_site_plan_requirements(
    *,
    adresse_ouvrage: str | None,
    documents: list[dict] | None,
) -> None:
    assert_adresse_ouvrage(adresse_ouvrage)
    assert_plan_situation_file(documents)


def validate_demande_site_plan_requirements(
    *,
    adresse_ouvrage: str | None,
    demande_documents: list[dict] | None,
    passation_uid: int | None = None,
    passation_documents: list[dict] | None = None,
) -> None:
    assert_adresse_ouvrage(adresse_ouvrage)
    if has_plan_situation_file(demande_documents):
        return
    if passation_uid and has_plan_situation_file(passation_documents):
        return
    assert_plan_situation_file(demande_documents)
