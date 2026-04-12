"""
migrate_add_moule_fields.py
Ajoute m_tare (g) et volume_cm3 (cm³) à qualite_equipment.
Ces champs permettent de caractériser les moules de laboratoire
(Proctor, CBR, etc.) pour la liaison automatique dans les essais.

Usage: python migrate_add_moule_fields.py
"""
import sqlite3
from app.core.database import get_db_path

def run():
    path = get_db_path()
    con = sqlite3.connect(str(path))
    con.row_factory = sqlite3.Row

    existing = {row[1] for row in con.execute("PRAGMA table_info(qualite_equipment)").fetchall()}

    added = []

    if "m_tare" not in existing:
        con.execute("ALTER TABLE qualite_equipment ADD COLUMN m_tare REAL")
        added.append("m_tare REAL")

    if "volume_cm3" not in existing:
        con.execute("ALTER TABLE qualite_equipment ADD COLUMN volume_cm3 REAL")
        added.append("volume_cm3 REAL")

    con.commit()
    con.close()

    if added:
        print(f"✓ Colonnes ajoutées à qualite_equipment : {', '.join(added)}")
    else:
        print("✓ Colonnes déjà présentes — rien à faire.")

if __name__ == "__main__":
    run()
