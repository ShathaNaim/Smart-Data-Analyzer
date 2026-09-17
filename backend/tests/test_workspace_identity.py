import os
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from backend.app.anonymous_identity import ANONYMOUS_COOKIE_NAME, create_signed_owner_cookie
from backend.app.auth_dependencies import get_workspace_owner_id
from backend.database import get_db
from backend.services.session_service import SESSION_COOKIE_NAME


class WorkspaceIdentityTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {
            'ANONYMOUS_COOKIE_SECRET': 'test-secret-that-is-at-least-32-characters',
            'COOKIE_SECURE': 'false',
        })
        environment.start()
        self.addCleanup(environment.stop)
        self.db = Mock()
        app = FastAPI()
        app.dependency_overrides[get_db] = lambda: self.db

        @app.get('/owner')
        def owner(owner_id: uuid.UUID = Depends(get_workspace_owner_id)):
            return {'owner_id': str(owner_id)}

        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_account_takes_precedence_over_guest_cookie(self):
        account_id = uuid.uuid4()
        self.db.scalar.return_value = SimpleNamespace(id=account_id)
        self.client.cookies.set(SESSION_COOKIE_NAME, 'valid-session')
        self.client.cookies.set(ANONYMOUS_COOKIE_NAME, create_signed_owner_cookie(uuid.uuid4()))
        response = self.client.get('/owner')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['owner_id'], str(account_id))
        self.assertNotIn('set-cookie', response.headers)
        self.db.scalar.assert_called_once()

    def test_guest_cookie_is_reused_without_database_lookup(self):
        guest_id = uuid.uuid4()
        self.client.cookies.set(ANONYMOUS_COOKIE_NAME, create_signed_owner_cookie(guest_id))
        response = self.client.get('/owner')
        self.assertEqual(response.json()['owner_id'], str(guest_id))
        self.db.scalar.assert_not_called()

    def test_new_guest_gets_a_stable_identity(self):
        first = self.client.get('/owner')
        self.assertEqual(first.status_code, 200)
        self.assertIn(ANONYMOUS_COOKIE_NAME, first.headers['set-cookie'])
        self.assertEqual(first.json(), self.client.get('/owner').json())
        self.db.scalar.assert_not_called()

    def test_rejected_session_never_falls_back_to_guest(self):
        self.db.scalar.return_value = None
        self.client.cookies.set(ANONYMOUS_COOKIE_NAME, create_signed_owner_cookie(uuid.uuid4()))
        for token in ['unknown-or-expired-session', '', 'x' * 129]:
            with self.subTest(token_length=len(token)):
                self.client.cookies.set(SESSION_COOKIE_NAME, token)
                response = self.client.get('/owner')
                self.assertEqual(response.status_code, 401)
                self.assertNotIn('set-cookie', response.headers)
