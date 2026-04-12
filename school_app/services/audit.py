from __future__ import annotations

from flask import current_app, g, request

from school_app.utils import utcnow_iso


def log_audit_event(
    action: str,
    *,
    status: str = "success",
    target_collection: str = "",
    target_id: str = "",
    details: dict | None = None,
    user_id: str = "",
    username: str = "",
) -> None:
    repository = getattr(current_app, "repository", None)
    if repository is None:
        return

    user = getattr(g, "current_user", None)
    payload = {
        "action": action,
        "status": status,
        "target_collection": target_collection,
        "target_id": target_id,
        "user_id": user_id or (user or {}).get("id", ""),
        "username": username or (user or {}).get("username", ""),
        "ip_address": request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip(),
        "user_agent": request.headers.get("User-Agent", ""),
        "details": details or {},
        "timestamp": utcnow_iso(),
    }
    repository.create("audit_logs", payload)
