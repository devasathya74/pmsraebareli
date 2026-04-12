import secrets
from pathlib import Path

from flask import Blueprint, current_app, flash, g, redirect, render_template, request, send_from_directory, session, url_for

from school_app.services.audit import log_audit_event
from school_app.utils import find_user_by_identifier, generate_captcha, login_required, utcnow_iso


auth_bp = Blueprint("auth", __name__, url_prefix="/auth")


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    repository = current_app.repository
    if g.current_user:
        destination = "admin.dashboard" if g.current_user.get("role") == "admin" else "teacher.dashboard"
        return redirect(url_for(destination))

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        captcha_answer = request.form.get("captcha_answer", "").strip()
        expected = str(session.get("captcha_answer", ""))
        user = find_user_by_identifier(repository, username)

        if expected != captcha_answer:
            flash("Captcha answer is incorrect.", "error")
            log_audit_event("FORM_LOGIN_FAILED_CAPTCHA", status="failed", username=username)
        elif not user or not repository.verify_password(user.get("password_hash", ""), password):
            flash("Invalid username or password.", "error")
            log_audit_event("FORM_LOGIN_FAILED_CREDENTIALS", status="failed", username=username)
        else:
            session.clear()
            session["user_id"] = user["id"]
            session["session_id"] = secrets.token_urlsafe(24)
            session["last_seen_at"] = utcnow_iso()
            repository.update(
                "users",
                user["id"],
                {
                    "active_session_id": session["session_id"],
                    "last_login_at": utcnow_iso(),
                },
            )
            log_audit_event("FORM_LOGIN_SUCCESS", target_collection="users", target_id=user["id"])
            flash("Login successful.", "success")
            destination = "admin.dashboard" if user.get("role") == "admin" else "teacher.dashboard"
            return redirect(url_for(destination))

    challenge, answer = generate_captcha()
    session["captcha_answer"] = answer
    return render_template("auth/login.html", challenge=challenge)


@auth_bp.post("/logout")
def logout():
    if g.current_user:
        current_app.repository.update(
            "users",
            g.current_user["id"],
            {"active_session_id": ""},
        )
        log_audit_event("FORM_LOGOUT", target_collection="users", target_id=g.current_user["id"])
    session.clear()
    flash("You have been logged out.", "success")
    return redirect(url_for("auth.login"))


@auth_bp.get("/files/<path:object_name>")
@login_required
def protected_file(object_name: str):
    upload_root = Path(current_app.config["LOCAL_UPLOAD_DIR"]).resolve()
    return send_from_directory(upload_root, object_name)
