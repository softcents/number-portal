"""
ICC Admin Panel HTTP Client
Manages a persistent httpx session to create subscribers on the ICC platform.

Security:
  - Credentials are constants (not env vars per project convention).
  - Passwords, cookies, and form values are NEVER logged.
  - Only job id, masked NID, stage name, and timing (ms) are logged.
"""

from __future__ import annotations

import asyncio
import logging
import io
import re
import time
from typing import Optional

import httpx
from PIL import Image

logger = logging.getLogger("verifier.icc")

# ICC requires JPG or PNG and limits file size to 300 KB max.
_ICC_MAX_IMAGE_BYTES = 280 * 1024


def _extract_jpeg_from_pdf_stream(pdf_bytes: bytes) -> Optional[bytes]:
    """If a PDF is provided, try extracting embedded raw JPEG stream."""
    start = pdf_bytes.find(b"\xff\xd8\xff")
    if start != -1:
        end = pdf_bytes.rfind(b"\xff\xd9")
        if end != -1 and end > start:
            return pdf_bytes[start : end + 2]
    return None


def _optimize_image_for_icc(raw_bytes: bytes, max_bytes: int = _ICC_MAX_IMAGE_BYTES) -> Optional[bytes]:
    """
    Ensure image is valid RGB JPEG and strictly within ICC's size limit (< 300 KB).
    Never returns a PDF or corrupt bytes.
    """
    if not raw_bytes:
        return None

    # Check if raw_bytes is a PDF
    if raw_bytes[:5] == b"%PDF-":
        extracted = _extract_jpeg_from_pdf_stream(raw_bytes)
        if extracted:
            raw_bytes = extracted
        else:
            return None

    try:
        img = Image.open(io.BytesIO(raw_bytes))
        if img.mode != "RGB":
            img = img.convert("RGB")

        # Downscale if excessively large dimensions
        max_dim = 1600
        w, h = img.size
        if w > max_dim or h > max_dim:
            scale = max_dim / max(w, h)
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        quality = 88
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)

        while buf.tell() > max_bytes and quality > 35:
            quality -= 10
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality, optimize=True)

        if buf.tell() > max_bytes:
            # Further reduce resolution if still oversized
            img = img.resize((int(img.width * 0.75), int(img.height * 0.75)), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=75, optimize=True)

        return buf.getvalue()
    except Exception as exc:
        logger.warning('"icc_image_optimize_failed","reason":"%s"', type(exc).__name__)
        return None


def _combine_nid_cards_for_icc(
    front_bytes: bytes,
    back_bytes: bytes,
    max_bytes: int = _ICC_MAX_IMAGE_BYTES,
) -> Optional[bytes]:
    """
    Combine Front and Back NID images vertically into a single clear document
    so that ICC Admin Panel shows both sides in ID/PASSPORT(FRONT).
    """
    try:
        f_raw = _optimize_image_for_icc(front_bytes, max_bytes=max_bytes * 2)
        b_raw = _optimize_image_for_icc(back_bytes, max_bytes=max_bytes * 2)
        if not f_raw or not b_raw:
            return f_raw or b_raw

        f_img = Image.open(io.BytesIO(f_raw)).convert("RGB")
        b_img = Image.open(io.BytesIO(b_raw)).convert("RGB")

        target_width = 800
        f_scale = target_width / f_img.width
        b_scale = target_width / b_img.width

        f_resized = f_img.resize((target_width, int(f_img.height * f_scale)), Image.LANCZOS)
        b_resized = b_img.resize((target_width, int(b_img.height * b_scale)), Image.LANCZOS)

        padding = 16
        total_height = f_resized.height + padding + b_resized.height

        combined = Image.new("RGB", (target_width, total_height), (242, 244, 247))
        combined.paste(f_resized, (0, 0))
        combined.paste(b_resized, (0, f_resized.height + padding))

        quality = 85
        buf = io.BytesIO()
        combined.save(buf, format="JPEG", quality=quality, optimize=True)

        while buf.tell() > max_bytes and quality > 35:
            quality -= 10
            buf = io.BytesIO()
            combined.save(buf, format="JPEG", quality=quality, optimize=True)

        return buf.getvalue()
    except Exception as exc:
        logger.warning('"icc_nid_combine_failed","reason":"%s"', type(exc).__name__)
        return _optimize_image_for_icc(front_bytes, max_bytes)


# ─── ICC Credentials & URLs (hardcoded per project convention) ────────────────

