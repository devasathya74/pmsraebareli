from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LoginRequest(StrictModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=255)
    captcha: str = Field(min_length=1, max_length=20)


class ChangePasswordRequest(StrictModel):
    current_password: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=6, max_length=255)


class CreateUserRequest(StrictModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=6, max_length=255)
    name: str = Field(min_length=2, max_length=120)
    role: Literal["admin", "principal", "teacher"]
    phone: str = Field(default="", max_length=20)
    username: str = Field(default="", max_length=80)
    assignedClass: str = Field(default="", max_length=60)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if "@" not in value:
            raise ValueError("invalid email")
        return value


class ContactRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    phone: str = Field(default="", max_length=30)
    message: str = Field(min_length=1, max_length=2000)
    createdAt: str = Field(default="", max_length=100)
    read: bool = Field(default=False)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if "@" not in value or len(value) < 3:
            raise ValueError("invalid email")
        return value


class NotificationCreateRequest(StrictModel):
    message: str = Field(min_length=2, max_length=500)
    status: str = Field(default="active", max_length=20)
    icon: str = Field(default="fa-bell", max_length=60)


class ExpenseCreateRequest(StrictModel):
    description: str = Field(min_length=2, max_length=300)
    amount: float = Field(gt=0, le=100000000)
    date: str = Field(min_length=8, max_length=50)
    type: str = Field(default="other", max_length=50)


class InventoryCreateRequest(StrictModel):
    itemName: str = Field(min_length=2, max_length=150)
    category: str = Field(min_length=2, max_length=50)
    quantity: int = Field(ge=0, le=100000)
    issuingDate: str = Field(default="", max_length=50)
    issuingAuthority: str = Field(default="", max_length=120)
    createdAt: str = Field(default="", max_length=50)
    location: str = Field(default="", max_length=120)
    condition: str = Field(default="", max_length=50)
    notes: str = Field(default="", max_length=1000)


class AttendanceRecordRequest(StrictModel):
    date: str = Field(min_length=8, max_length=20)
    class_name: str = Field(alias="class", min_length=1, max_length=60)
    teacherId: str = Field(min_length=1, max_length=120)
    teacherName: str = Field(min_length=1, max_length=120)
    totalStudents: int = Field(ge=0, le=10000)
    presentCount: int = Field(ge=0, le=10000)
    records: dict[str, str]
    timestamp: str = Field(min_length=8, max_length=50)

    @field_validator("records")
    @classmethod
    def validate_records(cls, value: dict[str, str]) -> dict[str, str]:
        allowed = {"present", "absent", "leave"}
        for status in value.values():
            if status not in allowed:
                raise ValueError("invalid attendance status")
        return value


class MessageCreateRequest(StrictModel):
    type: str = Field(default="", max_length=50)
    subject: str = Field(default="", max_length=150)
    message: str = Field(min_length=1, max_length=3000)
    fromName: str = Field(default="", max_length=120)
    fromId: str = Field(default="", max_length=120)
    fromClass: str = Field(default="", max_length=60)
    read: bool = False


class StudentCreateUpdateRequest(StrictModel):
    studentName: str = Field(min_length=2, max_length=120)
    class_name: str | None = Field(default=None, alias="class")
    fatherName: str = Field(default="", max_length=120)
    motherName: str = Field(default="", max_length=120)
    mobile: str = Field(default="", max_length=20)
    address: str = Field(default="", max_length=500)
    status: str = Field(default="active", max_length=20)
