"""
app/repositories/qualite_repository.py
"""
from __future__ import annotations
import sqlite3
from datetime import date, datetime, timedelta
from typing import Optional
from app.core.database import get_db_path
from app.models.qualite import (
    EquipmentRecord, MetrologyRecord, ProcedureRecord, StandardRecord, NcRecord,
    EquipmentCreateSchema, EquipmentUpdateSchema,
    MetrologyCreateSchema, MetrologyUpdateSchema,
    ProcedureCreateSchema, ProcedureUpdateSchema,
    StandardCreateSchema, StandardUpdateSchema,
    NcCreateSchema, NcUpdateSchema,
)


def _get_db():
    path = get_db_path()
    con = sqlite3.connect(str(path))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def _today() -> str:
    return date.today().isoformat()


# ═══════════════════════════════════════════════════════════════════════════════
# EQUIPMENT
# ═══════════════════════════════════════════════════════════════════════════════
class EquipmentRepository:
    def _row(self, r: sqlite3.Row) -> EquipmentRecord:
        k = r.keys()
        return EquipmentRecord(
            uid=r["id"], code=r["code"], label=r["label"],
            category=r["category"], domain=r["domain"],
            status=r["status"], serial_number=r["serial_number"],
            supplier=r["supplier"], purchase_date=r["purchase_date"],
            lieu=r["lieu"],
            etalonnage_interval=r["etalonnage_interval"],
            verification_interval=r["verification_interval"],
            presence=r["presence"], notes=r["notes"],
            m_tare=r["m_tare"] if "m_tare" in k else None,
            volume_cm3=r["volume_cm3"] if "volume_cm3" in k else None,
            division=r["division"] if "division" in k else None,
            precision=r["precision"] if "precision" in k else None,
            capacite=r["capacite"] if "capacite" in k else None,
            sensibilite=r["sensibilite"] if "sensibilite" in k else None,
            facteur_k=r["facteur_k"] if "facteur_k" in k else None,
            created_at=r["created_at"] or "", updated_at=r["updated_at"] or "",
            last_metrology=r["last_metrology"] if "last_metrology" in k else None,
            next_metrology=r["next_metrology"] if "next_metrology" in k else None,
        )

    def all(self, search=None, category=None, status=None) -> list[EquipmentRecord]:
        sql = """
            SELECT e.*,
                   m.performed_on AS last_metrology,
                   m.valid_until  AS next_metrology
            FROM qualite_equipment e
            LEFT JOIN (
                SELECT equipment_id,
                       MAX(performed_on) AS performed_on,
                       valid_until
                FROM qualite_metrology
                WHERE status = 'Valide'
                GROUP BY equipment_id
            ) m ON m.equipment_id = e.id
            WHERE 1=1
        """
        params = []
        if search:
            sql += " AND (e.code LIKE ? OR e.label LIKE ? OR e.serial_number LIKE ?)"
            q = f"%{search}%"; params += [q, q, q]
        if category: sql += " AND e.category = ?"; params.append(category)
        if status:   sql += " AND e.status = ?";   params.append(status)
        sql += " ORDER BY e.code"
        con = _get_db()
        rows = con.execute(sql, params).fetchall()
        con.close()
        return [self._row(r) for r in rows]

    def get(self, uid: int) -> Optional[EquipmentRecord]:
        sql = """
            SELECT e.*,
                   m.performed_on AS last_metrology,
                   m.valid_until  AS next_metrology
            FROM qualite_equipment e
            LEFT JOIN (
                SELECT equipment_id, MAX(performed_on) AS performed_on, valid_until
                FROM qualite_metrology WHERE status='Valide' GROUP BY equipment_id
            ) m ON m.equipment_id = e.id
            WHERE e.id = ?
        """
        con = _get_db()
        row = con.execute(sql, [uid]).fetchone()
        con.close()
        return self._row(row) if row else None

    def create(self, data: EquipmentCreateSchema) -> EquipmentRecord:
        con = _get_db()
        cur = con.execute(
            """INSERT INTO qualite_equipment
               (code,label,category,domain,status,serial_number,supplier,
                purchase_date,lieu,etalonnage_interval,verification_interval,presence,notes,
                m_tare,volume_cm3,division,precision,capacite,sensibilite,facteur_k)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [data.code, data.label, data.category, data.domain, data.status,
             data.serial_number, data.supplier, data.purchase_date, data.lieu,
             data.etalonnage_interval, data.verification_interval, data.presence, data.notes,
             getattr(data, 'm_tare', None), getattr(data, 'volume_cm3', None),
             getattr(data, 'division', None), getattr(data, 'precision', None),
             getattr(data, 'capacite', None), getattr(data, 'sensibilite', None),
             getattr(data, 'facteur_k', None)]
        )
        con.commit(); uid = cur.lastrowid; con.close()
        return self.get(uid)

    def update(self, uid: int, data: EquipmentUpdateSchema) -> Optional[EquipmentRecord]:
        fields = data.model_dump(exclude_unset=True)
        if not fields: return self.get(uid)
        fields["updated_at"] = datetime.now().isoformat()
        sets = ", ".join(f"{k}=?" for k in fields)
        con = _get_db()
        con.execute(f"UPDATE qualite_equipment SET {sets} WHERE id=?", list(fields.values()) + [uid])
        con.commit(); con.close()
        return self.get(uid)

    def delete(self, uid: int) -> bool:
        con = _get_db()
        con.execute("DELETE FROM qualite_equipment WHERE id=?", [uid])
        con.commit(); con.close()
        return True


# ═══════════════════════════════════════════════════════════════════════════════
# METROLOGY
# ═══════════════════════════════════════════════════════════════════════════════
class MetrologyRepository:
    def _row(self, r: sqlite3.Row) -> MetrologyRecord:
        k = r.keys()
        return MetrologyRecord(
            uid=r["id"], equipment_id=r["equipment_id"],
            control_type=r["control_type"], status=r["status"],
            reference=r["reference"], provider=r["provider"],
            performed_on=r["performed_on"], valid_until=r["valid_until"],
            notes=r["notes"], created_at=r["created_at"] or "",
            eq_code=r["eq_code"] if "eq_code" in k else "",
            eq_label=r["eq_label"] if "eq_label" in k else "",
            eq_category=r["eq_category"] if "eq_category" in k else "",
        )

    def for_equipment(self, equipment_id: int) -> list[MetrologyRecord]:
        con = _get_db()
        rows = con.execute(
            """SELECT m.*, e.code as eq_code, e.label as eq_label, e.category as eq_category
               FROM qualite_metrology m JOIN qualite_equipment e ON e.id=m.equipment_id
               WHERE m.equipment_id=? ORDER BY m.performed_on DESC""",
            [equipment_id]
        ).fetchall()
        con.close()
        return [self._row(r) for r in rows]

    def alerts(self, days: int = 60) -> list[MetrologyRecord]:
        limit = (date.today() + timedelta(days=days)).isoformat()
        con = _get_db()
        rows = con.execute(
            """SELECT m.*, e.code as eq_code, e.label as eq_label, e.category as eq_category
               FROM qualite_metrology m JOIN qualite_equipment e ON e.id=m.equipment_id
               WHERE m.status='Valide' AND m.valid_until IS NOT NULL AND m.valid_until <= ?
               AND e.status='En service'
               ORDER BY m.valid_until ASC""",
            [limit]
        ).fetchall()
        con.close()
        return [self._row(r) for r in rows]

    def get(self, uid: int) -> Optional[MetrologyRecord]:
        con = _get_db()
        row = con.execute(
            """SELECT m.*, e.code as eq_code, e.label as eq_label, e.category as eq_category
               FROM qualite_metrology m JOIN qualite_equipment e ON e.id=m.equipment_id
               WHERE m.id=?""", [uid]
        ).fetchone()
        con.close()
        return self._row(row) if row else None

    def create(self, data: MetrologyCreateSchema) -> MetrologyRecord:
        con = _get_db()
        cur = con.execute(
            """INSERT INTO qualite_metrology
               (equipment_id,control_type,status,reference,provider,performed_on,valid_until,notes)
               VALUES (?,?,?,?,?,?,?,?)""",
            [data.equipment_id, data.control_type, data.status, data.reference,
             data.provider, data.performed_on, data.valid_until, data.notes]
        )
        con.commit(); uid = cur.lastrowid; con.close()
        return self.get(uid)

    def update(self, uid: int, data: MetrologyUpdateSchema) -> Optional[MetrologyRecord]:
        fields = {k: v for k, v in data.model_dump(exclude_none=True).items()}
        if not fields: return self.get(uid)
        sets = ", ".join(f"{k}=?" for k in fields)
        con = _get_db()
        con.execute(f"UPDATE qualite_metrology SET {sets} WHERE id=?", list(fields.values()) + [uid])
        con.commit(); con.close()
        return self.get(uid)

    def delete(self, uid: int) -> bool:
        con = _get_db()
        con.execute("DELETE FROM qualite_metrology WHERE id=?", [uid])
        con.commit(); con.close()
        return True


# ═══════════════════════════════════════════════════════════════════════════════
# PROCEDURES
# ═══════════════════════════════════════════════════════════════════════════════
class ProcedureRepository:
    def _row(self, r: sqlite3.Row) -> ProcedureRecord:
        review_due = False
        if r["review_date"]:
            try:
                rd = date.fromisoformat(r["review_date"])
                review_due = rd <= date.today() + timedelta(days=60)
            except: pass
        return ProcedureRecord(
            uid=r["id"], code=r["code"], title=r["title"],
            technical_family=r["technical_family"], version=r["version"] or "1.0",
            status=r["status"], owner=r["owner"],
            issue_date=r["issue_date"], review_date=r["review_date"],
            file_path=r["file_path"], notes=r["notes"],
            created_at=r["created_at"] or "", updated_at=r["updated_at"] or "",
            review_due=review_due,
        )

    def all(self, search=None, family=None, status=None) -> list[ProcedureRecord]:
        sql = "SELECT * FROM qualite_procedures WHERE 1=1"
        params = []
        if search:
            sql += " AND (code LIKE ? OR title LIKE ? OR owner LIKE ?)"
            q = f"%{search}%"; params += [q, q, q]
        if family: sql += " AND technical_family=?"; params.append(family)
        if status: sql += " AND status=?"; params.append(status)
        sql += " ORDER BY code"
        con = _get_db()
        rows = con.execute(sql, params).fetchall()
        con.close()
        return [self._row(r) for r in rows]

    def get(self, uid: int) -> Optional[ProcedureRecord]:
        con = _get_db()
        row = con.execute("SELECT * FROM qualite_procedures WHERE id=?", [uid]).fetchone()
        con.close()
        return self._row(row) if row else None

    def create(self, data: ProcedureCreateSchema) -> ProcedureRecord:
        con = _get_db()
        cur = con.execute(
            """INSERT INTO qualite_procedures
               (code,title,technical_family,version,status,owner,issue_date,review_date,file_path,notes)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            [data.code, data.title, data.technical_family, data.version, data.status,
             data.owner, data.issue_date, data.review_date, data.file_path, data.notes]
        )
        con.commit(); uid = cur.lastrowid; con.close()
        return self.get(uid)

    def update(self, uid: int, data: ProcedureUpdateSchema) -> Optional[ProcedureRecord]:
        fields = {k: v for k, v in data.model_dump(exclude_none=True).items()}
        if not fields: return self.get(uid)
        fields["updated_at"] = datetime.now().isoformat()
        sets = ", ".join(f"{k}=?" for k in fields)
        con = _get_db()
        con.execute(f"UPDATE qualite_procedures SET {sets} WHERE id=?", list(fields.values()) + [uid])
        con.commit(); con.close()
        return self.get(uid)

    def delete(self, uid: int) -> bool:
        con = _get_db()
        con.execute("DELETE FROM qualite_procedures WHERE id=?", [uid])
        con.commit(); con.close()
        return True