ICC_BASE_URL = "https://iccfios.net/icc-form"
ICC_LOGIN_URL = "https://iccfios.net/icc-form/index.php/admin/login"
ICC_ADD_SUBSCRIBER_URL = "https://iccfios.net/icc-form/admin/add_subscriber"
ICC_LIST_URL = "https://iccfios.net/icc-form/index.php/admin/my_subscriber"
ICC_USERNAME = "Softcents"
ICC_PASSWORD = "Softcents@09639"

# ─── Field mapping: our form → ICC form ──────────────────────────────────────

_SUBSCRIBER_TYPE_MAP = {
    "Individual": "Individual",
    "Company": "Organization",
    "Organization": "Organization",
}


def _mask_nid(nid: str) -> str:
    if len(nid) <= 4:
        return "****"
    return nid[:2] + "*" * (len(nid) - 4) + nid[-2:]


class SubmitResult:
    """Result of a subscriber submission attempt."""
    __slots__ = ("ok", "reason", "duration_ms", "stage")

    def __init__(
        self,
        ok: bool,
        reason: str = "",
        duration_ms: int = 0,
        stage: str = "",
    ):
        self.ok = ok
        self.reason = reason          # "login_failed" | "validation_failed" | "duplicate" | "site_unavailable" | "unknown"
        self.duration_ms = duration_ms
        self.stage = stage


