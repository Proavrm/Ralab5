import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.repositories.campaign_type_catalog_repository import (
    CampaignTypeCatalogRepository,
    DEFAULT_CAMPAIGN_TYPE_CATALOG,
    RETIRED_CAMPAIGN_TYPE_CODES,
    normalize_campaign_type_code,
)


def _repo_with_reconcile() -> tuple[CampaignTypeCatalogRepository, Path]:
    fd, raw_path = tempfile.mkstemp(suffix=".db")
    path = Path(raw_path)
    import os
    os.close(fd)
    with sqlite3.connect(path) as conn:
        CampaignTypeCatalogRepository.reconcile_catalog(conn)
        conn.commit()
    return CampaignTypeCatalogRepository(path), path


class CampaignTypeCatalogTests(unittest.TestCase):
    def test_normalize_campaign_type_code(self):
        self.assertEqual(normalize_campaign_type_code(" suivi cirr "), "SUIVI-CIRR")
        self.assertEqual(normalize_campaign_type_code("diag_ch"), "DIAG-CH")

    def test_bootstrap_includes_operational_catalog(self):
        repo, _path = _repo_with_reconcile()
        rows = repo.list_active()
        self.assertEqual(len(rows), len(DEFAULT_CAMPAIGN_TYPE_CATALOG))
        codes = {row["code"] for row in rows}
        self.assertIn("DEM-CH", codes)
        self.assertIn("SUIV-CH", codes)
        self.assertIn("G3", codes)
        self.assertIn("NOTE-GEO", codes)
        self.assertIn("CALC-GEO", codes)
        self.assertIn("LEV-RES", codes)
        self.assertNotIn("RARX", codes)
        self.assertNotIn("SUIVI-CIRR", codes)
        self.assertNotIn("TEMOIN", codes)

    def test_reconcile_retires_legacy_codes(self):
        repo, _path = _repo_with_reconcile()
        with sqlite3.connect(repo.db_path) as conn:
            for code in ("RARX", "TEMOIN", "VC"):
                conn.execute(
                    """
                    INSERT INTO campaign_type_catalog (
                        code, label, description, category, sort_order, is_active, is_system
                    ) VALUES (?, ?, '', '', 999, 1, 1)
                    """,
                    (code, code),
                )
                conn.commit()
        with sqlite3.connect(repo.db_path) as conn:
            CampaignTypeCatalogRepository.reconcile_catalog(conn)
            conn.commit()
        rows = repo.list_active()
        codes = {row["code"] for row in rows}
        for code in ("RARX", "TEMOIN", "VC"):
            self.assertNotIn(code, codes)
            self.assertIn(code, RETIRED_CAMPAIGN_TYPE_CODES)

    def test_sync_updates_system_labels(self):
        repo, _path = _repo_with_reconcile()
        with sqlite3.connect(repo.db_path) as conn:
            CampaignTypeCatalogRepository.sync_system_defaults(conn)
            conn.commit()
        row = repo.get_by_code("DIAG-CH")
        self.assertEqual(row["label"], "Campagne de diagnostic chaussée")
        self.assertEqual(row["category"], "Diagnostic")

    def test_create_custom_type(self):
        repo, _path = _repo_with_reconcile()
        created = repo.create(
            code="SPECIAL-01",
            label="Campagne spéciale affaire",
            description="Type ajouté par un utilisateur.",
            category="Autre",
        )
        self.assertEqual(created["code"], "SPECIAL-01")
        self.assertFalse(created["is_system"])
        rows = repo.list_active()
        self.assertEqual(len(rows), len(DEFAULT_CAMPAIGN_TYPE_CATALOG) + 1)

    def test_create_rejects_duplicate_code(self):
        repo, _path = _repo_with_reconcile()
        repo.create(code="VC2", label="Visite 2", description="")
        with self.assertRaises(ValueError):
            repo.create(code="vc2", label="Autre visite", description="")


if __name__ == "__main__":
    unittest.main()
