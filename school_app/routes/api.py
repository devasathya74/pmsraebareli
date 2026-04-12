from __future__ import annotations

import secrets

from pydantic import ValidationError
from flask import Blueprint, current_app, g, jsonify, request, session

from school_app.schemas import (
    AttendanceRecordRequest,
    ChangePasswordRequest,
    CreateUserRequest,
    ExpenseCreateRequest,
    InventoryCreateRequest,
    LoginRequest,
    MessageCreateRequest,
    NotificationCreateRequest,
)
from school_app.services.audit import log_audit_event
from school_app.services.resources import (
    authorize_collection,
    create_document,
    delete_document,
    effective_role,
    get_document,
    list_documents,
    normalize_collection,
    patch_document,
    sanitize_document,
    serialize_user,
    set_document,
)
from school_app.services.security import (
    ensure_csrf_token,
    issue_login_captcha,
    validate_csrf_token,
    validate_login_captcha,
)
from school_app.utils import allowed_file, find_user_by_identifier, utcnow_iso


api_bp = Blueprint("api", __name__, url_prefix="/api")


UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def _json_error(message: str, status_code: int = 400, **extra):
    payload = {"success": False, "error": message}
    payload.update(extra)
    return jsonify(payload), status_code


def _parse_model(model_cls, payload: dict):
    try:
        return model_cls.model_validate(payload), None
    except ValidationError as error:
        return None, _json_error("validation-error", 422, details=error.errors())


def _require_api_user():
    if not g.current_user:
        return _json_error("Authentication required", 401)
    return None


def _authorize(collection: str, method: str):
    guard = _require_api_user()
    if guard:
        return guard
    allowed, message = authorize_collection(collection, method, g.current_user)
    if not allowed:
        return _json_error(message or "Access denied", 403)
    return None


def _list_payload():
    payload = request.get_json(silent=True) or {}
    return {
        "filters": payload.get("filters") or [],
        "order_by": payload.get("order_by") or [],
        "limit_value": payload.get("limit"),
        "start_after_id": payload.get("start_after_id"),
    }


def _resource_list(collection: str):
    guard = _authorize(collection, "GET")
    if guard:
        return guard
    params = _list_payload()
    documents = list_documents(collection, g.current_user, **params)
    return jsonify({"success": True, "data": [sanitize_document(normalize_collection(collection), item) for item in documents]})


def _resource_get(collection: str, doc_id: str):
    guard = _authorize(collection, "GET")
    if guard:
        return guard
    document = get_document(collection, doc_id, g.current_user)
    if not document:
        return _json_error("Document not found", 404)
    return jsonify({"success": True, "data": sanitize_document(normalize_collection(collection), document)})


def _resource_create(collection: str, payload: dict):
    guard = _authorize(collection, "POST")
    if guard:
        return guard
    item_id, document = create_document(collection, payload, g.current_user)
    log_audit_event(
        f"CREATE_{normalize_collection(collection).upper()}",
        target_collection=normalize_collection(collection),
        target_id=item_id,
    )
    return jsonify({"success": True, "id": item_id, "data": sanitize_document(normalize_collection(collection), document)})


def _resource_put(collection: str, doc_id: str, payload: dict):
    guard = _authorize(collection, "PUT")
    if guard:
        return guard
    existing = get_document(collection, doc_id, g.current_user) if g.current_user else None
    document = set_document(collection, doc_id, payload, existing)
    log_audit_event(
        f"UPSERT_{normalize_collection(collection).upper()}",
        target_collection=normalize_collection(collection),
        target_id=doc_id,
    )
    return jsonify({"success": True, "data": sanitize_document(normalize_collection(collection), document)})


def _resource_patch(collection: str, doc_id: str, payload: dict):
    guard = _authorize(collection, "PATCH")
    if guard:
        return guard
    existing = get_document(collection, doc_id, g.current_user)
    if not existing:
        return _json_error("Document not found", 404)
    document = patch_document(collection, doc_id, payload, existing)
    log_audit_event(
        f"UPDATE_{normalize_collection(collection).upper()}",
        target_collection=normalize_collection(collection),
        target_id=doc_id,
    )
    return jsonify({"success": True, "data": sanitize_document(normalize_collection(collection), document)})


