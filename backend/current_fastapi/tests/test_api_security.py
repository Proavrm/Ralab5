"""Tests de la politique d'authentification API."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from app.core import api_security


class ApiSecurityPolicyTests(unittest.TestCase):
    def test_api_auth_required_in_proxy_mode(self):
        with patch.dict(os.environ, {"RALAB_AUTH_MODE": "proxy", "RALAB_REQUIRE_API_AUTH": ""}, clear=False):
            self.assertTrue(api_security.api_auth_required())

    def test_api_auth_optional_in_passwordless_by_default(self):
        with patch.dict(os.environ, {"RALAB_AUTH_MODE": "passwordless", "RALAB_REQUIRE_API_AUTH": ""}, clear=False):
            self.assertFalse(api_security.api_auth_required())

    def test_storage_protected_in_proxy_mode(self):
        with patch.dict(os.environ, {"RALAB_AUTH_MODE": "proxy", "RALAB_PROTECT_STORAGE": ""}, clear=False):
            self.assertTrue(api_security.storage_auth_required())

    def test_public_login_route(self):
        self.assertTrue(api_security.is_public_api_route("POST", "/api/auth/login"))
        self.assertFalse(api_security.is_public_api_route("GET", "/api/g3/missions"))

    def test_users_public_on_localhost_in_proxy_mode(self):
        from unittest.mock import Mock

        request = Mock()
        request.headers = {"host": "localhost:5173"}
        request.client = Mock(host="127.0.0.1")
        with patch.dict(os.environ, {"RALAB_AUTH_MODE": "proxy", "RALAB_REQUIRE_API_AUTH": ""}, clear=False):
            self.assertTrue(api_security.is_public_api_route("GET", "/api/auth/users", request))


if __name__ == "__main__":
    unittest.main()
