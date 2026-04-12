from pathlib import Path

from flask import Flask, g, redirect, request, url_for
import click

from config import Config
from school_app.routes.admin import admin_bp
from school_app.routes.api import api_bp
from school_app.routes.auth import auth_bp
from school_app.routes.public import public_bp
from school_app.routes.teacher import teacher_bp
from school_app.services.backup import create_backup_archive
from school_app.services.keep_alive import start_keep_alive_service
from school_app.services.security import LoginRateLimiter, ensure_csrf_token
from school_app.services.repository import build_repository
from school_app.services.storage import build_storage_service
from school_app.utils import format_datetime, load_current_user


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object(Config)

    # Local directory setup removed for Cloud-only mode

    app.repository = build_repository(app.config)
    app.storage_service = build_storage_service(app.config)
    app.login_rate_limiter = LoginRateLimiter()
    _register_hooks(app)
    _register_filters(app)
    _register_commands(app)

    # Start Keep-Alive Service to prevent Firebase/Supabase sleeping
    start_keep_alive_service(app)

    app.register_blueprint(public_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(teacher_bp)
    return app


def _register_hooks(app: Flask) -> None:
    @app.before_request
    def session_guard():
        g.current_user = None
        if request.endpoint == "static":
            return None

        ensure_csrf_token()
        load_current_user(app)
        protected = request.endpoint and (
            request.endpoint.startswith("admin.")
            or request.endpoint.startswith("teacher.")
        )
        if protected and not g.current_user:
            return redirect(url_for("auth.login"))
        return None

    @app.context_processor
    def inject_layout_data():
        return {
            "school_name": app.config["SCHOOL_NAME"],
            "current_user": getattr(g, "current_user", None),
        }

    @app.after_request
    def apply_security_headers(response):
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: https:; "
            "style-src 'self' 'unsafe-inline' https:; "
            "script-src 'self' 'unsafe-inline' https:; "
            "font-src 'self' https: data:; "
            "connect-src 'self' https:; "
            "frame-src https://maps.google.com https://www.google.com;"
        )
        return response


def _register_filters(app: Flask) -> None:
    app.jinja_env.filters["format_datetime"] = format_datetime