# ═══════════════════════════════════════════════════════════════════════════════
# STANDARDS
# ═══════════════════════════════════════════════════════════════════════════════
class StandardRepository:
    def _row(self, r: sqlite3.Row) -> StandardRecord:
        return StandardRecord(
            uid=r["id"], code=r["code"], title=r["title"],
            technical_family=r["technical_family"], issuer=r["issuer"],
            version=r["version"], status=r["status"], issue_date=r["issue_date"],
            notes=r["notes"], created_at=r["created_at"] or "", updated_at=r["updated_at"] or "",
        )

    def all(self, search=None, family=None, status=None) -> list[StandardRecord]:
        sql = "SELECT * FROM qualite_standards WHERE 1=1"
        params = []
        if search:
            sql += " AND (code LIKE ? OR title LIKE ? OR issuer LIKE ?)"
            q = f"%{search}%"; params += [q, q, q]
        if family: sql += " AND technical_family=?"; params.append(family)
        if status: sql += " AND status=?"; params.append(status)
        sql += " ORDER BY code"
        con = _get_db()
        rows = con.execute(sql, params).fetchall()
        con.close()
        return [self._row(r) for r in rows]

    def get(self, uid: int) -> Optional[StandardRecord]:
        con = _get_db()
        row = con.execute("SELECT * FROM qualite_standards WHERE id=?", [uid]).fetchone()
        con.close()
        return self._row(row) if row else None

    def create(self, data: StandardCreateSchema) -> StandardRecord:
        con = _get_db()
        cur = con.execute(
            """INSERT INTO qualite_standards
               (code,title,technical_family,issuer,version,status,issue_date,notes)
               VALUES (?,?,?,?,?,?,?,?)""",
            [data.code, data.title, data.technical_family, data.issuer,
             data.version, data.status, data.issue_date, data.notes]
        )
        con.commit(); uid = cur.lastrowid; con.close()
        return self.get(uid)

    def update(self, uid: int, data: StandardUpdateSchema) -> Optional[StandardRecord]:
        fields = {k: v for k, v in data.model_dump(exclude_none=True).items()}
        if not fields: return self.get(uid)
        fields["updated_at"] = datetime.now().isoformat()
        sets = ", ".join(f"{k}=?" for k in fields)
        con = _get_db()
        con.execute(f"UPDATE qualite_standards SET {sets} WHERE id=?", list(fields.values()) + [uid])
        con.commit(); con.close()
        return self.get(uid)

    def delete(self, uid: int) -> bool:
        con = _get_db()
        con.execute("DELETE FROM qualite_standards WHERE id=?", [uid])
        con.commit(); con.close()
        return True


