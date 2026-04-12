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
    if config["DATA_BACKEND"] == "firestore":
        return FirestoreRepository(
            project_id=config["FIREBASE_PROJECT_ID"],
            credentials_path=config["FIREBASE_CREDENTIALS_PATH"],
            prefix=config["FIRESTORE_COLLECTION_PREFIX"],
        )
    if config["DATA_BACKEND"] == "sqlite":
        return SQLiteRepository(
            db_path=config["SQLITE_DATA_FILE"],
            bootstrap_json_path=config["LOCAL_DATA_FILE"] if config.get("BOOTSTRAP_FROM_JSON") else None,
        )
    return LocalJSONRepository(config["LOCAL_DATA_FILE"])


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


class LocalJSONRepository(BaseRepository):
    def __init__(self, file_path: str):
        self.file_path = Path(file_path)
        self.lock = threading.Lock()
        if not self.file_path.exists():
            self._write(DEFAULT_COLLECTIONS)

    def list(self, collection: str, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        data = self._read().get(collection, [])
        items = [dict(item) for item in data]
        if not filters:
            return sorted(items, key=lambda item: item.get("created_at", ""), reverse=True)
        return [
            item
            for item in items
            if all(str(item.get(key, "")) == str(value) for key, value in filters.items())
        ]

    def get(self, collection: str, item_id: str) -> dict[str, Any] | None:
        for item in self._read().get(collection, []):
            if item.get("id") == item_id:
                return dict(item)
        return None

    def create(self, collection: str, payload: dict[str, Any]) -> str:
        with self.lock:
            data = self._read()
            item_id = payload.get("id", str(uuid.uuid4()))
            payload = {
                "id": item_id,
                "created_at": payload.get("created_at", _utcnow()),
                "updated_at": payload.get("updated_at", _utcnow()),
                **payload,
            }
            data.setdefault(collection, []).append(payload)
            self._write(data)
            return item_id

    def update(self, collection: str, item_id: str, payload: dict[str, Any]) -> None:
        with self.lock:
            data = self._read()
            items = data.get(collection, [])
            for index, item in enumerate(items):
                if item.get("id") == item_id:
                    items[index] = {
                        **item,
                        **payload,
                        "id": item_id,
                        "updated_at": _utcnow(),
                    }
                    break
            self._write(data)

    def delete(self, collection: str, item_id: str) -> None:
        with self.lock:
            data = self._read()
            data[collection] = [
                item for item in data.get(collection, []) if item.get("id") != item_id
            ]
            self._write(data)

    def _read(self) -> dict[str, Any]:
        with self.file_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _write(self, payload: dict[str, Any]) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        with self.file_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)


class SQLiteRepository(BaseRepository):
    def __init__(self, db_path: str, bootstrap_json_path: str | None = None):
        self.db_path = Path(db_path)
        self.bootstrap_json_path = Path(bootstrap_json_path) if bootstrap_json_path else None
        self.lock = threading.Lock()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()
        self._bootstrap_from_json_if_needed()

    def list(self, collection: str, filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT payload
                FROM records
                WHERE collection = ?
                ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
                """,
                (collection,),
            ).fetchall()
        items = [json.loads(row["payload"]) for row in rows]
        if not filters:
            return items
        return [
            item
            for item in items
            if all(str(item.get(key, "")) == str(value) for key, value in filters.items())
        ]

    def get(self, collection: str, item_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload FROM records WHERE collection = ? AND id = ?",
                (collection, item_id),
            ).fetchone()
        if not row:
            return None
        return json.loads(row["payload"])

    def create(self, collection: str, payload: dict[str, Any]) -> str:
        item_id = payload.get("id", str(uuid.uuid4()))
        record = {
            "id": item_id,
            "created_at": payload.get("created_at", _utcnow()),
            "updated_at": payload.get("updated_at", _utcnow()),
            **payload,
        }
        with self.lock, self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO records (collection, id, payload, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    collection,
                    item_id,
                    json.dumps(record, ensure_ascii=False),
                    record.get("created_at", ""),
                    record.get("updated_at", ""),
                ),
            )
            connection.commit()
        return item_id

    def update(self, collection: str, item_id: str, payload: dict[str, Any]) -> None:
        existing = self.get(collection, item_id) or {"id": item_id, "created_at": _utcnow()}
        record = {
            **existing,
            **payload,
            "id": item_id,
            "created_at": existing.get("created_at", _utcnow()),
            "updated_at": _utcnow(),
        }
        with self.lock, self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO records (collection, id, payload, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    collection,
                    item_id,
                    json.dumps(record, ensure_ascii=False),
                    record.get("created_at", ""),
                    record.get("updated_at", ""),
                ),
            )
            connection.commit()

    def delete(self, collection: str, item_id: str) -> None:
        with self.lock, self._connect() as connection:
            connection.execute(
                "DELETE FROM records WHERE collection = ? AND id = ?",
                (collection, item_id),
            )
            connection.commit()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS records (
                    collection TEXT NOT NULL,
                    id TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT,
                    updated_at TEXT,
                    PRIMARY KEY (collection, id)
                )
                """
            )
            connection.commit()

    def _bootstrap_from_json_if_needed(self) -> None:
        if not self.bootstrap_json_path or not self.bootstrap_json_path.exists():
            return
        with self._connect() as connection:
            row = connection.execute("SELECT COUNT(*) AS count FROM records").fetchone()
        if row and row["count"]:
            return
        try:
            with self.bootstrap_json_path.open("r", encoding="utf-8") as handle:
                seed_payload = json.load(handle)
        except (OSError, json.JSONDecodeError):
            seed_payload = DEFAULT_COLLECTIONS

        with self.lock, self._connect() as connection:
            for collection, items in seed_payload.items():
                for item in items or []:
                    item_id = item.get("id", str(uuid.uuid4()))
                    record = {
                        "id": item_id,
                        "created_at": item.get("created_at", _utcnow()),
                        "updated_at": item.get("updated_at", _utcnow()),
                        **item,
                    }
                    connection.execute(
                        """
                        INSERT OR REPLACE INTO records (collection, id, payload, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            collection,
                            item_id,
                            json.dumps(record, ensure_ascii=False),
                            record.get("created_at", ""),
                            record.get("updated_at", ""),
                        ),
                    )
            connection.commit()


class FirestoreRepository(BaseRepository):
    def __init__(self, project_id: str, credentials_path: str, prefix: str):
        if firebase_admin is None or credentials is None or firestore is None:
            raise RuntimeError("firebase-admin is required for Firestore mode.")
        if not firebase_admin._apps:
            if credentials_path:
                cred = credentials.Certificate(credentials_path)
                firebase_admin.initialize_app(cred, {"projectId": project_id})
            else:
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
