import os
import shutil
import uuid
from pathlib import Path

from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename


def build_storage_service(config):
    # Remote-only architecture: Local file storage is disabled
    url = config.get("SUPABASE_URL", "")
    key = config.get("SUPABASE_KEY", "")
    bucket = config.get("SUPABASE_BUCKET", "school-files")

    if not url or not key:
        raise RuntimeError(
            "CRITICAL: SUPABASE_URL and SUPABASE_KEY must be set. "
            "Local storage is disabled to ensure data persistence across deployments."
        )
    
    return SupabaseStorageService(
        url=url,
        key=key,
        bucket=bucket,
    )


class SupabaseStorageService:
    def __init__(self, url: str, key: str, bucket: str):
        try:
            from supabase import create_client
        except Exception as error:  # pragma: no cover
            raise RuntimeError("supabase is required for Supabase storage mode.") from error
        self.client = create_client(url, key)
        self.bucket = bucket

    def upload(self, file_storage: FileStorage, folder: str = "general") -> dict[str, str]:
        filename = secure_filename(file_storage.filename or "upload.bin")
        object_name = f"{folder}/{uuid.uuid4()}-{filename}"
        file_storage.stream.seek(0)
        self.client.storage.from_(self.bucket).upload(
            object_name,
            file_storage.stream.read(),
            {"content-type": file_storage.mimetype},
        )
        public_url = self.client.storage.from_(self.bucket).get_public_url(object_name)
        return {
            "file_url": public_url,
            "object_name": object_name,
            "filename": filename,
        }

    def delete(self, object_name: str) -> None:
        self.client.storage.from_(self.bucket).remove([object_name])
