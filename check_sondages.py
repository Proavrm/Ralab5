import sqlite3

db_path = r"backend/current_fastapi/data/ralab3.db"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

print(
    "sondage_couches =",
    cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sondage_couches'"
    ).fetchone()
)

print(
    "prelevements =",
    [
        row[1]
        for row in cur.execute("PRAGMA table_info(prelevements)").fetchall()
        if row[1] in ("point_terrain_id", "sondage_couche_id")
    ]
)

print(
    "series source_essai_id =",
    [
        row[1]
        for row in cur.execute("PRAGMA table_info(series_essais_terrain)").fetchall()
        if row[1] == "source_essai_id"
    ]
)

conn.close()