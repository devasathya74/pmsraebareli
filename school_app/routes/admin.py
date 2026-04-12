from __future__ import annotations

import uuid

from flask import Blueprint, current_app, flash, g, redirect, render_template, request, url_for

from school_app.utils import allowed_file, role_required


admin_bp = Blueprint("admin", __name__, url_prefix="/admin")


@admin_bp.get("/")
@role_required("admin")
def dashboard():
    repository = current_app.repository
    students = repository.list("students")
    teachers = repository.list("teachers")
    attendance = repository.list("attendance")
    results = repository.list("results")
    admissions = repository.list("admissions")
    fees = repository.list("fees")
    inventory = repository.list("inventory_items")
    stats = {
        "students": len(students),
        "teachers": len(teachers),
        "attendance": len(attendance),
        "results": len(results),
        "admissions": len(admissions),
        "fees_pending": len([item for item in fees if item.get("status") != "Paid"]),
        "inventory": len(inventory),
    }
    recent_messages = repository.list("messages")[:5]
    return render_template("admin/dashboard.html", stats=stats, recent_messages=recent_messages)


@admin_bp.route("/students", methods=["GET", "POST"])
@role_required("admin")
def students():
    repository = current_app.repository
    edit_id = request.args.get("edit")
    if request.method == "POST":
        record_id = request.form.get("record_id", "").strip() or str(uuid.uuid4())
        payload = {
            "id": record_id,
            "admission_no": request.form.get("admission_no", "").strip(),
            "name": request.form.get("name", "").strip(),
            "class_name": request.form.get("class_name", "").strip(),
            "section": request.form.get("section", "").strip(),
            "guardian_name": request.form.get("guardian_name", "").strip(),
            "phone": request.form.get("phone", "").strip(),
            "fee_status": request.form.get("fee_status", "Pending"),
        }
        avatar = request.files.get("avatar")
        if avatar and avatar.filename:
            if not allowed_file(avatar.filename):
                flash("Unsupported file type for student avatar.", "error")
                return redirect(url_for("admin.students"))
            upload = current_app.storage_service.upload(avatar, "students")
            payload["avatar_url"] = upload["file_url"]
            repository.create(
                "files",
                {
                    "owner_collection": "students",
                    "owner_id": record_id,
                    "filename": upload["filename"],
                    "content_type": avatar.mimetype,
                    "storage_url": upload["file_url"],
                    "object_name": upload["object_name"],
                    "uploaded_by": g.current_user["id"],
                },
            )
        if request.form.get("record_id", "").strip():
            repository.update("students", record_id, payload)
            flash("Student updated successfully.", "success")
        else:
            repository.create("students", payload)
            flash("Student created successfully.", "success")
        return redirect(url_for("admin.students"))

    if request.args.get("delete"):
        repository.delete("students", request.args["delete"])
        flash("Student deleted.", "success")
        return redirect(url_for("admin.students"))

    records = repository.list("students")
    editing = repository.get("students", edit_id) if edit_id else None
    return render_template("admin/students.html", records=records, editing=editing)


@admin_bp.route("/teachers", methods=["GET", "POST"])
@role_required("admin")
def teachers():
    repository = current_app.repository
    edit_id = request.args.get("edit")
    if request.method == "POST":
        record_id = request.form.get("record_id", "").strip()
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        role_user_id = request.form.get("user_id", "").strip()
        user_payload = {
            "full_name": request.form.get("name", "").strip(),
            "username": username,
            "role": "teacher",
            "assigned_class": request.form.get("assigned_class", "").strip(),
        }
        if password:
            user_payload["password_hash"] = repository.hash_password(password)

        if role_user_id:
            repository.update("users", role_user_id, user_payload)
        else:
            user_payload["password_hash"] = repository.hash_password(password or "teacher123")
            user_payload["active_session_id"] = ""
            role_user_id = repository.create("users", user_payload)

        teacher_payload = {
            "name": request.form.get("name", "").strip(),
            "username": username,
            "subject": request.form.get("subject", "").strip(),
            "assigned_class": request.form.get("assigned_class", "").strip(),
            "phone": request.form.get("phone", "").strip(),
            "user_id": role_user_id,
        }
        if record_id:
            repository.update("teachers", record_id, teacher_payload)
            flash("Teacher updated successfully.", "success")
        else:
            repository.create("teachers", teacher_payload)
            flash("Teacher added successfully.", "success")
        return redirect(url_for("admin.teachers"))

    if request.args.get("delete"):
        teacher = repository.get("teachers", request.args["delete"])
        if teacher:
            repository.delete("teachers", teacher["id"])
            if teacher.get("user_id"):
                repository.delete("users", teacher["user_id"])
        flash("Teacher deleted.", "success")
        return redirect(url_for("admin.teachers"))

    records = repository.list("teachers")
    editing = repository.get("teachers", edit_id) if edit_id else None
    editing_user = repository.get("users", editing["user_id"]) if editing and editing.get("user_id") else None
    return render_template(
        "admin/teachers.html",
        records=records,
        editing=editing,
        editing_user=editing_user,
    )


