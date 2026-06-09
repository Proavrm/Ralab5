"""
api/interventions.py — RaLab4
GET    /api/interventions?demande_id=X&annee=YYYY&labo_code=SP
GET    /api/interventions/{uid}
POST   /api/interventions
PUT    /api/interventions/{uid}
DELETE /api/interventions/{uid}
"""
from __future__ import annotations

import json
import re
import sqlite3
from datetime import date, datetime
from typing import Optional

from app.core.database import ensure_ralab4_schema, get_db_path
from app.services.work_assignment_service import sync_intervention_assignment
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter()
DB_PATH = get_db_path()

TYPES = [
    "Visite de contrôle", "Auscultation", "Levé topographique", "Prélèvement",
    "Inspection géotechnique", "Essai in situ", "Réunion de chantier", "Autre",
]
STATUTS = ["Planifiée", "En cours", "Réalisée", "Annulée"]
ALERTES = ["Aucun", "Faible", "Moyen", "Élevé", "Critique"]
DEFAULT_NATURE_REELLE = "Intervention"


class InterventionCreate(BaseModel):
    demande_id: int
    campaign_id: Optional[int] = Field(None)
    campagne_id: Optional[int] = Field(None)
    type_intervention: str = Field("Visite de contrôle")
    sujet: str = Field("")
    date_intervention: date = Field(default_factory=date.today)
    duree_heures: Optional[float] = Field(None)
    geotechnicien: str = Field("")
    technicien: str = Field("")
    observations: str = Field("")
    anomalie_detectee: bool = Field(False)
    niveau_alerte: str = Field("Aucun")
    pv_ref: str = Field("")
    rapport_ref: str = Field("")
    photos_dossier: str = Field("")
    statut: str = Field("Planifiée")
    finalite: str = Field("")
    zone: str = Field("")
    heure_debut: str = Field("")
    heure_fin: str = Field("")


class InterventionUpdate(BaseModel):
    campaign_id: Optional[int] = None
    campagne_id: Optional[int] = None
    type_intervention: Optional[str] = None
    sujet: Optional[str] = None
    date_intervention: Optional[date] = None
    duree_heures: Optional[float] = None
    geotechnicien: Optional[str] = None
    technicien: Optional[str] = None
    observations: Optional[str] = None
    anomalie_detectee: Optional[bool] = None
    niveau_alerte: Optional[str] = None
    pv_ref: Optional[str] = None
    rapport_ref: Optional[str] = None
    photos_dossier: Optional[str] = None
    statut: Optional[str] = None
    finalite: Optional[str] = None
    zone: Optional[str] = None
    heure_debut: Optional[str] = None
    heure_fin: Optional[str] = None


def _conn():
    ensure_ralab4_schema(DB_PATH)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _resolve_campaign_id(conn: sqlite3.Connection, campaign_id: Optional[int], demande_id: int) -> Optional[int]:
    if not campaign_id:
        return None
    row = conn.execute("SELECT id, demande_id FROM campagnes WHERE id = ?", (campaign_id,)).fetchone()
    if row is None:
        raise HTTPException(404, f"Campagne #{campaign_id} introuvable")
    if int(row["demande_id"] or 0) != int(demande_id):
        raise HTTPException(400, "La campagne sélectionnée n'appartient pas à cette demande")
    return int(row["id"])


def _enabled_module_codes(conn: sqlite3.Connection, demande_id: int) -> set[str]:
    rows = conn.execute(
        "SELECT module_code FROM demande_enabled_modules WHERE demande_id = ? AND is_enabled = 1",
        (demande_id,),
    ).fetchall()
    return {str(row["module_code"]) for row in rows}


def _interventions_enabled(conn: sqlite3.Connection, demande_id: int) -> bool:
    return "interventions" in _enabled_module_codes(conn, demande_id)


def _require_interventions_enabled(conn: sqlite3.Connection, demande_id: int):
    if not _interventions_enabled(conn, demande_id):
        raise HTTPException(403, "Le module Interventions terrain n'est pas activé sur cette demande")


def _demande_id_for_intervention(conn: sqlite3.Connection, uid: int) -> Optional[int]:
    row = conn.execute("SELECT demande_id FROM interventions WHERE id = ?", (uid,)).fetchone()
    return int(row["demande_id"]) if row else None


