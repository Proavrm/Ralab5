"""
api/audits.py — RaLab4
Gestion des audits qualité laboratoire

GET    /api/audits                      → liste audits
GET    /api/audits/stats                → stats dashboard
GET    /api/audits/meta                 → valeurs de référence
GET    /api/audits/{uid}                → détail audit
POST   /api/audits                      → créer audit
PUT    /api/audits/{uid}                → modifier audit
DELETE /api/audits/{uid}                → supprimer audit

GET    /api/audits/{uid}/nc             → non-conformités d'un audit
POST   /api/audits/{uid}/nc             → créer NC
PUT    /api/audits/nc/{nc_id}           → modifier NC
DELETE /api/audits/nc/{nc_id}           → supprimer NC
"""
from __future__ import annotations
import re, sqlite3
from datetime import date, datetime
from typing import Optional
from app.core.database import get_db_path
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter()
DB_PATH = get_db_path()

TYPES_AUDIT  = ["Interne", "Externe", "COFRAC", "Client", "Fournisseur", "Autre"]
STATUTS_AUDIT = ["Planifié", "En cours", "Clôturé", "Annulé"]
TYPES_NC     = ["Majeure", "Mineure", "Observation", "Opportunité d'amélioration"]
STATUTS_NC   = ["Ouverte", "En cours", "Clôturée", "Vérifiée"]

# ── Pydantic ──────────────────────────────────────────────────────────────────

class AuditCreate(BaseModel):
    date_audit:   date           = Field(default_factory=date.today)
    date_fin:     Optional[date] = Field(None)
    type_audit:   str            = Field("Interne")
    organisme:    str            = Field("")
    responsable:  str            = Field("")
    perimetre:    str            = Field("")
    synthese:     str            = Field("")
    statut:       str            = Field("Planifié")

class AuditUpdate(BaseModel):
    date_audit:   Optional[date] = None
    date_fin:     Optional[date] = None
    type_audit:   Optional[str]  = None
    organisme:    Optional[str]  = None
    responsable:  Optional[str]  = None
    perimetre:    Optional[str]  = None
    synthese:     Optional[str]  = None
    statut:       Optional[str]  = None

class NcCreate(BaseModel):
    type_nc:            str            = Field("Mineure")
    description:        str            = Field("")
    action_corrective:  str            = Field("")
    responsable_action: str            = Field("")
    echeance:           Optional[date] = Field(None)
    statut:             str            = Field("Ouverte")

class NcUpdate(BaseModel):
    type_nc:            Optional[str]  = None
    description:        Optional[str]  = None
    action_corrective:  Optional[str]  = None
    responsable_action: Optional[str]  = None
    echeance:           Optional[date] = None
    date_cloture:       Optional[date] = None
    statut:             Optional[str]  = None

# ── Helpers ───────────────────────────────────────────────────────────────────

def _conn():
    c = sqlite3.connect(str(DB_PATH))
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.execute("PRAGMA journal_mode = WAL")
    return c

def _next_ref(conn) -> tuple[str, int, int]:
    year = datetime.now().year
    prefix = f"{year}-AUD-"
    rows = conn.execute(
        "SELECT reference FROM audits WHERE reference LIKE ?", (f"{prefix}%",)
    ).fetchall()
    nums = []
    for r in rows:
        m = re.match(rf"^{re.escape(prefix)}(\d+)$", r[0])
        if m: nums.append(int(m.group(1)))
    n = max(nums, default=0) + 1
    return f"{prefix}{n:03d}", year, n

def _row(row) -> dict:
    d = dict(row)
    d["uid"] = d.pop("id")
    return d

def _fmt(v) -> Optional[str]:
    if v is None: return None
    if isinstance(v, date): return v.isoformat()
    return str(v)

def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

# ── AUDITS ────────────────────────────────────────────────────────────────────

@router.get("/meta")
def meta():
    return {
        "types_audit": TYPES_AUDIT,
        "statuts_audit": STATUTS_AUDIT,
        "types_nc": TYPES_NC,
        "statuts_nc": STATUTS_NC,
    }


