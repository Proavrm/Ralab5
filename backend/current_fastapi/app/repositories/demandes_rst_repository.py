"""
app/repositories/demandes_rst_repository.py — RaLab4
"""
from __future__ import annotations
import re, sqlite3
from datetime import date, datetime
from typing import Optional
from app.core.database import get_db_path
from app.models.demande_rst import DemandeRstRecord, DemandeRstResponseSchema


class DemandesRstRepository:
    def __init__(self, db_path = None):
        self.db_path = db_path or get_db_path()

    def _connect(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    # ── Lecture ───────────────────────────────────────────────────────────────

    def all(self, affaire_rst_id=None, labo_code=None, statut=None,
            type_mission=None, search=None, a_revoir=None) -> list[DemandeRstRecord]:
        sql = """
            SELECT d.*, a.reference AS affaire_ref, a.client, a.chantier, a.affaire_nge,
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
            sql += " AND d.affaire_rst_id = ?"; params.append(affaire_rst_id)
        if labo_code:
            sql += " AND d.labo_code = ?"; params.append(labo_code)
        if statut:
            sql += " AND d.statut = ?"; params.append(statut)
        if type_mission:
            sql += " AND d.type_mission = ?"; params.append(type_mission)
        if a_revoir is not None:
            sql += " AND d.a_revoir = ?"; params.append(1 if a_revoir else 0)
        if search:
            sql += """ AND (d.reference LIKE ? OR d.numero_dst LIKE ? OR d.nature LIKE ?
                         OR d.demandeur LIKE ? OR a.client LIKE ? OR a.chantier LIKE ?)"""
            like = f"%{search}%"; params.extend([like]*6)
        sql += " GROUP BY d.id ORDER BY d.date_reception DESC, d.id DESC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row(r) for r in rows]

    def get_by_uid(self, uid: int) -> DemandeRstRecord | None:
        with self._connect() as conn:
            row = conn.execute("""
                SELECT d.*, a.reference AS affaire_ref, a.client, a.chantier, a.affaire_nge,
                       COUNT(DISTINCT e.id) AS nb_echantillons,
                       COUNT(DISTINCT i.id) AS nb_interventions
                FROM demandes d
                JOIN affaires_rst a ON a.id = d.affaire_rst_id
                LEFT JOIN echantillons e ON e.demande_id = d.id
                LEFT JOIN interventions i ON i.demande_id = d.id
                WHERE d.id = ? GROUP BY d.id
            """, (uid,)).fetchone()
        return self._row(row) if row else None


    def get_navigation_payload(self, uid: int) -> dict:
        with self._connect() as conn:
            interventions = conn.execute("""
                SELECT id, reference, date_intervention, type_intervention, sujet, geotechnicien,
                       technicien, niveau_alerte, anomalie_detectee, statut, pv_ref, rapport_ref, photos_dossier
                FROM interventions
                WHERE demande_id = ?
                ORDER BY date_intervention DESC, id DESC
            """, (uid,)).fetchall()

            echantillons = conn.execute("""
                SELECT id, reference, designation, profondeur_haut, profondeur_bas,
                       date_prelevement, localisation, statut, date_reception_labo
                FROM echantillons
                WHERE demande_id = ?
                ORDER BY id ASC
            """, (uid,)).fetchall()

            essais = conn.execute("""
                SELECT es.id, es.echantillon_id, es.type_essai, es.norme, es.statut,
                       es.date_debut, es.date_fin, es.operateur,
                       ech.reference AS echantillon_reference, ech.designation AS echantillon_designation
                FROM essais es
                JOIN echantillons ech ON ech.id = es.echantillon_id
                WHERE ech.demande_id = ?
                ORDER BY es.id ASC
            """, (uid,)).fetchall()

        def _rows(rows):
            result = []
            for row in rows:
                item = dict(row)
                item["uid"] = int(item.pop("id"))
                if "anomalie_detectee" in item:
                    item["anomalie_detectee"] = bool(item["anomalie_detectee"])
                result.append(item)
            return result

        interventions_data = _rows(interventions)
        echantillons_data = _rows(echantillons)
        essais_data = _rows(essais)

        return {
            "counts": {
                "interventions": len(interventions_data),
                "echantillons": len(echantillons_data),
                "essais": len(essais_data),
            },
            "interventions": interventions_data,
            "echantillons": echantillons_data,
            "essais": essais_data,
        }

    def next_reference(self, labo_code: str = "SP", annee: int | None = None) -> str:
        year = annee or datetime.now().year
        prefix = f"{year}-{labo_code}-D"
        with self._connect() as conn:
            rows = conn.execute("SELECT reference FROM demandes WHERE reference LIKE ?",
                                (f"{prefix}%",)).fetchall()
        numbers = []
        for r in rows:
            m = re.match(rf"^{re.escape(prefix)}(\d+)$", r[0])
            if m: numbers.append(int(m.group(1)))
        return f"{prefix}{max(numbers, default=0)+1:04d}"

    def distinct_values(self, column: str) -> list[str]:
        allowed = {"statut", "type_mission", "priorite", "labo_code", "demandeur"}
        if column not in allowed: return []
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT DISTINCT {column} FROM demandes WHERE {column} != '' ORDER BY {column}"
            ).fetchall()
        return [r[0] for r in rows if r[0]]

    # ── Écriture ─────────────────────────────────────────────────────────────

    def add(self, body) -> DemandeRstRecord:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ref = self.next_reference(body.labo_code, body.date_reception.year)
        p = ref.split("-"); annee = int(p[0]); numero = int(p[2][1:])
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO demandes
                (reference,annee,labo_code,numero,affaire_rst_id,
                 numero_dst,type_mission,nature,description,observations,
                 demandeur,date_reception,date_echeance,statut,priorite,
                 a_revoir,note_reconciliation,suivi_notes,dossier_nom,dossier_path,
                 rapport_ref,devis_ref,facture_ref,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                ref, annee, body.labo_code, numero, body.affaire_rst_id,
                body.numero_dst, body.type_mission, body.nature,
                body.description, body.observations, body.demandeur,
                body.date_reception.strftime("%Y-%m-%d"),
                body.date_echeance.strftime("%Y-%m-%d") if body.date_echeance else None,
                body.statut, body.priorite,
                1 if body.a_revoir else 0,
                body.note_reconciliation, body.suivi_notes,
                body.dossier_nom, body.dossier_path,
                body.rapport_ref, body.devis_ref, body.facture_ref,
                now, now,
            ))
            uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return self.get_by_uid(uid)

    def update(self, uid: int, fields: dict) -> DemandeRstRecord:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        fields = dict(fields)
        for k in ("date_reception", "date_echeance", "date_cloture", "date_envoi_rapport"):
            if k in fields and isinstance(fields[k], date):
                fields[k] = fields[k].strftime("%Y-%m-%d")
        if "a_revoir" in fields: fields["a_revoir"] = 1 if fields["a_revoir"] else 0
        if "rapport_envoye" in fields: fields["rapport_envoye"] = 1 if fields["rapport_envoye"] else 0
        fields["updated_at"] = now
        clause = ", ".join(f"{k} = ?" for k in fields)
        with self._connect() as conn:
            conn.execute(f"UPDATE demandes SET {clause} WHERE id = ?", list(fields.values()) + [uid])
        return self.get_by_uid(uid)

    def delete(self, uid: int) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM demandes WHERE id = ?", (uid,))
        return cur.rowcount > 0

    # ── Helpers ───────────────────────────────────────────────────────────────

    def to_resp(self, r: DemandeRstRecord) -> DemandeRstResponseSchema:
        return DemandeRstResponseSchema(
            uid=r.uid, reference=r.reference, annee=r.annee,
            labo_code=r.labo_code, numero=r.numero,
            affaire_rst_id=r.affaire_rst_id,
            affaire_ref=r.affaire_ref, client=r.client, chantier=r.chantier, affaire_nge=r.affaire_nge,
            numero_dst=r.numero_dst, type_mission=r.type_mission, nature=r.nature,
            description=r.description, observations=r.observations,
            demandeur=r.demandeur, date_reception=r.date_reception,
            date_echeance=r.date_echeance, date_cloture=r.date_cloture,
            statut=r.statut, priorite=r.priorite,
            a_revoir=r.a_revoir, note_reconciliation=r.note_reconciliation,
            suivi_notes=r.suivi_notes, dossier_nom=r.dossier_nom, dossier_path=r.dossier_path,
            rapport_ref=r.rapport_ref, rapport_envoye=r.rapport_envoye,
            date_envoi_rapport=r.date_envoi_rapport,
            devis_ref=r.devis_ref, facture_ref=r.facture_ref,
            source_legacy_id=r.source_legacy_id,
            nb_echantillons=r.nb_echantillons, nb_interventions=r.nb_interventions,
            created_at=r.created_at, updated_at=r.updated_at,
        )

    @staticmethod
    def _parse_date(v):
        if not v: return None
        for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y"):
            try: return datetime.strptime(str(v).strip(), fmt).date()
            except: pass
        return None

    def _row(self, row: sqlite3.Row) -> DemandeRstRecord:
        keys = row.keys()
        return DemandeRstRecord(
            uid=int(row["id"]), reference=row["reference"],
            annee=int(row["annee"]), labo_code=row["labo_code"], numero=int(row["numero"]),
            affaire_rst_id=int(row["affaire_rst_id"]),
            numero_dst=row["numero_dst"] or "",
            type_mission=row["type_mission"] or "À définir",
            nature=row["nature"] or "",
            description=row["description"] or "",
            observations=row["observations"] or "",
            demandeur=row["demandeur"] or "",
            date_reception=self._parse_date(row["date_reception"]) or date.today(),
            date_echeance=self._parse_date(row["date_echeance"]),
            date_cloture=self._parse_date(row["date_cloture"]),
            statut=row["statut"] or "À qualifier",
            priorite=row["priorite"] or "Normale",
            a_revoir=bool(row["a_revoir"]),
            note_reconciliation=row["note_reconciliation"] or "",
            suivi_notes=row["suivi_notes"] or "",
            dossier_nom=row["dossier_nom"] or "",
            dossier_path=row["dossier_path"] or "",
            rapport_ref=row["rapport_ref"] or "",
            rapport_envoye=bool(row["rapport_envoye"]),
            date_envoi_rapport=self._parse_date(row["date_envoi_rapport"]),
            devis_ref=row["devis_ref"] or "",
            facture_ref=row["facture_ref"] or "",
            source_legacy_id=row["source_legacy_id"],
            created_at=row["created_at"] or "", updated_at=row["updated_at"] or "",
            affaire_ref=row["affaire_ref"] if "affaire_ref" in keys else "",
            client=row["client"] if "client" in keys else "",
            chantier=row["chantier"] if "chantier" in keys else "",
            affaire_nge=row["affaire_nge"] if "affaire_nge" in keys else "",
            nb_echantillons=int(row["nb_echantillons"]) if "nb_echantillons" in keys else 0,
            nb_interventions=int(row["nb_interventions"]) if "nb_interventions" in keys else 0,
        )
