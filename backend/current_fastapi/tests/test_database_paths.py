from __future__ import annotations

from pathlib import Path

import pytest

from app.core.database import (
    DEFAULT_DB_NAME,
    LEGACY_DB_NAME,
    RALAB4_DB_PATH_ENV,
    RALAB5_DB_PATH_ENV,
    get_db_path,
    resolve_default_db_path,
)


def test_get_db_path_prefers_ralab5_env(monkeypatch, tmp_path: Path) -> None:
    custom = tmp_path / "custom.db"
    monkeypatch.setenv(RALAB5_DB_PATH_ENV, str(custom))
    monkeypatch.delenv(RALAB4_DB_PATH_ENV, raising=False)
    assert get_db_path() == custom


def test_get_db_path_falls_back_to_ralab4_env(monkeypatch, tmp_path: Path) -> None:
    custom = tmp_path / "legacy-env.db"
    monkeypatch.delenv(RALAB5_DB_PATH_ENV, raising=False)
    monkeypatch.setenv(RALAB4_DB_PATH_ENV, str(custom))
    assert get_db_path() == custom


def test_resolve_default_db_path_prefers_existing_ralab5(monkeypatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    ralab5 = data_dir / DEFAULT_DB_NAME
    ralab3 = data_dir / LEGACY_DB_NAME
    ralab5.touch()
    ralab3.touch()

    monkeypatch.setattr("app.core.database.DATA_DIR", data_dir)
    monkeypatch.delenv(RALAB5_DB_PATH_ENV, raising=False)
    monkeypatch.delenv(RALAB4_DB_PATH_ENV, raising=False)

    assert resolve_default_db_path() == ralab5


def test_resolve_default_db_path_falls_back_to_existing_ralab3(monkeypatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    ralab3 = data_dir / LEGACY_DB_NAME
    ralab3.touch()

    monkeypatch.setattr("app.core.database.DATA_DIR", data_dir)
    monkeypatch.delenv(RALAB5_DB_PATH_ENV, raising=False)
    monkeypatch.delenv(RALAB4_DB_PATH_ENV, raising=False)

    assert resolve_default_db_path() == ralab3


def test_resolve_default_db_path_defaults_to_ralab5_for_new_install(monkeypatch, tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    monkeypatch.setattr("app.core.database.DATA_DIR", data_dir)
    monkeypatch.delenv(RALAB5_DB_PATH_ENV, raising=False)
    monkeypatch.delenv(RALAB4_DB_PATH_ENV, raising=False)

    assert resolve_default_db_path() == data_dir / DEFAULT_DB_NAME


def test_ensure_ralab4_schema_delegates_to_ralab5(monkeypatch, tmp_path: Path) -> None:
    from app.core.database import ensure_ralab4_schema

    expected = tmp_path / "via-alias.db"
    monkeypatch.setattr(
        "app.core.database.ensure_ralab5_schema",
        lambda db_path=None: expected,
    )
    assert ensure_ralab4_schema() == expected
