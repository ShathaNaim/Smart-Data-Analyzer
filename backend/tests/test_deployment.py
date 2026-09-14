import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.config import Settings


class DeploymentTests(unittest.TestCase):
    def test_health_check_does_not_need_database_or_owner_cookie(self):
        with patch("backend.app.anonymous_identity._cookie_secret", side_effect=AssertionError):
            with TestClient(app) as client:
                response = client.get("/healthz")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertNotIn("set-cookie", response.headers)

    def test_production_cors_origins_are_loaded_from_json(self):
        with patch.dict("os.environ", {"CORS_ORIGINS": '["https://portfolio.example"]'}):
            settings = Settings(_env_file=None)
        self.assertEqual(settings.cors_origins, ["https://portfolio.example"])

    def test_proxy_deployment_can_disable_cross_origin_access(self):
        with patch.dict("os.environ", {"CORS_ORIGINS": "[]"}):
            settings = Settings(_env_file=None)
        self.assertEqual(settings.cors_origins, [])