def _resource_delete(collection: str, doc_id: str):
    guard = _authorize(collection, "DELETE")
    if guard:
        return guard
    existing = get_document(collection, doc_id, g.current_user)
    if not existing:
        return _json_error("Document not found", 404)
    delete_document(collection, doc_id)
    log_audit_event(
        f"DELETE_{normalize_collection(collection).upper()}",
        target_collection=normalize_collection(collection),
        target_id=doc_id,
    )
    return jsonify({"success": True})


@api_bp.before_request
def csrf_protect_api():
    ensure_csrf_token()
    if request.method not in UNSAFE_METHODS:
        return None

    token = (
        request.headers.get("X-CSRF-Token")
        or (request.get_json(silent=True) or {}).get("csrf_token")
        or request.form.get("csrf_token")
    )
    if not validate_csrf_token(token):
        log_audit_event("CSRF_REJECTED", status="blocked", details={"path": request.path})
        return _json_error("Invalid CSRF token", 403)
    return None


@api_bp.get("/security/csrf")
def csrf_token():
    return jsonify({"success": True, "csrf_token": ensure_csrf_token()})


@api_bp.get("/auth/captcha")
def auth_captcha():
    challenge = issue_login_captcha()
    return jsonify({"success": True, "captcha": challenge, "csrf_token": ensure_csrf_token()})


@api_bp.get("/auth/session")
def auth_session():
    ensure_csrf_token()
    if not g.current_user:
        return jsonify({
            "success": True, 
            "user": None, 
            "csrf_token": ensure_csrf_token(),
            "session_timeout_minutes": current_app.config["SESSION_TIMEOUT_MINUTES"]
        })
    return jsonify({
        "success": True, 
        "user": serialize_user(g.current_user), 
        "csrf_token": ensure_csrf_token(),
        "session_timeout_minutes": current_app.config["SESSION_TIMEOUT_MINUTES"]
    })


@api_bp.post("/auth/login")
def auth_login():
    payload = request.get_json(silent=True) or {}
    data, error_response = _parse_model(LoginRequest, payload)
    if error_response:
        return error_response

    identifier = data.email.strip()
    password = data.password
    captcha = data.captcha
    ip_address = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    username_key = identifier.lower()
    limiter = current_app.login_rate_limiter

    decision = limiter.check(f"login:ip:{ip_address}", f"login:user:{username_key}")
    if not decision.allowed:
        log_audit_event(
            "LOGIN_RATE_LIMITED",
            status="blocked",
            details={"identifier": identifier, "retry_after_seconds": decision.retry_after_seconds},
        )
        return _json_error("auth/too-many-requests", 429, retry_after=decision.retry_after_seconds)

    if not validate_login_captcha(captcha):
        limiter.register_failure(f"login:ip:{ip_address}", f"login:user:{username_key}")
        log_audit_event("LOGIN_FAILED_CAPTCHA", status="failed", username=identifier, details={"identifier": identifier})
        issue_login_captcha()
        return _json_error("auth/invalid-captcha", 400)

    repository = current_app.repository
    user = find_user_by_identifier(repository, identifier)
    if not user or not repository.verify_password(user.get("password_hash", ""), password):
        limiter.register_failure(f"login:ip:{ip_address}", f"login:user:{username_key}")
        log_audit_event("LOGIN_FAILED_CREDENTIALS", status="failed", username=identifier, details={"identifier": identifier})
        issue_login_captcha()
        return _json_error("auth/invalid-credential", 401)

    limiter.reset(f"login:ip:{ip_address}", f"login:user:{username_key}")
    session.clear()
    session["user_id"] = user["id"]
    session["session_id"] = secrets.token_urlsafe(24)
    session["last_seen_at"] = utcnow_iso()
    session["csrf_token"] = ensure_csrf_token()
    repository.update(
        "users",
        user["id"],
        {
            "active_session_id": session["session_id"],
            "last_login_at": utcnow_iso(),
        },
    )
    fresh_user = repository.get("users", user["id"]) or user
    log_audit_event("LOGIN_SUCCESS", target_collection="users", target_id=user["id"])
    issue_login_captcha()
    return jsonify({
        "success": True, 
        "user": serialize_user(fresh_user), 
        "csrf_token": ensure_csrf_token(),
        "session_timeout_minutes": current_app.config["SESSION_TIMEOUT_MINUTES"]
    })


