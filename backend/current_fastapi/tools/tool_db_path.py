"""Shared default SQLite path for CLI tools under backend/current_fastapi/tools/."""
from __future__ import annotations

from pathlib import Path

_FASTAPI_ROOT = Path(__file__).resolve().parents[1]


def get_tool_db_path() -> Path:
    import sys

    root = str(_FASTAPI_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)
    from app.core.database import get_db_path

    return get_db_path()
