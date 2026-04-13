import os
from dotenv import load_dotenv
load_dotenv()
import firebase_admin
from firebase_admin import credentials, firestore

prefix = os.getenv("FIRESTORE_COLLECTION_PREFIX", "pmsr")
cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "")

if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(cred_path))

db = firestore.client()
users = list(db.collection(f"{prefix}_users").stream())
print(f"Users in Firestore: {len(users)}")
for u in users:
    d = u.to_dict()
    has_hash = bool(d.get("password_hash", ""))
    print(f"  - {d.get('name')} | {d.get('email')} | role={d.get('role')} | hash={has_hash}")

print("Collections summary:")
for col in ["users", "students", "contacts", "audit_logs"]:
    docs = list(db.collection(f"{prefix}_{col}").stream())
    print(f"  {prefix}_{col}: {len(docs)} docs")
