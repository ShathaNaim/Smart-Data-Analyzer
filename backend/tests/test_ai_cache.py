import unittest
import uuid
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pandas as pd
from fastapi import Response

from backend.services import ai_cache
from backend.services.dataset_transformer import DatasetAccessError
from backend.schemas.semantic_profile import SemanticDatasetProfile
from backend.schemas.analysis_suggestion import AnalysisSuggestions

read_cached_result = ai_cache._read


class AICacheTests(unittest.TestCase):
    def setUp(self):
        self.owner = uuid.uuid4()
        self.dataset = SimpleNamespace(
            id=uuid.uuid4(), stored_filename="datasets/unique-file.csv",
            file_size=20, description="Sales", transformations=[],
        )
        self.db = Mock()
        self.records = {}
        self.profile = SemanticDatasetProfile.model_validate({
            "dataset_summary": "Sales", "columns": [{
                "name": "revenue", "semantic_type": "numeric_measure",
                "business_role": "Revenue", "description": "Sales revenue",
                "confidence": 1, "usable_as_dimension": False,
                "usable_as_measure": True,
            }],
        })
        self.suggestions = AnalysisSuggestions(summary="Sales analysis")
        # Generator output validation is tested by its own layer; this fixture
        # exercises storage and routing without paid external API requests.
        patches = {
            "get_owned_dataset": {"return_value": self.dataset},
            "load_working_dataset": {"return_value": pd.DataFrame({"revenue": [10]})},
            "ai_generation_usage": {"side_effect": lambda **kw: nullcontext()},
            "_read": {"side_effect": lambda db, did, fp, kind: self.records.get((did, fp, kind))},
            "_save": {"side_effect": lambda db, did, fp, kind, result: self.records.__setitem__((did, fp, kind), result)},
        }
        self.mocks = {}
        for name, options in patches.items():
            patcher = patch.object(ai_cache, name, **options)
            self.mocks[name] = patcher.start()
            self.addCleanup(patcher.stop)
        for module, name, result in [
            (ai_cache.semantic_profiler, "create_semantic_profile", self.profile),
            (ai_cache.analysis_suggester, "generate_analysis_suggestions", self.suggestions),
        ]:
            patcher = patch.object(module, name, return_value=result)
            self.mocks[name] = patcher.start()
            self.addCleanup(patcher.stop)

    def request(self, kind="suggestions"):
        return ai_cache.get_cached_ai_result(
            self.db, self.dataset.id, self.owner, Response(), kind,
        )

    def test_repeat_request_skips_ai_file_loading_and_usage(self):
        self.assertEqual(self.request(), self.suggestions)
        self.assertEqual(self.request(), self.suggestions)
        for name in ["load_working_dataset", "ai_generation_usage",
                     "create_semantic_profile", "generate_analysis_suggestions"]:
            self.mocks[name].assert_called_once()

    def test_suggestions_reuse_separately_generated_profile(self):
        self.request("profile")
        self.request()
        self.mocks["create_semantic_profile"].assert_called_once()
        self.assertIs(
            self.mocks["generate_analysis_suggestions"].call_args.kwargs["semantic_profile"],
            self.profile,
        )

    def test_input_changes_regenerate(self):
        self.request()
        self.dataset.description = "Net sales"
        self.request()
        self.dataset.transformations.append(SimpleNamespace(
            id=uuid.uuid4(), transformation_type="remove_duplicates", config={},
        ))
        self.request()
        self.assertEqual(self.mocks["create_semantic_profile"].call_count, 3)

    def test_fingerprint_covers_rules_file_and_ordered_transformations(self):
        original = ai_cache.input_fingerprint(self.dataset)
        with patch.object(ai_cache, "GENERATOR_VERSION", "next"):
            self.assertNotEqual(original, ai_cache.input_fingerprint(self.dataset))
        self.dataset.stored_filename = "replacement.csv"
        self.assertNotEqual(original, ai_cache.input_fingerprint(self.dataset))
        self.dataset.transformations = [
            SimpleNamespace(id=uuid.uuid4(), transformation_type="trim_whitespace", config={"column_name": col})
            for col in ["a", "b"]
        ]
        before = ai_cache.input_fingerprint(self.dataset)
        self.dataset.transformations.reverse()
        self.assertNotEqual(before, ai_cache.input_fingerprint(self.dataset))
        before = ai_cache.input_fingerprint(self.dataset)
        self.dataset.transformations[0].config["column_name"] = "c"
        self.assertNotEqual(before, ai_cache.input_fingerprint(self.dataset))

    def test_unauthorized_request_cannot_read_cache(self):
        self.request()
        self.mocks["_read"].reset_mock()
        self.mocks["get_owned_dataset"].side_effect = DatasetAccessError("Not found")
        with self.assertRaises(DatasetAccessError):
            self.request()
        self.mocks["_read"].assert_not_called()

    def test_recheck_after_lock_reuses_other_requests_result(self):
        self.mocks["_read"].side_effect = [None, self.suggestions]
        self.assertEqual(self.request(), self.suggestions)
        self.mocks["load_working_dataset"].assert_not_called()
        self.mocks["ai_generation_usage"].assert_not_called()
        self.db.commit.assert_called_once()

    def test_failed_generation_rolls_back_and_does_not_save_result(self):
        self.mocks["create_semantic_profile"].side_effect = ValueError("Invalid profile")
        with self.assertRaises(ValueError):
            self.request()
        self.mocks["_save"].assert_not_called()
        self.db.rollback.assert_called_once()
        self.db.commit.assert_not_called()

    def test_cache_json_round_trip_validates_schema(self):
        self.db.scalar.return_value = SimpleNamespace(result=self.profile.model_dump(mode="json"))
        self.assertEqual(
            read_cached_result(self.db, self.dataset.id, "fingerprint", "profile"),
            self.profile,
        )

    def test_failed_suggestions_roll_back_without_saving_suggestions(self):
        self.mocks["generate_analysis_suggestions"].side_effect = ValueError("Invalid suggestions")
        with self.assertRaises(ValueError):
            self.request()
        self.assertEqual([call.args[3] for call in self.mocks["_save"].call_args_list], ["profile"])
        self.db.rollback.assert_called_once()
        self.db.commit.assert_not_called()

    def test_migration_creates_unique_versioned_records_and_cascade(self):
        import importlib
        import io
        from alembic.migration import MigrationContext
        from alembic.operations import Operations

        output = io.StringIO()
        context = MigrationContext.configure(
            dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output},
        )
        migration = importlib.import_module("migrations.versions.8ab21c903def_add_dataset_ai_cache")
        with Operations.context(context):
            migration.upgrade()
        sql = output.getvalue()
        self.assertIn("PRIMARY KEY (dataset_id, fingerprint, result_type)", sql)
        self.assertIn("ON DELETE CASCADE", sql)


if __name__ == "__main__":
    unittest.main()
