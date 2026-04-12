import os
import shutil
import uuid
from pathlib import Path

from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename


def build_storage_service(config):
    # Remote-only architecture: Local file storage is disabled
    mode = config.get("STORAGE_BACKEND", "supabase")
    url = config.get("SUPABASE_URL", "")
    key = config.get("SUPABASE_KEY", "")
    env = config.get("ENVIRONMENT", "development").lower()

    if mode == "supabase":
        if not url or not key:
            if env == "development":
                print("WARNING: SUPABASE_URL or SUPABASE_KEY missing. Falling back to LocalStorageService for development.")
                return LocalStorageService()
            else:
                raise RuntimeError(
                    "CRITICAL: SUPABASE_URL and SUPABASE_KEY must be set in production mode when STORAGE_BACKEND='supabase'."
                )
        
        return SupabaseStorageService(
            url=url,
            key=key,
            bucket=config["SUPABASE_BUCKET"],
        )
    
    return LocalStorageService()


class LocalStorageService:
    def __init__(self, upload_folder: str = "school_app/static/uploads"):
        self.upload_folder = Path(upload_folder)
        self.upload_folder.mkdir(parents=True, exist_ok=True)

    def upload(self, file_storage: FileStorage, folder: str = "general") -> dict[str, str]:
        filename = secure_filename(file_storage.filename or "upload.bin")
        unique_name = f"{uuid.uuid4()}-{filename}"
        
        target_dir = self.upload_folder / folder
        target_dir.mkdir(parents=True, exist_ok=True)
        
        target_path = target_dir / unique_name
        file_storage.stream.seek(0)
        file_storage.save(str(target_path))
        
        # Relative URL for the frontend
        file_url = f"/static/uploads/{folder}/{unique_name}"
        return {
            "file_url": file_url,
            "object_name": f"{folder}/{unique_name}",
            "filename": filename,
        }

    def delete(self, object_name: str) -> None:
        file_path = self.upload_folder / object_name
        if file_path.exists():
            file_path.unlink()


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