class IccClient:
    """
    Manages a single shared httpx.AsyncClient with a logged-in ICC session.

    - Pre-warms the login at startup.
    - Re-logins once under a lock if the session expires mid-request.
    - Never auto-retries the final save POST (to avoid duplicates).
    """

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None
        self._login_lock = asyncio.Lock()
        self._logged_in = False
        self.login_url = ICC_LOGIN_URL
        self.username = ICC_USERNAME
        self.password = ICC_PASSWORD
        # Track recent NID submissions to reject duplicates within 10 minutes
        self._recent_nids: dict[str, float] = {}  # nid -> timestamp

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
            changed = True
        if changed:
            logger.info('"icc_client":"credentials_updated"')
            self._logged_in = False

    async def startup(self) -> None:
        """Create the shared client and pre-warm the login."""
        self._client = httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(connect=5.0, read=20.0, write=20.0, pool=10.0),
            verify=True,
        )
        logger.info('"icc_client":"startup","stage":"login_prewarm"')
        result = await self._do_login()
        if result:
            logger.info('"icc_client":"startup","stage":"login_prewarm_ok"')
        else:
            logger.warning('"icc_client":"startup","stage":"login_prewarm_failed"')

    async def shutdown(self) -> None:
        """Close the shared client."""
        if self._client:
            await self._client.aclose()
            self._client = None
            self._logged_in = False

    async def _do_login(self) -> bool:
        """
        Perform a login POST. Returns True on success.
        Must be called under self._login_lock or during startup.
        """
        if not self._client:
            return False

        try:
            t0 = time.perf_counter()

            # GET the login page first to get the ci_session cookie
            get_resp = await self._client.get(self.login_url, follow_redirects=True)
            if get_resp.status_code != 200:
                logger.warning('"icc_login":"get_page_failed","status":%d', get_resp.status_code)
                return False

            # POST login
            resp = await self._client.post(
                self.login_url,
                data={"user_name": self.username, "password": self.password},
            )
            elapsed = int((time.perf_counter() - t0) * 1000)

            # Success: 303 redirect to /admin/my_subscriber
            location = resp.headers.get("location", "")
            if resp.status_code in (301, 302, 303, 307, 308) and "/admin/" in location:
                self._logged_in = True
                # Follow the redirect to fully establish the session
                await self._client.get(location, follow_redirects=True)
                logger.info('"icc_login":"ok","ms":%d', elapsed)
                return True
            else:
                self._logged_in = False
                logger.warning('"icc_login":"failed","status":%d,"ms":%d', resp.status_code, elapsed)
                return False

        except (httpx.NetworkError, httpx.TimeoutException) as exc:
            self._logged_in = False
            logger.warning('"icc_login":"error","type":"%s"', type(exc).__name__)
            return False

    async def _ensure_session(self) -> bool:
        """
        Ensure we have a valid logged-in session.
        If not logged in, acquire the lock and login once.
        """
        if self._logged_in:
            return True

        async with self._login_lock:
            # Double-check after acquiring lock
            if self._logged_in:
                return True
            return await self._do_login()

    def _is_login_redirect(self, resp: httpx.Response) -> bool:
        """Check if a response indicates the session has expired (redirect to login)."""
        if resp.status_code in (301, 302, 303, 307, 308):
            location = resp.headers.get("location", "")
            if "login" in location.lower() and "/admin/" not in location.split("login")[0][-1:]:
                return True
            # Redirect to root (not /admin/) also indicates failure
            if location.rstrip("/").endswith("/icc-form/index.php") or location.rstrip("/").endswith("/icc-form"):
                return True
        return False

    async def _get_with_relogin(self, url: str) -> Optional[httpx.Response]:
        """
        GET a page. If the session expired, re-login once and retry.
        """
        if not self._client:
            return None

        resp = await self._client.get(url, follow_redirects=True)

        # Check if we got redirected to login
        if "login" in str(resp.url).lower():
            logger.info('"icc_session":"expired","stage":"relogin"')
            self._logged_in = False
            async with self._login_lock:
                if not self._logged_in:
                    ok = await self._do_login()
                    if not ok:
                        return None
            resp = await self._client.get(url, follow_redirects=True)
            if "login" in str(resp.url).lower():
                return None

        return resp

    def _cleanup_recent_nids(self) -> None:
        """Remove NID entries older than 10 minutes."""
        cutoff = time.time() - 600  # 10 minutes
        expired = [nid for nid, ts in self._recent_nids.items() if ts < cutoff]
        for nid in expired:
            del self._recent_nids[nid]

    async def check_duplicate(self, nid: str) -> bool:
        """
        Check if a subscriber with this NID already exists.
        1. Check the in-memory recent submissions cache.
        2. Search the ICC list page for the NID in the table.
        Returns True if duplicate found.
        """
        # Check recent submissions
        self._cleanup_recent_nids()
        if nid in self._recent_nids:
            return True

        # Search the ICC list page
        if not self._client:
            return False

        try:
            if not await self._ensure_session():
                return False

            resp = await self._get_with_relogin(f"{ICC_LIST_URL}?search={nid}")
            if resp is None or resp.status_code != 200:
                return False

            # Look for the NID in the table body
            # The "Number" column contains the NID/passport number
            # Search for the exact NID in table cells
            if f">{nid}<" in resp.text:
                return True

        except (httpx.NetworkError, httpx.TimeoutException):
            # On network error, we can't confirm — don't block submission
            pass

        return False

    async def submit_subscriber(
        self,
        job_id: str,
        fields: dict,
        photo_bytes: Optional[bytes] = None,
        photo_content_type: str = "image/jpeg",
        photo_filename: str = "photo.jpg",
        document_bytes: Optional[bytes] = None,
        document_content_type: str = "image/jpeg",
        document_filename: str = "id_document.jpg",
        document_back_bytes: Optional[bytes] = None,
        document_back_content_type: str = "image/jpeg",
        document_back_filename: str = "id_back.jpg",
    ) -> SubmitResult:
        """
        Submit a new subscriber to the ICC admin panel.

        This method:
        1. Ensures a valid session (re-login if needed).
        2. Checks for duplicates (by NID).
        3. Optimizes and prepares Photo, Front NID, and Back NID images (JPEG <= 280 KB).
           - When both front and back NID images are present, combines them vertically
             for ID/PASSPORT(FRONT) so both sides are fully visible in the ICC Admin Panel.
           - Also attaches back image fields in multipart form.
        4. POSTs the multipart form to the add_subscriber page.
        5. Detects success by checking for a redirect to the list page.
        6. NEVER auto-retries the save POST.

        Returns a SubmitResult.
        """
        if not self._client:
            return SubmitResult(ok=False, reason="site_unavailable", stage="init")

        nid = fields.get("national_id_num", "")
        masked = _mask_nid(nid) if nid else "no-nid"
        total_t0 = time.perf_counter()

        # ── Stage 1: Ensure session ──────────────────────────────────────────
        try:
            t0 = time.perf_counter()
            if not await self._ensure_session():
                return SubmitResult(
                    ok=False,
                    reason="login_failed",
                    duration_ms=int((time.perf_counter() - total_t0) * 1000),
                    stage="login",
                )
            login_ms = int((time.perf_counter() - t0) * 1000)
            logger.info('"submit":"%s","masked_nid":"%s","stage":"session_ok","ms":%d', job_id, masked, login_ms)
        except (httpx.NetworkError, httpx.TimeoutException) as exc:
            logger.warning('"submit":"%s","masked_nid":"%s","stage":"login_error","type":"%s"', job_id, masked, type(exc).__name__)
            return SubmitResult(
                ok=False,
                reason="site_unavailable",
                duration_ms=int((time.perf_counter() - total_t0) * 1000),
                stage="login",
            )

        # ── Stage 2: Duplicate check ────────────────────────────────────────
        try:
            t0 = time.perf_counter()
            if nid:
                is_dup = await self.check_duplicate(nid)
                dup_ms = int((time.perf_counter() - t0) * 1000)
                logger.info('"submit":"%s","masked_nid":"%s","stage":"dup_check","duplicate":%s,"ms":%d', job_id, masked, str(is_dup).lower(), dup_ms)
                if is_dup:
                    return SubmitResult(
                        ok=False,
                        reason="duplicate",
                        duration_ms=int((time.perf_counter() - total_t0) * 1000),
                        stage="duplicate_check",
                    )
        except (httpx.NetworkError, httpx.TimeoutException):
            # If we can't check, proceed (better to risk a server-side duplicate error)
            logger.warning('"submit":"%s","masked_nid":"%s","stage":"dup_check_skip"', job_id, masked)

        # ── Stage 3: Build the multipart form data ──────────────────────────
        # Map our field names to ICC field names
        icc_subscriber_type = _SUBSCRIBER_TYPE_MAP.get(
            fields.get("subscriberType", ""), fields.get("subscriberType", "")
        )

        form_data: dict[str, str] = {
            "subscriber_name": fields.get("subscriberName", ""),
            "connection": fields.get("connection", "Prepaid"),
            "reg_date": fields.get("registrationDate", ""),
            "prefix_a": fields.get("prefixA", ""),
            "prefix_b": fields.get("prefixB", ""),
            "prefix_c": fields.get("prefixC", ""),
            "subscribe": icc_subscriber_type,
            "auth_per_name": fields.get("authorizedPersonName", ""),
            "national_id_num": fields.get("nationalIdNumber", ""),
            "passport_num": fields.get("passportNumber", ""),
            "phone_details": fields.get("phoneNumber", ""),
            "birth_date": fields.get("birthDate", ""),
            "gender": fields.get("gender", "Male"),
            "occupation": fields.get("occupation", "Other"),
            "present_add_street": fields.get("presentStreet", ""),
            "present_add_city": fields.get("presentCity", ""),
            "present_add_postal_zip": fields.get("presentPostalZip", ""),
            "present_add_country": fields.get("presentCountry", ""),
            "permanent_add_street": fields.get("permanentStreet", ""),
            "permanent_add_city": fields.get("permanentCity", ""),
            "permanent_add_postal_zip": fields.get("permanentPostalZip", ""),
            "permanent_add_country": fields.get("permanentCountry", ""),
            "billing_add": fields.get("billingAddress", "Present"),
            "valid_email": fields.get("validEmail", ""),
            "father_name": fields.get("fatherName", ""),
            "mother_name": fields.get("motherName", ""),
            "spouce_name": fields.get("spouseName", ""),
        }

        # Build multipart parts with images formatted for ICC (JPEG <= 280 KB)
        files: dict[str, tuple] = {}
        if photo_bytes:
            opt_photo = _optimize_image_for_icc(photo_bytes)
            if opt_photo:
                files["subscriber_img"] = ("photo.jpg", opt_photo, "image/jpeg")

        opt_front = _optimize_image_for_icc(document_bytes) if document_bytes else None
        opt_back = _optimize_image_for_icc(document_back_bytes) if document_back_bytes else None

        if opt_front and opt_back:
            # Combine both into composite image for ID/PASSPORT(FRONT) on ICC
            combined_doc = _combine_nid_cards_for_icc(opt_front, opt_back)
            if combined_doc:
                files["id_passport_img"] = ("id_document.jpg", combined_doc, "image/jpeg")
            else:
                files["id_passport_img"] = ("id_document.jpg", opt_front, "image/jpeg")

            # Also attach back image fields
            files["id_passport_back_img"] = ("id_back.jpg", opt_back, "image/jpeg")
            files["id_passport_img_back"] = ("id_back.jpg", opt_back, "image/jpeg")
            files["id_passport_back"] = ("id_back.jpg", opt_back, "image/jpeg")
            files["id_back_img"] = ("id_back.jpg", opt_back, "image/jpeg")
            files["id_back"] = ("id_back.jpg", opt_back, "image/jpeg")
        elif opt_front:
            files["id_passport_img"] = ("id_document.jpg", opt_front, "image/jpeg")
        elif opt_back:
            files["id_passport_img"] = ("id_document.jpg", opt_back, "image/jpeg")
            files["id_passport_back_img"] = ("id_back.jpg", opt_back, "image/jpeg")

        # ── Stage 4: POST the form (NO auto-retry) ─────────────────────────
        try:
            t0 = time.perf_counter()
            resp = await self._client.post(
                ICC_ADD_SUBSCRIBER_URL,
                data=form_data,
                files=files if files else None,
            )
            save_ms = int((time.perf_counter() - t0) * 1000)
            total_ms = int((time.perf_counter() - total_t0) * 1000)

            logger.info(
                '"submit":"%s","masked_nid":"%s","stage":"save_post","status":%d,"ms":%d',
                job_id, masked, resp.status_code, save_ms,
            )

            # ── Stage 5: Detect success ─────────────────────────────────────
            # Success: 303 redirect to the list page
            if resp.status_code in (301, 302, 303, 307, 308):
                location = resp.headers.get("location", "")
                if "my_subscriber" in location or "/admin/" in location:
                    # Successful save → record the NID to prevent duplicates
                    if nid:
                        self._recent_nids[nid] = time.time()
                    logger.info(
                        '"submit":"%s","masked_nid":"%s","stage":"done","ms":%d',
                        job_id, masked, total_ms,
                    )
                    return SubmitResult(ok=True, duration_ms=total_ms, stage="done")
                elif "login" in location.lower():
                    # Session expired during the POST — we do NOT retry the save
                    self._logged_in = False
                    logger.warning('"submit":"%s","masked_nid":"%s","stage":"session_expired_on_save"', job_id, masked)
                    return SubmitResult(
                        ok=False,
                        reason="site_unavailable",
                        duration_ms=total_ms,
                        stage="save",
                    )
                else:
                    # Unknown redirect
                    logger.warning('"submit":"%s","masked_nid":"%s","stage":"unknown_redirect"', job_id, masked)
                    return SubmitResult(
                        ok=False,
                        reason="unknown",
                        duration_ms=total_ms,
                        stage="save",
                    )

            elif resp.status_code == 200:
                # Stayed on the same page — likely a validation error
                # Check if there's an error/notification in the response
                body = resp.text
                if "page-notification" in body:
                    # Extract the notification text
                    notif_match = re.search(
                        r'class="page-notification"[^>]*>(.*?)</div>',
                        body, re.DOTALL | re.IGNORECASE,
                    )
                    notif_text = notif_match.group(1).strip() if notif_match else ""
                    if notif_text:
                        logger.warning(
                            '"submit":"%s","masked_nid":"%s","stage":"validation_error"',
                            job_id, masked,
                        )
                        return SubmitResult(
                            ok=False,
                            reason="validation_failed",
                            duration_ms=total_ms,
                            stage="save",
                        )

                # If form is still showing (add_subscriber in title), it's a validation error
                if "Add Subscriber" in body or "add_subscriber" in body.lower():
                    logger.warning(
                        '"submit":"%s","masked_nid":"%s","stage":"form_returned","ms":%d',
                        job_id, masked, total_ms,
                    )
                    return SubmitResult(
                        ok=False,
                        reason="validation_failed",
                        duration_ms=total_ms,
                        stage="save",
                    )

                # Ambiguous 200 — try to verify by checking the list page
                logger.info('"submit":"%s","masked_nid":"%s","stage":"verify_list"', job_id, masked)
                try:
                    verify_resp = await self._get_with_relogin(f"{ICC_LIST_URL}?search={nid}")
                    if verify_resp and f">{nid}<" in verify_resp.text:
                        if nid:
                            self._recent_nids[nid] = time.time()
                        return SubmitResult(ok=True, duration_ms=total_ms, stage="done_verified")
                except Exception:
                    pass

                return SubmitResult(
                    ok=False,
                    reason="unknown",
                    duration_ms=total_ms,
                    stage="save",
                )

            else:
                logger.warning(
                    '"submit":"%s","masked_nid":"%s","stage":"http_error","status":%d,"ms":%d',
                    job_id, masked, resp.status_code, total_ms,
                )
                return SubmitResult(
                    ok=False,
                    reason="site_unavailable",
                    duration_ms=total_ms,
                    stage="save",
                )

        except (httpx.NetworkError, httpx.TimeoutException) as exc:
            total_ms = int((time.perf_counter() - total_t0) * 1000)
            logger.warning(
                '"submit":"%s","masked_nid":"%s","stage":"save_error","type":"%s","ms":%d',
                job_id, masked, type(exc).__name__, total_ms,
            )
            return SubmitResult(
                ok=False,
                reason="site_unavailable",
                duration_ms=total_ms,
                stage="save",
            )

        except Exception as exc:
            total_ms = int((time.perf_counter() - total_t0) * 1000)
            logger.error(
                '"submit":"%s","masked_nid":"%s","stage":"unexpected_error","type":"%s","ms":%d',
                job_id, masked, type(exc).__name__, total_ms,
            )
            return SubmitResult(
                ok=False,
                reason="unknown",
                duration_ms=total_ms,
                stage="save",
            )


# Singleton instance — created at module level, started/stopped in lifespan
icc_client = IccClient()
