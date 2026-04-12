from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Callable

from flask import current_app, flash, g, redirect, session, url_for


def generate_captcha() -> tuple[str, int]:
    left = secrets.randbelow(9) + 1
    right = secrets.randbelow(9) + 1
    operator = "+" if secrets.randbelow(2) == 0 else "-"
    if operator == "+":
        return f"{left} + {right}", left + right
    if left < right:
        left, right = right, left
    return f"{left} - {right}", left - right


def format_datetime(value: str | None) -> str:
    if not value:
        return "-"
    try:
        return datetime.fromisoformat(value).strftime("%d %b %Y, %I:%M %p")
    except ValueError:
        return value


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_role(role: str | None) -> str:
    return (role or "").strip().lower()


def generated_user_email(user: dict) -> str:
    email = str(user.get("email", "")).strip()
    if email:
        return email

    username = str(user.get("username", "")).strip()
    phone = str(user.get("phone", "")).strip() or str(user.get("mobile", "")).strip()
    base = username or phone or str(user.get("id", "")).strip() or "user"
    return f"{base}@pmsraebareli.online"


def find_user_by_identifier(repository, identifier: str):
    normalized = (identifier or "").strip()
    if not normalized:
        return None

    lowered = normalized.lower()
    local_part = lowered.split("@", 1)[0]

    for user in repository.list("users"):
        candidates = {
            str(user.get("id", "")).strip().lower(),
            str(user.get("username", "")).strip().lower(),
            str(user.get("email", "")).strip().lower(),
            str(user.get("phone", "")).strip().lower(),
            str(user.get("mobile", "")).strip().lower(),
            generated_user_email(user).strip().lower(),
        }
        if lowered in candidates or local_part in candidates:
            return user
    return None


def parse_iso_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def load_current_user(app) -> None:
    user_id = session.get("user_id")
    session_id = session.get("session_id")
    if not user_id or not session_id:
        return

    user = app.repository.get("users", user_id)
    if not user or user.get("active_session_id") != session_id:
        session.clear()
        return

    last_seen = parse_iso_timestamp(session.get("last_seen_at"))
    timeout_minutes = app.config["SESSION_TIMEOUT_MINUTES"]
    if last_seen and datetime.now(timezone.utc) - last_seen > timedelta(minutes=timeout_minutes):
        session.clear()
        flash("Session expired due to inactivity.", "warning")
        return

    session["last_seen_at"] = utcnow_iso()
    session.permanent = True
    g.current_user = user


def login_required(view: Callable):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not getattr(g, "current_user", None):
            return redirect(url_for("auth.login"))
        return view(*args, **kwargs)

    return wrapped


def role_required(*roles: str):
    def decorator(view: Callable):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = getattr(g, "current_user", None)
            if not user:
                return redirect(url_for("auth.login"))
            requested_roles = {normalize_role(role) for role in roles}
            effective_role = normalize_role(user.get("role"))
            if effective_role == "principal":
                effective_role = "admin"
            if effective_role not in requested_roles:
                flash("You do not have permission to view that page.", "error")
                return redirect(url_for("public.index"))
            return view(*args, **kwargs)

        return wrapped

    return decorator


def allowed_file(filename: str) -> bool:
    if "." not in filename:
        return False
    extension = filename.rsplit(".", 1)[1].lower()
    return extension in current_app.config["ALLOWED_EXTENSIONS"]
