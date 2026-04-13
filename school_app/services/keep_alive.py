import logging
import threading
import time
from datetime import datetime, timezone
from io import BytesIO
from werkzeug.datastructures import FileStorage

logger = logging.getLogger(__name__)

def run_keep_alive_cycle(app):
    """Performs a write/delete cycle on Firebase and Supabase."""
    try:
        # 1. Firebase Ping (Firestore)
        if app.config.get("DATA_BACKEND") == "firestore":
            logger.info("Keep-Alive: Pinging Firestore...")
            repo = app.repository
            ping_id = repo.create("keep_alive", {"type": "ping", "reason": "keep_alive", "timestamp": datetime.now(timezone.utc).isoformat()})
            repo.delete("keep_alive", ping_id)
            logger.info(f"Keep-Alive: Firestore ping successful (doc: {ping_id})")

        # 2. Supabase Ping (Storage)
        # Only ping if we are actually using Supabase remote storage
        from school_app.services.storage import SupabaseStorageService
        if isinstance(app.storage_service, SupabaseStorageService):
            logger.info("Keep-Alive: Pinging Supabase Storage...")
            storage = app.storage_service
            
            # Create a minimal valid PNG (1x1 transparent pixel) - accepted by image buckets
            TINY_PNG = bytes([
                0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
                0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1f,0x15,0xc4,
                0x89,0x00,0x00,0x00,0x0a,0x49,0x44,0x41,0x54,0x78,0x9c,0x62,0x00,0x01,0x00,0x00,
                0x05,0x00,0x01,0x0d,0x0a,0x2d,0xb4,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,
                0x42,0x60,0x82,
            ])
            dummy_file = FileStorage(
                stream=BytesIO(TINY_PNG),
                filename="ping.png",
                content_type="image/png"
            )
            
            # Upload
            result = storage.upload(dummy_file, folder="keep_alive")
            object_name = result["object_name"]
            
            # Delete
            storage.delete(object_name)
            logger.info(f"Keep-Alive: Supabase ping successful (obj: {object_name})")
        else:
            logger.info("Keep-Alive: Skipping Supabase ping (using LocalStorageService)")

    except Exception as e:
        logger.error(f"Keep-Alive error: {str(e)}")

def start_keep_alive_service(app):
    """Starts a background thread to perform the keep-alive cycle every hour."""
    def loop():
        # Wait a bit after startup to ensure everyone is ready
        time.sleep(10)
        while True:
            with app.app_context():
                run_keep_alive_cycle(app)
            
            # Sleep for 1 hour (3600 seconds)
            time.sleep(3600)

    thread = threading.Thread(target=loop, name="KeepAliveService", daemon=True)
    thread.start()
    logger.info("Keep-Alive service started in background.")
