from __future__ import annotations

import uuid

from flask import Blueprint, current_app, flash, g, redirect, render_template, request, url_for

from school_app.utils import allowed_file, role_required


teacher_bp = Blueprint("teacher", __name__, url_prefix="/teacher")


@teacher_bp.get("/")
@role_required("teacher")
def dashboard():
    repository = current_app.repository
    assigned_class = g.current_user.get("assigned_class", "")
    students = repository.list("students", {"class_name": assigned_class})
    attendance = repository.list("attendance", {"class_name": assigned_class})
    results = repository.list("results", {"class_name": assigned_class})
    fees = repository.list("fees", {"class_name": assigned_class})
    stats = {
        "class_name": assigned_class,
        "students": len(students),
        "attendance_entries": len(attendance),
        "results": len(results),
        "pending_fees": len([fee for fee in fees if fee.get("status") != "Paid"]),
    }
    return render_template("teacher/dashboard.html", stats=stats, students=students[:5], fees=fees[:5])


@teacher_bp.route("/attendance", methods=["GET", "POST"])
@role_required("teacher")
def attendance():
    repository = current_app.repository
    assigned_class = g.current_user.get("assigned_class", "")
    students = repository.list("students", {"class_name": assigned_class})
    if request.method == "POST":
        attendance_date = request.form.get("attendance_date", "").strip()
        remarks = request.form.get("remarks", "").strip()
        for student in students:
            status = request.form.get(f"status_{student['id']}", "Present")
            existing = repository.find_one(
                "attendance",
                {
                    "class_name": assigned_class,
                    "student_id": student["id"],
                    "attendance_date": attendance_date,
                },
            )
            payload = {
                "class_name": assigned_class,
                "student_id": student["id"],
                "student_name": student["name"],
                "attendance_date": attendance_date,
                "status": status,
                "remarks": remarks,
                "marked_by": g.current_user["id"],
            }
            if existing:
                repository.update("attendance", existing["id"], payload)
            else:
                repository.create("attendance", payload)
        flash("Attendance saved successfully.", "success")
        return redirect(url_for("teacher.attendance"))

    records = repository.list("attendance", {"class_name": assigned_class})
    return render_template("teacher/attendance.html", students=students, records=records, assigned_class=assigned_class)


@teacher_bp.route("/results", methods=["GET", "POST"])
@role_required("teacher")
def results():
    repository = current_app.repository
    assigned_class = g.current_user.get("assigned_class", "")
    students = repository.list("students", {"class_name": assigned_class})
    if request.method == "POST":
        record_id = str(uuid.uuid4())
        student_id = request.form.get("student_id", "").strip()
        student = repository.get("students", student_id)
        payload = {
            "id": record_id,
            "class_name": assigned_class,
            "student_id": student_id,
            "student_name": student.get("name", "") if student else "",
            "exam_name": request.form.get("exam_name", "").strip(),
            "subject": request.form.get("subject", "").strip(),
            "marks": float(request.form.get("marks", "0") or 0),
            "max_marks": float(request.form.get("max_marks", "0") or 0),
            "grade": request.form.get("grade", "").strip(),
            "remarks": request.form.get("remarks", "").strip(),
            "uploaded_by": g.current_user["id"],
        }
        attachment = request.files.get("attachment")
        if attachment and attachment.filename:
            if not allowed_file(attachment.filename):
                flash("Unsupported result attachment type.", "error")
                return redirect(url_for("teacher.results"))
            upload = current_app.storage_service.upload(attachment, "results")
            payload["attachment_url"] = upload["file_url"]
            repository.create(
                "files",
                {
                    "owner_collection": "results",
                    "owner_id": record_id,
                    "filename": upload["filename"],
                    "content_type": attachment.mimetype,
                    "storage_url": upload["file_url"],
                    "object_name": upload["object_name"],
                    "uploaded_by": g.current_user["id"],
                },
            )
        repository.create("results", payload)
        flash("Academic result uploaded.", "success")
        return redirect(url_for("teacher.results"))

    records = repository.list("results", {"class_name": assigned_class})
    return render_template("teacher/results.html", students=students, records=records, assigned_class=assigned_class)


@teacher_bp.get("/fees")
@role_required("teacher")
def fees():
    assigned_class = g.current_user.get("assigned_class", "")
    records = current_app.repository.list("fees", {"class_name": assigned_class})
    return render_template("teacher/fees.html", records=records, assigned_class=assigned_class)
