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
from pydantic import BaseModel, Field
from app.models.demande_rst import (
    DemandeRstCreateSchema, DemandeRstResponseSchema, DemandeRstUpdateSchema,
)
from app.repositories.demande_documents_repository import DemandeDocumentsRepository
from app.repositories.demande_prestations_repository import DemandePrestationsRepository
from app.repositories.demande_preparation_repository import DemandePreparationRepository
from app.repositories.demandes_rst_repository import DemandesRstRepository
from app.repositories.passations_repository import PassationsRepository
from app.repositories.affaires_rst_repository import AffairesRstRepository
from app.repositories.dst_repository import DstRepository
from app.services.intervention_campaign_service import list_campaigns_for_demande, list_demande_scope_notes_techniques
from app.services.site_plan_requirements_service import validate_demande_site_plan_requirements

router = APIRouter()
_repo  = DemandesRstRepository()
_prep_repo = DemandePreparationRepository()
_docs_repo = DemandeDocumentsRepository()
_prestations_repo = DemandePrestationsRepository()
_passations_repo = PassationsRepository()
_affaires_repo = AffairesRstRepository()
_dst_repo = DstRepository()


class DemandeDocumentItemSchema(BaseModel):
    document_type: str = ""
    is_received: bool = False
    version: str = ""
    document_date: Optional[str] = None
    comment: str = ""
    stored_path: str = ""
    uploaded_at: Optional[str] = None


class DemandeDocumentsUpdateSchema(BaseModel):
    documents: list[DemandeDocumentItemSchema] = Field(default_factory=list)


class DemandePrestationItemSchema(BaseModel):
    need_code: str = ""
    need_label: str = ""
    description: str = ""
    request_status: str = "À confirmer"
    quantity: str = ""
    notes: str = ""


class DemandePrestationsUpdateSchema(BaseModel):
    prestations: list[DemandePrestationItemSchema] = Field(default_factory=list)


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


def _slugify_text(value: object) -> str:
    text = _normalize_text(value).casefold()
    return "-".join(part for part in text.replace("/", " ").replace("_", " ").split() if part)


def _campaign_signature(item: dict) -> tuple[str, str, str] | None:
    # Campaign auto-detection is disabled for now.
    return None


def _build_campaigns(demande, preparation: dict, related: dict) -> list[dict]:
    grouped: dict[str, dict] = {}

    for item in related.get("interventions", []):
        signature = _campaign_signature(item)
        if signature is None:
            continue

        code, label, designation = signature
        group_key = code.casefold()
        campaign = grouped.get(group_key)
        if campaign is None:
            reference = f"{demande.reference}-{code}" if demande.reference else code
            campaign = {
                "uid": f"demande-{demande.uid}-{_slugify_text(code) or group_key}",
                "code": code,
                "reference": reference,
                "label": label,
                "designation": designation,
                "workflow_label": "Campagne -> Preparation de l'intervention -> Intervention -> Essai -> Rapport",
                "source_mode": "historique_importe",
                "source_label": "Historique importe",
                "target_mode": "manuel",
                "target_label": "Cible manuelle",
                "intervention_count": 0,
                "intervention_uids": [],
                "interventions": [],
                "report_ref": _first_non_empty(demande.rapport_ref),
                "preparation_status": _first_non_empty(preparation.get("phase_operation"), "A cadrer"),
                "next_step": "Structurer la campagne, reprendre la saisie manuelle des valeurs et preparer le rapport.",
                "steps": [
                    {"code": "campagne", "label": "Campagne", "status": "Structuree a la demande"},
                    {"code": "preparation", "label": "Preparation", "status": _first_non_empty(preparation.get("phase_operation"), "A cadrer")},
                    {"code": "intervention", "label": "Interventions", "status": "A planifier"},
                    {"code": "essai", "label": "Essai", "status": "Saisie manuelle a reprendre"},
                    {"code": "rapport", "label": "Rapport", "status": _first_non_empty(demande.rapport_ref, "A produire")},
                ],
            }
            grouped[group_key] = campaign

        campaign["intervention_count"] += 1
        campaign["intervention_uids"].append(item.get("uid"))
        campaign["interventions"].append({
            "uid": item.get("uid"),
            "reference": item.get("reference") or "",
            "date_intervention": item.get("date_intervention") or "",
            "type_intervention": item.get("type_intervention") or "",
            "sujet": item.get("sujet") or "",
            "statut": item.get("statut") or "",
            "rapport_ref": item.get("rapport_ref") or "",
        })

    campaigns = list(grouped.values())
    for campaign in campaigns:
        campaign["interventions"].sort(
            key=lambda item: (
                str(item.get("date_intervention") or ""),
                str(item.get("reference") or ""),
                int(item.get("uid") or 0),
            )
        )
        intervention_count = campaign["intervention_count"]
        campaign["steps"][2]["status"] = f"{intervention_count} intervention(s) disponibles"

    campaigns.sort(key=lambda item: (str(item.get("code") or ""), str(item.get("reference") or "")))
    return campaigns


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
        "dst_service": record.first_text("Service"),
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
        "dst_documents_fournis": record.first_text("Liste des documents fournis"),
        "dst_lien_pieces_jointes": record.first_text("Lien d'accès pièces jointes volumineuses"),
        "dst_objet_demande": record.first_text("Objet de la demande (Problématiques, Hypothèses, Objectifs, Remarques)", "Objet"),
    }


