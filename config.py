import os
from datetime import timedelta
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret-key")
    ENVIRONMENT = os.getenv("FLASK_ENV", os.getenv("APP_ENV", "development")).lower()
    SCHOOL_NAME = os.getenv("SCHOOL_NAME", "Police Modern School Raebareli")
    SESSION_TIMEOUT_MINUTES = int(os.getenv("SESSION_TIMEOUT_MINUTES", "5"))
    PERMANENT_SESSION_LIFETIME = timedelta(minutes=SESSION_TIMEOUT_MINUTES)
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_CONTENT_LENGTH", str(10 * 1024 * 1024)))
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = os.getenv(
        "SESSION_COOKIE_SECURE",
        "true" if ENVIRONMENT == "production" else "false",
    ).lower() == "true"
    SESSION_COOKIE_SAMESITE = os.getenv("SESSION_COOKIE_SAMESITE", "Strict")
    WTF_CSRF_ENABLED = True

    DATA_BACKEND = os.getenv("DATA_BACKEND", "sqlite")
    LOCAL_DATA_FILE = os.getenv("LOCAL_DATA_FILE", str(BASE_DIR / "data" / "local_store.json"))
    SQLITE_DATA_FILE = os.getenv("SQLITE_DATA_FILE", str(BASE_DIR / "data" / "school_app.db"))
    LOCAL_UPLOAD_DIR = os.getenv("LOCAL_UPLOAD_DIR", str(BASE_DIR / "uploads"))
    BACKUP_DIR = os.getenv("BACKUP_DIR", str(BASE_DIR / "backups"))
    BOOTSTRAP_FROM_JSON = os.getenv("BOOTSTRAP_FROM_JSON", "false").lower() == "true"
    ALLOW_DEMO_SEED = os.getenv("ALLOW_DEMO_SEED", "false").lower() == "true"

    FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
    FIREBASE_CREDENTIALS_PATH = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
    FIRESTORE_COLLECTION_PREFIX = os.getenv("FIRESTORE_COLLECTION_PREFIX", "pmsr")

    STORAGE_BACKEND = os.getenv("STORAGE_BACKEND", "local")
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
    SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "school-files")

    ALLOWED_EXTENSIONS = {
        "pdf",
        "png",
        "jpg",
        "jpeg",
        "webp",
        "doc",
        "docx",
        "xls",
        "xlsx",
    }
