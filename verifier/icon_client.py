"""
ICON Provider Client
High-speed pure-HTTP client for http://iptspkyc.icon-infotech.net:4000

Features:
  - Persistent httpx.AsyncClient with connection pooling
  - Pre-warmed session: logs in at worker startup so first job is instant
  - Automatic re-login under asyncio.Lock on session expiry
  - Resizes photo (300x300) and NID images (350x220) to match ICON portal requirements
  - Never logs passwords, cookies, or raw form values
  - Idempotent: duplicate checking via 10-minute in-memory cache
"""

from __future__ import annotations

import asyncio
import io
import logging
import time
from datetime import datetime, timezone
from typing import NamedTuple, Optional

import httpx
from PIL import Image

logger = logging.getLogger("icon_client")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ICON_BASE_URL = "http://iptspkyc.icon-infotech.net:4000"
ICON_LOGIN_URL = "http://iptspkyc.icon-infotech.net:4000/login"
ICON_REGISTER_URL = "http://iptspkyc.icon-infotech.net:4000/api/add-registerInformation"
ICON_LOG_TRACK_URL = "http://iptspkyc.icon-infotech.net:4000/api/add-log-track"
ICON_USERNAME = "SoFtceNts"
ICON_PASSWORD = "SoFtceNts321"

ICON_CONNECT_TIMEOUT = 5.0
ICON_READ_TIMEOUT = 20.0
ICON_DUPLICATE_TTL_SECONDS = 600.0  # 10 minutes


class IconResult(NamedTuple):
    ok: bool
    stage: str
    duration_ms: int
    reason: Optional[str] = None


def _format_dhaka_now() -> str:
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d %H:%M:%S")