# ═══════════════════════════════════════════════════════════════════════════════
# NON-CONFORMITÉS
# ═══════════════════════════════════════════════════════════════════════════════
class NcRepository:
    def _next_ref(self, con) -> str:
        year = date.today().year
        row = con.execute(
            "SELECT COUNT(*) as n FROM qualite_nc WHERE reference LIKE ?",
            [f"NC-{year}-%"]
        ).fetchone()
        return f"NC-{year}-{(row['n'] or 0) + 1:04d}"

    def _row(self, r: sqlite3.Row) -> NcRecord:
        is_late = False
        if r["due_date"] and r["status"] not in ("Clôturée", "Vérifiée"):
            try: is_late = date.fromisoformat(r["due_date"]) < date.today()
            except: pass
        return NcRecord(
            uid=r["id"], reference=r["reference"], source_type=r["source_type"],
            severity=r["severity"], status=r["status"], source_ref=r["source_ref"],
            title=r["title"], description=r["description"],
            detected_on=r["detected_on"], detected_by=r["detected_by"],
            action_immediate=r["action_immediate"], corrective_action=r["corrective_action"],
            owner=r["owner"], due_date=r["due_date"], closure_date=r["closure_date"],
            created_at=r["created_at"] or "", updated_at=r["updated_at"] or "",
            is_late=is_late,
        )

    def all(self, search=None, status=None, severity=None, source_type=None) -> list[NcRecord]:
        sql = "SELECT * FROM qualite_nc WHERE 1=1"
        params = []
        if search:
            sql += " AND (reference LIKE ? OR title LIKE ? OR owner LIKE ?)"
            q = f"%{search}%"; params += [q, q, q]
        if status:      sql += " AND status=?";      params.append(status)
        if severity:    sql += " AND severity=?";    params.append(severity)
        if source_type: sql += " AND source_type=?"; params.append(source_type)
        sql += " ORDER BY detected_on DESC, id DESC"
        con = _get_db()
        rows = con.execute(sql, params).fetchall()
        con.close()
        return [self._row(r) for r in rows]

    def get(self, uid: int) -> Optional[NcRecord]:
        con = _get_db()
        row = con.execute("SELECT * FROM qualite_nc WHERE id=?", [uid]).fetchone()
        con.close()
        return self._row(row) if row else None

    def create(self, data: NcCreateSchema) -> NcRecord:
        con = _get_db()
        ref = self._next_ref(con)
        cur = con.execute(
            """INSERT INTO qualite_nc
               (reference,source_type,severity,status,source_ref,title,description,
                detected_on,detected_by,action_immediate,corrective_action,owner,due_date)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [ref, data.source_type, data.severity, data.status, data.source_ref,
             data.title, data.description, data.detected_on or _today(),
             data.detected_by, data.action_immediate, data.corrective_action,
             data.owner, data.due_date]
        )
        con.commit(); uid = cur.lastrowid; con.close()
        return self.get(uid)

    def update(self, uid: int, data: NcUpdateSchema) -> Optional[NcRecord]:
        fields = {k: v for k, v in data.model_dump(exclude_none=True).items()}
        if not fields: return self.get(uid)
        if fields.get("status") in ("Clôturée", "Vérifiée") and "closure_date" not in fields:
            fields["closure_date"] = _today()
        fields["updated_at"] = datetime.now().isoformat()
        sets = ", ".join(f"{k}=?" for k in fields)
        con = _get_db()
        con.execute(f"UPDATE qualite_nc SET {sets} WHERE id=?", list(fields.values()) + [uid])
        con.commit(); con.close()
        return self.get(uid)

    def delete(self, uid: int) -> bool:
        con = _get_db()
        con.execute("DELETE FROM qualite_nc WHERE id=?", [uid])
        con.commit(); con.close()
        return True


# ═══════════════════════════════════════════════════════════════════════════════
# STATS
# ═══════════════════════════════════════════════════════════════════════════════
def get_stats() -> dict:
    con = _get_db()
    try:
        eq_total  = con.execute("SELECT COUNT(*) FROM qualite_equipment").fetchone()[0]
        eq_active = con.execute("SELECT COUNT(*) FROM qualite_equipment WHERE status='En service'").fetchone()[0]
        eq_hs     = con.execute("SELECT COUNT(*) FROM qualite_equipment WHERE status='Hors service'").fetchone()[0]
        limit     = (date.today() + timedelta(days=60)).isoformat()
        metro_due = con.execute(
            "SELECT COUNT(*) FROM qualite_metrology WHERE status='Valide' AND valid_until IS NOT NULL AND valid_until<=?",
            [limit]
        ).fetchone()[0]
        proc_total = con.execute("SELECT COUNT(*) FROM qualite_procedures").fetchone()[0]
        proc_rev   = con.execute("SELECT COUNT(*) FROM qualite_procedures WHERE status='En révision'").fetchone()[0]
        std_total  = con.execute("SELECT COUNT(*) FROM qualite_standards").fetchone()[0]
        nc_open    = con.execute("SELECT COUNT(*) FROM qualite_nc WHERE status IN ('Ouverte','En cours')").fetchone()[0]
        nc_late    = con.execute(
            "SELECT COUNT(*) FROM qualite_nc WHERE status IN ('Ouverte','En cours') AND due_date IS NOT NULL AND due_date<?",
            [date.today().isoformat()]
        ).fetchone()[0]
    finally:
        con.close()
    return {
        "equipment_total": eq_total, "equipment_active": eq_active,
        "equipment_hs": eq_hs, "metrology_due": metro_due,
        "procedures_total": proc_total, "procedures_revision": proc_rev,
        "standards_total": std_total, "nc_open": nc_open, "nc_late": nc_late,
    }
