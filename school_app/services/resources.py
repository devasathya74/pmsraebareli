from __future__ import annotations

from collections.abc import Iterable

from flask import current_app

from school_app.utils import generated_user_email, normalize_role, utcnow_iso


COLLECTION_ALIASES = {
    "inventory": "inventory_items",
    "expenses": "ledger_entries",
}

TEACHER_WRITE_COLLECTIONS = {
    "attendance",
    "messages",
    "results",
    "students",
}

TEACHER_READ_COLLECTIONS = TEACHER_WRITE_COLLECTIONS | {
    "users",
    "teachers",
    "fees",
    "notifications",
    "salary_slips",
    "exam_schedules",
}


def normalize_collection(collection: str) -> str:
    return COLLECTION_ALIASES.get(collection, collection)


def effective_role(user: dict | None) -> str:
    role = normalize_role((user or {}).get("role"))
    return "admin" if role == "principal" else role


def serialize_user(user: dict) -> dict:
    return {
        "uid": user["id"],
        "id": user["id"],
        "email": generated_user_email(user),
        "name": user.get("name") or user.get("full_name") or user.get("username") or "User",
        "username": user.get("username", ""),
        "phone": user.get("phone", "") or user.get("mobile", ""),
        "role": user.get("role", ""),
        "assignedClass": user.get("assigned_class", "") or user.get("assignedClass", ""),
    }


def teacher_class(user: dict) -> str:
    return str(user.get("assigned_class", "") or user.get("assignedClass", "")).strip()


def teacher_profile(user: dict) -> dict | None:
    repository = current_app.repository
    candidates = []
    if user.get("id"):
        candidates.append(("user_id", user["id"]))
        candidates.append(("uid", user["id"]))   # admin stores teacher with uid field
    email = generated_user_email(user)
    if email:
        candidates.append(("email", email))
    username = user.get("username", "")
    if username:
        candidates.append(("username", username))

    for field, value in candidates:
        profile = repository.find_one("teachers", {field: value})
        if profile:
            return profile
    return None


def get_nested_value(payload: dict, dotted_key: str):
    current = payload
    for part in dotted_key.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def set_nested_value(payload: dict, dotted_key: str, value):
    parts = dotted_key.split(".")
    current = payload
    for part in parts[:-1]:
        next_value = current.get(part)
        if not isinstance(next_value, dict):
            next_value = {}
            current[part] = next_value
        current = next_value
    current[parts[-1]] = value


def expand_dotted_payload(payload: dict) -> dict:
    expanded: dict = {}
    for key, value in payload.items():
        if "." in key:
            set_nested_value(expanded, key, value)
        elif isinstance(value, dict):
            expanded[key] = expand_dotted_payload(value)
        else:
            expanded[key] = value
    return expanded


def deep_merge(base: dict, updates: dict) -> dict:
    merged = dict(base)
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def apply_filters(items: list[dict], filters: Iterable[dict] | None) -> list[dict]:
    if not filters:
        return items

    def matches(item: dict, clause: dict) -> bool:
        field = str(clause.get("field", "")).strip()
        operator = str(clause.get("op", "==")).strip()
        value = clause.get("value")
        actual = get_nested_value(item, field) if field else None
        if operator == "==":
            return str(actual) == str(value)
        if operator == "!=":
            return str(actual) != str(value)
        if operator == "in":
            values = value if isinstance(value, list) else [value]
            return str(actual) in {str(item) for item in values}
        return True

    return [item for item in items if all(matches(item, clause) for clause in filters)]


def apply_ordering(items: list[dict], order_by: Iterable[dict] | None) -> list[dict]:
    ordered = list(items)
    clauses = list(order_by or [])
    for clause in reversed(clauses):
        field = clause.get("field") or "createdAt"
        direction = str(clause.get("direction", "asc")).lower()
        ordered.sort(
            key=lambda item: str(get_nested_value(item, field) or ""),
            reverse=direction == "desc",
        )
    if not clauses:
        ordered.sort(key=lambda item: str(item.get("created_at", "")), reverse=True)
    return ordered


def sanitize_document(collection: str, payload: dict) -> dict:
    document = dict(payload)
    if collection == "users":
        document.pop("password_hash", None)
        document.pop("active_session_id", None)
    return document