@api_bp.post("/auth/logout")
def auth_logout():
    if g.current_user:
        current_app.repository.update("users", g.current_user["id"], {"active_session_id": ""})
        log_audit_event("LOGOUT", target_collection="users", target_id=g.current_user["id"])
    session.clear()
    session["csrf_token"] = secrets.token_urlsafe(32)
    return jsonify({"success": True, "csrf_token": session["csrf_token"]})


@api_bp.post("/auth/verify-password")
def verify_password():
    guard = _require_api_user()
    if guard:
        return guard

    payload = request.get_json(silent=True) or {}
    password = payload.get("password", "")
    if not current_app.repository.verify_password(g.current_user.get("password_hash", ""), password):
        log_audit_event("PASSWORD_VERIFY_FAILED", status="failed", target_collection="users", target_id=g.current_user["id"])
        return _json_error("auth/wrong-password", 401)
    return jsonify({"success": True})


@api_bp.post("/auth/change-password")
def change_password():
    guard = _require_api_user()
    if guard:
        return guard

    payload = request.get_json(silent=True) or {}
    data, error_response = _parse_model(ChangePasswordRequest, payload)
    if error_response:
        return error_response

    if not current_app.repository.verify_password(g.current_user.get("password_hash", ""), data.current_password):
        log_audit_event("PASSWORD_CHANGE_FAILED", status="failed", target_collection="users", target_id=g.current_user["id"])
        return _json_error("auth/wrong-password", 401)

    current_app.repository.update(
        "users",
        g.current_user["id"],
        {"password_hash": current_app.repository.hash_password(data.new_password)},
    )
    log_audit_event("PASSWORD_CHANGED", target_collection="users", target_id=g.current_user["id"])
    return jsonify({"success": True})


@api_bp.post("/auth/create-user")
def create_user():
    guard = _require_api_user()
    if guard:
        return guard
    if effective_role(g.current_user) != "admin":
        return _json_error("Access denied", 403)

    payload = request.get_json(silent=True) or {}
    data, error_response = _parse_model(CreateUserRequest, payload)
    if error_response:
        return error_response

    repository = current_app.repository
    if repository.find_one("users", {"email": data.email}):
        return _json_error("auth/email-already-in-use", 409)

    user_id, _ = create_document(
        "users",
        {
            "name": data.name,
            "full_name": data.name,
            "email": data.email,
            "username": data.username or data.email.split("@", 1)[0],
            "phone": data.phone,
            "password_hash": repository.hash_password(data.password),
            "role": data.role,
            "assigned_class": data.assignedClass,
            "active_session_id": "",
        },
        g.current_user,
    )
    log_audit_event("CREATE_USER_ACCOUNT", target_collection="users", target_id=user_id, details={"role": data.role})
    return jsonify({"success": True, "uid": user_id})


@api_bp.post("/storage/upload")
def upload_file():
    guard = _require_api_user()
    if guard:
        return guard

    folder = (request.form.get("folder", "general") or "general").strip()
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return _json_error("No file provided")
    if not allowed_file(upload.filename):
        return _json_error("Unsupported file type", 415)

    stored = current_app.storage_service.upload(upload, folder)
    current_app.repository.create(
        "files",
        {
            "filename": stored["filename"],
            "object_name": stored["object_name"],
            "file_url": stored["file_url"],
            "folder": folder,
            "uploaded_by": g.current_user["id"],
        },
    )
    log_audit_event("FILE_UPLOAD", target_collection="files", target_id=stored["object_name"], details={"folder": folder})
    return jsonify({"success": True, "url": stored["file_url"], "data": stored})


@api_bp.get("/users/<doc_id>")
def users_get(doc_id: str):
    return _resource_get("users", doc_id)


@api_bp.post("/students/list")
def students_list():
    return _resource_list("students")


@api_bp.post("/students")
def students_create():
    payload = request.get_json(silent=True) or {}
    return _resource_create("students", payload)


@api_bp.get("/students/<doc_id>")
def students_get(doc_id: str):
    return _resource_get("students", doc_id)


