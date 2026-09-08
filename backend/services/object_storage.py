from __future__ import annotations

import os
from functools import lru_cache
from typing import BinaryIO

import boto3
from botocore.exceptions import BotoCoreError, ClientError


class ObjectStorageError(RuntimeError):
    """Raised when an R2 object operation cannot be completed."""


def _required_setting(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ObjectStorageError(f"Required object storage setting {name} is missing.")
    return value


@lru_cache(maxsize=1)
def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=_required_setting("R2_ENDPOINT_URL"),
        aws_access_key_id=_required_setting("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=_required_setting("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def _bucket_name() -> str:
    return _required_setting("R2_BUCKET_NAME")


def upload_object(file_object: BinaryIO, object_key: str, content_type: str) -> None:
    try:
        get_r2_client().upload_fileobj(
            file_object,
            _bucket_name(),
            object_key,
            ExtraArgs={"ContentType": content_type},
        )
    except (BotoCoreError, ClientError, OSError) as error:
        raise ObjectStorageError("Could not upload the file to object storage.") from error


def download_object(object_key: str) -> bytes:
    try:
        response = get_r2_client().get_object(
            Bucket=_bucket_name(),
            Key=object_key,
        )
        return response["Body"].read()
    except (BotoCoreError, ClientError, OSError) as error:
        raise ObjectStorageError("Could not download the file from object storage.") from error


def delete_object(object_key: str) -> None:
    try:
        get_r2_client().delete_object(
            Bucket=_bucket_name(),
            Key=object_key,
        )
    except (BotoCoreError, ClientError, OSError) as error:
        raise ObjectStorageError("Could not delete the file from object storage.") from error
