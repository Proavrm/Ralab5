"""
app/repositories/affaires_rst_repository.py — RaLab4
"""
from __future__ import annotations
import re, sqlite3
from datetime import date, datetime
from typing import Optional
from app.core.database import get_db_path
from app.models.affaire_rst import AffaireRstRecord


class AffairesRstRepository:
    def __init__(self, db_path = None):
        self.db_path = db_path or get_db_path()

    def _connect(self):
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    # ── Lecture ───────────────────────────────────────────────────────────────

    def all(self, statut=None, titulaire=None, search=None, a_revoir=None) -> list[AffaireRstRecord]:
        sql = """
            SELECT a.*,
                   COUNT(d.id) AS nb_demandes,
                   COUNT(CASE WHEN d.statut NOT IN ('Fini','Archivée','Envoyé - Perdu') THEN 1 END) AS nb_demandes_actives
            FROM affaires_rst a
            LEFT JOIN demandes d ON d.affaire_rst_id = a.id
            WHERE 1=1
        """
        params = []
        if statut:
            sql += " AND a.statut = ?"; params.append(statut)
        if titulaire:
            sql += " AND a.titulaire = ?"; params.append(titulaire)
        if search:
            sql += " AND (a.reference LIKE ? OR a.client LIKE ? OR a.chantier LIKE ? OR a.affaire_nge LIKE ? OR a.autre_reference LIKE ? OR a.responsable LIKE ?)"
            like = f"%{search}%"; params.extend([like]*6)
        sql += " GROUP BY a.id ORDER BY a.date_ouverture DESC, a.id DESC"
        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [self._row(r) for r in rows]

    def get_by_uid(self, uid: int) -> AffaireRstRecord | None:
        with self._connect() as conn:
            row = conn.execute("""
                SELECT a.*,
                       COUNT(d.id) AS nb_demandes,
                       COUNT(CASE WHEN d.statut NOT IN ('Fini','Archivée','Envoyé - Perdu') THEN 1 END) AS nb_demandes_actives
                FROM affaires_rst a LEFT JOIN demandes d ON d.affaire_rst_id = a.id
                WHERE a.id = ? GROUP BY a.id
            """, (uid,)).fetchone()
        return self._row(row) if row else None

    def distinct_values(self, column: str) -> list[str]:
        allowed = {"statut", "titulaire", "region"}
        if column not in allowed: return []
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT DISTINCT {column} FROM affaires_rst WHERE {column} != '' ORDER BY {column}"
            ).fetchall()
        return [r[0] for r in rows if r[0]]

    def next_reference(self, region: str = "RA") -> str:
        year = datetime.now().year
        prefix = f"{year}-{region}-"
        with self._connect() as conn:
            rows = conn.execute("SELECT reference FROM affaires_rst WHERE reference LIKE ?",
                                (f"{prefix}%",)).fetchall()
        numbers = []
        for r in rows:
            m = re.match(rf"^{re.escape(prefix)}(\d+)$", r[0])
            if m: numbers.append(int(m.group(1)))
        return f"{prefix}{max(numbers, default=0)+1:04d}"

    # ── Écriture ─────────────────────────────────────────────────────────────

    def add(self, record: AffaireRstRecord) -> AffaireRstRecord:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ref = record.reference
        p = ref.strip().split("-")
        try: annee, region, numero = int(p[0]), p[1], int(p[2])
        except: annee, region, numero = datetime.now().year, "RA", 0
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO affaires_rst
                (reference,annee,region,numero,client,titulaire,chantier,affaire_nge,
                 site,numero_etude,filiale,autre_reference,dossier_nom,dossier_path,
                 date_ouverture,date_cloture,statut,responsable,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                ref, annee, region, numero,
                record.client, record.titulaire, record.chantier, record.affaire_nge,
                record.site, record.numero_etude, record.filiale, record.autre_reference, record.dossier_nom, record.dossier_path,
                self._fmt(record.date_ouverture), self._fmt(record.date_cloture),
                record.statut, record.responsable, now, now,
            ))
            uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        return self.get_by_uid(uid)

    def update(self, uid: int, fields: dict) -> AffaireRstRecord:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        fields = dict(fields)
        for k in ("date_ouverture", "date_cloture"):
            if k in fields and isinstance(fields[k], date):
                fields[k] = fields[k].strftime("%Y-%m-%d")
        fields["updated_at"] = now
        clause = ", ".join(f"{k} = ?" for k in fields)
        with self._connect() as conn:
            conn.execute(f"UPDATE affaires_rst SET {clause} WHERE id = ?", list(fields.values()) + [uid])
        return self.get_by_uid(uid)

    def delete(self, uid: int) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM affaires_rst WHERE id = ?", (uid,))
        return cur.rowcount > 0

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _fmt(d): return d.strftime("%Y-%m-%d") if d else None

    @staticmethod
    def _parse_date(v):
        if not v: return None
        for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%d/%m/%Y"):
            try: return datetime.strptime(str(v).strip(), fmt).date()
            except: pass
        return None

    def _row(self, row: sqlite3.Row) -> AffaireRstRecord:
        keys = row.keys()
        return AffaireRstRecord(
            uid=int(row["id"]), reference=row["reference"],
            annee=int(row["annee"]), region=row["region"], numero=int(row["numero"]),
            client=row["client"] or "", titulaire=row["titulaire"] or "",
            chantier=row["chantier"] or "", affaire_nge=row["affaire_nge"] or "",
            dossier_nom=(row["dossier_nom"] or "") if "dossier_nom" in keys else "",
            dossier_path=(row["dossier_path"] or "") if "dossier_path" in keys else "",
            site=(row["site"] or "") if "site" in keys else "",
            numero_etude=(row["numero_etude"] or "") if "numero_etude" in keys else "",
            filiale=(row["filiale"] or "") if "filiale" in keys else "",
            autre_reference=(row["autre_reference"] or "") if "autre_reference" in keys else "",
            date_ouverture=self._parse_date(row["date_ouverture"]) or date.today(),
            date_cloture=self._parse_date(row["date_cloture"]),
            statut=row["statut"] or "À qualifier",
            responsable=row["responsable"] or "",
            source_legacy_id=row["source_legacy_id"],
            created_at=row["created_at"] or "", updated_at=row["updated_at"] or "",
            nb_demandes=int(row["nb_demandes"]) if "nb_demandes" in keys else 0,
            nb_demandes_actives=int(row["nb_demandes_actives"]) if "nb_demandes_actives" in keys else 0,
        )