@api_bp.patch("/students/<doc_id>")
def students_patch(doc_id: str):
    return _resource_patch("students", doc_id, request.get_json(silent=True) or {})


@api_bp.put("/students/<doc_id>")
def students_put(doc_id: str):
    return _resource_put("students", doc_id, request.get_json(silent=True) or {})


@api_bp.delete("/students/<doc_id>")
def students_delete(doc_id: str):
    return _resource_delete("students", doc_id)


@api_bp.post("/teachers/list")
def teachers_list():
    return _resource_list("teachers")


@api_bp.post("/teachers")
def teachers_create():
    payload = request.get_json(silent=True) or {}
    return _resource_create("teachers", payload)


@api_bp.get("/teachers/<doc_id>")
def teachers_get(doc_id: str):
    return _resource_get("teachers", doc_id)


@api_bp.patch("/teachers/<doc_id>")
def teachers_patch(doc_id: str):
    return _resource_patch("teachers", doc_id, request.get_json(silent=True) or {})


@api_bp.put("/teachers/<doc_id>")
def teachers_put(doc_id: str):
    return _resource_put("teachers", doc_id, request.get_json(silent=True) or {})


@api_bp.delete("/teachers/<doc_id>")
def teachers_delete(doc_id: str):
    return _resource_delete("teachers", doc_id)


@api_bp.post("/admissions/list")
def admissions_list():
    return _resource_list("admissions")


@api_bp.post("/admissions")
def admissions_create():
    payload = request.get_json(silent=True) or {}
    return _resource_create("admissions", payload)


@api_bp.get("/admissions/<doc_id>")
def admissions_get(doc_id: str):
    return _resource_get("admissions", doc_id)


@api_bp.patch("/admissions/<doc_id>")
def admissions_patch(doc_id: str):
    return _resource_patch("admissions", doc_id, request.get_json(silent=True) or {})


@api_bp.put("/admissions/<doc_id>")
def admissions_put(doc_id: str):
    return _resource_put("admissions", doc_id, request.get_json(silent=True) or {})


@api_bp.delete("/admissions/<doc_id>")
def admissions_delete(doc_id: str):
    return _resource_delete("admissions", doc_id)


@api_bp.post("/attendance/list")
def attendance_list():
    return _resource_list("attendance")


@api_bp.put("/attendance/<doc_id>")
def attendance_put(doc_id: str):
    payload = request.get_json(silent=True) or {}
    data, error_response = _parse_model(AttendanceRecordRequest, payload)
    if error_response:
        return error_response
    return _resource_put("attendance", doc_id, data.model_dump(by_alias=True))


@api_bp.get("/attendance/<doc_id>")
def attendance_get(doc_id: str):
    return _resource_get("attendance", doc_id)


@api_bp.post("/messages/list")
def messages_list():
    return _resource_list("messages")


@api_bp.post("/messages")
def messages_create():
    payload = request.get_json(silent=True) or {}
    data, error_response = _parse_model(MessageCreateRequest, payload)
    if error_response:
        return error_response
    return _resource_create("messages", data.model_dump())


@api_bp.delete("/messages/<doc_id>")
def messages_delete(doc_id: str):
    return _resource_delete("messages", doc_id)


@api_bp.post("/notifications/list")
def notifications_list():
    return _resource_list("notifications")


@api_bp.post("/notifications")
def notifications_create():
    payload = request.get_json(silent=True) or {}
    data, error_response = _parse_model(NotificationCreateRequest, payload)
    if error_response:
        return error_response
    return _resource_create("notifications", data.model_dump())


@api_bp.patch("/notifications/<doc_id>")
def notifications_patch(doc_id: str):
    return _resource_patch("notifications", doc_id, request.get_json(silent=True) or {})


@api_bp.delete("/notifications/<doc_id>")
def notifications_delete(doc_id: str):
    return _resource_delete("notifications", doc_id)


@api_bp.post("/inventory/list")
def inventory_list():
    return _resource_list("inventory")


