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
        if app.config.get("STORAGE_BACKEND") == "supabase":
            logger.info("Keep-Alive: Pinging Supabase Storage...")
            storage = app.storage_service
            
            # Create a tiny dummy file
            dummy_file = FileStorage(
                stream=BytesIO(b"keep_alive_ping"),
                filename="ping.txt",
                content_type="text/plain"
            )
            
            # Upload
            result = storage.upload(dummy_file, folder="keep_alive")
            object_name = result["object_name"]
            
            # Delete
            storage.delete(object_name)
            logger.info(f"Keep-Alive: Supabase ping successful (obj: {object_name})")

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
