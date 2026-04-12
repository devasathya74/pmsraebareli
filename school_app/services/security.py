from __future__ import annotations

import secrets
import threading
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from flask import session


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_csrf_token() -> str:
    token = session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["csrf_token"] = token
    return token


def validate_csrf_token(candidate: str) -> bool:
    expected = session.get("csrf_token")
    if not expected or not candidate:
        return False
    return secrets.compare_digest(str(expected), str(candidate))


def issue_login_captcha() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    challenge = "".join(secrets.choice(alphabet) for _ in range(6))
    session["login_captcha"] = challenge
    session["login_captcha_issued_at"] = utcnow().isoformat()
    return challenge


def validate_login_captcha(candidate: str) -> bool:
    expected = str(session.get("login_captcha", ""))
    issued_at = session.get("login_captcha_issued_at")
    if not expected or not issued_at:
        return False
    try:
        issued = datetime.fromisoformat(issued_at)
    except ValueError:
        return False
    if utcnow() - issued > timedelta(minutes=10):
        return False
    return secrets.compare_digest(expected, str(candidate or ""))


@dataclass
class RateLimitDecision:
    allowed: bool
    retry_after_seconds: int = 0


class LoginRateLimiter:
    def __init__(self, max_failures: int = 5, window_minutes: int = 15, block_minutes: int = 15):
        self.max_failures = max_failures
        self.window = timedelta(minutes=window_minutes)
        self.block_window = timedelta(minutes=block_minutes)
        self._events: dict[str, deque[datetime]] = defaultdict(deque)
        self._blocked_until: dict[str, datetime] = {}
        self._lock = threading.Lock()

    def check(self, *keys: str) -> RateLimitDecision:
        now = utcnow()
        with self._lock:
            for key in filter(None, keys):
                blocked_until = self._blocked_until.get(key)
                if blocked_until and blocked_until > now:
                    retry_after = int((blocked_until - now).total_seconds())
                    return RateLimitDecision(False, retry_after)
                if blocked_until and blocked_until <= now:
                    self._blocked_until.pop(key, None)
        return RateLimitDecision(True, 0)

    def register_failure(self, *keys: str) -> None:
        now = utcnow()
        with self._lock:
            for key in filter(None, keys):
                events = self._events[key]
                events.append(now)
                while events and now - events[0] > self.window:
                    events.popleft()
                if len(events) >= self.max_failures:
                    self._blocked_until[key] = now + self.block_window

    def reset(self, *keys: str) -> None:
        with self._lock:
            for key in filter(None, keys):
                self._events.pop(key, None)
                self._blocked_until.pop(key, None)