@api_bp.post("/inventory")
def inventory_create():
    payload = request.get_json(silent=True) or {}
    data, error_response = _parse_model(InventoryCreateRequest, payload)
    if error_response:
        return error_response
    return _resource_create(
        "inventory",
        {
            "item_name": data.itemName,
            "itemName": data.itemName,
            "category": data.category,
            "quantity": data.quantity,
            "issuingDate": data.issuingDate,
            "issuingAuthority": data.issuingAuthority,
            "createdAt": data.createdAt or payload.get("createdAt", ""),
            "location": data.location,
            "condition": data.condition,
            "notes": data.notes,
        },
    )


@api_bp.delete("/inventory/<doc_id>")
def inventory_delete(doc_id: str):
    return _resource_delete("inventory", doc_id)


@api_bp.post("/contacts/list")
def contacts_list():
    return _resource_list("contacts")


@api_bp.post("/contacts")
def contacts_create():
    payload = request.get_json(silent=True) or {}
    return _resource_create("contacts", payload)


@api_bp.patch("/contacts/<doc_id>")
def contacts_patch(doc_id: str):
    return _resource_patch("contacts", doc_id, request.get_json(silent=True) or {})


@api_bp.delete("/contacts/<doc_id>")
def contacts_delete(doc_id: str):
    return _resource_delete("contacts", doc_id)


@api_bp.post("/fees/list")
def fees_list():
    return _resource_list("fees")


@api_bp.post("/fees")
def fees_create():
    payload = request.get_json(silent=True) or {}
    return _resource_create("fees", payload)


@api_bp.get("/fees/<doc_id>")
def fees_get(doc_id: str):
    return _resource_get("fees", doc_id)


@api_bp.put("/fees/<doc_id>")
def fees_put(doc_id: str):
    return _resource_put("fees", doc_id, request.get_json(silent=True) or {})


@api_bp.delete("/fees/<doc_id>")
def fees_delete(doc_id: str):
    return _resource_delete("fees", doc_id)


@api_bp.post("/expenses/list")
def expenses_list():
    return _resource_list("expenses")


@api_bp.post("/expenses")
def expenses_create():
    payload = request.get_json(silent=True) or {}
    data, error_response = _parse_model(ExpenseCreateRequest, payload)
    if error_response:
        return error_response
    return _resource_create("expenses", data.model_dump())


@api_bp.get("/expenses/<doc_id>")
def expenses_get(doc_id: str):
    return _resource_get("expenses", doc_id)


@api_bp.put("/expenses/<doc_id>")
def expenses_put(doc_id: str):
    return _resource_put("expenses", doc_id, request.get_json(silent=True) or {})


@api_bp.delete("/expenses/<doc_id>")
def expenses_delete(doc_id: str):
    return _resource_delete("expenses", doc_id)


@api_bp.post("/salary-slips/list")
def salary_slips_list():
    return _resource_list("salary_slips")


@api_bp.get("/salary-slips/<doc_id>")
def salary_slips_get(doc_id: str):
    return _resource_get("salary_slips", doc_id)


@api_bp.put("/salary-slips/<doc_id>")
def salary_slips_put(doc_id: str):
    return _resource_put("salary_slips", doc_id, request.get_json(silent=True) or {})


@api_bp.delete("/salary-slips/<doc_id>")
def salary_slips_delete(doc_id: str):
    return _resource_delete("salary_slips", doc_id)


@api_bp.get("/exam-schedules/<doc_id>")
def exam_schedules_get(doc_id: str):
    guard = _authorize("exam_schedules", "GET")
    if guard:
        return guard
    document = get_document("exam_schedules", doc_id, g.current_user)
    # Firestore getDoc() semantics: missing doc is not an error.
    if not document:
        return jsonify({"success": True, "data": None})
    return jsonify({"success": True, "data": sanitize_document("exam_schedules", document)})


@api_bp.put("/exam-schedules/<doc_id>")
def exam_schedules_put(doc_id: str):
    return _resource_put("exam_schedules", doc_id, request.get_json(silent=True) or {})


@api_bp.get("/audit-logs")
def audit_logs_list():
    guard = _require_api_user()
    if guard:
        return guard
    if (g.current_user.get("role", "") not in {"admin", "principal"}):
        return _json_error("Access denied", 403)
    documents = list_documents("audit_logs", g.current_user, limit_value=200)
    return jsonify({"success": True, "data": documents})
