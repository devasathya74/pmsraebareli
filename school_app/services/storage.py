from __future__ import annotations

import uuid
from pathlib import Path

from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename


def build_storage_service(config):
    if config["STORAGE_BACKEND"] == "supabase":
        return SupabaseStorageService(
            url=config["SUPABASE_URL"],
            key=config["SUPABASE_KEY"],
            bucket=config["SUPABASE_BUCKET"],
        )
    return LocalStorageService(config["LOCAL_UPLOAD_DIR"])


class LocalStorageService:
    def __init__(self, upload_dir: str):
        self.base_path = Path(upload_dir)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def upload(self, file_storage: FileStorage, folder: str = "general") -> dict[str, str]:
        filename = secure_filename(file_storage.filename or "upload.bin")
        object_name = f"{folder}/{uuid.uuid4()}-{filename}"
        destination = self.base_path / object_name
        destination.parent.mkdir(parents=True, exist_ok=True)
        file_storage.save(destination)
        return {
            "file_url": f"/auth/files/{object_name.replace('\\', '/')}",
            "object_name": object_name,
            "filename": filename,
        }

    def delete(self, object_name: str) -> None:
        target = self.base_path / object_name
        if target.exists():
            target.unlink()


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