def scope_documents(collection: str, items: list[dict], user: dict) -> list[dict]:
    if effective_role(user) == "admin":
        return items

    if effective_role(user) != "teacher":
        return []

    assigned_class = teacher_class(user)
    teacher_doc = teacher_profile(user)
    teacher_doc_id = teacher_doc.get("id") if teacher_doc else ""
    teacher_email = generated_user_email(user)

    # Fallback: if the user record has no assigned_class, read it from the teachers profile
    if not assigned_class and teacher_doc:
        assigned_class = str(
            teacher_doc.get("assignedClass", "") or teacher_doc.get("assigned_class", "")
        ).strip()

    if collection == "users":
        return [item for item in items if item.get("id") == user.get("id")]
    if collection == "teachers":
        return [
            item
            for item in items
            if item.get("user_id") == user.get("id")
            or str(item.get("email", "")).strip() == teacher_email
            or item.get("id") == teacher_doc_id
        ]
    if collection in {"students", "attendance", "fees", "results"} and assigned_class:
        return [
            item
            for item in items
            if assigned_class
            in {
                str(item.get("class", "")).strip(),
                str(item.get("class_name", "")).strip(),
                str(item.get("assignedClass", "")).strip(),
                str(item.get("assigned_class", "")).strip(),
            }
        ]
    if collection == "salary_slips" and teacher_doc_id:
        return [item for item in items if item.get("teacherId") == teacher_doc_id]
    if collection in {"notifications", "messages", "exam_schedules"}:
        return items
    return []


def authorize_collection(collection: str, method: str, user: dict) -> tuple[bool, str]:
    role = effective_role(user)
    method = method.upper()
    if role == "admin":
        return True, ""
    if role != "teacher":
        return False, "Access denied"
    if method in {"GET", "HEAD"}:
        return (collection in TEACHER_READ_COLLECTIONS, "Access denied")
    return (collection in TEACHER_WRITE_COLLECTIONS, "Access denied")


def prepare_document_for_save(collection: str, payload: dict, existing: dict | None = None) -> dict:
    expanded = expand_dotted_payload(payload)
    if collection == "users":
        expanded.pop("password_hash", None)
        expanded.pop("active_session_id", None)
    return deep_merge(existing or {}, expanded)


def list_documents(
    collection: str,
    user: dict,
    *,
    filters: Iterable[dict] | None = None,
    order_by: Iterable[dict] | None = None,
    limit_value: int | None = None,
    start_after_id: str | None = None,
) -> list[dict]:
    collection = normalize_collection(collection)
    items = current_app.repository.list(collection)
    items = scope_documents(collection, items, user)
    items = apply_filters(items, filters)
    items = apply_ordering(items, order_by)
    if start_after_id:
        try:
            start_index = next(index for index, item in enumerate(items) if item.get("id") == start_after_id)
            items = items[start_index + 1 :]
        except StopIteration:
            items = []
    if isinstance(limit_value, int) and limit_value > 0:
        items = items[:limit_value]
    return items


def get_document(collection: str, doc_id: str, user: dict) -> dict | None:
    collection = normalize_collection(collection)
    document = current_app.repository.get(collection, doc_id)
    if not document:
        return None
    scoped = scope_documents(collection, [document], user)
    return scoped[0] if scoped else None


def create_document(collection: str, payload: dict, user: dict) -> tuple[str, dict]:
    collection = normalize_collection(collection)
    payload.setdefault("createdAt", utcnow_iso())
    payload["updatedAt"] = utcnow_iso()
    item_id = current_app.repository.create(collection, payload)
    return item_id, current_app.repository.get(collection, item_id) or {"id": item_id}


def set_document(collection: str, doc_id: str, payload: dict, existing: dict | None = None) -> dict:
    collection = normalize_collection(collection)
    payload.setdefault("createdAt", existing.get("createdAt") if existing else utcnow_iso())
    payload["updatedAt"] = utcnow_iso()
    merged = prepare_document_for_save(collection, payload, existing)
    merged["id"] = doc_id
    if existing:
        current_app.repository.update(collection, doc_id, merged)
    else:
        current_app.repository.create(collection, merged)
    return current_app.repository.get(collection, doc_id) or merged


def patch_document(collection: str, doc_id: str, payload: dict, existing: dict) -> dict:
    collection = normalize_collection(collection)
    payload["updatedAt"] = utcnow_iso()
    merged = prepare_document_for_save(collection, payload, existing)
    current_app.repository.update(collection, doc_id, merged)
    return current_app.repository.get(collection, doc_id) or merged


def delete_document(collection: str, doc_id: str) -> None:
    current_app.repository.delete(normalize_collection(collection), doc_id)
