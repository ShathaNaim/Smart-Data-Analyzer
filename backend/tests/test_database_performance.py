import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

from backend.services.database_performance import install_query_timing, measure_dataset_queries


class DatabasePerformanceTests(unittest.TestCase):
    def test_query_timing_is_scoped_and_does_not_log_sql_or_values(self):
        engine = create_engine("sqlite://")
        self.addCleanup(engine.dispose)
        install_query_timing(engine)
        with engine.connect() as connection:
            with self.assertLogs("uvicorn.error.performance", level="INFO") as logs:
                with measure_dataset_queries():
                    self.assertEqual(connection.scalar(text("SELECT :private"), {"private": "secret-value"}), "secret-value")
                connection.execute(text("SELECT 2"))
        self.assertEqual(len(logs.output), 2)
        self.assertIn("stage=dataset_query_execute", logs.output[0])
        self.assertIn("query_count=1", logs.output[1])
        self.assertNotIn("secret-value", str(logs.output))
        self.assertNotIn("SELECT", str(logs.output))

    def test_failed_query_preserves_error_and_resets_scope(self):
        engine = create_engine("sqlite://")
        self.addCleanup(engine.dispose)
        install_query_timing(engine)
        with engine.connect() as connection:
            with self.assertLogs("uvicorn.error.performance", level="INFO") as logs:
                with self.assertRaises(DBAPIError):
                    with measure_dataset_queries():
                        connection.execute(text("SELECT * FROM private_missing_table"))
                connection.execute(text("SELECT 1"))
        self.assertEqual(len(logs.output), 2)
        self.assertTrue(all("outcome=error" in line for line in logs.output))
        self.assertNotIn("private_missing_table", str(logs.output))