def _register_commands(app: Flask) -> None:
    @app.cli.command("seed-demo")
    def seed_demo():
        if not app.config.get("ALLOW_DEMO_SEED"):
            print("Demo seeding is disabled. Set ALLOW_DEMO_SEED=true to enable.")
            return
        repository = app.repository
        if repository.find_one("users", {"username": "principal"}):
            print("Demo data already exists.")
            return

        admin_id = repository.create(
            "users",
            {
                "name": "Principal",
                "full_name": "Principal",
                "username": "principal",
                "email": "principal@pmsraebareli.online",
                "phone": "9000000000",
                "password_hash": repository.hash_password("admin123"),
                "role": "admin",
                "assigned_class": "",
                "active_session_id": "",
            },
        )
        teacher_id = repository.create(
            "users",
            {
                "name": "Class Teacher",
                "full_name": "Class Teacher",
                "username": "teacher1",
                "email": "teacher1@pmsraebareli.online",
                "phone": "9000000001",
                "password_hash": repository.hash_password("teacher123"),
                "role": "teacher",
                "assigned_class": "Class 8A",
                "active_session_id": "",
            },
        )
        repository.create(
            "teachers",
            {
                "name": "Class Teacher",
                "username": "teacher1",
                "email": "teacher1@pmsraebareli.online",
                "mobile": "9000000001",
                "subject": "Mathematics",
                "assignedClass": "Class 8A",
                "assigned_class": "Class 8A",
                "phone": "9000000001",
                "user_id": teacher_id,
            },
        )
        for number in range(1, 6):
            student_id = repository.create(
                "students",
                {
                    "admission_no": f"PMSR-2026-0{number}",
                    "name": f"Student {number}",
                    "studentName": f"Student {number}",
                    "class_name": "Class 8A",
                    "class": "Class 8A",
                    "section": "A",
                    "guardian_name": f"Guardian {number}",
                    "fatherName": f"Guardian {number}",
                    "phone": f"900000000{number}",
                    "mobile": f"900000000{number}",
                    "fee_status": "Pending" if number % 2 else "Paid",
                    "avatar_url": "",
                },
            )
            repository.create(
                "fees",
                {
                    "student_id": student_id,
                    "student_name": f"Student {number}",
                    "class_name": "Class 8A",
                    "amount_due": 2500,
                    "amount_paid": 1500 if number % 2 else 2500,
                    "status": "Pending" if number % 2 else "Paid",
                    "last_payment_date": "2026-04-01",
                    "remarks": "Seed record",
                },
            )

        repository.create(
            "admissions",
            {
                "student_name": "Aarav Singh",
                "class_applied": "Class 6",
                "class": "Class 6",
                "status": "Under Review",
                "mode": "Online",
                "guardian_name": "Mr. Singh",
                "phone": "9555555555",
                "attachment_url": "",
            },
        )
        repository.create(
            "ledger_entries",
            {
                "entry_date": "2026-04-10",
                "entry_type": "Income",
                "category": "Fees",
                "amount": 12500,
                "notes": "Monthly collections",
                "created_by": admin_id,
            },
        )
        repository.create(
            "inventory_items",
            {
                "item_name": "Physics Lab Kit",
                "quantity": 8,
                "condition": "Good",
                "location": "Lab Store",
                "notes": "Checked in April",
            },
        )
        repository.create(
            "messages",
            {
                "title": "Tinker Lab Orientation",
                "audience": "Teachers",
                "body": "Orientation will be conducted on Monday after assembly.",
                "attachment_url": "",
                "posted_by": admin_id,
            },
        )
        repository.create(
            "notifications",
            {
                "message": "Admissions open for Session 2026-27.",
                "status": "active",
            },
        )
        if not repository.find_one("users", {"email": "admin@gmail.com"}):
            repository.create(
                "users",
                {
                    "name": "Admin",
                    "full_name": "Admin",
                    "username": "admin",
                    "email": "admin@gmail.com",
                    "phone": "",
                    "password_hash": repository.hash_password("654321"),
                    "role": "admin",
                    "assigned_class": "",
                    "active_session_id": "",
                },
            )
        if not repository.find_one("users", {"email": "tr@gmail.com"}):
            teacher_user_id = repository.create(
                "users",
                {
                    "name": "Teacher",
                    "full_name": "Teacher",
                    "username": "tr",
                    "email": "tr@gmail.com",
                    "phone": "9876543210",
                    "password_hash": repository.hash_password("123456"),
                    "role": "teacher",
                    "assigned_class": "1",
                    "active_session_id": "",
                },
            )
            repository.create(
                "teachers",
                {
                    "name": "Teacher",
                    "email": "tr@gmail.com",
                    "mobile": "9876543210",
                    "subject": "maths",
                    "assignedClass": "1",
                    "assigned_class": "1",
                    "user_id": teacher_user_id,
                    "uid": teacher_user_id,
                    "status": "active",
                },
            )
        print("Demo users created:")
        print("Principal username=principal password=admin123")
        print("Teacher username=teacher1 password=teacher123")
        print("Admin email=admin@gmail.com password=654321")
        print("Teacher email=tr@gmail.com password=123456")

    # CLI commands for local storage (backup/reset) have been removed to enforce Cloud-only mode

    @app.cli.command("create-admin")
    @click.option("--email", required=True)
    @click.option("--password", required=True)
    @click.option("--name", default="Admin")
    @click.option("--username", default="admin")
    def create_admin(email: str, password: str, name: str, username: str):
        repo = app.repository
        existing = repo.find_one("users", {"email": email})
        payload = {
            "name": name,
            "full_name": name,
            "username": username,
            "email": email,
            "phone": "",
            "password_hash": repo.hash_password(password),
            "role": "admin",
            "assigned_class": "",
            "active_session_id": "",
        }
        if existing:
            repo.update("users", existing["id"], payload)
            print(f"Updated admin: {email}")
            return
        repo.create("users", payload)
        print(f"Created admin: {email}")
