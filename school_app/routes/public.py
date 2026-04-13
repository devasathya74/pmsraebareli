from pathlib import Path

from pydantic import ValidationError
from flask import Blueprint, current_app, g, jsonify, redirect, render_template, request, send_from_directory, session, url_for

from school_app.schemas import ContactRequest
from school_app.services.audit import log_audit_event
from school_app.services.security import ensure_csrf_token, validate_csrf_token
from school_app.utils import normalize_role


public_bp = Blueprint("public", __name__)


@public_bp.get("/admission")
def admission():
    return render_template("public/admission.html")


@public_bp.get("/print/fee-card")
def print_fee_card():
    return render_template("print/fee-card.html")


@public_bp.get("/print/student-profile")
def print_student_profile():
    return render_template("print/student-profile.html")


@public_bp.get("/print/fee-structure")
def print_fee_structure():
    return render_template("print/fee-structure.html")


@public_bp.get("/brochure")
def brochure():
    return render_template("public/brochure.html")




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
    """Serve legacy static pages directly from the static/pages directory."""
    return send_from_directory(Path(current_app.static_folder) / "pages", page_name)


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
        print(f"[public/contacts] CSRF rejected. header={request.headers.get('X-CSRF-Token')!r}, session_has_token={bool(session.get('csrf_token'))}")
        return jsonify({"success": False, "error": "Invalid CSRF token"}), 403

    raw_payload = request.get_json(silent=True) or {}
    print(f"[public/contacts] Received payload keys={list(raw_payload.keys())}, email={raw_payload.get('email')!r}, name_len={len(str(raw_payload.get('name', '')))}, msg_len={len(str(raw_payload.get('message', '')))}")

    try:
        data = ContactRequest.model_validate(raw_payload)
    except ValidationError as error:
        print(f"[public/contacts] Validation Error: {error.errors()}")
        return jsonify({"success": False, "error": "validation-error", "details": error.errors()}), 422

    save_payload = {
        "name": data.name,
        "email": data.email,
        "phone": data.phone,
        "message": data.message,
        "createdAt": raw_payload.get("createdAt", ""),
        "read": bool(raw_payload.get("read", False)),
        "status": "new",
    }
    current_app.repository.create("contacts", save_payload)
    log_audit_event("PUBLIC_CONTACT_SUBMITTED", target_collection="contacts", details={"email": data.email})
    return jsonify({"success": True})
