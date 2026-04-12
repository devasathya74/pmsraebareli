from pathlib import Path

from pydantic import ValidationError
from flask import Blueprint, current_app, g, jsonify, redirect, render_template, request, send_from_directory, url_for

from school_app.schemas import ContactRequest
from school_app.services.audit import log_audit_event
from school_app.services.security import ensure_csrf_token, validate_csrf_token
from school_app.utils import normalize_role


public_bp = Blueprint("public", __name__)


PUBLIC_PAGES = {
    "login.html",
    "admission.html",
    "admission-terms-pdf.html",
    "brochure.html",
    "fee-structure.html",
    "fee-structure-pdf.html",
}

ADMIN_PAGES = {
    "admin-dashboard.html",
    "fee-card-print.html",
    "admin-inventory.html",
    "admin-messages.html",
    "admin-monitor.html",
    "admin-students.html",
}

TEACHER_PAGES = {
    "teacher-dashboard.html",
}

STAFF_PAGES = {
    "print-student.html",
}


@public_bp.get("/")
def index():
    return render_template("public/index.html")


@public_bp.get("/index.html")
def root_index_alias():
    return redirect(url_for("public.index"))


@public_bp.get("/assets/<path:filename>")
def assets(filename: str):
    return send_from_directory(Path(current_app.static_folder) / "assets", filename)


@public_bp.get("/manifest.json")
def web_manifest():
    return send_from_directory(current_app.static_folder, "manifest.json")


@public_bp.get("/favicon.ico")
def favicon():
    return send_from_directory(current_app.static_folder, "favicon.ico")


@public_bp.get("/service-worker.js")
def service_worker():
    return send_from_directory(current_app.static_folder, "service-worker.js")


@public_bp.get("/.well-known/appspecific/<path:filename>")
def well_known_appspecific(filename: str):
    """Suppress Chrome DevTools discovery requests – return empty 204."""
    return "", 204


@public_bp.get("/new_index.html")
def english_alias():
    return redirect(url_for("public.index"))


@public_bp.get("/pages/<path:page_name>")
def legacy_page(page_name: str):
    static_pages = Path(current_app.static_folder) / "pages"
    target = static_pages / page_name
    if not target.exists() or target.suffix.lower() != ".html":
        return redirect(url_for("public.index"))

    effective_role = normalize_role((g.current_user or {}).get("role"))
    if effective_role == "principal":
        effective_role = "admin"

    if page_name in ADMIN_PAGES and effective_role != "admin":
        return redirect(url_for("public.legacy_page", page_name="login.html"))
    if page_name in TEACHER_PAGES and effective_role != "teacher":
        return redirect(url_for("public.legacy_page", page_name="login.html"))
    if page_name in STAFF_PAGES and effective_role not in {"admin", "teacher"}:
        return redirect(url_for("public.legacy_page", page_name="login.html"))
    if page_name not in PUBLIC_PAGES | ADMIN_PAGES | TEACHER_PAGES | STAFF_PAGES:
        return redirect(url_for("public.index"))

    return send_from_directory(static_pages, page_name)


@public_bp.get("/api/public/notifications")
def public_notifications():
    records = [
        item
        for item in current_app.repository.list("notifications")
        if item.get("status", "active") == "active"
    ]
    return jsonify({"success": True, "data": records})


@public_bp.get("/api/public/fees/<student_id>")
def public_student_fees(student_id: str):
    # Fetch fees filtered by student_id
    records = [
        item
        for item in current_app.repository.list("fees")
        if item.get("studentId") == student_id
    ]
    # Return sorted by date
    records.sort(key=lambda x: x.get("submittedAt", ""), reverse=True)
    return jsonify({"success": True, "data": records})


@public_bp.get("/api/public/students/<student_id>")
def public_student_info(student_id: str):
    # Fetch student details
    student = current_app.repository.get("students", student_id)
    if not student:
        return jsonify({"success": False, "error": "Student not found"}), 404
        
    # Return minimal data for public card
    return jsonify({
        "success": True,
        "data": {
            "studentName": student.get("studentName", student.get("name", "")),
            "serialNumber": student.get("serialNumber", student.get("id", "")),
            "class": student.get("class", ""),
            "rollNumber": student.get("rollNumber", ""),
            "fatherName": student.get("fatherName", ""),
            "mobile": student.get("mobile", ""),
            "photo": student.get("photo", student.get("avatar_url", ""))
        }
    })


@public_bp.post("/api/public/contacts")
def public_contacts():
    token = request.headers.get("X-CSRF-Token") or (request.get_json(silent=True) or {}).get("csrf_token")
    if not validate_csrf_token(token):
        return jsonify({"success": False, "error": "Invalid CSRF token"}), 403

    payload = request.get_json(silent=True) or {}
    try:
        data = ContactRequest.model_validate(payload)
    except ValidationError as error:
        return jsonify({"success": False, "error": "validation-error", "details": error.errors()}), 422

    payload = {
        "name": data.name,
        "email": data.email,
        "phone": data.phone,
        "message": data.message,
        "createdAt": payload.get("createdAt", ""),
        "read": bool(payload.get("read", False)),
        "status": "new",
    }
    current_app.repository.create("contacts", payload)
    log_audit_event("PUBLIC_CONTACT_SUBMITTED", target_collection="contacts", details={"email": data.email})
    return jsonify({"success": True})