@router.get("/stats")
def stats():
    with _conn() as c:
        year = datetime.now().year
        today = date.today().isoformat()
        total_year   = c.execute("SELECT COUNT(*) FROM audits WHERE annee = ?", (year,)).fetchone()[0]
        planifies    = c.execute("SELECT COUNT(*) FROM audits WHERE statut = 'Planifié'").fetchone()[0]
        en_cours     = c.execute("SELECT COUNT(*) FROM audits WHERE statut = 'En cours'").fetchone()[0]
        nc_ouvertes  = c.execute("SELECT COUNT(*) FROM non_conformites WHERE statut IN ('Ouverte','En cours')").fetchone()[0]
        nc_retard    = c.execute(
            "SELECT COUNT(*) FROM non_conformites WHERE statut IN ('Ouverte','En cours') AND echeance < ? AND echeance IS NOT NULL",
            (today,)
        ).fetchone()[0]
    return {
        "total_year": total_year,
        "planifies": planifies,
        "en_cours": en_cours,
        "nc_ouvertes": nc_ouvertes,
        "nc_retard": nc_retard,
    }


@router.get("")
def list_audits(
    statut:     Optional[str] = Query(None),
    type_audit: Optional[str] = Query(None),
    annee:      Optional[int] = Query(None),
    search:     Optional[str] = Query(None),
):
    sql = """
        SELECT a.*,
               COUNT(nc.id) AS nb_nc,
               COUNT(CASE WHEN nc.statut IN ('Ouverte','En cours') THEN 1 END) AS nb_nc_ouvertes
        FROM audits a
        LEFT JOIN non_conformites nc ON nc.audit_id = a.id
        WHERE 1=1
    """
    params = []
    if statut:     sql += " AND a.statut = ?";     params.append(statut)
    if type_audit: sql += " AND a.type_audit = ?"; params.append(type_audit)
    if annee:      sql += " AND a.annee = ?";      params.append(annee)
    if search:
        sql += " AND (a.reference LIKE ? OR a.organisme LIKE ? OR a.responsable LIKE ? OR a.perimetre LIKE ?)"
        like = f"%{search}%"; params.extend([like]*4)
    sql += " GROUP BY a.id ORDER BY a.date_audit DESC, a.id DESC"
    with _conn() as c:
        rows = c.execute(sql, params).fetchall()
    return [_row(r) for r in rows]


@router.get("/nc/open")
def nc_open():
    """Toutes les NCs ouvertes/en cours — vue globale."""
    today = date.today().isoformat()
    with _conn() as c:
        rows = c.execute("""
            SELECT nc.*, a.reference AS audit_ref, a.type_audit, a.organisme
            FROM non_conformites nc
            JOIN audits a ON a.id = nc.audit_id
            WHERE nc.statut IN ('Ouverte', 'En cours')
            ORDER BY nc.echeance ASC, nc.id ASC
        """).fetchall()
    result = []
    for r in rows:
        d = _row(r)
        d["en_retard"] = bool(r["echeance"] and r["echeance"] < today)
        result.append(d)
    return result


@router.get("/{uid}")
def get_audit(uid: int):
    with _conn() as c:
        row = c.execute("""
            SELECT a.*,
                   COUNT(nc.id) AS nb_nc,
                   COUNT(CASE WHEN nc.statut IN ('Ouverte','En cours') THEN 1 END) AS nb_nc_ouvertes
            FROM audits a
            LEFT JOIN non_conformites nc ON nc.audit_id = a.id
            WHERE a.id = ? GROUP BY a.id
        """, (uid,)).fetchone()
    if not row: raise HTTPException(404, f"Audit #{uid} introuvable")
    return _row(row)


