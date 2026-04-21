import sqlite3

db_path = r"backend/current_fastapi/data/ralab3.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

print(
    [row[1] for row in cur.execute("PRAGMA table_info(sondage_couches)").fetchall()
     if row[1] in ("granulo_elements", "forme_elements")]
)

conn.close()
