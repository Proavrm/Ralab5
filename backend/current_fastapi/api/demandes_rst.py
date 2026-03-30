"""
api/demandes_rst.py — RaLab4
Endpoints :
  GET    /api/demandes
  GET    /api/demandes/next-ref
  GET    /api/demandes/filters
  GET    /api/demandes/{uid}
  POST   /api/demandes
  PUT    /api/demandes/{uid}
  DELETE /api/demandes/{uid}
"""
from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from app.models.demande_rst import (
    DemandeRstCreateSchema, DemandeRstResponseSchema, DemandeRstUpdateSchema,
)
from app.repositories.demande_preparation_repository import DemandePreparationRepository
from app.repositories.demandes_rst_repository import DemandesRstRepository
from app.repositories.dst_repository import DstRepository

router = APIRouter()
_repo  = DemandesRstRepository()
_prep_repo = DemandePreparationRepository()
_dst_repo = DstRepository()


def _first_non_empty(*values):
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _normalize_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _find_dst_record(numero_dst: str):
    numero = _normalize_text(numero_dst)
    if not numero or not _dst_repo.is_available:
        return None
    for column in ("N° chrono", "Numéro dossier DST"):
        records = _dst_repo.search(search_text=numero, column_name=column, limit=20)
        for record in records:
            value = record.first_text(column)
            if value and value.casefold() == numero.casefold():
                return record
    return None


def _build_dst_context(numero_dst: str) -> dict[str, str]:
    record = _find_dst_record(numero_dst)
    if not record:
        return {}
    return {
        "dst_libelle_projet": record.first_text("Libellé du projet", "Objet"),
        "dst_societe": record.first_text("Société"),
        "dst_direction_regionale": record.first_text("Direction régionale"),
        "dst_affaire_demandeur": record.first_text("N° affaire demandeur"),
        "dst_situation_geographique": record.first_text("Situation Géographique", "Situation géographique projet", "Site"),
        "dst_type_demande": record.first_text("Type de demande"),
        "dst_urgence": record.first_text("Urgence"),
        "dst_origine": record.first_text("Origine"),
        "dst_remise_souhaitee": record.first_text("Remise souhaitée", "Echéance"),
        "dst_cadre_demande": record.first_text("Cadre de la demande"),
        "dst_domaine_etude": record.first_text("Domaine d'étude", "Autre domaine d'étude"),
        "dst_type_prestation": record.first_text("Type de prestation attendue", "Autre type de prestation"),
        "dst_objet_demande": record.first_text("Objet de la demande (Problématiques, Hypothèses, Objectifs, Remarques)", "Objet"),
    }


def _build_linked_items(demande_ref: str, preparation: dict, related: dict) -> list[dict]:
    items: list[dict] = []
    if preparation:
        items.append({
            "type": "Préparation",
            "reference": demande_ref or "",
            "designation": _first_non_empty(
                preparation.get("attentes_client"),
                preparation.get("objectifs"),
                preparation.get("contexte_operationnel"),
                "Préparation de la demande",
            ),
            "statut": preparation.get("phase_operation") or "À qualifier",
            "date": preparation.get("updated_at") or preparation.get("created_at") or "",
            "item_kind": "preparation",
            "item_uid": preparation.get("uid"),
            "echantillon_uid": None,
            "module_code": "preparation",
        })

    for item in related.get("interventions", []):
        items.append({
            "type": "Intervention",
            "reference": item.get("reference") or "",
            "designation": _first_non_empty(item.get("sujet"), item.get("type_intervention"), "Intervention"),
            "statut": item.get("statut") or ("Anomalie" if item.get("anomalie_detectee") else ""),
            "date": item.get("date_intervention") or "",
            "item_kind": "intervention",
            "item_uid": item.get("uid"),
            "echantillon_uid": None,
            "module_code": "interventions",
        })

    for item in related.get("echantillons", []):
        items.append({
            "type": "Échantillon",
            "reference": item.get("reference") or "",
            "designation": _first_non_empty(item.get("designation"), item.get("localisation"), "Échantillon"),
            "statut": item.get("statut") or "",
            "date": item.get("date_prelevement") or item.get("date_reception_labo") or "",
            "item_kind": "echantillon",
            "item_uid": item.get("uid"),
            "echantillon_uid": item.get("uid"),
            "module_code": "echantillons",
        })

    for item in related.get("essais", []):
        items.append({
            "type": "Essai",
            "reference": item.get("reference") or f"Essai #{item.get('uid')}",
            "designation": _first_non_empty(
                item.get("type_essai"),
                item.get("echantillon_designation"),
                item.get("echantillon_reference"),
                "Essai",
            ),
            "statut": item.get("statut") or "",
            "date": item.get("date_debut") or item.get("date_fin") or "",
            "item_kind": "essai",
            "item_uid": item.get("uid"),
            "echantillon_uid": item.get("echantillon_id"),
            "module_code": "essais_laboratoire",
        })

    order_map = {"Préparation": 0, "Intervention": 1, "Échantillon": 2, "Essai": 3}
    items.sort(key=lambda item: (order_map.get(item["type"], 99), str(item.get("reference") or ""), str(item.get("date") or ""), int(item.get("item_uid") or 0)))
    return items


