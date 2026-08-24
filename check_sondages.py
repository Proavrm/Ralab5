import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend" / "current_fastapi"))

from app.core.database import get_db_path

db_path = str(get_db_path())

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
    "source_essai_id"
    in {row[1] for row in cur.execute("PRAGMA table_info(series_essais_terrain)").fetchall()}
)

conn.close()
