import os
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api import analysis, dashboard, dashboard_share, dataset, upload
from backend.app.anonymous_identity import ANONYMOUS_COOKIE_NAME, create_signed_owner_cookie
from backend.database import get_db
from backend.services.dataset_transformer import DatasetAccessError
from backend.services.dashboard_share_service import ShareLinkNotFoundError
from backend.services.session_service import SESSION_COOKIE_NAME


class WorkspaceRouteTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {'ANONYMOUS_COOKIE_SECRET': 'test-secret-that-is-at-least-32-characters'})
        env.start()
        self.addCleanup(env.stop)
        self.db = Mock()
        self.account_a = uuid.uuid4()
        self.account_b = uuid.uuid4()
        self.db.scalar.return_value = SimpleNamespace(id=self.account_a)
        app = FastAPI()
        app.dependency_overrides[get_db] = lambda: self.db
        for module in (analysis, dashboard, dashboard_share, dataset, upload):
            app.include_router(module.router)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.client.cookies.set(SESSION_COOKIE_NAME, 'account-session')
        self.guest = uuid.uuid4()
        self.client.cookies.set(ANONYMOUS_COOKIE_NAME, create_signed_owner_cookie(self.guest))

    def test_analysis_uses_account_and_rejects_other_account_in_same_browser(self):
        file_id = uuid.uuid4()
        def owned(db, dataset_id, owner_id):
            if dataset_id != file_id or owner_id != self.account_a:
                raise DatasetAccessError('Dataset not found')
            return SimpleNamespace(description=None)
        with patch.object(analysis, 'get_owned_dataset', side_effect=owned), patch.object(analysis, 'load_working_dataset', return_value=pd.DataFrame({'value': [1, 2]})):
            self.assertEqual(self.client.get(f'/dataset/{file_id}/summary').status_code, 200)
            self.db.scalar.return_value = SimpleNamespace(id=self.account_b)
            self.assertEqual(self.client.get(f'/dataset/{file_id}/summary').status_code, 404)
            self.db.scalar.return_value = SimpleNamespace(id=self.account_a)
            self.client.cookies.delete(ANONYMOUS_COOKIE_NAME)
            self.assertEqual(self.client.get(f'/dataset/{file_id}/summary').status_code, 200)

    def test_dataset_list_is_scoped_to_account_then_guest_after_signout(self):
        self.db.scalars.return_value.all.return_value = []
        self.assertEqual(self.client.get('/datasets').status_code, 200)
        params = self.db.scalars.call_args.args[0].compile().params
        self.assertEqual(params['owner_id_1'], self.account_a)
        self.client.cookies.delete(SESSION_COOKIE_NAME)
        self.assertEqual(self.client.get('/datasets').status_code, 200)
        params = self.db.scalars.call_args.args[0].compile().params
        self.assertEqual(params['owner_id_1'], self.guest)

    def test_dashboard_and_share_management_receive_account_identity(self):
        with patch.object(dashboard, 'list_dashboards', return_value=[]) as listing:
            self.assertEqual(self.client.get('/dashboards').status_code, 200)
            self.assertIn(self.account_a, listing.call_args.args)
        with patch.object(dashboard_share, 'revoke_dashboard_share_links') as revoke:
            response = self.client.delete(f'/dashboards/{uuid.uuid4()}/share')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(revoke.call_args.kwargs['owner_id'], self.account_a)

    def test_expired_session_blocks_private_routes_but_public_shares_still_resolve(self):
        self.db.scalar.return_value = None
        resource_id = uuid.uuid4()
        for method, path in [('GET', '/datasets'), ('GET', '/dashboards'),
                             ('GET', f'/dataset/{resource_id}/summary'),
                             ('DELETE', f'/datasets/{resource_id}'),
                             ('DELETE', f'/dashboards/{resource_id}/share')]:
            with self.subTest(path=path):
                self.assertEqual(self.client.request(method, path).status_code, 401)
        with patch.object(dashboard_share, 'get_dashboard_by_share_token', side_effect=ShareLinkNotFoundError('Unavailable')) as lookup:
            response = self.client.get('/shared-dashboards/' + 'a' * 32)
            self.assertEqual(response.status_code, 404)
            lookup.assert_called_once()
        self.db.commit.assert_not_called()
