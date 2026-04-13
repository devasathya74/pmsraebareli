"""
Firestore Database Reset + Admin Seed Script
============================================
1. Deletes ALL documents from all pmsr_* collections
2. Creates the admin user (admin@gmail.com / 654321)
3. Creates the teacher user  (tr@gmail.com / 123456)

Usage:
    python seed_db.py
"""
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from werkzeug.security import generate_password_hash

# ── Firebase init ──────────────────────────────────────────────────────────────
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    print("[ERROR] firebase-admin not installed. Run: pip install firebase-admin")
    sys.exit(1)

project_id   = os.getenv("FIREBASE_PROJECT_ID", "")
cred_path    = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
cred_json    = os.getenv("FIREBASE_CREDENTIALS_JSON", "")
prefix       = os.getenv("FIRESTORE_COLLECTION_PREFIX", "pmsr")

if not firebase_admin._apps:
    if cred_json:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(cred_json)))
    elif cred_path and Path(cred_path).exists():
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
    else:
        firebase_admin.initialize_app(options={"projectId": project_id})

db = firestore.client()

def col(name: str) -> str:
    return f"{prefix}_{name}" if prefix else name

def now() -> str:
    return datetime.now(timezone.utc).isoformat()

# ── All collections to wipe ────────────────────────────────────────────────────
ALL_COLLECTIONS = [
    "users", "students", "teachers", "admissions", "fees",
    "ledger_entries", "attendance", "results", "inventory_items",
    "messages", "files", "contacts", "notifications", "salary_slips",
    "exam_schedules", "audit_logs", "keep_alive",
]

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n" + "="*60)
print("  STEP 1: Wiping ALL Firestore collections")
print("="*60)

total_deleted = 0
for collection in ALL_COLLECTIONS:
    collection_name = col(collection)
    docs = list(db.collection(collection_name).stream())
    count = len(docs)
    if count == 0:
        print(f"  [SKIP] {collection_name} — already empty")
        continue
    # Delete in batches of 500
    batch = db.batch()
    batch_count = 0
    for doc in docs:
        batch.delete(doc.reference)
        batch_count += 1
        if batch_count == 500:
            batch.commit()
            batch = db.batch()
            batch_count = 0
    if batch_count > 0:
        batch.commit()
    print(f"  [DONE] {collection_name} — deleted {count} document(s)")
    total_deleted += count

print(f"\n  Total documents deleted: {total_deleted}")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n" + "="*60)
print("  STEP 2: Creating users")
print("="*60)

admin_id   = str(uuid.uuid4())
teacher_id = str(uuid.uuid4())

admin_user = {
    "id":                admin_id,
    "email":             "admin@gmail.com",
    "username":          "admin",
    "name":              "School Admin",
    "role":              "admin",
    "phone":             "",
    "password_hash":     generate_password_hash("654321"),
    "active_session_id": "",
    "last_login_at":     "",
    "created_at":        now(),
    "updated_at":        now(),
}

teacher_user = {
    "id":                teacher_id,
    "email":             "tr@gmail.com",
    "username":          "teacher",
    "name":              "Class Teacher",
    "role":              "teacher",
    "phone":             "",
    "assigned_class":    "",          # Admin can set this from dashboard
    "password_hash":     generate_password_hash("123456"),
    "active_session_id": "",
    "last_login_at":     "",
    "created_at":        now(),
    "updated_at":        now(),
}

# Write to Firestore
db.collection(col("users")).document(admin_id).set(admin_user)
print(f"  [CREATED] Admin   -> email: admin@gmail.com  |  pass: 654321  |  id: {admin_id}")

db.collection(col("users")).document(teacher_id).set(teacher_user)
print(f"  [CREATED] Teacher -> email: tr@gmail.com     |  pass: 123456  |  id: {teacher_id}")

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
print("\n" + "="*60)
print("  STEP 3: Verify users saved correctly")
print("="*60)

users = list(db.collection(col("users")).stream())
print(f"  Total users in Firestore: {len(users)}")
for u in users:
    d = u.to_dict()
    has_hash = bool(d.get("password_hash", ""))
    print(f"  - {d.get('name')} ({d.get('email')}) | role={d.get('role')} | hash={'YES' if has_hash else 'NO'}")

print("\n" + "="*60)
print("  DONE! Firestore is clean. Users created.")
print("  Login at: http://localhost:5000/auth/login")
print("="*60 + "\n")
