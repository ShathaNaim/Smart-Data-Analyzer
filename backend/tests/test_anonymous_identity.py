import os
import unittest
import uuid
from unittest.mock import patch

from backend.app.anonymous_identity import (
    create_signed_owner_cookie,
    read_signed_owner_cookie,
)


class AnonymousIdentityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.environment = patch.dict(
            os.environ,
            {"ANONYMOUS_COOKIE_SECRET": "test-secret-that-is-at-least-32-characters"},
        )
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_signed_cookie_round_trip(self) -> None:
        owner_id = uuid.uuid4()
        cookie = create_signed_owner_cookie(owner_id)

        self.assertEqual(read_signed_owner_cookie(cookie), owner_id)

    def test_tampered_owner_id_is_rejected(self) -> None:
        cookie = create_signed_owner_cookie(uuid.uuid4())
        _, signature = cookie.rsplit(".", 1)
        tampered_cookie = f"{uuid.uuid4()}.{signature}"

        self.assertIsNone(read_signed_owner_cookie(tampered_cookie))

    def test_malformed_cookie_is_rejected(self) -> None:
        self.assertIsNone(read_signed_owner_cookie("not-a-valid-cookie"))


if __name__ == "__main__":
    unittest.main()
