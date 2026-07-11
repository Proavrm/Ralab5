"""Smoke tests HTTP — routers montés et endpoints GET sans erreur 500."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

PUBLIC_GET_PATHS = (
    "/api/status",
    "/api/auth/hint",
)

SMOKE_GET_PATHS = (
    "/api/affaires",
    "/api/demandes_rst",
    "/api/passations",
    "/api/interventions",
    "/api/essais",
    "/api/g3/missions",
    "/api/g3/catalogs",
    "/api/contacts",
    "/api/planning/demandes",
    "/api/planning/items",
    "/api/dst/status",
    "/api/qualite/stats",
    "/api/reference-sources",
    "/api/import-historique-labo/status",
)

OPENAPI_REQUIRED_PREFIXES = (
    "/api/status",
    "/api/auth/login",
    "/api/affaires",
    "/api/g3/missions",
    "/api/dst/status",
    "/api/import-historique-labo/status",
)


class RouterSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        smoke_tmp = tempfile.mkdtemp(prefix="ralab5-router-smoke-")
        os.environ["RALAB_AUTH_MODE"] = "passwordless"
        os.environ["RALAB5_DB_PATH"] = str(Path(smoke_tmp) / "ralab5-smoke.db")
        os.environ["RALAB_ALLOWED_HOSTS"] = "*"

        from fastapi.testclient import TestClient

        from api_main import app

        cls.client = TestClient(app)

    def test_status_ok(self):
        response = self.client.get("/api/status")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get("status"), "ok")

    def test_public_get_routes(self):
        for path in PUBLIC_GET_PATHS:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200, response.text)

    def test_smoke_get_routes_do_not_500(self):
        for path in SMOKE_GET_PATHS:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertLess(
                    response.status_code,
                    500,
                    f"{path} -> {response.status_code}: {response.text[:300]}",
                )

    def test_openapi_lists_core_paths(self):
        response = self.client.get("/openapi.json")
        self.assertEqual(response.status_code, 200)
        paths = set(response.json().get("paths", {}).keys())
        for prefix in OPENAPI_REQUIRED_PREFIXES:
            self.assertIn(prefix, paths, msg=f"missing OpenAPI path {prefix}")


if __name__ == "__main__":
    unittest.main()
