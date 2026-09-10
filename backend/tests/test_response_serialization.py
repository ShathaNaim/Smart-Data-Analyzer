import json
import unittest
import uuid
from io import BytesIO
from unittest.mock import Mock, patch

import pandas as pd
from fastapi import UploadFile
from fastapi.encoders import jsonable_encoder
from starlette.responses import JSONResponse

from backend.app.api.upload import upload_file
from backend.app.api.analysis import get_summary, get_column_summary


class ResponseSerializationTests(unittest.IsolatedAsyncioTestCase):
    async def test_upload_blank_column_and_infinity_return_null(self):
        file = UploadFile(filename="sample.csv", file=BytesIO(b"name,value,\nA,inf,\nB,2,\n"))
        with patch("backend.app.api.upload.upload_object"):
            response = await upload_file(file, None, Mock(), uuid.uuid4())
        payload = json.loads(JSONResponse(jsonable_encoder(response)).body)
        self.assertIsNone(payload["preview"][0]["Unnamed: 2"])
        self.assertIsNone(payload["preview"][0]["value"])
        self.assertEqual(payload["preview"][1]["value"], 2)
        await file.close()

    async def test_summary_and_column_with_missing_values_are_json_safe(self):
        frame = pd.DataFrame({"empty": [float("nan")], "single": [2.0], "infinite": [float("inf")]})
        with patch("backend.app.api.analysis.load_owned_dataset", return_value=(frame, None)):
            summary = get_summary("test", Mock(), uuid.uuid4())
            column = get_column_summary("test", "infinite", Mock(), uuid.uuid4())
        payload = json.loads(JSONResponse(jsonable_encoder(summary)).body)
        self.assertIsNone(payload["numeric_summary"]["empty"]["mean"])
        self.assertIsNone(payload["numeric_summary"]["single"]["std"])
        self.assertIsNone(json.loads(JSONResponse(jsonable_encoder(column)).body)["max"])
