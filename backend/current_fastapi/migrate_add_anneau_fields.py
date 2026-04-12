"""
migrate_add_anneau_fields.py
Ajoute capacite (kN), sensibilite (kN/div) et facteur_k (kN/div)
à la table qualite_equipment pour les anneaux dynamométriques / capteurs.

Usage: python migrate_add_anneau_fields.py
"""
import sqlite3
from app.core.database import get_db_path

def run():
    path = get_db_path()
    con = sqlite3.connect(str(path))
    existing = {row[1] for row in con.execute("PRAGMA table_info(qualite_equipment)").fetchall()}
    added = []
    for col, typ in [('m_tare','REAL'), ('volume_cm3','REAL'),
                     ('capacite','REAL'), ('sensibilite','REAL'), ('facteur_k','REAL')]:
        if col not in existing:
            con.execute(f"ALTER TABLE qualite_equipment ADD COLUMN {col} {typ}")
            added.append(f"{col} {typ}")
    con.commit()
    con.close()
    if added:
        print(f"✓ Colonnes ajoutées : {', '.join(added)}")
    else:
        print("✓ Toutes les colonnes déjà présentes — rien à faire.")

if __name__ == "__main__":
    run()
