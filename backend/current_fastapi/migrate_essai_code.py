"""
migrate_essai_code.py
Ajoute la colonne essai_code à la table essais.
Usage: python migrate_essai_code.py
"""
import sqlite3
import sys
import os

def get_db_path():
    base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, 'data', 'ralab3.db')

def main():
    db = get_db_path()
    print(f"DB: {db}")
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row

    # Vérifier si la colonne existe déjà
    cols = [r['name'] for r in conn.execute("PRAGMA table_info(essais)")]
    if 'essai_code' in cols:
        print("Colonne essai_code déjà présente — rien à faire.")
        conn.close()
        return

    print("Ajout de la colonne essai_code...")
    conn.execute("ALTER TABLE essais ADD COLUMN essai_code TEXT NOT NULL DEFAULT ''")
    conn.commit()
    print("OK — colonne essai_code ajoutée.")

    # Vérification
    cols = [r['name'] for r in conn.execute("PRAGMA table_info(essais)")]
    print(f"Colonnes: {cols}")
    conn.close()

if __name__ == '__main__':
    main()