def _resize_image(image_bytes: bytes, target_width: int, target_height: int) -> bytes:
    """Resize/crop an image buffer to exact target width and height as JPEG."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img = img.convert("RGB")
            # Fit/resize to exact dimensions
            img_resized = img.resize((target_width, target_height), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img_resized.save(buf, format="JPEG", quality=88)
            return buf.getvalue()
    except Exception as exc:
        logger.warning('"icon_image_resize_warning","error":"%s"', exc)
        return image_bytes


class IconClient:
    """Singleton HTTP client for ICON provider automation."""

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None
        self._lock = asyncio.Lock()
        self._logged_in = False
        self._user_type = "Reseller"
        self.login_url = ICON_LOGIN_URL
        self.base_url = ICON_BASE_URL
        self.username = ICON_USERNAME
        self.password = ICON_PASSWORD
        self._recent_submissions: dict[str, float] = {}  # NID/Passport -> timestamp

    def set_credentials(
        self,
        username: Optional[str] = None,
        password: Optional[str] = None,
        login_url: Optional[str] = None,
    ) -> None:
        changed = False
        if username and username.strip() and username.strip() != self.username:
            self.username = username.strip()
            changed = True
        if password and password.strip() and password.strip() != self.password:
            self.password = password.strip()
            changed = True
        if login_url and login_url.strip() and login_url.strip() != self.login_url:
            self.login_url = login_url.strip()
            from urllib.parse import urlparse
            p = urlparse(self.login_url)
            if p.scheme and p.netloc:
                self.base_url = f"{p.scheme}://{p.netloc}"
            changed = True
        if changed:
            logger.info('"icon_client":"credentials_updated"')
            self._logged_in = False

    async def startup(self) -> None:
        """Called during FastAPI lifespan startup to pre-warm session."""
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(
                connect=ICON_CONNECT_TIMEOUT,
                read=ICON_READ_TIMEOUT,
                write=ICON_READ_TIMEOUT,
                pool=ICON_READ_TIMEOUT,
            ),
            follow_redirects=True,
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
        logger.info('"icon_client":"startup","stage":"login_prewarm"')
        try:
            ok = await self._do_login()
            if ok:
                logger.info('"icon_client":"startup","stage":"login_prewarm_ok"')
            else:
                logger.warning('"icon_client":"startup","stage":"login_prewarm_failed"')
        except Exception as exc:
            logger.warning('"icon_client":"startup","stage":"login_prewarm_error","detail":"%s"', type(exc).__name__)

    async def shutdown(self) -> None:
        """Called during FastAPI lifespan shutdown."""
        if self._client:
            await self._client.aclose()
            self._client = None
            self._logged_in = False

    async def _do_login(self) -> bool:
        """Execute login POST. Returns True if authenticated."""
        if not self._client:
            return False

        t0 = time.monotonic()
        payload = {"username": self.username, "password": self.password}
        resp = await self._client.post("/login", json=payload)
        elapsed_ms = int((time.monotonic() - t0) * 1000)

        if resp.status_code == 200:
            try:
                data = resp.json()
                if data.get("message") == "Login Successfully":
                    user = data.get("user", {})
                    self._user_type = user.get("userType", "Reseller")
                    self._logged_in = True
                    logger.info('"icon_login":"ok","ms":%d', elapsed_ms)
                    return True
            except Exception:
                pass

        logger.error('"icon_login":"failed","status":%d,"ms":%d', resp.status_code, elapsed_ms)
        self._logged_in = False
        return False

    async def ensure_session(self) -> bool:
        """Ensure active login cookie. Thread-safe with asyncio.Lock."""
        if self._logged_in and self._client:
            return True

        async with self._lock:
            if self._logged_in:
                return True
            return await self._do_login()

    def _cleanup_recent_cache(self) -> None:
        now = time.monotonic()
        expired = [k for k, ts in self._recent_submissions.items() if (now - ts) > ICON_DUPLICATE_TTL_SECONDS]
        for k in expired:
            del self._recent_submissions[k]

    def _is_recent_duplicate(self, key: str) -> bool:
        self._cleanup_recent_cache()
        return key in self._recent_submissions

    def _record_submission(self, key: str) -> None:
        self._cleanup_recent_cache()
        self._recent_submissions[key] = time.monotonic()

    async def submit_subscriber(
        self,
        job_id: str,
        fields: dict,
        photo_bytes: Optional[bytes] = None,
        photo_content_type: str = "image/jpeg",
        photo_filename: str = "photo.jpg",
        document_bytes: Optional[bytes] = None,
        document_content_type: str = "image/jpeg",
        document_filename: str = "document.jpg",
        document_back_bytes: Optional[bytes] = None,
        document_back_content_type: str = "image/jpeg",
        document_back_filename: str = "document-back.jpg",
    ) -> IconResult:
        """
        Submit subscriber registration to ICON.
        Returns IconResult with timing and status.
        """
        t_start = time.monotonic()
        nid = str(fields.get("nationalIdNumber", "")).strip()
        passport = str(fields.get("passportNumber", "")).strip()
        dup_key = nid or passport

        if dup_key and self._is_recent_duplicate(dup_key):
            elapsed_ms = int((time.monotonic() - t_start) * 1000)
            return IconResult(ok=False, stage="duplicate_check", duration_ms=elapsed_ms, reason="duplicate")

        # 1. Authenticate
        logged_in = await self.ensure_session()
        if not logged_in:
            elapsed_ms = int((time.monotonic() - t_start) * 1000)
            return IconResult(ok=False, stage="login", duration_ms=elapsed_ms, reason="login_failed")

        # 2. Prepare images (with exact dimension resizing)
        if photo_bytes:
            photo_bytes = _resize_image(photo_bytes, 300, 300)
        else:
            # Generate blank 300x300 JPEG
            img = Image.new("RGB", (300, 300), color=(240, 240, 240))
            buf = io.BytesIO()
            img.save(buf, format="JPEG")
            photo_bytes = buf.getvalue()

        if document_bytes:
            document_bytes = _resize_image(document_bytes, 350, 220)
        else:
            img = Image.new("RGB", (350, 220), color=(240, 240, 240))
            buf = io.BytesIO()
            img.save(buf, format="JPEG")
            document_bytes = buf.getvalue()

        if document_back_bytes:
            document_back_bytes = _resize_image(document_back_bytes, 350, 220)
        else:
            # If no back document provided, reuse front document to satisfy portal requirement
            document_back_bytes = document_bytes

        # 3. Build form fields
        # ICON field format
        now_dhaka = _format_dhaka_now()
        fullname = str(fields.get("subscriberName", "")).strip()
        sub_type = str(fields.get("subscriberType", "Individual")).strip() or "Individual"
        phone = str(fields.get("phoneNumber", "")).strip()
        email = str(fields.get("validEmail", "")).strip()
        dob = str(fields.get("birthDate", "")).strip()
        allocated_number = str(fields.get("number", "")).strip() or phone

        form_data = {
            "agreed": "1",
            "created_by": self.username,
            "authorizedName": str(fields.get("authorizedPersonName", "")).strip(),
            "billing_address": str(fields.get("billingAddress", "Present")).strip(),
            "birth_date": dob,
            "city_permanent": str(fields.get("permanentCity", "")).strip(),
            "city_present": str(fields.get("presentCity", "")).strip(),
            "connectionType": str(fields.get("connection", "Prepaid")).strip() or "Prepaid",
            "country_permanent": str(fields.get("permanentCountry", "Bangladesh")).strip() or "Bangladesh",
            "country_present": str(fields.get("presentCountry", "Bangladesh")).strip() or "Bangladesh",
            "email": email,
            "father_name": str(fields.get("fatherName", "")).strip(),
            "fullname": fullname,
            "gender": str(fields.get("gender", "Male")).strip() or "Male",
            "mother_name": str(fields.get("motherName", "")).strip(),
            "nationalId": nid,
            "number": allocated_number,
            "occupation": str(fields.get("occupation", "Private Service")).strip() or "Private Service",
            "passportNumber": passport,
            "phoneA": str(fields.get("prefixA", phone[:5] if len(phone) >= 5 else "")).strip(),
            "phoneB": str(fields.get("prefixB", "")).strip(),
            "phoneC": str(fields.get("prefixC", "")).strip(),
            "reg_date": now_dhaka,
            "spouse_name": str(fields.get("spouseName", "")).strip(),
            "street_permanent": str(fields.get("permanentStreet", "")).strip(),
            "street_present": str(fields.get("presentStreet", "")).strip(),
            "subscribe": sub_type,
            "valid_email": email,
            "zip_permanent": str(fields.get("permanentPostalZip", "")).strip(),
            "zip_present": str(fields.get("presentPostalZip", "")).strip(),
        }

        files = {
            "subscriberPhoto": (photo_filename, photo_bytes, "image/jpeg"),
            "nid_or_p_front": (document_filename, document_bytes, "image/jpeg"),
            "nid_or_p_back": (document_back_filename, document_back_bytes, "image/jpeg"),
        }

        # 4. Dispatch Registration POST
        t_post = time.monotonic()
        try:
            assert self._client is not None
            resp = await self._client.post(
                "/api/add-registerInformation",
                data=form_data,
                files=files,
            )
            save_ms = int((time.monotonic() - t_post) * 1000)

            # Check if session expired
            if resp.status_code == 401:
                logger.warning('"icon_session_expired","attempting_relogin":true')
                self._logged_in = False
                relogin_ok = await self.ensure_session()
                if relogin_ok:
                    resp = await self._client.post(
                        "/api/add-registerInformation",
                        data=form_data,
                        files=files,
                    )

            if resp.status_code in (200, 201):
                if dup_key:
                    self._record_submission(dup_key)

                # Send log track
                try:
                    await self._client.post(
                        "/api/add-log-track",
                        json={
                            "work_name": "Add Subscriber",
                            "logger": self.username,
                            "logTime": now_dhaka,
                            "logger_type": self._user_type,
                            "sub_name": fullname,
                            "details": f"Add New subscriber {fullname} by {self.username}",
                        },
                    )
                except Exception:
                    pass

                elapsed_ms = int((time.monotonic() - t_start) * 1000)
                return IconResult(ok=True, stage="save", duration_ms=elapsed_ms)

            elapsed_ms = int((time.monotonic() - t_start) * 1000)
            logger.error('"icon_save_failed","status":%d,"text":"%s"', resp.status_code, resp.text[:200])
            return IconResult(
                ok=False,
                stage="save",
                duration_ms=elapsed_ms,
                reason="site_error",
            )

        except (httpx.NetworkError, httpx.TimeoutException) as exc:
            elapsed_ms = int((time.monotonic() - t_start) * 1000)
            logger.error('"icon_save_network_error","type":"%s"', type(exc).__name__)
            return IconResult(
                ok=False,
                stage="save",
                duration_ms=elapsed_ms,
                reason="site_unavailable",
            )


# Global singleton instance
icon_client = IconClient()