def _table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {str(row["name"] if isinstance(row, sqlite3.Row) else row[1]) for row in rows}


def _next_ref(conn, demande_id: int) -> tuple[str, int, str, int]:
    row = conn.execute("SELECT d.annee, d.labo_code FROM demandes d WHERE d.id = ?", (demande_id,)).fetchone()
    annee = row["annee"] if row else datetime.now().year
    labo = row["labo_code"] if row else "SP"
    prefix = f"{annee}-{labo}-I"
    rows = conn.execute("SELECT reference FROM interventions WHERE reference LIKE ?", (f"{prefix}%",)).fetchall()
    nums = []
    for row in rows:
        match = re.match(rf"^{re.escape(prefix)}(\d+)$", row[0])
        if match:
            nums.append(int(match.group(1)))
    number = max(nums, default=0) + 1
    return f"{prefix}{number:04d}", annee, labo, number


def _extract_obs_metadata(observations: str) -> tuple[str, str]:
    if not isinstance(observations, str):
        return "", ""
    raw = observations.strip()
    if not raw or not raw.startswith("{"):
        return "", ""
    try:
        payload = json.loads(raw)
    except Exception:
        return "", ""
    essai_code = str(payload.get("essai_code") or payload.get("code_essai") or payload.get("source_essai_code") or "").strip()
    essai_label = str(payload.get("essai_label") or payload.get("label") or payload.get("libelle") or "").strip()
    return essai_code, essai_label


def _row_to_dict(row) -> dict:
    data = dict(row)
    data["uid"] = data.pop("id")
    essai_code, essai_label = _extract_obs_metadata(data.get("observations") or "")
    data["essai_code"] = essai_code
    data["code_essai"] = essai_code
    data["essai_label"] = essai_label
    data["campaign_id"] = data.get("campagne_id")
    data["intervention_reelle_id"] = data["uid"]
    data["intervention_reelle_reference"] = data.get("reference") or ""
    return data


def _base_select() -> str:
    return """
        SELECT
            i.*,
            COALESCE(c.code, '') AS campaign_code,
            COALESCE(c.reference, '') AS campaign_ref,
            COALESCE(c.label, '') AS campaign_label,
            COALESCE(c.designation, '') AS campaign_designation,
            d.id AS demande_id,
            d.reference AS demande_ref,
            d.reference AS demande_reference,
            d.affaire_rst_id AS affaire_rst_id,
            a.reference AS affaire_ref,
            a.reference AS affaire_reference,
            a.client AS client,
            a.chantier AS chantier,
            a.site AS site
        FROM interventions i
        LEFT JOIN campagnes c ON c.id = i.campagne_id
        JOIN demandes d ON d.id = i.demande_id
        LEFT JOIN affaires_rst a ON a.id = d.affaire_rst_id
    """


@router.get("")
def list_interventions(
    demande_id: Optional[int] = Query(None),
    annee: Optional[int] = Query(None),
    labo_code: Optional[str] = Query(None),
    statut: Optional[str] = Query(None),
):
    with _conn() as conn:
        if demande_id and not _interventions_enabled(conn, demande_id):
            return []
        sql = _base_select() + " WHERE 1=1"
        params = []
        if demande_id:
            sql += " AND i.demande_id = ?"
            params.append(demande_id)
        if annee is not None:
            sql += " AND COALESCE(NULLIF(substr(COALESCE(i.date_intervention, ''), 1, 4), ''), CAST(i.annee AS TEXT)) = ?"
            params.append(str(annee))
        if labo_code:
            sql += " AND i.labo_code = ?"
            params.append(labo_code)
        if statut:
            sql += " AND i.statut = ?"
            params.append(statut)
        sql += " ORDER BY i.date_intervention DESC, i.id DESC"
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(row) for row in rows]


@router.get("/meta")
def meta():
    return {"types": TYPES, "statuts": STATUTS, "alertes": ALERTES}