def _build_linked_items(demande_ref: str, preparation: dict, related: dict) -> list[dict]:
    items: list[dict] = []
    if preparation:
        items.append({
            "type": "Préparation",
            "reference": preparation.get("reference") or "",
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
        designation = _first_non_empty(item.get("sujet"), item.get("type_intervention"), "Intervention")
        raw_intervention_count = int(item.get("raw_intervention_count") or 0)
        if item.get("nature_reelle") == "Sondage" and raw_intervention_count > 1:
            designation = f"{designation} ({raw_intervention_count} sondages)"
        items.append({
            "type": "Intervention",
            "reference": item.get("reference") or "",
            "designation": designation,
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


def _build_visibility(enabled_codes: set[str], has_campaigns: bool = False) -> dict[str, bool]:
    echantillons_visible = any(code in enabled_codes for code in ("echantillons", "essais_laboratoire"))
    essais_visible = "essais_laboratoire" in enabled_codes
    interventions_visible = "interventions" in enabled_codes
    essais_terrain_visible = "essais_terrain" in enabled_codes
    return {
        "preparation": True,
        # Campagnes are created manually; keep the section visible even when empty.
        "campagnes": "interventions" in enabled_codes or has_campaigns,
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
        "campagnes": int(related_counts.get("campagnes") or 0) if visibility.get("campagnes") else 0,
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
    campaigns = list_campaigns_for_demande(uid, preparation.get("phase_operation") or "")
    notes_techniques = list_demande_scope_notes_techniques(uid)
    if not campaigns and related.get("interventions"):
        campaigns = _build_campaigns(r, preparation, related)
    related_counts = {
        **related["counts"],
        "campagnes": len(campaigns),
    }
    visibility = _build_visibility(enabled_codes, has_campaigns=bool(campaigns))
    linked_items_all = _build_linked_items(r.reference, preparation, related)
    linked_items_visible = _filter_visible_linked_items(linked_items_all, visibility)
    counts_total = {
        **related_counts,
        "modules_enabled": len(enabled_codes),
    }
    counts_visible = _visible_counts(related_counts, visibility, enabled_codes)
    passation_uid = None
    passation_reference = ""
    with _repo._connect() as conn:
        source_row = conn.execute("SELECT passation_source_id FROM demandes WHERE id=?", (uid,)).fetchone()
        if source_row and source_row["passation_source_id"]:
            passation_uid = int(source_row["passation_source_id"])
            passation_row = conn.execute("SELECT reference FROM passations WHERE id=?", (passation_uid,)).fetchone()
            if passation_row:
                passation_reference = passation_row["reference"] or ""
    documents = _docs_repo.list_for_demande(uid)
    demande_prestations: list[dict] = []
    passation_prestations: list[dict] = []
    passation_date_passation = ""
    passation_date_debut_travaux_prevue = ""
    passation_created_at = ""
    affaire_date_debut_travaux_prevue = ""
    if r.affaire_rst_id:
        affaire = _affaires_repo.get_by_uid(int(r.affaire_rst_id))
        if affaire and affaire.date_debut_travaux_prevue:
            affaire_date_debut_travaux_prevue = affaire.date_debut_travaux_prevue.isoformat()
    if passation_uid:
        passation = _passations_repo.get_by_uid(passation_uid)
        if passation:
            passation_date_passation = passation.date_passation.isoformat() if passation.date_passation else ""
            if passation.date_debut_travaux_prevue:
                passation_date_debut_travaux_prevue = passation.date_debut_travaux_prevue.isoformat()
            passation_created_at = (passation.created_at or "")[:10]
            passation_prestations = [
                {
                    "uid": item.uid,
                    "need_code": item.need_code,
                    "need_label": item.need_label,
                    "description": item.description,
                    "request_status": item.request_status,
                    "quantity": item.quantity,
                    "notes": item.notes,
                }
                for item in passation.structured_needs
            ]
    else:
        demande_prestations = _prestations_repo.list_for_demande(uid)
    return {
        "demande": {**_repo.to_resp(r).model_dump(mode="json"), **_build_dst_context(r.numero_dst)},
        "preparation": preparation,
        "family_catalog": _prep_repo.family_catalog(),
        "modules": modules,
        "enabled_module_codes": sorted(enabled_codes),
        "enabled_family_codes": list(preparation.get("familles_prevues") or []),
        "visibility": visibility,
        "counts": counts_visible,
        "counts_total": counts_total,
        "campagnes": campaigns,
        "campagnes_total": campaigns,
        "notes_techniques": notes_techniques,
        # Interventions are returned for campaign fallback/grouping on demande sheet.
        "interventions": related["interventions"],
        "plans_implantation": related.get("plans_implantation") or [],
        "nivellements": related.get("nivellements") or [],
        "echantillons": related["echantillons"] if visibility.get("echantillons") else [],
        "essais": related["essais"] if visibility.get("essais") else [],
        "linked_items": linked_items_visible,
        "linked_items_total": linked_items_all,
        "passation_uid": passation_uid,
        "passation_reference": passation_reference,
        "passation_date_passation": passation_date_passation,
        "passation_date_debut_travaux_prevue": passation_date_debut_travaux_prevue,
        "passation_created_at": passation_created_at,
        "affaire_date_debut_travaux_prevue": affaire_date_debut_travaux_prevue,
        "passation_prestations": passation_prestations,
        "demande_prestations": demande_prestations,
        "documents": documents,
    }


@router.post("", response_model=DemandeRstResponseSchema, status_code=201)
def create_demande(body: DemandeRstCreateSchema):
    r = _repo.add(body)
    if body.documents_fournis:
        _docs_repo.seed_from_documents_fournis(r.uid, body.documents_fournis)
    return _repo.to_resp(r)


@router.put("/{uid}", response_model=DemandeRstResponseSchema)
def update_demande(uid: int, body: DemandeRstUpdateSchema):
    if not _repo.get_by_uid(uid): raise HTTPException(404, f"Demande #{uid} introuvable")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    return _repo.to_resp(_repo.update(uid, fields))


@router.put("/{uid}/prestations")
def update_demande_prestations(uid: int, body: DemandePrestationsUpdateSchema):
    if not _repo.get_by_uid(uid):
        raise HTTPException(404, f"Demande #{uid} introuvable")
    with _repo._connect() as conn:
        source_row = conn.execute("SELECT passation_source_id FROM demandes WHERE id=?", (uid,)).fetchone()
        if source_row and source_row["passation_source_id"]:
            raise HTTPException(
                409,
                "Les prestations d'une demande issue de passation sont figées sur la passation d'origine.",
            )
    payload = [item.model_dump(mode="json") for item in body.prestations]
    return {"prestations": _prestations_repo.replace_for_demande(uid, payload)}


@router.put("/{uid}/documents")
def update_demande_documents(uid: int, body: DemandeDocumentsUpdateSchema):
    record = _repo.get_by_uid(uid)
    if not record:
        raise HTTPException(404, f"Demande #{uid} introuvable")
    payload = [item.model_dump(mode="json") for item in body.documents]

    passation_uid = None
    passation_documents: list[dict] = []
    with _repo._connect() as conn:
        source_row = conn.execute(
            "SELECT passation_source_id FROM demandes WHERE id = ?",
            (uid,),
        ).fetchone()
        if source_row and source_row["passation_source_id"]:
            passation_uid = int(source_row["passation_source_id"])
    if passation_uid:
        passation = _passations_repo.get_by_uid(passation_uid)
        if passation:
            passation_documents = [
                {"document_type": doc.document_type, "stored_path": doc.stored_path}
                for doc in (passation.documents or [])
            ]

    try:
        validate_demande_site_plan_requirements(
            adresse_ouvrage=record.adresse_ouvrage,
            demande_documents=payload,
            passation_uid=passation_uid,
            passation_documents=passation_documents,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    return {"documents": _docs_repo.replace_for_demande(uid, payload)}


@router.delete("/{uid}", status_code=204)
def delete_demande(uid: int):
    if not _repo.delete(uid): raise HTTPException(404, f"Demande #{uid} introuvable")
