"""
tools/init_ralab4_db.py
Initialize the bootstrap RaLab4 schema used by the current package.
"""
from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.database import ensure_ralab4_schema


if __name__ == "__main__":
    path = ensure_ralab4_schema()
    print(f"[OK] RaLab4 schema ready: {path}")
