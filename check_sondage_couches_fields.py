import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "backend" / "current_fastapi"))

from app.core.database import get_db_path

conn = sqlite3.connect(str(get_db_path()))
cur = conn.cursor()

print(
    [row[1] for row in cur.execute("PRAGMA table_info(sondage_couches)").fetchall()
     if row[1] in ("granulo_elements", "forme_elements")]
)

conn.close()
