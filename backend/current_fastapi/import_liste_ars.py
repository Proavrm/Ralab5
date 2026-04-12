"""
import_liste_ars.py — Importe Liste_ARS.xlsb dans qualite_equipment
Usage: python import_liste_ars.py <chemin_vers_Liste_ARS.xlsb>
       python import_liste_ars.py  (cherche dans le répertoire courant)
"""
import sys, os, sqlite3
from datetime import datetime, date

try:
    from pyxlsb import open_workbook
except ImportError:
    print("pip install pyxlsb"); sys.exit(1)

XLSB = sys.argv[1] if len(sys.argv) > 1 else "Liste_ARS.xlsb"
DB   = os.path.join(os.path.dirname(__file__), "data", "ralab3.db")

if not os.path.exists(XLSB):
    print(f"Fichier non trouvé: {XLSB}"); sys.exit(1)
if not os.path.exists(DB):
    print(f"DB non trouvée: {DB}"); sys.exit(1)

def xl_date(v):
    """Convertit un nombre Excel en date ISO ou None."""
    if not v or not isinstance(v, (int, float)): return None
    try:
        from datetime import datetime
        d = datetime.fromordinal(datetime(1899,12,30).toordinal() + int(v))
        return d.date().isoformat()
    except: return None

con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
con.execute("PRAGMA foreign_keys=ON")

total = 0
skipped = 0

with open_workbook(XLSB) as wb:
    # ── Matériel (cat: Labo/Terrain selon domaine) ──────────────────────────
    with wb.get_sheet('Matériel') as ws:
        rows = list(ws.rows())
        # Row 0 = headers, Row 1 = sub-headers (Oui/Non), data from Row 2
        for row in rows[2:]:
            cells = [c.v for c in row]
            if not cells[0]: continue  # skip empty rows
            label = str(cells[0]).strip()
            domain = str(cells[1]).strip() if cells[1] else None
            code  = str(cells[2]).strip() if cells[2] else None
            if not code or not label: continue
            purchase_date = xl_date(cells[3])
            status = str(cells[4]).strip() if cells[4] else 'En service'
            serial = str(cells[5]).strip() if cells[5] else None
            descriptif = str(cells[6]).strip() if cells[6] else None
            lieu   = str(cells[7]).strip() if cells[7] else None
            eta_int = int(cells[9]) if cells[9] and isinstance(cells[9],(int,float)) else None
            ver_int = int(cells[10]) if cells[10] and isinstance(cells[10],(int,float)) else None
            presence = 'Oui' if cells[11] == 'X' else ('Non' if cells[12] == 'X' else None)
            category = 'Labo'
            if domain and any(x in domain.upper() for x in ['TERRAIN', 'G3', 'SOL']):
                category = 'Terrain'
            # Check if already exists
            exists = con.execute("SELECT id FROM qualite_equipment WHERE code=?", [code]).fetchone()
            if exists:
                skipped += 1; continue
            con.execute(
                """INSERT INTO qualite_equipment
                   (code,label,category,domain,status,serial_number,
                    purchase_date,lieu,etalonnage_interval,verification_interval,presence,notes)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                [code, label, category, domain, status, serial,
                 purchase_date, lieu, eta_int, ver_int, presence, descriptif]
            )
            total += 1

    # ── Vérifications (cat: Vérification) ───────────────────────────────────
    with wb.get_sheet('Vérifications') as ws:
        rows = list(ws.rows())
        for row in rows[2:]:
            cells = [c.v for c in row]
            if not cells[0]: continue
            label = str(cells[0]).strip()
            code  = str(cells[1]).strip() if cells[1] else None
            if not code or not label: continue
            purchase_date = xl_date(cells[2])
            status = str(cells[3]).strip() if cells[3] else 'En service'
            serial = str(cells[4]).strip() if cells[4] else None
            descriptif = str(cells[5]).strip() if cells[5] else None
            lieu   = str(cells[6]).strip() if cells[6] else None
            eta_int = int(cells[9]) if cells[9] and isinstance(cells[9],(int,float)) else None
            en_usage = cells[10] if len(cells)>10 else None
            presence = 'Oui' if en_usage else None
            exists = con.execute("SELECT id FROM qualite_equipment WHERE code=?", [code]).fetchone()
            if exists:
                skipped += 1; continue
            con.execute(
                """INSERT INTO qualite_equipment
                   (code,label,category,status,serial_number,
                    purchase_date,lieu,etalonnage_interval,presence,notes)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                [code, label, 'Vérification', status, serial,
                 purchase_date, lieu, eta_int, presence, descriptif]
            )
            total += 1

    # ── Tamis (cat: Tamis) ───────────────────────────────────────────────────
    with wb.get_sheet('Tamis') as ws:
        rows = list(ws.rows())
        for row in rows[2:]:
            cells = [c.v for c in row]
            if not cells[0]: continue
            label = str(cells[0]).strip()
            code  = str(cells[2]).strip() if cells[2] else None
            if not code or not label: continue
            purchase_date = xl_date(cells[3])
            status = str(cells[4]).strip() if cells[4] else 'En service'
            serial = str(cells[5]).strip() if cells[5] else None
            descriptif = str(cells[6]).strip() if cells[6] else None
            lieu   = str(cells[7]).strip() if cells[7] else None
            eta_int = int(cells[9]) if cells[9] and isinstance(cells[9],(int,float)) else None
            exists = con.execute("SELECT id FROM qualite_equipment WHERE code=?", [code]).fetchone()
            if exists:
                skipped += 1; continue
            con.execute(
                """INSERT INTO qualite_equipment
                   (code,label,category,status,serial_number,
                    purchase_date,lieu,etalonnage_interval,notes)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                [code, label, 'Tamis', status, serial,
                 purchase_date, lieu, eta_int, descriptif]
            )
            total += 1

con.commit()
con.close()
print(f"✓ Import terminé: {total} équipements importés, {skipped} ignorés (déjà présents)")