@router.get("/{uid}")
def get_intervention(uid: int):
    with _conn() as conn:
        row = conn.execute(_base_select() + " WHERE i.id = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, f"Intervention #{uid} introuvable")
        _require_interventions_enabled(conn, int(row["demande_id"]))
    return _row_to_dict(row)


def _linked_prelevements(
    conn: sqlite3.Connection,
    intervention_uid: int,
    direct_prelevement_id: Optional[int],
    *,
    point_ids: list[int],
    couche_ids: list[int],
) -> list[dict]:
    prelevement_ids: set[int] = set()
    if direct_prelevement_id:
        prelevement_ids.add(int(direct_prelevement_id))

    rows_by_intervention = conn.execute(
        "SELECT id FROM prelevements WHERE intervention_id = ?",
        (intervention_uid,),
    ).fetchall()
    for row in rows_by_intervention:
        prelevement_ids.add(int(row["id"]))

    prelevements_cols = _table_columns(conn, "prelevements")
    if "point_terrain_id" in prelevements_cols and point_ids:
        placeholders = ",".join("?" for _ in point_ids)
        point_rows = conn.execute(
            f"SELECT id FROM prelevements WHERE point_terrain_id IN ({placeholders})",
            tuple(point_ids),
        ).fetchall()
        for row in point_rows:
            prelevement_ids.add(int(row["id"]))

    if "sondage_couche_id" in prelevements_cols and couche_ids:
        placeholders = ",".join("?" for _ in couche_ids)
        couche_rows = conn.execute(
            f"SELECT id FROM prelevements WHERE sondage_couche_id IN ({placeholders})",
            tuple(couche_ids),
        ).fetchall()
        for row in couche_rows:
            prelevement_ids.add(int(row["id"]))

    if not prelevement_ids:
        return []

    placeholders = ",".join("?" for _ in prelevement_ids)
    prelevements_cols = _table_columns(conn, "prelevements")
    point_col_sql = "p.point_terrain_id" if "point_terrain_id" in prelevements_cols else "NULL"
    couche_col_sql = "p.sondage_couche_id" if "sondage_couche_id" in prelevements_cols else "NULL"

    rows = conn.execute(
        f"""
        SELECT
            p.id,
            p.reference,
            p.description,
            p.quantite,
            p.zone,
            p.materiau,
            p.statut,
            p.intervention_id,
            {point_col_sql} AS point_terrain_id,
            {couche_col_sql} AS sondage_couche_id,
            COALESCE(ec.echantillon_count, 0) AS echantillon_count,
            COALESCE(es.essai_count, 0) AS essai_count
        FROM prelevements p
        LEFT JOIN (
            SELECT prelevement_id, COUNT(*) AS echantillon_count
            FROM echantillons
            WHERE prelevement_id IS NOT NULL
            GROUP BY prelevement_id
        ) ec ON ec.prelevement_id = p.id
        LEFT JOIN (
            SELECT ech.prelevement_id AS prelevement_id, COUNT(e.id) AS essai_count
            FROM echantillons ech
            LEFT JOIN essais e ON e.echantillon_id = ech.id
            WHERE ech.prelevement_id IS NOT NULL
            GROUP BY ech.prelevement_id
        ) es ON es.prelevement_id = p.id
        WHERE p.id IN ({placeholders})
        ORDER BY p.id DESC
        """,
        tuple(prelevement_ids),
    ).fetchall()

    return [
        {
            "uid": int(row["id"]),
            "reference": row["reference"] or "",
            "description": row["description"] or "",
            "quantite": row["quantite"] or "",
            "zone": row["zone"] or "",
            "materiau": row["materiau"] or "",
            "statut": row["statut"] or "",
            "intervention_id": row["intervention_id"],
            "intervention_reelle_id": row["intervention_id"],
            "point_terrain_id": row["point_terrain_id"],
            "sondage_couche_id": row["sondage_couche_id"],
            "echantillon_count": int(row["echantillon_count"] or 0),
            "essai_count": int(row["essai_count"] or 0),
        }
        for row in rows
    ]


def _linked_echantillons(conn: sqlite3.Connection, intervention_uid: int, prelevements: list[dict]) -> list[dict]:
    prelevement_ids = [int(item["uid"]) for item in prelevements if item.get("uid") is not None]
    params: list[object] = [intervention_uid]
    where = "ech.intervention_id = ?"
    if prelevement_ids:
        placeholders = ",".join("?" for _ in prelevement_ids)
        where += f" OR ech.prelevement_id IN ({placeholders})"
        params.extend(prelevement_ids)

    rows = conn.execute(
        f"""
        SELECT
            ech.id,
            ech.reference,
            ech.designation,
            ech.localisation,
            ech.statut,
            ech.prelevement_id,
            ech.intervention_id,
            COALESCE((SELECT COUNT(*) FROM essais es WHERE es.echantillon_id = ech.id), 0) AS essai_count
        FROM echantillons ech
        WHERE {where}
        ORDER BY ech.id DESC
        """,
        tuple(params),
    ).fetchall()

    return [
        {
            "uid": int(row["id"]),
            "reference": row["reference"] or "",
            "designation": row["designation"] or "",
            "localisation": row["localisation"] or "",
            "statut": row["statut"] or "",
            "prelevement_id": row["prelevement_id"],
            "intervention_id": row["intervention_id"],
            "intervention_reelle_id": row["intervention_id"],
            "essai_count": int(row["essai_count"] or 0),
        }
        for row in rows
    ]


def _linked_essais(conn: sqlite3.Connection, intervention_uid: int, echantillons: list[dict]) -> list[dict]:
    echantillon_ids = [int(item["uid"]) for item in echantillons if item.get("uid") is not None]
    params: list[object] = [intervention_uid]
    where = "e.intervention_id = ?"
    if echantillon_ids:
        placeholders = ",".join("?" for _ in echantillon_ids)
        where += f" OR e.echantillon_id IN ({placeholders})"
        params.extend(echantillon_ids)

    rows = conn.execute(
        f"""
        SELECT
            e.id,
            COALESCE(NULLIF(e.source_label, ''), NULLIF(e.type_essai, ''), NULLIF(e.essai_code, ''), '') AS reference,
            e.essai_code,
            e.type_essai,
            e.statut,
            e.intervention_id,
            e.echantillon_id,
            e.source_label,
            e.resultat_principal,
            e.resultat_unite,
            e.resultat_label
        FROM essais e
        WHERE {where}
        ORDER BY e.id DESC
        """,
        tuple(params),
    ).fetchall()

    return [
        {
            "uid": int(row["id"]),
            "reference": row["reference"] or "",
            "essai_code": row["essai_code"] or "",
            "code_essai": row["essai_code"] or "",
            "type_essai": row["type_essai"] or "",
            "statut": row["statut"] or "",
            "intervention_id": row["intervention_id"],
            "intervention_reelle_id": row["intervention_id"],
            "echantillon_id": row["echantillon_id"],
            "source_label": row["source_label"] or "",
            "resultat_principal": row["resultat_principal"],
            "resultat_unite": row["resultat_unite"] or "",
            "resultat_label": row["resultat_label"] or "",
        }
        for row in rows
    ]


def _linked_feuilles_terrain(conn: sqlite3.Connection, intervention_uid: int) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
            f.id,
            f.serie_id,
            f.reference,
            f.code_feuille,
            f.label,
            f.date_feuille,
            f.statut,
            f.intervention_id,
            COALESCE((
                SELECT COUNT(*)
                FROM points_terrain pt
                WHERE pt.serie_id = f.serie_id
            ), 0) AS points_count
        FROM feuilles_terrain f
        WHERE f.intervention_id = ?
        ORDER BY f.id DESC
        """,
        (intervention_uid,),
    ).fetchall()

    return [
        {
            "uid": int(row["id"]),
            "serie_id": row["serie_id"],
            "reference": row["reference"] or "",
            "code_feuille": row["code_feuille"] or "",
            "label": row["label"] or "",
            "date_feuille": row["date_feuille"] or "",
            "statut": row["statut"] or "",
            "intervention_id": row["intervention_id"],
            "intervention_reelle_id": row["intervention_id"],
            "points_count": int(row["points_count"] or 0),
        }
        for row in rows
    ]


def _support_scope(campagne_id: Optional[int], intervention_id: Optional[int]) -> str:
    if intervention_id:
        return 'intervention'
    if campagne_id:
        return 'campagne'
    return 'demande'


def _support_origin_label(scope: str, reference: str, uid: Optional[int]) -> str:
    fallback = f'#{uid}' if uid else ''
    if scope == 'intervention':
        return f'Intervention {reference or fallback}'.strip()
    if scope == 'campagne':
        return f'Campagne {reference or fallback}'.strip()
    return f'Demande {reference or fallback}'.strip()


def _support_scope_for_current(
    current_intervention_uid: int,
    current_campagne_id: Optional[int],
    item_campagne_id: Optional[int],
    item_intervention_id: Optional[int],
) -> str:
    if item_intervention_id and int(item_intervention_id) == int(current_intervention_uid):
        return 'intervention'
    if current_campagne_id and item_campagne_id and int(item_campagne_id) == int(current_campagne_id):
        return 'campagne'
    return _support_scope(item_campagne_id, item_intervention_id)


def _linked_plans_implantation(
    conn: sqlite3.Connection,
    intervention_uid: int,
    demande_id: int,
    campagne_id: Optional[int],
) -> list[dict]:
    rows = conn.execute(
        '''
        SELECT
            p.id,
            p.reference,
            p.titre,
            p.date_plan,
            p.statut,
            p.demande_id,
            p.campagne_id,
            p.intervention_id,
            d.reference AS demande_reference,
            c.reference AS campagne_reference,
            owner.reference AS owner_intervention_reference,
            COALESCE((
                SELECT COUNT(*)
                FROM plan_implantation_points pip
                WHERE pip.plan_implantation_id = p.id
            ), 0) AS points_count
        FROM plans_implantation p
        LEFT JOIN demandes d ON d.id = p.demande_id
        LEFT JOIN campagnes c ON c.id = p.campagne_id
        LEFT JOIN interventions owner ON owner.id = p.intervention_id
        WHERE p.demande_id = ?
        AND p.intervention_id = ?
        ORDER BY
            p.id DESC
        ''',
        (
            demande_id,
            intervention_uid,
        ),
    ).fetchall()

    result: list[dict] = []
    for row in rows:
        scope = _support_scope_for_current(intervention_uid, campagne_id, row['campagne_id'], row['intervention_id'])
        origin_ref = row['owner_intervention_reference'] if scope == 'intervention' else (
            row['campagne_reference'] if scope == 'campagne' else row['demande_reference']
        )
        origin_uid = row['intervention_id'] if scope == 'intervention' else (row['campagne_id'] if scope == 'campagne' else row['demande_id'])
        result.append({
            'uid': int(row['id']),
            'reference': row['reference'] or '',
            'titre': row['titre'] or '',
            'date_plan': row['date_plan'] or '',
            'statut': row['statut'] or '',
            'demande_id': row['demande_id'],
            'campagne_id': row['campagne_id'],
            'intervention_id': row['intervention_id'],
            'ownership_scope': scope,
            'ownership_origin_label': _support_origin_label(scope, origin_ref or '', origin_uid),
            'is_owner_intervention': int(row['intervention_id'] or 0) == int(intervention_uid),
            'points_count': int(row['points_count'] or 0),
        })
    return result


def _linked_nivellements(
    conn: sqlite3.Connection,
    intervention_uid: int,
    demande_id: int,
    campagne_id: Optional[int],
) -> list[dict]:
    rows = conn.execute(
        '''
        SELECT
            n.id,
            n.reference,
            n.titre,
            n.date_releve,
            n.statut,
            n.demande_id,
            n.campagne_id,
            n.intervention_id,
            d.reference AS demande_reference,
            c.reference AS campagne_reference,
            owner.reference AS owner_intervention_reference,
            COALESCE((
                SELECT COUNT(*)
                FROM nivellement_points np
                WHERE np.nivellement_id = n.id
            ), 0) AS points_count
        FROM nivellements n
        LEFT JOIN demandes d ON d.id = n.demande_id
        LEFT JOIN campagnes c ON c.id = n.campagne_id
        LEFT JOIN interventions owner ON owner.id = n.intervention_id
        WHERE n.demande_id = ?
        AND n.intervention_id = ?
        ORDER BY
            n.id DESC
        ''',
        (
            demande_id,
            intervention_uid,
        ),
    ).fetchall()

    result: list[dict] = []
    for row in rows:
        scope = _support_scope_for_current(intervention_uid, campagne_id, row['campagne_id'], row['intervention_id'])
        origin_ref = row['owner_intervention_reference'] if scope == 'intervention' else (
            row['campagne_reference'] if scope == 'campagne' else row['demande_reference']
        )
        origin_uid = row['intervention_id'] if scope == 'intervention' else (row['campagne_id'] if scope == 'campagne' else row['demande_id'])
        result.append({
            'uid': int(row['id']),
            'reference': row['reference'] or '',
            'titre': row['titre'] or '',
            'date_releve': row['date_releve'] or '',
            'statut': row['statut'] or '',
            'demande_id': row['demande_id'],
            'campagne_id': row['campagne_id'],
            'intervention_id': row['intervention_id'],
            'ownership_scope': scope,
            'ownership_origin_label': _support_origin_label(scope, origin_ref or '', origin_uid),
            'is_owner_intervention': int(row['intervention_id'] or 0) == int(intervention_uid),
            'points_count': int(row['points_count'] or 0),
        })
    return result


def _linked_points_terrain(conn: sqlite3.Connection, feuilles_terrain: list[dict]) -> list[dict]:
    serie_ids = [int(item["serie_id"]) for item in feuilles_terrain if item.get("serie_id") is not None]
    if not serie_ids:
        return []

    placeholders = ",".join("?" for _ in serie_ids)
    rows = conn.execute(
        f"""
        SELECT
            pt.id,
            pt.serie_id,
            pt.point_code,
            pt.point_type,
            pt.ordre,
            pt.profondeur_bas,
            COALESCE((
                SELECT COUNT(*)
                FROM sondage_couches sc
                WHERE sc.point_terrain_id = pt.id
            ), 0) AS couches_count
        FROM points_terrain pt
        WHERE pt.serie_id IN ({placeholders})
        ORDER BY pt.id DESC
        """,
        tuple(serie_ids),
    ).fetchall()

    return [
        {
            "uid": int(row["id"]),
            "serie_id": row["serie_id"],
            "point_code": row["point_code"] or "",
            "point_type": row["point_type"] or "",
            "ordre": int(row["ordre"] or 0),
            "profondeur_bas": row["profondeur_bas"],
            "couches_count": int(row["couches_count"] or 0),
        }
        for row in rows
    ]


def _linked_couches(conn: sqlite3.Connection, points_terrain: list[dict]) -> list[dict]:
    point_ids = [int(item["uid"]) for item in points_terrain if item.get("uid") is not None]
    if not point_ids:
        return []

    placeholders = ",".join("?" for _ in point_ids)
    rows = conn.execute(
        f"""
        SELECT
            sc.id,
            sc.point_terrain_id,
            sc.ordre,
            sc.description_libre,
            sc.z_haut,
            sc.z_bas
        FROM sondage_couches sc
        WHERE sc.point_terrain_id IN ({placeholders})
        ORDER BY sc.id DESC
        """,
        tuple(point_ids),
    ).fetchall()

    return [
        {
            "uid": int(row["id"]),
            "point_terrain_id": row["point_terrain_id"],
            "ordre": int(row["ordre"] or 0),
            "description_libre": row["description_libre"] or "",
            "z_haut": row["z_haut"],
            "z_bas": row["z_bas"],
        }
        for row in rows
    ]


@router.get("/{uid}/linked-chain")
def get_intervention_linked_chain(uid: int):
    with _conn() as conn:
        row = conn.execute(_base_select() + " WHERE i.id = ?", (uid,)).fetchone()
        if not row:
            raise HTTPException(404, f"Intervention #{uid} introuvable")
        _require_interventions_enabled(conn, int(row["demande_id"]))

        direct_prelevement_id = row["prelevement_id"] if "prelevement_id" in row.keys() else None
        plans_implantation = _linked_plans_implantation(conn, uid, int(row['demande_id']), row['campagne_id'])
        nivellements = _linked_nivellements(conn, uid, int(row['demande_id']), row['campagne_id'])
        feuilles_terrain = _linked_feuilles_terrain(conn, uid)
        points_terrain = _linked_points_terrain(conn, feuilles_terrain)
        couches_terrain = _linked_couches(conn, points_terrain)

        prelevements = _linked_prelevements(
            conn,
            uid,
            direct_prelevement_id,
            point_ids=[int(item["uid"]) for item in points_terrain],
            couche_ids=[int(item["uid"]) for item in couches_terrain],
        )
        echantillons = _linked_echantillons(conn, uid, prelevements)
        essais = _linked_essais(conn, uid, echantillons)

    return {
        "intervention_uid": uid,
        "plans_implantation": plans_implantation,
        "nivellements": nivellements,
        "feuilles_terrain": feuilles_terrain,
        "points_terrain": points_terrain,
        "couches_terrain": couches_terrain,
        "prelevements": prelevements,
        "echantillons": echantillons,
        "essais": essais,
    }


@router.post("", status_code=201)
def create_intervention(body: InterventionCreate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _conn() as conn:
        _require_interventions_enabled(conn, body.demande_id)
        requested_campaign_id = body.campagne_id or body.campaign_id
        campagne_id = _resolve_campaign_id(conn, requested_campaign_id, body.demande_id)
        ref, annee, labo, numero = _next_ref(conn, body.demande_id)
        conn.execute(
            """
            INSERT INTO interventions (
                reference, annee, labo_code, numero, demande_id, campagne_id,
                type_intervention, sujet, date_intervention, duree_heures,
                geotechnicien, technicien, observations, anomalie_detectee,
                niveau_alerte, pv_ref, rapport_ref, photos_dossier, statut,
                nature_reelle, finalite, zone, heure_debut, heure_fin,
                tri_updated_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ref, annee, labo, numero, body.demande_id, campagne_id,
                body.type_intervention, body.sujet, body.date_intervention.isoformat(), body.duree_heures,
                body.geotechnicien, body.technicien, body.observations,
                1 if body.anomalie_detectee else 0, body.niveau_alerte,
                body.pv_ref, body.rapport_ref, body.photos_dossier, body.statut,
                DEFAULT_NATURE_REELLE, body.finalite, body.zone, body.heure_debut, body.heure_fin,
                now, now, now,
            ),
        )
        uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        assignment_row = conn.execute(
            """
            SELECT i.id, i.reference, i.technicien, i.date_intervention, i.demande_id, d.affaire_rst_id
            FROM interventions i
            LEFT JOIN demandes d ON d.id = i.demande_id
            WHERE i.id = ?
            """,
            (uid,),
        ).fetchone()
        if assignment_row:
            sync_intervention_assignment(conn, assignment_row)
    return get_intervention(int(uid))


