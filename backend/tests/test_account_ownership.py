"""Database-backed ownership tests; SQLite exercises transactions, not PG locking."""
import os
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.models import Dataset, Dashboard, User, UserSession, DashboardShareLink
from backend.app.api import auth, dataset, dashboard
from backend.app.anonymous_identity import ANONYMOUS_COOKIE_NAME, create_signed_owner_cookie
from backend.services.session_service import SESSION_COOKIE_NAME, create_session
from backend.services.workspace_transfer import transfer_guest_workspace


@compiles(JSONB, 'sqlite')
def compile_jsonb_sqlite(type_, compiler, **kwargs):
    return 'JSON'


class AccountOwnershipTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {'ANONYMOUS_COOKIE_SECRET': 'test-secret-that-is-at-least-32-characters'})
        env.start()
        self.addCleanup(env.stop)
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.db.close)
        self.a = User(email='a@example.com', password_hash='unused')
        self.b = User(email='b@example.com', password_hash='unused')
        self.db.add_all([self.a, self.b])
        self.db.flush()
        self.session_a, self.token_a = create_session(self.a.id)
        self.session_b, self.token_b = create_session(self.b.id)
        self.guest = uuid.uuid4()
        self.guest_cookie = create_signed_owner_cookie(self.guest)
        self.guest_data = self.make_dataset(self.guest, 'guest.csv')
        self.a_data = self.make_dataset(self.a.id, 'a.csv')
        self.b_data = self.make_dataset(self.b.id, 'b.csv')
        self.board = Dashboard(dataset_id=self.guest_data.id, owner_id=self.guest, name='Guest board')
        self.db.add_all([self.session_a, self.session_b, self.board])
        self.db.flush()
        self.link = DashboardShareLink(dashboard_id=self.board.id, token_hash='x' * 64)
        self.db.add(self.link)
        self.db.commit()
        app = FastAPI()
        app.dependency_overrides[get_db] = lambda: self.db
        for module in (auth, dataset, dashboard):
            app.include_router(module.router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.client.cookies.set(ANONYMOUS_COOKIE_NAME, self.guest_cookie)
        self.client.cookies.set(SESSION_COOKIE_NAME, self.token_a)
        self.origin = {'Origin': 'http://localhost:3000'}

    def make_dataset(self, owner, name):
        data = Dataset(owner_id=owner, original_filename=name, stored_filename=name,
                       extension='.csv', file_size=1, row_count=1, columns=['value'])
        self.db.add(data)
        self.db.flush()
        return data

    def test_accounts_are_isolated_and_same_account_works_without_guest_cookie(self):
        self.assertEqual([x['id'] for x in self.client.get('/datasets').json()], [str(self.a_data.id)])
        self.client.cookies.set(SESSION_COOKIE_NAME, self.token_b)
        self.assertEqual([x['id'] for x in self.client.get('/datasets').json()], [str(self.b_data.id)])
        self.assertEqual(self.client.delete(f'/datasets/{self.a_data.id}').status_code, 404)
        self.client.cookies.set(SESSION_COOKIE_NAME, self.token_a)
        self.client.cookies.delete(ANONYMOUS_COOKIE_NAME)
        self.assertEqual([x['id'] for x in self.client.get('/datasets').json()], [str(self.a_data.id)])

    def test_transfer_requires_explicit_request_and_moves_related_records(self):
        summary = self.client.get('/auth/guest-workspace')
        self.assertEqual(summary.json(), {'datasets': 1, 'dashboards': 1})
        self.db.refresh(self.guest_data)
        self.assertEqual(self.guest_data.owner_id, self.guest)
        response = self.client.post('/auth/guest-workspace/transfer', headers=self.origin, json={'expected_account_id': str(self.a.id)})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'datasets': 1, 'dashboards': 1})
        for row in (self.guest_data, self.board, self.b_data, self.link):
            self.db.refresh(row)
        self.assertEqual(self.guest_data.owner_id, self.a.id)
        self.assertEqual(self.board.owner_id, self.a.id)
        self.assertEqual(self.b_data.owner_id, self.b.id)
        self.assertTrue(self.link.is_active)
        self.assertEqual(self.guest_data.stored_filename, 'guest.csv')
        # Replaying the old guest cookie cannot claim already transferred data.
        self.client.cookies.set(SESSION_COOKIE_NAME, self.token_b)
        self.client.cookies.set(ANONYMOUS_COOKIE_NAME, self.guest_cookie)
        response = self.client.post('/auth/guest-workspace/transfer', headers=self.origin, json={'expected_account_id': str(self.b.id)})
        self.assertEqual(response.json(), {'datasets': 0, 'dashboards': 0})
        self.db.refresh(self.guest_data)
        self.assertEqual(self.guest_data.owner_id, self.a.id)

    def test_transfer_rejects_guest_tampering_and_disallowed_origin(self):
        self.assertEqual(self.client.post('/auth/guest-workspace/transfer').status_code, 403)
        self.client.cookies.set(ANONYMOUS_COOKIE_NAME, 'tampered')
        self.assertEqual(self.client.post('/auth/guest-workspace/transfer', headers=self.origin, json={'expected_account_id': str(self.a.id)}).status_code, 409)
        self.client.cookies.delete(SESSION_COOKIE_NAME)
        self.assertEqual(self.client.post('/auth/guest-workspace/transfer', headers=self.origin, json={'expected_account_id': str(self.a.id)}).status_code, 401)
        self.db.refresh(self.guest_data)
        self.assertEqual(self.guest_data.owner_id, self.guest)

    def test_failed_transfer_rolls_back_both_owners(self):
        execute = self.db.execute
        updates = 0
        def fail_second_update(statement, *args, **kwargs):
            nonlocal updates
            if getattr(statement, 'is_update', False):
                updates += 1
                if updates == 2:
                    raise RuntimeError('Simulated database failure')
            return execute(statement, *args, **kwargs)
        with patch.object(self.db, 'execute', side_effect=fail_second_update):
            with self.assertRaises(RuntimeError):
                transfer_guest_workspace(self.db, self.guest, self.a.id)
        self.db.refresh(self.guest_data)
        self.db.refresh(self.board)
        self.assertEqual(self.guest_data.owner_id, self.guest)
        self.assertEqual(self.board.owner_id, self.guest)

    def test_expired_revoked_and_disabled_accounts_cannot_access_data(self):
        self.session_a.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        self.db.commit()
        self.assertEqual(self.client.get('/datasets').status_code, 401)
        self.session_a.expires_at = datetime.now(timezone.utc) + timedelta(days=1)
        self.session_a.revoked_at = datetime.now(timezone.utc)
        self.db.commit()
        self.assertEqual(self.client.get('/datasets').status_code, 401)
        self.session_a.revoked_at = None
        self.a.is_active = False
        self.db.commit()
        self.assertEqual(self.client.get('/datasets').status_code, 401)

    def test_signout_revokes_session_and_restores_only_guest_workspace(self):
        self.assertEqual(self.client.post('/auth/signout', headers=self.origin).status_code, 200)
        # The test cookie was manually installed; remove it to mimic the browser.
        self.client.cookies.delete(SESSION_COOKIE_NAME)
        self.assertEqual([x['id'] for x in self.client.get('/datasets').json()], [str(self.guest_data.id)])
        self.client.cookies.set(SESSION_COOKIE_NAME, self.token_a)
        self.assertEqual(self.client.get('/datasets').status_code, 401)

    def test_transfer_rejects_a_stale_account_confirmation(self):
        self.client.cookies.set(SESSION_COOKIE_NAME, self.token_b)
        response = self.client.post('/auth/guest-workspace/transfer', headers=self.origin,
            json={'expected_account_id': str(self.a.id)})
        self.assertEqual(response.status_code, 409)
        self.db.refresh(self.guest_data)
        self.assertEqual(self.guest_data.owner_id, self.guest)
