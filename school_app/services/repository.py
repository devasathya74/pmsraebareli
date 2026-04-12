from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from werkzeug.security import check_password_hash, generate_password_hash

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:  # pragma: no cover
    firebase_admin = None
    credentials = None
    firestore = None


DEFAULT_COLLECTIONS = {
    "users": [],
    "students": [],
    "teachers": [],
    "admissions": [],
    "fees": [],
    "ledger_entries": [],
    "attendance": [],
    "results": [],
    "inventory_items": [],
    "messages": [],
    "files": [],
    "contacts": [],
    "notifications": [],
    "salary_slips": [],
    "exam_schedules": [],
    "audit_logs": [],
}


def build_repository(config) -> "BaseRepository":
    # Remote-only architecture: Local storage is disabled
    return FirestoreRepository(
        project_id=config["FIREBASE_PROJECT_ID"],
        credentials_path=config["FIREBASE_CREDENTIALS_PATH"],
        credentials_json=config["FIREBASE_CREDENTIALS_JSON"],
        prefix=config["FIRESTORE_COLLECTION_PREFIX"],
    )


@dataclass
class BaseRepository:
    def hash_password(self, password: str) -> str:
        return generate_password_hash(password)

    def verify_password(self, password_hash: str, password: str) -> bool:
        return check_password_hash(password_hash, password)

    def list(self, collection: str, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        raise NotImplementedError

    def get(self, collection: str, item_id: str) -> dict[str, Any] | None:
        raise NotImplementedError

    def find_one(self, collection: str, filters: dict[str, Any]) -> dict[str, Any] | None:
        matches = self.list(collection, filters)
        return matches[0] if matches else None

    def create(self, collection: str, payload: dict[str, Any]) -> str:
        raise NotImplementedError

    def update(self, collection: str, item_id: str, payload: dict[str, Any]) -> None:
        raise NotImplementedError

    def delete(self, collection: str, item_id: str) -> None:
        raise NotImplementedError


# Removed local repositories to enforce Cloud persistence (Firebase Firestore)


class FirestoreRepository(BaseRepository):
    def __init__(self, project_id: str, credentials_path: str, prefix: str, credentials_json: str = ""):
        if firebase_admin is None or credentials is None or firestore is None:
            raise RuntimeError("firebase-admin is required for Firestore mode.")
        if not firebase_admin._apps:
            if credentials_json:
                # 1. Try loading from JSON string (priority for Cloud/Railway)
                try:
                    cred_info = json.loads(credentials_json)
                    cred = credentials.Certificate(cred_info)
                    firebase_admin.initialize_app(cred)
                except Exception as e:
                    print(f"Error initializing Firebase from JSON: {e}")
                    # Fallback to other methods if JSON fail
            
            if not firebase_admin._apps:
                if credentials_path and Path(credentials_path).exists():
                    # 2. Try loading from local file
                    cred = credentials.Certificate(credentials_path)
                    firebase_admin.initialize_app(cred)
                else:
                    # 3. Fallback to default credentials or project ID
                    firebase_admin.initialize_app(options={"projectId": project_id})
        self.client = firestore.client()
        self.prefix = prefix.strip()

    def list(self, collection: str, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        ref = self.client.collection(self._collection_name(collection))
        query = ref
        if filters:
            for key, value in filters.items():
                query = query.where(key, "==", value)
        items = []
        for document in query.stream():
            item = document.to_dict() or {}
            item["id"] = document.id
            items.append(item)
        return items

    def get(self, collection: str, item_id: str) -> dict[str, Any] | None:
        snapshot = self.client.collection(self._collection_name(collection)).document(item_id).get()
        if not snapshot.exists:
            return None
        payload = snapshot.to_dict() or {}
        payload["id"] = snapshot.id
        return payload

    def create(self, collection: str, payload: dict[str, Any]) -> str:
        item_id = payload.get("id", str(uuid.uuid4()))
        payload = {
            **payload,
            "created_at": payload.get("created_at", _utcnow()),
            "updated_at": payload.get("updated_at", _utcnow()),
        }
        self.client.collection(self._collection_name(collection)).document(item_id).set(payload)
        return item_id

    def update(self, collection: str, item_id: str, payload: dict[str, Any]) -> None:
        payload = {**payload, "updated_at": _utcnow()}
        self.client.collection(self._collection_name(collection)).document(item_id).set(
            payload,
            merge=True,
        )

    def delete(self, collection: str, item_id: str) -> None:
        self.client.collection(self._collection_name(collection)).document(item_id).delete()

    def _collection_name(self, collection: str) -> str:
        return f"{self.prefix}_{collection}" if self.prefix else collection


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()