@admin_bp.route("/admissions", methods=["GET", "POST"])
@role_required("admin")
def admissions():
    repository = current_app.repository
    edit_id = request.args.get("edit")
    if request.method == "POST":
        record_id = request.form.get("record_id", "").strip() or str(uuid.uuid4())
        payload = {
            "id": record_id,
            "student_name": request.form.get("student_name", "").strip(),
            "class_applied": request.form.get("class_applied", "").strip(),
            "status": request.form.get("status", "").strip(),
            "mode": request.form.get("mode", "").strip(),
            "guardian_name": request.form.get("guardian_name", "").strip(),
            "phone": request.form.get("phone", "").strip(),
        }
        attachment = request.files.get("attachment")
        if attachment and attachment.filename:
            if not allowed_file(attachment.filename):
                flash("Unsupported admission attachment type.", "error")
                return redirect(url_for("admin.admissions"))
            upload = current_app.storage_service.upload(attachment, "admissions")
            payload["attachment_url"] = upload["file_url"]
            repository.create(
                "files",
                {
                    "owner_collection": "admissions",
                    "owner_id": record_id,
                    "filename": upload["filename"],
                    "content_type": attachment.mimetype,
                    "storage_url": upload["file_url"],
                    "object_name": upload["object_name"],
                    "uploaded_by": g.current_user["id"],
                },
            )
        if request.form.get("record_id", "").strip():
            repository.update("admissions", record_id, payload)
            flash("Admission updated successfully.", "success")
        else:
            repository.create("admissions", payload)
            flash("Admission saved successfully.", "success")
        return redirect(url_for("admin.admissions"))

    if request.args.get("delete"):
        repository.delete("admissions", request.args["delete"])
        flash("Admission removed.", "success")
        return redirect(url_for("admin.admissions"))

    records = repository.list("admissions")
    editing = repository.get("admissions", edit_id) if edit_id else None
    return render_template("admin/admissions.html", records=records, editing=editing)


@admin_bp.route("/fees", methods=["GET", "POST"])
@role_required("admin")
def fees():
    repository = current_app.repository
    edit_id = request.args.get("edit")
    students = repository.list("students")
    if request.method == "POST":
        student_id = request.form.get("student_id", "").strip()
        student = repository.get("students", student_id)
        payload = {
            "student_id": student_id,
            "student_name": student.get("name", "") if student else "",
            "class_name": student.get("class_name", "") if student else request.form.get("class_name", ""),
            "amount_due": float(request.form.get("amount_due", "0") or 0),
            "amount_paid": float(request.form.get("amount_paid", "0") or 0),
            "status": request.form.get("status", "").strip(),
            "last_payment_date": request.form.get("last_payment_date", "").strip(),
            "remarks": request.form.get("remarks", "").strip(),
        }
        record_id = request.form.get("record_id", "").strip()
        if record_id:
            repository.update("fees", record_id, payload)
            flash("Fee record updated.", "success")
        else:
            repository.create("fees", payload)
            flash("Fee record added.", "success")
        return redirect(url_for("admin.fees"))

    if request.args.get("delete"):
        repository.delete("fees", request.args["delete"])
        flash("Fee record deleted.", "success")
        return redirect(url_for("admin.fees"))

    records = repository.list("fees")
    editing = repository.get("fees", edit_id) if edit_id else None
    return render_template("admin/fees.html", records=records, students=students, editing=editing)


@admin_bp.get("/fees/card/<record_id>")
@role_required("admin")
def fee_card(record_id):
    repository = current_app.repository
    record = repository.get("fees", record_id)
    if not record:
        flash("Fee record not found.", "error")
        return redirect(url_for("admin.fees"))
    return render_template("admin/fee_card.html", record=record)