def _build_visibility(enabled_codes: set[str]) -> dict[str, bool]:
    echantillons_visible = any(code in enabled_codes for code in ("echantillons", "essais_laboratoire"))
    essais_visible = "essais_laboratoire" in enabled_codes
    interventions_visible = "interventions" in enabled_codes
    return {
        "preparation": True,
        "interventions": interventions_visible,
        "echantillons": echantillons_visible,
        "essais": essais_visible,
        "g3": any(code in enabled_codes for code in ("interventions", "essais_terrain", "g3")),
        "labo": echantillons_visible or essais_visible,
        "planning": "planning" in enabled_codes,
        "documents": "documents" in enabled_codes,
        "essais_externes": "essais_externes" in enabled_codes,
        "etude_technique": any(code in enabled_codes for code in ("etude_technique", "g3")),
        "devis_facturation": "devis_facturation" in enabled_codes,
    }


def _filter_visible_linked_items(items: list[dict], visibility: dict[str, bool]) -> list[dict]:
    visible_items: list[dict] = []
    for item in items:
        module_code = item.get("module_code")
        if module_code == "preparation":
            visible_items.append(item)
            continue
        if module_code == "interventions" and visibility.get("interventions"):
            visible_items.append(item)
            continue
        if module_code == "echantillons" and visibility.get("echantillons"):
            visible_items.append(item)
            continue
        if module_code == "essais_laboratoire" and visibility.get("essais"):
            visible_items.append(item)
    return visible_items


def _visible_counts(related_counts: dict, visibility: dict[str, bool], enabled_codes: set[str]) -> dict[str, int]:
    return {
        "modules_enabled": len(enabled_codes),
        "interventions": int(related_counts.get("interventions") or 0) if visibility.get("interventions") else 0,
        "echantillons": int(related_counts.get("echantillons") or 0) if visibility.get("echantillons") else 0,
        "essais": int(related_counts.get("essais") or 0) if visibility.get("essais") else 0,
    }


@router.get("", response_model=list[DemandeRstResponseSchema])
def list_demandes(
    affaire_rst_id: Optional[int]  = Query(None),
    labo_code:      Optional[str]  = Query(None),
    statut:         Optional[str]  = Query(None),
    type_mission:   Optional[str]  = Query(None),
    search:         Optional[str]  = Query(None),
    a_revoir:       Optional[bool] = Query(None),
):
    rows = _repo.all(
        affaire_rst_id=affaire_rst_id, labo_code=labo_code,
        statut=statut, type_mission=type_mission, search=search, a_revoir=a_revoir,
    )
    return [_repo.to_resp(r) for r in rows]


@router.get("/next-ref")
def next_ref(labo_code: str = Query("SP")):
    return {"reference": _repo.next_reference(labo_code)}


@router.get("/filters")
def filters():
    return {
        "statuts":       _repo.distinct_values("statut"),
        "types_mission": _repo.distinct_values("type_mission"),
        "priorites":     _repo.distinct_values("priorite"),
        "labo_codes":    _repo.distinct_values("labo_code"),
    }


@router.get("/{uid}", response_model=DemandeRstResponseSchema)
def get_demande(uid: int):
    r = _repo.get_by_uid(uid)
    if not r:
        raise HTTPException(404, f"Demande #{uid} introuvable")
    payload = _repo.to_resp(r).model_dump(mode="json")
    payload.update(_build_dst_context(r.numero_dst))
    return payload


@router.get("/{uid}/navigation")
def get_demande_navigation(uid: int):
    r = _repo.get_by_uid(uid)
    if not r:
        raise HTTPException(404, f"Demande #{uid} introuvable")
    config = _prep_repo.get_configuration(uid)
    related = _repo.get_navigation_payload(uid)
    preparation = config.preparation.model_dump(mode="json")
    modules = [item.model_dump(mode="json") for item in config.modules]
    enabled_codes = {item["module_code"] for item in modules if item.get("is_enabled")}
    visibility = _build_visibility(enabled_codes)
    linked_items_all = _build_linked_items(r.reference, preparation, related)
    linked_items_visible = _filter_visible_linked_items(linked_items_all, visibility)
    counts_total = {
        **related["counts"],
        "modules_enabled": len(enabled_codes),
    }
    counts_visible = _visible_counts(related["counts"], visibility, enabled_codes)
    return {
        "demande": {**_repo.to_resp(r).model_dump(mode="json"), **_build_dst_context(r.numero_dst)},
        "preparation": preparation,
        "modules": modules,
        "enabled_module_codes": sorted(enabled_codes),
        "visibility": visibility,
        "counts": counts_visible,
        "counts_total": counts_total,
        "interventions": related["interventions"] if visibility.get("interventions") else [],
        "echantillons": related["echantillons"] if visibility.get("echantillons") else [],
        "essais": related["essais"] if visibility.get("essais") else [],
        "linked_items": linked_items_visible,
        "linked_items_total": linked_items_all,
    }


@router.post("", response_model=DemandeRstResponseSchema, status_code=201)
def create_demande(body: DemandeRstCreateSchema):
    r = _repo.add(body)
    return _repo.to_resp(r)


@router.put("/{uid}", response_model=DemandeRstResponseSchema)
def update_demande(uid: int, body: DemandeRstUpdateSchema):
    if not _repo.get_by_uid(uid): raise HTTPException(404, f"Demande #{uid} introuvable")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    return _repo.to_resp(_repo.update(uid, fields))


@router.delete("/{uid}", status_code=204)
def delete_demande(uid: int):
    if not _repo.delete(uid): raise HTTPException(404, f"Demande #{uid} introuvable")
