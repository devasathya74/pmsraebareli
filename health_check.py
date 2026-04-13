"""
Comprehensive Backend Health Check
Tests: Environment, Firestore, Supabase Storage, Flask API routes.
Run: python health_check.py
"""
import os
import sys
import json
import time
import traceback
from io import BytesIO
from pathlib import Path

# Force UTF-8 on Windows terminal
if sys.stdout.encoding and sys.stdout.encoding.lower() in ("cp1252", "cp850"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_URL = os.getenv("HEALTH_CHECK_BASE_URL", "http://localhost:5000")

PASS = "[PASS]"
FAIL = "[FAIL]"
WARN = "[WARN]"
INFO = "[INFO]"

results = {"passed": 0, "failed": 0, "warnings": 0}


def ok(msg):
    print(f"  {PASS} {msg}")
    results["passed"] += 1


def fail(msg):
    print(f"  {FAIL} {msg}")
    results["failed"] += 1


def warn(msg):
    print(f"  {WARN} {msg}")
    results["warnings"] += 1


def info(msg):
    print(f"  {INFO} {msg}")


def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


# ===================================================
# 1. ENVIRONMENT VARIABLES
# ===================================================
section("1. ENVIRONMENT VARIABLES")

required_vars = {
    "FIREBASE_PROJECT_ID": "Firestore project ID",
    "SUPABASE_URL": "Supabase project URL",
    "SUPABASE_KEY": "Supabase anon/service key",
    "SECRET_KEY": "Flask session secret",
}
optional_vars = {
    "FIREBASE_CREDENTIALS_PATH": "Local service account JSON path",
    "FIREBASE_CREDENTIALS_JSON": "Service account JSON (cloud/Railway)",
    "SUPABASE_BUCKET": "Supabase storage bucket name",
    "FIRESTORE_COLLECTION_PREFIX": "Firestore collection prefix",
}

for var, desc in required_vars.items():
    val = os.getenv(var, "")
    if val:
        masked = val[:4] + "*" * max(0, len(val) - 4)
        ok(f"{var} = {masked}  [{desc}]")
    else:
        fail(f"{var} NOT SET  [{desc}]")

for var, desc in optional_vars.items():
    val = os.getenv(var, "")
    if val:
        masked = val[:4] + "*" * max(0, len(val) - 4)
        ok(f"{var} = {masked}  [{desc}]")
    else:
        warn(f"{var} not set (optional)  [{desc}]")

cred_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
if cred_path:
    if Path(cred_path).exists():
        ok(f"Service account file exists: {cred_path}")
    else:
        warn(f"Service account file NOT found: {cred_path} (will try JSON env var)")

cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON", "")
if cred_json:
    try:
        parsed = json.loads(cred_json)
        ok(f"FIREBASE_CREDENTIALS_JSON is valid JSON (project: {parsed.get('project_id', '?')})")
    except json.JSONDecodeError:
        fail("FIREBASE_CREDENTIALS_JSON is set but NOT valid JSON!")


# ===================================================
# 2. FIRESTORE CONNECTIVITY
# ===================================================
section("2. FIRESTORE CONNECTIVITY")

_firestore_ok = False
try:
    import firebase_admin
    from firebase_admin import credentials, firestore

    project_id = os.getenv("FIREBASE_PROJECT_ID", "")
    cred_json_str = os.getenv("FIREBASE_CREDENTIALS_JSON", "")
    cred_path_env = os.getenv("FIREBASE_CREDENTIALS_PATH", "")
    prefix = os.getenv("FIRESTORE_COLLECTION_PREFIX", "pmsr")

    if not firebase_admin._apps:
        if cred_json_str:
            cred_info = json.loads(cred_json_str)
            cred = credentials.Certificate(cred_info)
            firebase_admin.initialize_app(cred)
            info("Firebase initialized from FIREBASE_CREDENTIALS_JSON")
        elif cred_path_env and Path(cred_path_env).exists():
            cred = credentials.Certificate(cred_path_env)
            firebase_admin.initialize_app(cred)
            info(f"Firebase initialized from file: {cred_path_env}")
        elif project_id:
            firebase_admin.initialize_app(options={"projectId": project_id})
            warn("Firebase initialized with default credentials (no service account set)")
        else:
            fail("Cannot initialize Firebase - no credentials or project ID found")
            raise RuntimeError("No Firebase credentials")
    else:
        info("Firebase already initialized")

    db = firestore.client()

    # Write ping
    test_col = f"{prefix}_keep_alive" if prefix else "keep_alive"
    t0 = time.time()
    doc_ref = db.collection(test_col).document("health_check_ping")
    doc_ref.set({"ping": True, "ts": str(time.time()), "source": "health_check.py"})
    write_ms = int((time.time() - t0) * 1000)
    ok(f"Firestore WRITE ({write_ms}ms) -> {test_col}/health_check_ping")

    # Read back
    t0 = time.time()
    snap = doc_ref.get()
    read_ms = int((time.time() - t0) * 1000)
    if snap.exists:
        ok(f"Firestore READ ({read_ms}ms) -> document confirmed")
    else:
        fail("Firestore READ failed - document not found after write!")

    # Delete
    t0 = time.time()
    doc_ref.delete()
    del_ms = int((time.time() - t0) * 1000)
    ok(f"Firestore DELETE ({del_ms}ms)")

    # Check live collections
    info(f"Checking real collections with prefix='{prefix}'...")
    for col in ["users", "students", "teachers", "fees", "notifications", "contacts", "admissions"]:
        col_name = f"{prefix}_{col}" if prefix else col
        try:
            docs = list(db.collection(col_name).limit(1).stream())
            hint = "1+ docs" if docs else "0 docs (empty)"
            ok(f"Collection '{col_name}' -> accessible ({hint})")
        except Exception as e:
            warn(f"Collection '{col_name}' -> error: {e}")

    _firestore_ok = True

except ImportError:
    fail("firebase-admin NOT installed! Run: pip install firebase-admin")
except Exception as e:
    fail(f"Firestore FAILED: {e}")
    traceback.print_exc()


# ===================================================
# 3. SUPABASE STORAGE CONNECTIVITY
# ===================================================
section("3. SUPABASE STORAGE CONNECTIVITY")

supabase_url = os.getenv("SUPABASE_URL", "")
supabase_key = os.getenv("SUPABASE_KEY", "")
bucket = os.getenv("SUPABASE_BUCKET", "school-files")

if not supabase_url or not supabase_key:
    fail("SUPABASE_URL or SUPABASE_KEY not set - skipping storage test")
else:
    try:
        from supabase import create_client
        client = create_client(supabase_url, supabase_key)
        info(f"Supabase client created for: {supabase_url[:45]}...")

        # List buckets
        try:
            t0 = time.time()
            buckets_raw = client.storage.list_buckets()
            list_ms = int((time.time() - t0) * 1000)
            # Handle different supabase SDK versions
            if hasattr(buckets_raw, '__iter__'):
                bucket_names = []
                for b in buckets_raw:
                    if hasattr(b, 'name'):
                        bucket_names.append(b.name)
                    elif isinstance(b, dict):
                        bucket_names.append(b.get('name', str(b)))
            else:
                bucket_names = []

            if bucket_names:
                ok(f"Bucket list ({list_ms}ms): {bucket_names}")
                if bucket in bucket_names:
                    ok(f"Target bucket '{bucket}' EXISTS")
                else:
                    fail(f"Target bucket '{bucket}' NOT in list: {bucket_names}")
            else:
                warn(f"Bucket list returned empty ({list_ms}ms) - anon key may not have list_buckets permission")
                info("Will proceed to test bucket access directly via upload...")
        except Exception as e:
            warn(f"list_buckets() failed (key may lack permission): {e}")

        # Upload test using a 1x1 transparent PNG (bucket allows image/* types)
        try:
            TINY_PNG = bytes([
                0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00,0x00,0x0d,0x49,0x48,0x44,0x52,
                0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1f,0x15,0xc4,
                0x89,0x00,0x00,0x00,0x0a,0x49,0x44,0x41,0x54,0x78,0x9c,0x62,0x00,0x01,0x00,0x00,
                0x05,0x00,0x01,0x0d,0x0a,0x2d,0xb4,0x00,0x00,0x00,0x00,0x49,0x45,0x4e,0x44,0xae,
                0x42,0x60,0x82,
            ])
            object_name = "keep_alive/health_check_ping.png"
            t0 = time.time()
            client.storage.from_(bucket).upload(
                object_name,
                TINY_PNG,
                {"content-type": "image/png", "x-upsert": "true"},
            )
            upload_ms = int((time.time() - t0) * 1000)
            ok(f"Supabase UPLOAD ({upload_ms}ms) -> {bucket}/{object_name}")

            # Get public URL
            public_url = client.storage.from_(bucket).get_public_url(object_name)
            ok(f"Supabase PUBLIC URL: {public_url[:70]}...")

            # Delete
            t0 = time.time()
            client.storage.from_(bucket).remove([object_name])
            del_ms = int((time.time() - t0) * 1000)
            ok(f"Supabase DELETE ({del_ms}ms)")

        except Exception as e:
            fail(f"Supabase upload/delete FAILED: {e}")
            info("Hint: Check bucket MIME type restrictions in Supabase Dashboard > Storage > Policies")

    except ImportError:
        fail("supabase NOT installed! Run: pip install supabase>=2.9.0")
    except Exception as e:
        fail(f"Supabase connection FAILED: {e}")
        traceback.print_exc()


# ===================================================
# 4. FLASK API LIVE ENDPOINT TESTS
# ===================================================
section("4. FLASK API ENDPOINTS (live)")

try:
    import requests as req_lib
    http = req_lib.Session()
    info(f"Testing server at: {BASE_URL}")

    def api_get(path, expected=200, label=None):
        tag = label or path
        try:
            r = http.get(f"{BASE_URL}{path}", timeout=8)
            if r.status_code == expected:
                ok(f"GET {tag} -> HTTP {r.status_code}")
            else:
                fail(f"GET {tag} -> HTTP {r.status_code} (expected {expected}) | {r.text[:150]}")
            return r
        except req_lib.ConnectionError:
            fail(f"GET {tag} -> CONNECTION REFUSED (is server running?)")
        except Exception as e:
            fail(f"GET {tag} -> {e}")
        return None

    def api_post(path, data=None, hdrs=None, expected=200, label=None):
        tag = label or path
        try:
            r = http.post(f"{BASE_URL}{path}", json=data, headers=hdrs or {}, timeout=8)
            if r.status_code == expected:
                ok(f"POST {tag} -> HTTP {r.status_code}")
            else:
                fail(f"POST {tag} -> HTTP {r.status_code} (expected {expected}) | {r.text[:150]}")
            return r
        except req_lib.ConnectionError:
            fail(f"POST {tag} -> CONNECTION REFUSED")
        except Exception as e:
            fail(f"POST {tag} -> {e}")
        return None

    # Public pages
    info("--- Public Routes ---")
    api_get("/", label="Homepage")
    api_get("/api/public/notifications", label="GET /api/public/notifications")

    # CSRF + Captcha
    info("--- Auth Endpoints ---")
    csrf_token = ""
    r = api_get("/api/security/csrf", label="GET /api/security/csrf")
    if r and r.ok:
        csrf_token = r.json().get("csrf_token", "")
        ok(f"CSRF token: {csrf_token[:16]}...")

    r = api_get("/api/auth/captcha", label="GET /api/auth/captcha")
    if r and r.ok:
        captcha_q = r.json().get("captcha", "")
        csrf_token = r.json().get("csrf_token", csrf_token)
        ok(f"Captcha challenge obtained: '{captcha_q}'")

    r = api_get("/api/auth/session", label="GET /api/auth/session (unauthed)")
    if r and r.ok:
        user = r.json().get("user")
        ok(f"Session check -> user={'None (unauthenticated)' if not user else user.get('email', '?')}")

    # Public contact form
    info("--- Public Contact Form ---")
    hdrs = {"X-CSRF-Token": csrf_token, "Content-Type": "application/json"}
    r = api_post(
        "/api/public/contacts",
        data={
            "name": "Health Check Bot",
            "email": "healthcheck@example.com",
            "phone": "9876543210",
            "message": "Automated health check ping. Please ignore.",
            "createdAt": "2026-04-13T03:30:00.000Z",
            "read": False,
        },
        hdrs=hdrs,
        label="POST /api/public/contacts",
    )
    if r:
        if r.status_code == 200:
            ok("Contact form -> ACCEPTED by backend and saved to Firestore")
        elif r.status_code == 422:
            fail(f"Contact form -> 422 Validation Error: {r.json().get('details', r.text)}")
        elif r.status_code == 403:
            warn("Contact form -> 403 CSRF rejected (token might have expired between requests)")

    # Protected routes - should return 401 when unauthenticated
    info("--- Protected Routes (expect 401) ---")
    api_post("/api/students/list", data={}, hdrs=hdrs, expected=401, label="POST /api/students/list")
    api_post("/api/teachers/list", data={}, hdrs=hdrs, expected=401, label="POST /api/teachers/list")
    api_post("/api/fees/list", data={}, hdrs=hdrs, expected=401, label="POST /api/fees/list")
    api_post("/api/admissions/list", data={}, hdrs=hdrs, expected=401, label="POST /api/admissions/list")
    api_post("/api/contacts/list", data={}, hdrs=hdrs, expected=401, label="POST /api/contacts/list")
    api_post("/api/messages/list", data={}, hdrs=hdrs, expected=401, label="POST /api/messages/list")
    api_post("/api/notifications/list", data={}, hdrs=hdrs, expected=401, label="POST /api/notifications/list")
    api_post("/api/expenses/list", data={}, hdrs=hdrs, expected=401, label="POST /api/expenses/list")
    api_post("/api/inventory/list", data={}, hdrs=hdrs, expected=401, label="POST /api/inventory/list")
    api_get("/api/audit-logs", expected=401, label="GET /api/audit-logs")

    # Storage
    info("--- Storage Upload (expect 401) ---")
    try:
        r = http.post(
            f"{BASE_URL}/api/storage/upload",
            headers={"X-CSRF-Token": csrf_token},
            files={"file": ("test.bin", BytesIO(b"ping"), "application/octet-stream")},
            data={"folder": "health_check"},
            timeout=8,
        )
        if r.status_code == 401:
            ok("POST /api/storage/upload -> 401 (auth guard working)")
        else:
            warn(f"POST /api/storage/upload -> {r.status_code} (expected 401)")
    except req_lib.ConnectionError:
        fail("POST /api/storage/upload -> CONNECTION REFUSED")

except ImportError:
    warn("'requests' not installed. Skipping live API tests. Run: pip install requests")


# ===================================================
# 5. ISSUE: auth.py uses LOCAL_UPLOAD_DIR (cloud bug)
# ===================================================
section("5. CODE AUDIT FLAGS")

info("Checking for known code issues...")

# Check if auth.py has LOCAL_UPLOAD_DIR reference (incompatible with cloud-only mode)
auth_py = Path("school_app/routes/auth.py")
if auth_py.exists():
    content = auth_py.read_text(encoding="utf-8")
    if "LOCAL_UPLOAD_DIR" in content:
        warn("auth.py references LOCAL_UPLOAD_DIR - this path doesn't exist in cloud-only config!")
        warn("  -> GET /auth/files/<path> will crash if accessed in production")
        warn("  -> Fix: Remove this route or redirect to Supabase URL")
    else:
        ok("auth.py - no LOCAL_UPLOAD_DIR reference found")

# Check config for LOCAL_UPLOAD_DIR def
config_py = Path("config.py")
if config_py.exists():
    ct = config_py.read_text(encoding="utf-8")
    if "LOCAL_UPLOAD_DIR" not in ct:
        warn("LOCAL_UPLOAD_DIR not defined in config.py but auth.py uses it -> KeyError on startup if route is hit")
    else:
        ok("LOCAL_UPLOAD_DIR defined in config.py")

# Check schemas.py for ContactRequest
schemas_py = Path("school_app/schemas.py")
if schemas_py.exists():
    ct = schemas_py.read_text(encoding="utf-8")
    if "ContactRequest" in ct:
        ok("ContactRequest schema found in schemas.py")
    else:
        fail("ContactRequest schema MISSING from schemas.py!")

# Check keep_alive DATA_BACKEND guard
ka_py = Path("school_app/services/keep_alive.py")
if ka_py.exists():
    ct = ka_py.read_text(encoding="utf-8")
    if "DATA_BACKEND" in ct:
        ok("keep_alive.py checks DATA_BACKEND before pinging Firestore")
    else:
        warn("keep_alive.py does not check DATA_BACKEND - may error on non-Firestore setups")


# ===================================================
# SUMMARY
# ===================================================
section("HEALTH CHECK SUMMARY")
total = results["passed"] + results["failed"] + results["warnings"]
print(f"\n  Total checks : {total}")
print(f"  {PASS} Passed   : {results['passed']}")
print(f"  {FAIL} Failed   : {results['failed']}")
print(f"  {WARN} Warnings : {results['warnings']}")

if results["failed"] == 0:
    print("\n  ALL CRITICAL CHECKS PASSED - Backend is healthy!")
elif results["failed"] <= 3:
    print(f"\n  {results['failed']} check(s) failed - review output above")
else:
    print(f"\n  {results['failed']} checks failed - action required!")

sys.exit(0 if results["failed"] == 0 else 1)