@admin_bp.route("/ledger", methods=["GET", "POST"])
@role_required("admin")
def ledger():
    repository = current_app.repository
    edit_id = request.args.get("edit")
    if request.method == "POST":
        payload = {
            "entry_date": request.form.get("entry_date", "").strip(),
            "entry_type": request.form.get("entry_type", "").strip(),
            "category": request.form.get("category", "").strip(),
            "amount": float(request.form.get("amount", "0") or 0),
            "notes": request.form.get("notes", "").strip(),
            "created_by": g.current_user["id"],
        }
        record_id = request.form.get("record_id", "").strip()
        if record_id:
            repository.update("ledger_entries", record_id, payload)
            flash("Ledger entry updated.", "success")
        else:
            repository.create("ledger_entries", payload)
            flash("Ledger entry created.", "success")
        return redirect(url_for("admin.ledger"))

    if request.args.get("delete"):
        repository.delete("ledger_entries", request.args["delete"])
        flash("Ledger entry deleted.", "success")
        return redirect(url_for("admin.ledger"))

    records = repository.list("ledger_entries")
    editing = repository.get("ledger_entries", edit_id) if edit_id else None
    totals = {
        "income": sum(item.get("amount", 0) for item in records if item.get("entry_type") == "Income"),
        "expense": sum(item.get("amount", 0) for item in records if item.get("entry_type") == "Expense"),
    }
    totals["balance"] = totals["income"] - totals["expense"]
    return render_template("admin/ledger.html", records=records, editing=editing, totals=totals)


@admin_bp.get("/attendance")
@role_required("admin")
def attendance():
    records = current_app.repository.list("attendance")
    return render_template("admin/attendance.html", records=records)


@admin_bp.get("/results")
@role_required("admin")
def results():
    records = current_app.repository.list("results")
    return render_template("admin/results.html", records=records)


@admin_bp.route("/inventory", methods=["GET", "POST"])
@role_required("admin")
def inventory():
    repository = current_app.repository
    edit_id = request.args.get("edit")
    if request.method == "POST":
        payload = {
            "item_name": request.form.get("item_name", "").strip(),
            "quantity": int(request.form.get("quantity", "0") or 0),
            "condition": request.form.get("condition", "").strip(),
            "location": request.form.get("location", "").strip(),
            "notes": request.form.get("notes", "").strip(),
        }
        record_id = request.form.get("record_id", "").strip()
        if record_id:
            repository.update("inventory_items", record_id, payload)
            flash("Inventory item updated.", "success")
        else:
            repository.create("inventory_items", payload)
            flash("Inventory item added.", "success")
        return redirect(url_for("admin.inventory"))

    if request.args.get("delete"):
        repository.delete("inventory_items", request.args["delete"])
        flash("Inventory item deleted.", "success")
        return redirect(url_for("admin.inventory"))

    records = repository.list("inventory_items")
    editing = repository.get("inventory_items", edit_id) if edit_id else None
    return render_template("admin/inventory.html", records=records, editing=editing)


@admin_bp.route("/messages", methods=["GET", "POST"])
@role_required("admin")
def messages():
    repository = current_app.repository
    edit_id = request.args.get("edit")
    if request.method == "POST":
        record_id = request.form.get("record_id", "").strip() or str(uuid.uuid4())
        payload = {
            "id": record_id,
            "title": request.form.get("title", "").strip(),
            "audience": request.form.get("audience", "").strip(),
            "body": request.form.get("body", "").strip(),
            "posted_by": g.current_user["id"],
        }
        attachment = request.files.get("attachment")
        if attachment and attachment.filename:
            if not allowed_file(attachment.filename):
                flash("Unsupported file type for attachment.", "error")
                return redirect(url_for("admin.messages"))
            upload = current_app.storage_service.upload(attachment, "messages")
            payload["attachment_url"] = upload["file_url"]
            repository.create(
                "files",
                {
                    "owner_collection": "messages",
                    "owner_id": record_id,
                    "filename": upload["filename"],
                    "content_type": attachment.mimetype,
                    "storage_url": upload["file_url"],
                    "object_name": upload["object_name"],
                    "uploaded_by": g.current_user["id"],
                },
            )
        if request.form.get("record_id", "").strip():
            repository.update("messages", record_id, payload)
            flash("Message updated.", "success")
        else:
            repository.create("messages", payload)
            flash("Message posted.", "success")
        return redirect(url_for("admin.messages"))

    if request.args.get("delete"):
        repository.delete("messages", request.args["delete"])
        flash("Message removed.", "success")
        return redirect(url_for("admin.messages"))

    records = repository.list("messages")
    editing = repository.get("messages", edit_id) if edit_id else None
    return render_template("admin/messages.html", records=records, editing=editing)


@admin_bp.route("/passwords", methods=["GET", "POST"])
@role_required("admin")
def passwords():
    repository = current_app.repository
    if request.method == "POST":
        user_id = request.form.get("user_id", "").strip()
        new_password = request.form.get("new_password", "").strip()
        if not user_id or not new_password:
            flash("User and password are required.", "error")
            return redirect(url_for("admin.passwords"))
        repository.update(
            "users",
            user_id,
            {
                "password_hash": repository.hash_password(new_password),
                "active_session_id": "",
            },
        )
        flash("Password reset successfully.", "success")
        return redirect(url_for("admin.passwords"))

    users = current_app.repository.list("users")
    return render_template("admin/passwords.html", users=users)
