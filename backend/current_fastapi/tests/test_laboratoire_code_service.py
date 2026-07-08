import sqlite3
from pathlib import Path

import pytest

from app.repositories.laboratoires_repository import LaboratoiresRepository
from app.services import laboratoire_code_service as svc


@pytest.fixture()
def lab_db(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"

    def _db_path():
        return db_path

    monkeypatch.setattr("app.core.database.get_db_path", _db_path)
    monkeypatch.setattr("app.services.laboratoire_code_service.get_db_path", _db_path)
    monkeypatch.setattr("app.repositories.laboratoires_repository.get_db_path", _db_path)

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE laboratoires (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                nom TEXT NOT NULL,
                region TEXT NOT NULL DEFAULT 'ARS',
                actif INTEGER NOT NULL DEFAULT 1,
                address TEXT NOT NULL DEFAULT '',
                report_header TEXT NOT NULL DEFAULT '',
                lat REAL,
                lon REAL,
                coords_updated_at TEXT NOT NULL DEFAULT '',
                responsable_email TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                agence_code TEXT NOT NULL DEFAULT ''
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE demandes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                reference TEXT NOT NULL,
                labo_code TEXT NOT NULL DEFAULT 'SP'
            )
            """
        )
        conn.execute(
            "INSERT INTO laboratoires (code, nom, region, agence_code) VALUES ('CHB', 'Chambéry', 'ARS', 'RA')"
        )
        conn.execute(
            "INSERT INTO demandes (reference, labo_code) VALUES ('2026-CHB-D0001', 'CHB')"
        )
        conn.commit()

    return db_path


def test_rename_laboratoire_code_updates_laboratoires_and_demandes(lab_db):
    result = svc.rename_laboratoire_code("CHB", "SVV")
    assert result["new_code"] == "SVV"

    with sqlite3.connect(lab_db) as conn:
        code = conn.execute("SELECT code FROM laboratoires WHERE code = 'SVV'").fetchone()[0]
        row = conn.execute("SELECT labo_code, reference FROM demandes").fetchone()

    assert code == "SVV"
    assert row[0] == "SVV"
    assert row[1] == "2026-SVV-D0001"


def test_delete_laboratoire_code_without_references(lab_db):
    with sqlite3.connect(lab_db) as conn:
        conn.execute(
            "INSERT INTO laboratoires (code, nom, region, agence_code) VALUES ('ZZZ', 'Test', 'ARS', 'RA')"
        )
        conn.commit()

    result = svc.delete_laboratoire_code("ZZZ")
    assert result["deleted_code"] == "ZZZ"

    with sqlite3.connect(lab_db) as conn:
        row = conn.execute("SELECT code FROM laboratoires WHERE code = 'ZZZ'").fetchone()
    assert row is None


def test_delete_laboratoire_code_blocks_when_referenced(lab_db):
    with pytest.raises(ValueError, match="références actives"):
        svc.delete_laboratoire_code("CHB")