@router.put("/{uid}")
def update_intervention(uid: int, body: InterventionUpdate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    fields = {key: value for key, value in body.model_dump().items() if value is not None}
    if "date_intervention" in fields and isinstance(fields["date_intervention"], date):
        fields["date_intervention"] = fields["date_intervention"].isoformat()
    if "anomalie_detectee" in fields:
        fields["anomalie_detectee"] = 1 if fields["anomalie_detectee"] else 0
    requested_campaign_id = fields.pop("campagne_id", None) or fields.pop("campaign_id", None)
    fields["updated_at"] = now
    with _conn() as conn:
        demande_id = _demande_id_for_intervention(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Intervention #{uid} introuvable")
        _require_interventions_enabled(conn, demande_id)
        if requested_campaign_id is not None:
            fields["campagne_id"] = _resolve_campaign_id(conn, requested_campaign_id, demande_id)
        clause = ", ".join(f"{key} = ?" for key in fields)
        if clause:
            conn.execute(f"UPDATE interventions SET {clause} WHERE id = ?", list(fields.values()) + [uid])
        conn.execute(
            """
            UPDATE interventions
            SET nature_reelle = ?, tri_updated_at = ?
            WHERE id = ? AND COALESCE(NULLIF(nature_reelle, ''), '') = ''
            """,
            (DEFAULT_NATURE_REELLE, now, uid),
        )
        assignment_row = conn.execute(
            """
            SELECT i.id, i.reference, i.technicien, i.date_intervention, i.demande_id, d.affaire_rst_id
            FROM interventions i
            LEFT JOIN demandes d ON d.id = i.demande_id
            WHERE i.id = ?
            """,
            (uid,),
        ).fetchone()
        if assignment_row:
            sync_intervention_assignment(conn, assignment_row)
    return get_intervention(uid)


@router.delete("/{uid}", status_code=204)
def delete_intervention(uid: int):
    with _conn() as conn:
        demande_id = _demande_id_for_intervention(conn, uid)
        if demande_id is None:
            raise HTTPException(404, f"Intervention #{uid} introuvable")
        _require_interventions_enabled(conn, demande_id)
        cur = conn.execute("DELETE FROM interventions WHERE id = ?", (uid,))
    if not cur.rowcount:
        raise HTTPException(404, f"Intervention #{uid} introuvable")
