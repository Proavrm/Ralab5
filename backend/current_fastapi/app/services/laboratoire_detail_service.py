"""Fiche laboratoire — personnel (utilisateurs), équipements, périmètre."""
from __future__ import annotations

from app.repositories.laboratoires_repository import LaboratoireRecord, LaboratoiresRepository
from app.repositories.qualite_repository import _get_db
from app.repositories.security_repository import SecurityRepository
from app.services.laboratoire_org_catalog import (
    build_user_org_association,
    enrich_laboratoire_dict,
    invalidate_org_cache,
    list_org_regions_payload,
    user_service_matches_lab,
)


def _user_brief(row) -> dict:
    return {
        "email": row["email"],
        "display_name": row["display_name"],
        "role_code": row["role_code"],
        "service_code": row["service_code"] or "",
        "employment_level_label": row["employment_level_label"] or "",
        "is_active": bool(row["is_active"]),
    }


def _equipment_stats(lab_code: str) -> dict:
    from app.services.lab_geo_catalog import normalize_labo_code

    code = normalize_labo_code(lab_code)
    con = _get_db()
    try:
        keys = {row[1] for row in con.execute("PRAGMA table_info(qualite_equipment)").fetchall()}
        if "labo_code" not in keys:
            return {"total": 0, "active": 0, "hs": 0, "linked": False}

        total = con.execute(
            "SELECT COUNT(*) FROM qualite_equipment WHERE upper(trim(COALESCE(labo_code, ''))) = ?",
            (code,),
        ).fetchone()[0]
        active = con.execute(
            "SELECT COUNT(*) FROM qualite_equipment WHERE upper(trim(COALESCE(labo_code, ''))) = ? AND status = 'En service'",
            (code,),
        ).fetchone()[0]
        hs = con.execute(
            "SELECT COUNT(*) FROM qualite_equipment WHERE upper(trim(COALESCE(labo_code, ''))) = ? AND status = 'Hors service'",
            (code,),
        ).fetchone()[0]
        unassigned = con.execute(
            "SELECT COUNT(*) FROM qualite_equipment WHERE trim(COALESCE(labo_code, '')) = ''",
        ).fetchone()[0]
    finally:
        con.close()
    return {
        "total": int(total or 0),
        "active": int(active or 0),
        "hs": int(hs or 0),
        "unassigned_total": int(unassigned or 0),
        "linked": True,
    }


def laboratoire_to_dict(record: LaboratoireRecord) -> dict:
    payload = {
        "id": record.id,
        "code": record.code,
        "name": record.nom,
        "region": record.region,
        "agence_code": record.agence_code,
        "is_active": record.actif,
        "address": record.address,
        "report_header": record.report_header,
        "lat": record.lat,
        "lon": record.lon,
        "coords_updated_at": record.coords_updated_at,
        "has_coords": record.lat is not None and record.lon is not None,
        "responsable_email": record.responsable_email,
        "notes": record.notes,
    }
    return enrich_laboratoire_dict(payload)


def build_laboratoire_detail(record: LaboratoireRecord) -> dict:
    security = SecurityRepository()
    all_users = security.list_all_users()
    staff = [
        _user_brief(row)
        for row in all_users
        if user_service_matches_lab(
            row["service_code"],
            record.code,
            record.region,
            record.agence_code,
        )
    ]
    staff_active = [person for person in staff if person["is_active"]]

    responsable = None
    responsable_email = str(record.responsable_email or "").strip().casefold()
    if responsable_email:
        for row in all_users:
            if str(row["email"] or "").strip().casefold() == responsable_email:
                responsable = _user_brief(row)
                break

    payload = laboratoire_to_dict(record)
    payload["responsable"] = responsable
    payload["staff"] = staff
    payload["staff_active_count"] = len(staff_active)
    payload["staff_total_count"] = len(staff)
    payload["equipment"] = _equipment_stats(record.code)
    payload["scope"] = {
        "labo_code": record.code,
        "region": payload.get("region"),
        "region_label": payload.get("region_label"),
        "agence_code": payload.get("agence_code"),
        "agence_label": payload.get("agence_label"),
        "dashboard_rule": "Chaque laboratoire voit ses demandes, équipements et activités rattachés au code labo ; les demandes d'essais partagées restent visibles selon les règles métier.",
        "user_link_field": "service_code",
        "equipment_link_field": "labo_code",
    }
    return payload


def list_laboratoires_summary() -> list[dict]:
    repo = LaboratoiresRepository()
    security = SecurityRepository()
    all_users = security.list_all_users()
    items: list[dict] = []
    for record in repo.list_all():
        summary = laboratoire_to_dict(record)
        staff_rows = [
            row for row in all_users
            if user_service_matches_lab(
                row["service_code"],
                record.code,
                record.region,
                record.agence_code,
            )
        ]
        summary["staff_active_count"] = sum(1 for row in staff_rows if row["is_active"])
        summary["equipment"] = _equipment_stats(record.code)
        responsable_email = str(record.responsable_email or "").strip().casefold()
        if responsable_email:
            for row in all_users:
                if str(row["email"] or "").strip().casefold() == responsable_email:
                    summary["responsable"] = _user_brief(row)
                    break
        items.append(summary)
    return items


def list_laboratoires_with_org() -> dict:
    labs = list_laboratoires_summary()
    org_regions = list_org_regions_payload(labs)
    return {
        "laboratoires": labs,
        "org_regions": org_regions,
        "rst_regions": org_regions,
    }


list_laboratoires_with_rst = list_laboratoires_with_org
