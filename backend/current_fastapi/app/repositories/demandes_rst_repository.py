"""
app/repositories/demandes_rst_repository.py — RaLab5
Harmonized repository for demandes RST navigation and related items.
"""
from __future__ import annotations

import re
import sqlite3
from datetime import date, datetime
from typing import Optional

from app.core.database import get_db_path
from app.models.demande_rst import DemandeRstRecord, DemandeRstResponseSchema


def _pick_text(*values) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


class DemandesRstRepository:
    def __init__(self, db_path=None):
        self.db_path = db_path or get_db_path()

    def _connect(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    def _table_exists(self, conn: sqlite3.Connection, table_name: str) -> bool:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table_name,),
        ).fetchone()
        return row is not None

    # ── Lecture ───────────────────────────────────────────────────────────────

    def all(
        self,
        affaire_rst_id=None,
        labo_code=None,
        statut=None,
        type_mission=None,
        search=None,
        a_revoir=None,
    ) -> list[DemandeRstRecord]:
        sql = """
            SELECT d.*, a.reference AS affaire_ref, a.client, a.chantier, a.site,
                   a.numero_etude, a.affaire_nge, a.filiale, a.titulaire,
                   a.responsable AS responsable_affaire,
                   a.statut AS statut_affaire,
                   a.date_ouverture AS date_ouverture_affaire,
                   a.date_cloture AS date_cloture_affaire,
                   COUNT(DISTINCT e.id) AS nb_echantillons,
                   COUNT(DISTINCT i.id) AS nb_interventions
            FROM demandes d
            JOIN affaires_rst a ON a.id = d.affaire_rst_id
            LEFT JOIN echantillons e ON e.demande_id = d.id
            LEFT JOIN interventions i ON i.demande_id = d.id
            WHERE 1=1
        """
        params = []
        if affaire_rst_id is not None:
            sql += " AND d.affaire_rst_id = ?"
            params.append(affaire_rst_id)
        if labo_code:
            sql += " AND d.labo_code = ?"
            params.append(labo_code)
        if statut:
            sql += " AND d.statut = ?"
            params.append(statut)
        if type_mission:
            sql += " AND d.type_mission = ?"
            params.append(type_mission)
        if a_revoir is not None:
            sql += " AND d.a_revoir = ?"
            params.append(1 if a_revoir else 0)
        if search:
            sql += """ AND (d.reference LIKE ? OR d.numero_dst LIKE ? OR d.nature LIKE ?
                         OR d.demandeur LIKE ? OR a.client LIKE ? OR a.chantier LIKE ?
                         OR a.affaire_nge LIKE ? OR a.numero_etude LIKE ? OR a.site LIKE ?)"""
            like = f"%{search}%"
            params.extend([like] * 9)
        sql += " GROUP BY d.id ORDER BY d.date_reception DESC, d.id DESC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row(r) for r in rows]

    def get_by_uid(self, uid: int) -> DemandeRstRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT d.*, a.reference AS affaire_ref, a.client, a.chantier, a.site,
                       a.numero_etude, a.affaire_nge, a.filiale, a.titulaire,
                       a.responsable AS responsable_affaire,
                       a.statut AS statut_affaire,
                       a.date_ouverture AS date_ouverture_affaire,
                       a.date_cloture AS date_cloture_affaire,
                       COUNT(DISTINCT e.id) AS nb_echantillons,
                       COUNT(DISTINCT i.id) AS nb_interventions
                FROM demandes d
                JOIN affaires_rst a ON a.id = d.affaire_rst_id
                LEFT JOIN echantillons e ON e.demande_id = d.id
                LEFT JOIN interventions i ON i.demande_id = d.id
                WHERE d.id = ? GROUP BY d.id
                """,
                (uid,),
            ).fetchone()
        return self._row(row) if row else None

    def get_navigation_payload(self, uid: int) -> dict:
        with self._connect() as conn:
            interventions = conn.execute(
                """
                SELECT
                    i.id,
                    i.reference,
                    i.date_intervention,
                    i.type_intervention,
                    i.sujet,
                    i.geotechnicien,
                    i.technicien,
                    i.niveau_alerte,
                    i.anomalie_detectee,
                    i.statut,
                    i.pv_ref,
                    i.rapport_ref,
                    i.photos_dossier,
                    i.nature_reelle,
                    i.campagne_id,
                    c.reference AS campagne_reference,
                    c.code AS campagne_code,
                    c.label AS campagne_label,
                    c.designation AS campagne_designation
                FROM interventions i
                LEFT JOIN campagnes c ON c.id = i.campagne_id
                WHERE i.demande_id = ?
                ORDER BY i.date_intervention DESC, i.id DESC
                """,
                (uid,),
            ).fetchall()

            echantillons = conn.execute(
                """
                SELECT
                    id,
                    reference,
                    designation,
                    profondeur_haut,
                    profondeur_bas,
                    date_prelevement,
                    localisation,
                    statut,
                    date_reception_labo,
                    prelevement_id,
                    intervention_id
                FROM echantillons
                WHERE demande_id = ?
                ORDER BY id ASC
                """,
                (uid,),
            ).fetchall()

            essais = conn.execute(
                """
                SELECT
                    es.id,
                    es.echantillon_id,
                    es.intervention_id,
                    es.essai_code,
                    es.type_essai,
                    es.norme,
                    es.statut,
                    es.date_debut,
                    es.date_fin,
                    es.operateur,
                    es.resultat_principal,
                    es.resultat_unite,
                    es.resultat_label,
                    ech.reference AS echantillon_reference,
                    ech.designation AS echantillon_designation,
                    ech.intervention_id AS echantillon_intervention_id,
                    i.reference AS intervention_reference,
                    i.sujet AS intervention_subject
                FROM essais es
                LEFT JOIN echantillons ech ON ech.id = es.echantillon_id
                LEFT JOIN interventions i ON i.id = es.intervention_id
                WHERE (ech.demande_id = ? OR i.demande_id = ?)
                ORDER BY es.id ASC
                """,
                (uid, uid),
            ).fetchall()

            prelevements = []
            if self._table_exists(conn, 'prelevements'):
                prelevements = conn.execute(
                    """
                    SELECT
                        id,
                        reference,
                        intervention_id,
                        date_prelevement,
                        date_reception_labo,
                        zone,
                        materiau,
                        finalite,
                        description,
                        quantite,
                        receptionnaire,
                        statut
                    FROM prelevements
                    WHERE demande_id = ?
                    ORDER BY id ASC
                    """,
                    (uid,),
                ).fetchall()

            plans_implantation = []
            if self._table_exists(conn, 'plans_implantation'):
                plans_implantation = conn.execute(
                    """
                    SELECT
                        id,
                        reference,
                        intervention_id,
                        campagne_id,
                        titre,
                        date_plan,
                        operateur,
                        zone,
                        fond_plan,
                        systeme_reperage,
                        repere_base,
                        statut,
                        observations
                    FROM plans_implantation
                    WHERE demande_id = ?
                    ORDER BY id ASC
                    """,
                    (uid,),
                ).fetchall()

            nivellements = []
            if self._table_exists(conn, 'nivellements'):
                nivellements = conn.execute(
                    """
                    SELECT
                        id,
                        reference,
                        intervention_id,
                        campagne_id,
                        titre,
                        date_releve,
                        operateur,
                        referentiel_altimetrique,
                        materiel,
                        statut,
                        observations
                    FROM nivellements
                    WHERE demande_id = ?
                    ORDER BY id ASC
                    """,
                    (uid,),
                ).fetchall()

            feuilles_terrain = []
            if self._table_exists(conn, 'feuilles_terrain'):
                feuilles_terrain = conn.execute(
                    """
                    SELECT
                        id,
                        reference,
                        intervention_id,
                        campagne_id,
                        code_feuille,
                        label,
                        norme,
                        date_feuille,
                        operateur,
                        statut,
                        observations,
                        resultat_principal,
                        resultat_unite,
                        resultat_label
                    FROM feuilles_terrain
                    WHERE demande_id = ?
                    ORDER BY id ASC
                    """,
                    (uid,),
                ).fetchall()

        def _rows(rows):
            result = []
            for row in rows:
                item = dict(row)
                item['uid'] = int(item.pop('id'))
                if 'anomalie_detectee' in item:
                    item['anomalie_detectee'] = bool(item['anomalie_detectee'])
                result.append(item)
            return result

        interventions_data = _rows(interventions)
        echantillons_data = _rows(echantillons)
        essais_data = _rows(essais)
        prelevements_data = _rows(prelevements)
        plans_implantation_data = _rows(plans_implantation)
        nivellements_data = _rows(nivellements)
        feuilles_terrain_data = _rows(feuilles_terrain)


        echantillons_by_uid = {item['uid']: item for item in echantillons_data}
        prelevements_by_uid = {item['uid']: item for item in prelevements_data}

        essais_by_echantillon: dict[int, list[dict]] = {}
        essais_by_intervention: dict[int, list[dict]] = {}
        for item in essais_data:
            echantillon_id = item.get('echantillon_id')
            if echantillon_id:
                essais_by_echantillon.setdefault(int(echantillon_id), []).append(item)

            target_intervention_id = item.get('intervention_id') or item.get('echantillon_intervention_id')
            if not target_intervention_id and echantillon_id and echantillon_id in echantillons_by_uid:
                target_intervention_id = echantillons_by_uid[echantillon_id].get('intervention_id')
            if target_intervention_id:
                essais_by_intervention.setdefault(int(target_intervention_id), []).append(item)

        echantillons_by_prelevement: dict[int, list[dict]] = {}
        echantillons_by_intervention: dict[int, list[dict]] = {}
        orphan_echantillons_by_intervention: dict[int, list[dict]] = {}
        for item in echantillons_data:
            prelevement_id = item.get('prelevement_id')
            if prelevement_id:
                echantillons_by_prelevement.setdefault(int(prelevement_id), []).append(item)

            intervention_id = item.get('intervention_id')
            if not intervention_id and prelevement_id and prelevement_id in prelevements_by_uid:
                intervention_id = prelevements_by_uid[prelevement_id].get('intervention_id')
            if not intervention_id:
                continue

            intervention_id = int(intervention_id)
            echantillons_by_intervention.setdefault(intervention_id, []).append(item)
            if not prelevement_id:
                orphan_echantillons_by_intervention.setdefault(intervention_id, []).append(item)

        prelevements_by_intervention: dict[int, list[dict]] = {}
        for item in prelevements_data:
            intervention_id = item.get('intervention_id')
            if not intervention_id:
                continue
            prelevements_by_intervention.setdefault(int(intervention_id), []).append(item)

        plans_by_intervention: dict[int, list[dict]] = {}
        for item in plans_implantation_data:
            intervention_id = item.get('intervention_id')
            if not intervention_id:
                continue
            plans_by_intervention.setdefault(int(intervention_id), []).append(item)

        nivellements_by_intervention: dict[int, list[dict]] = {}
        for item in nivellements_data:
            intervention_id = item.get('intervention_id')
            if not intervention_id:
                continue
            nivellements_by_intervention.setdefault(int(intervention_id), []).append(item)

        feuilles_by_intervention: dict[int, list[dict]] = {}
        for item in feuilles_terrain_data:
            intervention_id = item.get('intervention_id')
            if not intervention_id:
                continue
            feuilles_by_intervention.setdefault(int(intervention_id), []).append(item)

        def _build_essai_object(item: dict) -> dict:
            result_value = ''
            if item.get('resultat_principal') is not None and item.get('resultat_principal') != '':
                result_value = f"{item.get('resultat_principal')}{(' ' + item.get('resultat_unite')) if item.get('resultat_unite') else ''}"
            return {
                'kind': 'essai',
                'category': 'essai',
                'uid': item['uid'],
                'reference': item.get('reference') or f"ESSAI-{str(item['uid']).zfill(4)}",
                'title': _pick_text(item.get('type_essai'), item.get('essai_code'), 'Essai'),
                'subtitle': _pick_text(item.get('echantillon_designation'), item.get('echantillon_reference')),
                'date': item.get('date_debut') or item.get('date_fin') or '',
                'statut': item.get('statut') or '',
                'result_label': item.get('resultat_label') or '',
                'result_value': result_value,
                'children': [],
            }

        def _build_echantillon_object(item: dict) -> dict:
            essais_children = [_build_essai_object(essai) for essai in essais_by_echantillon.get(int(item['uid']), [])]
            return {
                'kind': 'echantillon',
                'category': 'echantillon',
                'uid': item['uid'],
                'reference': item.get('reference') or '',
                'title': _pick_text(item.get('designation'), item.get('localisation'), 'Échantillon'),
                'subtitle': _pick_text(item.get('localisation')),
                'date': item.get('date_prelevement') or item.get('date_reception_labo') or '',
                'statut': item.get('statut') or '',
                'result_label': 'Essais labo',
                'result_value': f"{len(essais_children)} essai(s)",
                'children': essais_children,
            }

        def _build_related_objects(intervention_id: int) -> list[dict]:
            related_objects: list[dict] = []

            for item in plans_by_intervention.get(intervention_id, []):
                related_objects.append({
                    'kind': 'plan_implantation',
                    'category': 'support',
                    'uid': item['uid'],
                    'reference': item.get('reference') or '',
                    'title': _pick_text(item.get('titre'), 'Plan d’implantation'),
                    'subtitle': _pick_text(item.get('zone'), item.get('fond_plan'), item.get('systeme_reperage')),
                    'date': item.get('date_plan') or '',
                    'statut': item.get('statut') or '',
                    'result_label': '',
                    'result_value': '',
                    'children': [],
                })

            for item in nivellements_by_intervention.get(intervention_id, []):
                related_objects.append({
                    'kind': 'nivellement',
                    'category': 'support',
                    'uid': item['uid'],
                    'reference': item.get('reference') or '',
                    'title': _pick_text(item.get('titre'), 'Nivellement'),
                    'subtitle': _pick_text(item.get('referentiel_altimetrique'), item.get('materiel')),
                    'date': item.get('date_releve') or '',
                    'statut': item.get('statut') or '',
                    'result_label': '',
                    'result_value': '',
                    'children': [],
                })

            for item in feuilles_by_intervention.get(intervention_id, []):
                result_value = ''
                if item.get('resultat_principal') is not None and item.get('resultat_principal') != '':
                    result_value = f"{item.get('resultat_principal')}{(' ' + item.get('resultat_unite')) if item.get('resultat_unite') else ''}"
                related_objects.append({
                    'kind': 'feuille_terrain',
                    'category': 'terrain',
                    'uid': item['uid'],
                    'reference': item.get('reference') or '',
                    'title': _pick_text(item.get('label'), item.get('code_feuille'), 'Feuille terrain'),
                    'subtitle': _pick_text(item.get('norme'), item.get('observations')),
                    'date': item.get('date_feuille') or '',
                    'statut': item.get('statut') or '',
                    'result_label': item.get('resultat_label') or '',
                    'result_value': result_value,
                    'children': [],
                })

            for item in prelevements_by_intervention.get(intervention_id, []):
                child_echantillons = [_build_echantillon_object(ech) for ech in echantillons_by_prelevement.get(int(item['uid']), [])]
                total_essais = sum(len(child.get('children') or []) for child in child_echantillons)
                related_objects.append({
                    'kind': 'prelevement',
                    'category': 'prelevement',
                    'uid': item['uid'],
                    'reference': item.get('reference') or '',
                    'title': _pick_text(item.get('description'), item.get('materiau'), 'Prélèvement'),
                    'subtitle': _pick_text(item.get('zone'), item.get('finalite'), item.get('quantite')),
                    'date': item.get('date_prelevement') or item.get('date_reception_labo') or '',
                    'statut': item.get('statut') or '',
                    'result_label': 'Chaîne labo',
                    'result_value': f"{len(child_echantillons)} éch. · {total_essais} essai(s)",
                    'children': child_echantillons,
                })

            linked_prelevement_ids = {int(item['uid']) for item in prelevements_by_intervention.get(intervention_id, [])}
            for item in orphan_echantillons_by_intervention.get(intervention_id, []):
                if item.get('prelevement_id') and int(item.get('prelevement_id')) in linked_prelevement_ids:
                    continue
                related_objects.append(_build_echantillon_object(item) | {'category': 'echantillon'})

            linked_echantillon_ids = {int(item['uid']) for item in echantillons_by_intervention.get(intervention_id, [])}
            for item in essais_by_intervention.get(intervention_id, []):
                echantillon_id = item.get('echantillon_id')
                if echantillon_id and int(echantillon_id) in linked_echantillon_ids:
                    continue
                related_objects.append(_build_essai_object(item) | {'category': 'essai'})

            category_order = {
                'support': 1,
                'terrain': 2,
                'prelevement': 3,
                'echantillon': 4,
                'essai': 5,
            }
            related_objects.sort(
                key=lambda item: (
                    category_order.get(item.get('category'), 99),
                    str(item.get('date') or ''),
                    str(item.get('reference') or ''),
                    int(item.get('uid') or 0),
                )
            )
            return related_objects
        def _present_interventions(items: list[dict]) -> list[dict]:
            presented: list[dict] = []
            for item in items:
                normalized = dict(item)
                normalized['raw_intervention_count'] = 1
                normalized['grouped_raw_uids'] = [normalized['uid']]
                related_objects = _build_related_objects(normalized['uid'])
                normalized['related_objects'] = related_objects
                normalized['related_object_count'] = len(related_objects)
                normalized['support_object_count'] = sum(1 for obj in related_objects if obj.get('category') == 'support')
                normalized['terrain_sheet_count'] = sum(1 for obj in related_objects if obj.get('category') == 'terrain')
                normalized['prelevement_count'] = len(prelevements_by_intervention.get(normalized['uid'], []))
                normalized['echantillon_count'] = len(echantillons_by_intervention.get(normalized['uid'], []))
                normalized['essai_count'] = len(essais_by_intervention.get(normalized['uid'], []))
                presented.append(normalized)
            return presented

        interventions_data = _present_interventions(interventions_data)

        return {
            'counts': {
                'interventions': len(interventions_data),
                'prelevements': len(prelevements_data),
                'echantillons': len(echantillons_data),
                'essais': len(essais_data),
                'plans_implantation': len(plans_implantation_data),
                'nivellements': len(nivellements_data),
                'feuilles_terrain': len(feuilles_terrain_data),
            },
            'interventions': interventions_data,
            'prelevements': prelevements_data,
            'echantillons': echantillons_data,
            'essais': essais_data,
            'plans_implantation': plans_implantation_data,
            'nivellements': nivellements_data,
            'feuilles_terrain': feuilles_terrain_data,
        }

    def next_reference(self, labo_code: str = 'SP', annee: int | None = None) -> str:
        year = annee or datetime.now().year
        global_prefix = f'{year}-'
        with self._connect() as conn:
            rows = conn.execute(
                'SELECT reference FROM demandes WHERE reference LIKE ?',
                (f'{global_prefix}%',),
            ).fetchall()
        numbers = []
        for r in rows:
            m = re.match(rf'^{re.escape(global_prefix)}[^-]+-D(\d+)$', r[0])
            if m:
                numbers.append(int(m.group(1)))
        next_num = max(numbers, default=0) + 1
        return f'{year}-{labo_code}-D{next_num:04d}'

    def distinct_values(self, column: str) -> list[str]:
        allowed = {'statut', 'type_mission', 'priorite', 'labo_code', 'demandeur'}
        if column not in allowed:
            return []
        with self._connect() as conn:
            rows = conn.execute(
                f'SELECT DISTINCT {column} FROM demandes WHERE {column} != "" ORDER BY {column}'
            ).fetchall()
        return [r[0] for r in rows if r[0]]

    # ── Écriture ─────────────────────────────────────────────────────────────

    def add(self, body) -> DemandeRstRecord:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        ref = self.next_reference(body.labo_code, body.date_reception.year)
        p = ref.split('-')
        annee = int(p[0])
        numero = int(p[2][1:])
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO demandes
                (reference,annee,labo_code,numero,affaire_rst_id,
                 numero_dst,type_mission,nature,description,observations,
                 demandeur,date_reception,date_echeance,statut,priorite,
                 a_revoir,note_reconciliation,suivi_notes,dossier_nom,dossier_path,
                 rapport_ref,devis_ref,facture_ref,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    ref,
                    annee,
                    body.labo_code,
                    numero,
                    body.affaire_rst_id,
                    body.numero_dst,
                    body.type_mission,
                    body.nature,
                    body.description,
                    body.observations,
                    body.demandeur,
                    body.date_reception.strftime('%Y-%m-%d'),
                    body.date_echeance.strftime('%Y-%m-%d') if body.date_echeance else None,
                    body.statut,
                    body.priorite,
                    1 if body.a_revoir else 0,
                    body.note_reconciliation,
                    body.suivi_notes,
                    body.dossier_nom,
                    body.dossier_path,
                    body.rapport_ref,
                    body.devis_ref,
                    body.facture_ref,
                    now,
                    now,
                ),
            )
            uid = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        return self.get_by_uid(uid)

    def update(self, uid: int, fields: dict) -> DemandeRstRecord:
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        fields = dict(fields)
        for k in ('date_reception', 'date_echeance', 'date_cloture', 'date_envoi_rapport'):
            if k in fields and isinstance(fields[k], date):
                fields[k] = fields[k].strftime('%Y-%m-%d')
        if 'a_revoir' in fields:
            fields['a_revoir'] = 1 if fields['a_revoir'] else 0
        if 'rapport_envoye' in fields:
            fields['rapport_envoye'] = 1 if fields['rapport_envoye'] else 0
        if 'labo_code' in fields and fields['labo_code']:
            current = self.get_by_uid(uid)
            if current and fields['labo_code'] != current.labo_code:
                new_ref = self.next_reference(fields['labo_code'], current.annee)
                m = re.match(r'^\d{4}-[^-]+-D(\d+)$', new_ref)
                fields['reference'] = new_ref
                if m:
                    fields['numero'] = int(m.group(1))
        fields['updated_at'] = now
        clause = ', '.join(f'{k} = ?' for k in fields)
        with self._connect() as conn:
            conn.execute(f'UPDATE demandes SET {clause} WHERE id = ?', list(fields.values()) + [uid])
        return self.get_by_uid(uid)

    def delete(self, uid: int) -> bool:
        with self._connect() as conn:
            cur = conn.execute('DELETE FROM demandes WHERE id = ?', (uid,))
        return cur.rowcount > 0

    # ── Helpers ───────────────────────────────────────────────────────────────

    def to_resp(self, r: DemandeRstRecord) -> DemandeRstResponseSchema:
        return DemandeRstResponseSchema(
            uid=r.uid,
            reference=r.reference,
            annee=r.annee,
            labo_code=r.labo_code,
            numero=r.numero,
            affaire_rst_id=r.affaire_rst_id,
            affaire_ref=r.affaire_ref,
            client=r.client,
            chantier=r.chantier,
            site=r.site,
            numero_etude=r.numero_etude,
            affaire_nge=r.affaire_nge,
            filiale=r.filiale,
            titulaire=r.titulaire,
            responsable_affaire=r.responsable_affaire,
            statut_affaire=r.statut_affaire,
            date_ouverture_affaire=r.date_ouverture_affaire,
            date_cloture_affaire=r.date_cloture_affaire,
            numero_dst=r.numero_dst,
            type_mission=r.type_mission,
            nature=r.nature,
            description=r.description,
            observations=r.observations,
            demandeur=r.demandeur,
            date_reception=r.date_reception,
            date_echeance=r.date_echeance,
            date_cloture=r.date_cloture,
            statut=r.statut,
            priorite=r.priorite,
            a_revoir=r.a_revoir,
            note_reconciliation=r.note_reconciliation,
            suivi_notes=r.suivi_notes,
            dossier_nom=r.dossier_nom,
            dossier_path=r.dossier_path,
            rapport_ref=r.rapport_ref,
            rapport_envoye=r.rapport_envoye,
            date_envoi_rapport=r.date_envoi_rapport,
            devis_ref=r.devis_ref,
            facture_ref=r.facture_ref,
            source_legacy_id=r.source_legacy_id,
            nb_echantillons=r.nb_echantillons,
            nb_interventions=r.nb_interventions,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )

    @staticmethod
    def _parse_date(v):
        if not v:
            return None
        for fmt in ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%d/%m/%Y'):
            try:
                return datetime.strptime(str(v).strip(), fmt).date()
            except Exception:
                pass
        return None

    def _row(self, row: sqlite3.Row) -> DemandeRstRecord:
        keys = row.keys()
        return DemandeRstRecord(
            uid=int(row['id']),
            reference=row['reference'] or '',
            annee=int(row['annee']),
            labo_code=row['labo_code'] or '',
            numero=int(row['numero']),
            affaire_rst_id=int(row['affaire_rst_id']),
            numero_dst=row['numero_dst'] or '',
            type_mission=row['type_mission'] or 'À définir',
            nature=row['nature'] or '',
            description=row['description'] or '',
            observations=row['observations'] or '',
            demandeur=row['demandeur'] or '',
            date_reception=self._parse_date(row['date_reception']) or date.today(),
            date_echeance=self._parse_date(row['date_echeance']),
            date_cloture=self._parse_date(row['date_cloture']),
            statut=row['statut'] or 'À qualifier',
            priorite=row['priorite'] or 'Normale',
            a_revoir=bool(row['a_revoir']),
            note_reconciliation=row['note_reconciliation'] or '',
            suivi_notes=row['suivi_notes'] or '',
            dossier_nom=row['dossier_nom'] or '',
            dossier_path=row['dossier_path'] or '',
            rapport_ref=row['rapport_ref'] or '',
            rapport_envoye=bool(row['rapport_envoye']),
            date_envoi_rapport=self._parse_date(row['date_envoi_rapport']),
            devis_ref=row['devis_ref'] or '',
            facture_ref=row['facture_ref'] or '',
            source_legacy_id=row['source_legacy_id'],
            created_at=row['created_at'] or '',
            updated_at=row['updated_at'] or '',
            affaire_ref=(row['affaire_ref'] or '') if 'affaire_ref' in keys else '',
            client=(row['client'] or '') if 'client' in keys else '',
            chantier=(row['chantier'] or '') if 'chantier' in keys else '',
            site=(row['site'] or '') if 'site' in keys else '',
            numero_etude=(row['numero_etude'] or '') if 'numero_etude' in keys else '',
            affaire_nge=(row['affaire_nge'] or '') if 'affaire_nge' in keys else '',
            filiale=(row['filiale'] or '') if 'filiale' in keys else '',
            titulaire=(row['titulaire'] or '') if 'titulaire' in keys else '',
            responsable_affaire=(row['responsable_affaire'] or '') if 'responsable_affaire' in keys else '',
            statut_affaire=(row['statut_affaire'] or '') if 'statut_affaire' in keys else '',
            date_ouverture_affaire=self._parse_date(row['date_ouverture_affaire']) if 'date_ouverture_affaire' in keys else None,
            date_cloture_affaire=self._parse_date(row['date_cloture_affaire']) if 'date_cloture_affaire' in keys else None,
            nb_echantillons=int(row['nb_echantillons']) if 'nb_echantillons' in keys and row['nb_echantillons'] is not None else 0,
            nb_interventions=int(row['nb_interventions']) if 'nb_interventions' in keys and row['nb_interventions'] is not None else 0,
        )