@router.post("", status_code=201)
def create_audit(body: AuditCreate):
    now = _now()
    with _conn() as c:
        ref, annee, numero = _next_ref(c)
        c.execute("""
            INSERT INTO audits
            (reference, annee, numero, date_audit, date_fin, type_audit,
             organisme, responsable, perimetre, synthese, statut, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            ref, annee, numero,
            _fmt(body.date_audit), _fmt(body.date_fin),
            body.type_audit, body.organisme, body.responsable,
            body.perimetre, body.synthese, body.statut,
            now, now,
        ))
        uid = c.execute("SELECT last_insert_rowid()").fetchone()[0]
    return get_audit(uid)


@router.put("/{uid}")
def update_audit(uid: int, body: AuditUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    for k in ("date_audit", "date_fin"):
        if k in fields and isinstance(fields[k], date):
            fields[k] = fields[k].isoformat()
    fields["updated_at"] = _now()
    clause = ", ".join(f"{k} = ?" for k in fields)
    with _conn() as c:
        c.execute(f"UPDATE audits SET {clause} WHERE id = ?", list(fields.values()) + [uid])
    return get_audit(uid)


@router.delete("/{uid}", status_code=204)
def delete_audit(uid: int):
    with _conn() as c:
        cur = c.execute("DELETE FROM audits WHERE id = ?", (uid,))
    if not cur.rowcount: raise HTTPException(404)

# ── NON-CONFORMITES ───────────────────────────────────────────────────────────

@router.get("/{uid}/nc")
def list_nc(uid: int):
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM non_conformites WHERE audit_id = ? ORDER BY id ASC", (uid,)
        ).fetchall()
    today = date.today().isoformat()
    result = []
    for r in rows:
        d = _row(r)
        d["en_retard"] = bool(r["echeance"] and r["echeance"] < today and r["statut"] in ("Ouverte","En cours"))
        result.append(d)
    return result


@router.post("/{uid}/nc", status_code=201)
def create_nc(uid: int, body: NcCreate):
    # Vérifier audit existe
    with _conn() as c:
        if not c.execute("SELECT id FROM audits WHERE id = ?", (uid,)).fetchone():
            raise HTTPException(404, f"Audit #{uid} introuvable")
        # Générer référence NC
        count = c.execute("SELECT COUNT(*) FROM non_conformites WHERE audit_id = ?", (uid,)).fetchone()[0]
        audit_ref = c.execute("SELECT reference FROM audits WHERE id = ?", (uid,)).fetchone()[0]
        nc_ref = f"{audit_ref}-NC{count+1:02d}"
        now = _now()
        c.execute("""
            INSERT INTO non_conformites
            (audit_id, reference, type_nc, description, action_corrective,
             responsable_action, echeance, statut, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (
            uid, nc_ref, body.type_nc, body.description,
            body.action_corrective, body.responsable_action,
            _fmt(body.echeance), body.statut, now, now,
        ))
        nc_id = c.execute("SELECT last_insert_rowid()").fetchone()[0]
    with _conn() as c:
        row = c.execute("SELECT * FROM non_conformites WHERE id = ?", (nc_id,)).fetchone()
    d = _row(row)
    d["en_retard"] = False
    return d


@router.put("/nc/{nc_id}")
def update_nc(nc_id: int, body: NcUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    for k in ("echeance", "date_cloture"):
        if k in fields and isinstance(fields[k], date):
            fields[k] = fields[k].isoformat()
    # Auto-clôture
    if fields.get("statut") in ("Clôturée", "Vérifiée") and "date_cloture" not in fields:
        fields["date_cloture"] = date.today().isoformat()
    fields["updated_at"] = _now()
    clause = ", ".join(f"{k} = ?" for k in fields)
    with _conn() as c:
        c.execute(f"UPDATE non_conformites SET {clause} WHERE id = ?", list(fields.values()) + [nc_id])
        row = c.execute("SELECT * FROM non_conformites WHERE id = ?", (nc_id,)).fetchone()
    if not row: raise HTTPException(404)
    today = date.today().isoformat()
    d = _row(row)
    d["en_retard"] = bool(row["echeance"] and row["echeance"] < today and row["statut"] in ("Ouverte","En cours"))
    return d


@router.delete("/nc/{nc_id}", status_code=204)
def delete_nc(nc_id: int):
    with _conn() as c:
        cur = c.execute("DELETE FROM non_conformites WHERE id = ?", (nc_id,))
    if not cur.rowcount: raise HTTPException(404)
