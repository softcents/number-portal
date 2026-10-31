"""
National Identity Verification Worker
FastAPI background-job service that proxies NID checks to the Central Identity Platform.

Security:
  - /docs and /openapi.json are disabled.
  - All endpoints require x-worker-secret (compared with hmac.compare_digest).
  - Full NID and DOB are never logged; NID is masked (first 2 + last 2 chars).
  - Worker secret and platform key are never logged.
  - Startup refuses if required env vars are absent or too short.
"""

from __future__ import annotations

import asyncio
import hmac
import io
import json
import logging
import os
import re
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone, date
from typing import Optional

import httpx
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request, Response
from pydantic import BaseModel, field_validator

from icc_client import icc_client
from icctalk_client import icctalk_client, MIN_RECHARGE, MAX_RECHARGE
from icon_client import icon_client
from icon_billing_client import icon_billing_client, ICON_MIN_RECHARGE, ICON_MAX_RECHARGE
from ranksitt_client import (
    ranksitt_client,
    RanksIttError,
    RANKSITT_USERNAME,
    RANKSITT_PASSWORD,
    RANKSITT_LOGIN_URL,
)

# ---------------------------------------------------------------------------
# Pillow -- imported at module level so startup fails loudly if not installed
# ---------------------------------------------------------------------------

try:
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 40_000_000
except ImportError as _pil_err:  # pragma: no cover
    raise RuntimeError(
        "Pillow is required but not installed. Run: pip install -r requirements.txt"
    ) from _pil_err

# ---------------------------------------------------------------------------
# Logging - JSON-ish lines
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":%(message)s}',
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("verifier")


def _mask_nid(nid: str) -> str:
    """Return first-2 + stars + last-2 of an NID. Never reveal the full number."""
    if len(nid) <= 4:
        return "****"
    return nid[:2] + "*" * (len(nid) - 4) + nid[-2:]


# ---------------------------------------------------------------------------
# Environment / startup validation
# ---------------------------------------------------------------------------

# Automatically load .env file if present in verifier/ or repo root
_candidate_env_paths = [
    os.path.join(os.path.dirname(__file__), ".env"),
    os.path.join(os.path.dirname(__file__), "..", ".env"),
    os.path.join(os.getcwd(), ".env"),
]
for _env_path in _candidate_env_paths:
    if os.path.exists(_env_path):
        try:
            from dotenv import load_dotenv

            load_dotenv(_env_path)
        except ImportError:
            with open(_env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip()
                        if (v.startswith('"') and v.endswith('"')) or (
                            v.startswith("'") and v.endswith("'")
                        ):
                            v = v[1:-1]
                        os.environ.setdefault(k, v)

WORKER_SECRET: str = os.environ.get("WORKER_SECRET", "")
PLATFORM_URL: str = os.environ.get("PLATFORM_URL", "")
PLATFORM_API_KEY: str = os.environ.get("PLATFORM_API_KEY", "")
MOCK_MODE: bool = os.environ.get("MOCK_MODE", "false").lower() == "true"
LOG_PROFILE_SHAPE: bool = os.environ.get("LOG_PROFILE_SHAPE", "false").lower() == "true"

# Mock-mode test fixture (NID not logged; only compared in-process)
_MOCK_NID = "1234567890"
_MOCK_DOB = "2002-10-12"

_MOCK_PROFILE = {
    "account": {
        "id": "acc_mock_987654",
        "email": "sarah.connor@example.com",
        "status": "ACTIVE",
        "profile": {
            "first_name": "Sarah",
            "last_name": "Connor",
            "country_code": "+880",
            "phone_number": "01712345678",
        },
    },
    "personalDetails": {
        "fullName": "Sarah Connor",
        "firstName": "Sarah",
        "lastName": "Connor",
        "nidPassportNumber": "1234567890",
        "dateOfBirth": "2002-10-12",
        "gender": "Female",
        "phoneNumber": "01712345678",
        "profilePhoneNumber": "01712345678",
        "email": "sarah.connor@example.com",
        "accountEmail": "sarah.connor@example.com",
        "countryCode": "+880",
        "fatherName": "John Connor Sr.",
        "motherName": "Mary Connor",
        "contactPhone": "01712345678",
        "contactEmail": "sarah.connor.contact@example.com",
    },
    "customerRegistration": {
        "present_street": "House 42, Road 11, Banani",
        "present_city": "Dhaka",
        "present_postal_code": "1213",
        "present_country": "Bangladesh",
        "same_as_present_address": True,
        "permanent_street": "House 42, Road 11, Banani",
        "permanent_city": "Dhaka",
        "permanent_postal_code": "1213",
        "permanent_country": "Bangladesh",
        "customer_type": "INDIVIDUAL",
        "company_name": "",
        "authorized_person_name": "",
        "company_position": "",
        "date_of_birth": "2002-10-12",
        "nid_passport_number": "1234567890",
    },
    "kyc": {"status": "VERIFIED"},
    "kyb": {"businesses": []},
    "support": {"tickets": []},
    "oauth": {"providers": ["google"]},
    "tenancy": {"tenant_id": "mock-tenant-01"},
    "auditLogs": [{"action": "LOGIN", "timestamp": "2026-10-01T12:00:00Z"}],
    # primaryImages signals the worker that images exist
    "primaryImages": {
        "livePhoto": {
            "kind": "face-live",
            "id": "mock-photo-id",
            "mimeType": "image/jpeg",
            "sizeBytes": 12345,
        },
        "idDocument": {
            "kind": "document-front",
            "id": "mock-doc-id",
            "mimeType": "application/pdf",
            "sizeBytes": 9876,
        },
    },
}


def _log_profile_shape(job_id: str, profile: Optional[dict]) -> None:
    """Log ONLY the key names of the profile sections (never values)."""
    if not LOG_PROFILE_SHAPE or not isinstance(profile, dict):
        return
    shape: dict[str, object] = {}
    for k, v in profile.items():
        if isinstance(v, dict):
            shape[k] = list(v.keys())
        elif isinstance(v, list):
            if v and isinstance(v[0], dict):
                shape[k] = [list(v[0].keys())]
            else:
                shape[k] = "list"
        else:
            shape[k] = type(v).__name__
    logger.info('"job":"%s","profile_shape":%s', job_id, json.dumps(shape))


def _startup_checks() -> None:
    global WORKER_SECRET, PLATFORM_URL, PLATFORM_API_KEY, MOCK_MODE, LOG_PROFILE_SHAPE
    WORKER_SECRET = os.environ.get("WORKER_SECRET", WORKER_SECRET)
    PLATFORM_URL = os.environ.get("PLATFORM_URL", PLATFORM_URL)
    PLATFORM_API_KEY = os.environ.get("PLATFORM_API_KEY", PLATFORM_API_KEY)
    MOCK_MODE = os.environ.get("MOCK_MODE", "false").lower() == "true"
    LOG_PROFILE_SHAPE = os.environ.get("LOG_PROFILE_SHAPE", "false").lower() == "true"

    if not WORKER_SECRET or len(WORKER_SECRET) < 32:
        raise RuntimeError(
            "WORKER_SECRET is missing or shorter than 32 characters. "
            "Generate one with: openssl rand -hex 32"
        )
    if not MOCK_MODE:
        if not PLATFORM_URL:
            raise RuntimeError(
                "PLATFORM_URL is required when MOCK_MODE is not 'true'."
            )
        if not PLATFORM_API_KEY:
            raise RuntimeError(
                "PLATFORM_API_KEY is required when MOCK_MODE is not 'true'."
            )
    else:
        logger.warning(
            '"WARNING: MOCK_MODE is ON - no real platform calls will be made. '
            'Disable for production."'
        )


# ---------------------------------------------------------------------------
# In-memory Job Store (replace with Redis later without API changes)
# ---------------------------------------------------------------------------

_JOB_TTL_SECONDS = 300  # 5 minutes

# Accepted content types
_PHOTO_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
_DOC_CONTENT_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
_PHOTO_MAX_BYTES = 8 * 1024 * 1024   # 8 MB
_DOC_MAX_BYTES = 15 * 1024 * 1024    # 15 MB


class _JobImages:
    """Holds downloaded (and resized) image/document bytes in memory."""
    __slots__ = (
        "photo_bytes", "photo_content_type",
        "document_bytes", "document_content_type", "document_type",
        "document_back_bytes", "document_back_content_type", "document_back_type",
    )

    def __init__(self) -> None:
        self.photo_bytes: Optional[bytes] = None
        self.photo_content_type: str = ""
        self.document_bytes: Optional[bytes] = None
        self.document_content_type: str = ""
        self.document_type: Optional[str] = None  # "pdf" | "image" | None
        self.document_back_bytes: Optional[bytes] = None
        self.document_back_content_type: str = ""
        self.document_back_type: Optional[str] = None  # "pdf" | "image" | None


class JobRecord:
    __slots__ = (
        "status", "match", "profile", "created_at",
        "img_photo", "img_document", "img_document_type",
        "img_document_back", "img_document_back_type",
        "images",
    )

    def __init__(
        self,
        status: str,
        match: Optional[bool] = None,
        profile: Optional[dict] = None,
    ):
        self.status: str = status
        self.match: Optional[bool] = match
        self.profile: Optional[dict] = profile
        self.created_at: datetime = datetime.now(tz=timezone.utc)
        # Image availability flags (returned in JSON)
        self.img_photo: bool = False
        self.img_document: bool = False
        self.img_document_type: Optional[str] = None
        self.img_document_back: bool = False
        self.img_document_back_type: Optional[str] = None
        # Raw bytes (never logged, never written to disk)
        self.images: _JobImages = _JobImages()


class JobStore:
    def __init__(self) -> None:
        self._store: dict[str, JobRecord] = {}
        self._lock = asyncio.Lock()

    async def set(self, job_id: str, record: JobRecord) -> None:
        async with self._lock:
            self._store[job_id] = record

    async def get(self, job_id: str) -> Optional[JobRecord]:
        async with self._lock:
            return self._store.get(job_id)

    async def update(
        self,
        job_id: str,
        status: str,
        match: Optional[bool] = None,
        profile: Optional[dict] = None,
    ) -> None:
        async with self._lock:
            rec = self._store.get(job_id)
            if rec is not None:
                rec.status = status
                rec.match = match
                rec.profile = profile

    async def cleanup(self) -> None:
        """Remove records older than TTL."""
        now = datetime.now(tz=timezone.utc)
        async with self._lock:
            expired = [
                jid
                for jid, rec in self._store.items()
                if (now - rec.created_at).total_seconds() > _JOB_TTL_SECONDS
            ]
            for jid in expired:
                del self._store[jid]
        if expired:
            logger.info('"Cleaned up %d expired job(s)"', len(expired))


job_store = JobStore()

# ---------------------------------------------------------------------------
# Concurrency & rate-limit guards
# ---------------------------------------------------------------------------

_platform_semaphore: Optional[asyncio.Semaphore] = None


def _get_platform_semaphore() -> asyncio.Semaphore:
    global _platform_semaphore
    if _platform_semaphore is None:
        _platform_semaphore = asyncio.Semaphore(5)
    return _platform_semaphore


_call_timestamps: list[float] = []
_rate_lock: Optional[asyncio.Lock] = None
_RATE_WINDOW = 60.0
_RATE_MAX = 20


async def _acquire_rate_slot(max_wait_seconds: float = 5.0) -> bool:
    import time
    global _rate_lock, _call_timestamps

    if _rate_lock is None:
        _rate_lock = asyncio.Lock()

    deadline = time.monotonic() + max_wait_seconds

    while True:
        async with _rate_lock:
            now = time.monotonic()
            while _call_timestamps and now - _call_timestamps[0] > _RATE_WINDOW:
                _call_timestamps.pop(0)

            if len(_call_timestamps) < _RATE_MAX:
                _call_timestamps.append(now)
                return True

            oldest = _call_timestamps[0]
            wait_for = _RATE_WINDOW - (now - oldest) + 0.05

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False

        sleep_time = min(wait_for, remaining, 1.0)
        await asyncio.sleep(max(sleep_time, 0.1))


# ---------------------------------------------------------------------------
# Image processing helpers (CPU-bound work runs in asyncio.to_thread)
# ---------------------------------------------------------------------------

def _resize_photo_sync(raw_bytes: bytes) -> Optional[bytes]:
    """
    Synchronous photo resize — call via asyncio.to_thread.

    Steps:
      1. Open + verify (catches DecompressionBomb and corrupt files).
      2. EXIF-transpose (corrects phone rotation).
      3. ImageOps.fit(img, (300, 300), Image.LANCZOS, centering=(0.5, 0.4))
         — cover-crop favouring the upper frame where faces are.
      4. Convert RGBA / P / LA -> RGB on white background.
      5. Save as JPEG quality=90 optimize=True.

    Returns None on any Pillow error (DecompressionBombError or otherwise).
    """
    try:
        # verify() validates the file and raises on corrupt/bomb images
        probe = Image.open(io.BytesIO(raw_bytes))
        probe.verify()
        # Must re-open after verify() because it exhausts the stream
        img = Image.open(io.BytesIO(raw_bytes))

        # Correct EXIF orientation
        img = ImageOps.exif_transpose(img)

        # Cover-crop to 300x300, favouring upper portion (faces)
        img = ImageOps.fit(img, (300, 300), Image.LANCZOS, centering=(0.5, 0.4))

        # Flatten transparency to white
        if img.mode in ("RGBA", "LA"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        elif img.mode == "P":
            img = img.convert("RGBA")
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90, optimize=True)
        return buf.getvalue()

    except Exception as exc:  # includes Image.DecompressionBombError
        logger.warning('"image_resize_failed","reason":"%s"', type(exc).__name__)
        return None


def _build_mock_photo_raw() -> bytes:
    """Generate a 640x480 synthetic JPEG to feed through the resize pipeline."""
    buf = io.BytesIO()
    img = Image.new("RGB", (640, 480), color=(70, 130, 180))  # steel-blue
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _build_mock_pdf() -> bytes:
    """Build a minimal valid single-page PDF in memory (no extra library)."""
    return (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R "
        b"/MediaBox [0 0 595 842] >>\nendobj\n"
        b"xref\n0 4\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"trailer\n<< /Size 4 /Root 1 0 R >>\n"
        b"startxref\n190\n%%EOF\n"
    )


async def _download_file(
    client: httpx.AsyncClient,
    kind: str,
    file_id: str,
    platform_url: str,
    platform_key: str,
    max_bytes: int,
    allowed_types: set,
    backoff_seconds: list,
    silent_404: bool = False,
) -> tuple:
    """
    Download a platform file. Returns (bytes, content_type) or (None, None).
    Retries on 5xx / network errors; no retry on 4xx.
    If silent_404 is True, HTTP 404 returns (None, None) without logging a warning.
    """
    url = f"{platform_url}/api/internal/files/{kind}/{file_id}"
    headers = {"Authorization": f"Bearer {platform_key}"}
    attempt = 0

    while True:
        try:
            resp = await client.get(url, headers=headers)
            sc = resp.status_code

            if sc == 200:
                ct = resp.headers.get("content-type", "").split(";")[0].strip().lower()
                if ct not in allowed_types:
                    logger.warning(
                        '"file_skip","kind":"%s","reason":"content_type_not_accepted"',
                        kind,
                    )
                    return None, None
                raw = resp.content
                if len(raw) > max_bytes:
                    logger.warning(
                        '"file_skip","kind":"%s","reason":"size_limit_exceeded"',
                        kind,
                    )
                    return None, None
                return raw, ct

            elif sc == 404 and silent_404:
                return None, None

            elif 400 <= sc < 500:
                logger.warning(
                    '"file_fail","kind":"%s","reason":"http_%d","no_retry":true',
                    kind, sc,
                )
                return None, None

            else:
                if attempt < len(backoff_seconds):
                    await asyncio.sleep(backoff_seconds[attempt])
                    attempt += 1
                    continue
                logger.warning(
                    '"file_fail","kind":"%s","reason":"http_%d"', kind, sc,
                )
                return None, None

        except (httpx.NetworkError, httpx.TimeoutException) as exc:
            if attempt < len(backoff_seconds):
                await asyncio.sleep(backoff_seconds[attempt])
                attempt += 1
                continue
            logger.warning(
                '"file_fail","kind":"%s","reason":"%s"', kind, type(exc).__name__,
            )
            return None, None


async def _fetch_images_for_job(
    job_id: str,
    record: JobRecord,
    profile: dict,
    platform_url: str,
    platform_key: str,
) -> None:
    """
    Download photo + front document + back document from platform, resize photo to 300x300,
    store bytes in record.images. Any failure leaves flags false; job is unaffected.
    """
    primary = profile.get("primaryImages")
    if not isinstance(primary, dict):
        logger.warning('"images_skip","reason":"no_primary_images"')
        return

    photo_meta = primary.get("livePhoto")
    doc_meta = primary.get("idDocument")
    backoff = [1, 2]

    async with httpx.AsyncClient(timeout=15.0) as client:

        # ── Photo ──────────────────────────────────────────────────────────
        if isinstance(photo_meta, dict):
            kind = photo_meta.get("kind", "")
            fid = photo_meta.get("id", "")
            if kind and fid:
                raw, ct = await _download_file(
                    client, kind, fid, platform_url, platform_key,
                    _PHOTO_MAX_BYTES, _PHOTO_CONTENT_TYPES, backoff,
                )
                if raw is not None:
                    resized = await asyncio.to_thread(_resize_photo_sync, raw)
                    if resized is not None:
                        async with job_store._lock:
                            record.images.photo_bytes = resized
                            record.images.photo_content_type = "image/jpeg"
                            record.img_photo = True
                    else:
                        logger.warning('"photo_resize_failed","kind":"%s"', kind)
                else:
                    logger.warning('"photo_skip","kind":"%s","reason":"download_failed"', kind)
            else:
                logger.warning('"photo_skip","reason":"missing_kind_or_id"')
        else:
            logger.warning('"photo_skip","reason":"no_photo_meta"')

        # ── Document (Front) ───────────────────────────────────────────────
        front_succeeded = False
        doc_id = ""
        if isinstance(doc_meta, dict):
            kind = doc_meta.get("kind", "")
            doc_id = doc_meta.get("id", "")
            if kind and doc_id:
                raw, ct = await _download_file(
                    client, kind, doc_id, platform_url, platform_key,
                    _DOC_MAX_BYTES, _DOC_CONTENT_TYPES, backoff,
                )
                if raw is not None and ct is not None:
                    media_type = ct.split(";")[0].strip().lower()
                    if media_type == "application/pdf":
                        if raw[:5] != b"%PDF-":
                            logger.warning(
                                '"document_skip","kind":"%s","reason":"invalid_pdf_magic"',
                                kind,
                            )
                            raw = None
                        else:
                            doc_type = "pdf"
                    else:
                        # Image format (JPEG/PNG/WebP) - do NOT resize with Pillow
                        doc_type = "image"

                    if raw is not None:
                        async with job_store._lock:
                            record.images.document_bytes = raw
                            record.images.document_content_type = media_type
                            record.images.document_type = doc_type
                            record.img_document = True
                            record.img_document_type = doc_type
                        front_succeeded = True
                else:
                    logger.warning('"document_skip","kind":"%s","reason":"download_failed"', kind)
            else:
                logger.warning('"document_skip","reason":"missing_kind_or_id"')
        else:
            logger.warning('"document_skip","reason":"no_doc_meta"')

        # ── Document (Back) ────────────────────────────────────────────────
        # After front succeeds, download document-back using idDocument.id
        if front_succeeded and doc_id:
            back_kind = "document-back"
            raw_back, ct_back = await _download_file(
                client, back_kind, doc_id, platform_url, platform_key,
                _DOC_MAX_BYTES, _DOC_CONTENT_TYPES, backoff,
                silent_404=True,
            )
            if raw_back is not None and ct_back is not None:
                media_type_back = ct_back.split(";")[0].strip().lower()
                if media_type_back == "application/pdf":
                    if raw_back[:5] != b"%PDF-":
                        logger.warning(
                            '"document_skip","kind":"%s","reason":"invalid_pdf_magic"',
                            back_kind,
                        )
                        raw_back = None
                    else:
                        doc_back_type = "pdf"
                else:
                    doc_back_type = "image"

                if raw_back is not None:
                    async with job_store._lock:
                        record.images.document_back_bytes = raw_back
                        record.images.document_back_content_type = media_type_back
                        record.images.document_back_type = doc_back_type
                        record.img_document_back = True
                        record.img_document_back_type = doc_back_type


async def _mock_images_for_job(record: JobRecord) -> None:
    """Generate synthetic images for MOCK_MODE; produces photo and both front and back PDF."""
    raw_photo = _build_mock_photo_raw()
    resized = await asyncio.to_thread(_resize_photo_sync, raw_photo)
    if resized is not None:
        async with job_store._lock:
            record.images.photo_bytes = resized
            record.images.photo_content_type = "image/jpeg"
            record.img_photo = True

    pdf = _build_mock_pdf()
    async with job_store._lock:
        record.images.document_bytes = pdf
        record.images.document_content_type = "application/pdf"
        record.images.document_type = "pdf"
        record.img_document = True
        record.img_document_type = "pdf"

        record.images.document_back_bytes = pdf
        record.images.document_back_content_type = "application/pdf"
        record.images.document_back_type = "pdf"
        record.img_document_back = True
        record.img_document_back_type = "pdf"


# ---------------------------------------------------------------------------
# Submit-Job Store (ICC subscriber creation jobs)
# ---------------------------------------------------------------------------

_SUBMIT_JOB_TTL_SECONDS = 300  # 5 minutes

_SUBMIT_PHOTO_MAX_BYTES = 2 * 1024 * 1024   # 2 MB
_SUBMIT_DOC_MAX_BYTES = 15 * 1024 * 1024    # 15 MB
_SUBMIT_PHOTO_TYPES = {"image/jpeg", "image/png"}
_SUBMIT_DOC_TYPES = {"application/pdf", "image/jpeg", "image/png"}


class SubmitJobRecord:
    __slots__ = ("status", "stage", "reason", "duration_ms", "created_at")

    def __init__(self) -> None:
        self.status: str = "pending"   # pending | done | error
        self.stage: str = "queued"
        self.reason: str = ""          # login_failed | validation_failed | duplicate | site_unavailable | unknown
        self.duration_ms: int = 0
        self.created_at: datetime = datetime.now(tz=timezone.utc)


class SubmitJobStore:
    def __init__(self) -> None:
        self._store: dict[str, SubmitJobRecord] = {}
        self._lock = asyncio.Lock()

    async def create(self, job_id: str) -> SubmitJobRecord:
        rec = SubmitJobRecord()
        async with self._lock:
            self._store[job_id] = rec
        return rec

    async def get(self, job_id: str) -> Optional[SubmitJobRecord]:
        async with self._lock:
            return self._store.get(job_id)

    async def update(
        self, job_id: str, status: str, stage: str = "",
        reason: str = "", duration_ms: int = 0,
    ) -> None:
        async with self._lock:
            rec = self._store.get(job_id)
            if rec:
                rec.status = status
                if stage:
                    rec.stage = stage
                if reason:
                    rec.reason = reason
                if duration_ms:
                    rec.duration_ms = duration_ms

    async def cleanup(self) -> None:
        now = datetime.now(tz=timezone.utc)
        async with self._lock:
            expired = [
                jid for jid, rec in self._store.items()
                if (now - rec.created_at).total_seconds() > _SUBMIT_JOB_TTL_SECONDS
            ]
            for jid in expired:
                del self._store[jid]
        if expired:
            logger.info('"Cleaned up %d expired submit job(s)"', len(expired))


submit_job_store = SubmitJobStore()

# ICC submit concurrency guard (shared with the lookup semaphore pattern)
_icc_semaphore: Optional[asyncio.Semaphore] = None


def _get_icc_semaphore() -> asyncio.Semaphore:
    global _icc_semaphore
    if _icc_semaphore is None:
        _icc_semaphore = asyncio.Semaphore(3)
    return _icc_semaphore


# ---------------------------------------------------------------------------
# Lifespan: startup checks + cleanup task + ICC client
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    global _platform_semaphore, _rate_lock, _icc_semaphore

    _startup_checks()

    _platform_semaphore = asyncio.Semaphore(5)
    _rate_lock = asyncio.Lock()
    _icc_semaphore = asyncio.Semaphore(3)

    # Pre-warm the ICC, ICCTalk, ICON KYC, ICON Billing, and RANKS ITT logins
    await icc_client.startup()
    await icctalk_client.startup()
    await icon_client.startup()
    await icon_billing_client.startup()
    await ranksitt_client.startup()

    async def _cleanup_loop() -> None:
        while True:
            await asyncio.sleep(60)
            await job_store.cleanup()
            await submit_job_store.cleanup()
            await icctalk_client.cleanup_jobs()
            await icon_billing_client.cleanup_jobs()
            await ranksitt_client.cleanup_jobs()

    cleanup_task = asyncio.create_task(_cleanup_loop())
    try:
        yield
    finally:
        cleanup_task.cancel()
        await icc_client.shutdown()
        await icctalk_client.shutdown()
        await icon_client.shutdown()
        await icon_billing_client.shutdown()
        await ranksitt_client.shutdown()


# ---------------------------------------------------------------------------
# App (docs/openapi disabled)
# ---------------------------------------------------------------------------

app = FastAPI(
    title="NID Verification Worker",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------


def _require_secret(x_worker_secret: Optional[str]) -> None:
    """Constant-time comparison of x-worker-secret header."""
    secret = os.environ.get("WORKER_SECRET", WORKER_SECRET)
    secret_bytes = secret.encode()
    incoming = (x_worker_secret or "").encode()
    if not hmac.compare_digest(incoming, secret_bytes):
        raise HTTPException(status_code=401, detail="Unauthorized")


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

_NID_PATTERN = re.compile(r"^\d{10}$|^\d{13}$|^\d{17}$")
_DOB_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class SubmitRequest(BaseModel):
    nid: str
    dob: str

    @field_validator("nid")
    @classmethod
    def validate_nid(cls, v: str) -> str:
        if not _NID_PATTERN.match(v):
            raise ValueError("nid must be exactly 10, 13, or 17 digits")
        return v

    @field_validator("dob")
    @classmethod
    def validate_dob(cls, v: str) -> str:
        if not _DOB_PATTERN.match(v):
            raise ValueError("dob must be YYYY-MM-DD")
        try:
            parsed = date.fromisoformat(v)
        except ValueError:
            raise ValueError("dob is not a valid calendar date")
        today = date.today()
        if parsed > today:
            raise ValueError("dob cannot be in the future")
        if parsed < date(1900, 1, 1):
            raise ValueError("dob cannot precede 1900-01-01")
        return v


# ---------------------------------------------------------------------------
# Background job runner
# ---------------------------------------------------------------------------

async def _run_job(job_id: str, nid: str, dob: str) -> None:
    """
    Runs the platform call (or mock), stores {status, match, images}.
    NID is cleared from memory when finished; DOB is never stored.
    """
    masked = _mask_nid(nid)
    try:
        if MOCK_MODE:
            await asyncio.sleep(1.5)
            match = (nid == _MOCK_NID and dob == _MOCK_DOB)
            profile = _MOCK_PROFILE if match else None
            _log_profile_shape(job_id, profile)
            if match:
                record = await job_store.get(job_id)
                if record is not None:
                    await _mock_images_for_job(record)
            await job_store.update(job_id, "done", match, profile)
            logger.info(
                '"job":"%s","masked_nid":"%s","result":"done","match":%s,"mode":"mock"',
                job_id, masked, str(match).lower(),
            )
            return

        if not await _acquire_rate_slot(max_wait_seconds=5.0):
            logger.warning(
                '"job":"%s","masked_nid":"%s","result":"error","reason":"global_rate_limit_exceeded"',
                job_id, masked,
            )
            await job_store.update(job_id, "error")
            return

        platform_url = os.environ.get("PLATFORM_URL", PLATFORM_URL)
        platform_key = os.environ.get("PLATFORM_API_KEY", PLATFORM_API_KEY)

        payload = json.dumps({"nid": nid, "dob": dob}).encode()
        req_headers = {
            "Authorization": f"Bearer {platform_key}",
            "Content-Type": "application/json",
        }

        attempt = 0
        backoff_seconds = [1, 2]

        sem = _get_platform_semaphore()
        async with sem:
            async with httpx.AsyncClient(timeout=10.0) as client:
                while attempt < 3:
                    try:
                        resp = await client.post(
                            f"{platform_url}/api/internal/nid-lookup",
                            content=payload,
                            headers=req_headers,
                        )
                        status_code = resp.status_code

                        if status_code == 200:
                            data = resp.json()
                            match = bool(data.get("match", False))
                            profile = (
                                data.get("profile")
                                if (match and isinstance(data.get("profile"), dict))
                                else None
                            )
                            _log_profile_shape(job_id, profile)
                            if match and profile is not None:
                                record = await job_store.get(job_id)
                                if record is not None:
                                    await _fetch_images_for_job(
                                        job_id, record, profile,
                                        platform_url, platform_key,
                                    )
                            await job_store.update(job_id, "done", match, profile)
                            logger.info(
                                '"job":"%s","masked_nid":"%s","result":"done","match":%s,"http":%d',
                                job_id, masked, str(match).lower(), status_code,
                            )
                            return

                        elif status_code == 429:
                            logger.warning(
                                '"job":"%s","masked_nid":"%s","result":"retry","reason":"429","attempt":%d',
                                job_id, masked, attempt,
                            )
                            if attempt == 0:
                                await asyncio.sleep(2)
                                attempt += 1
                                continue
                            await job_store.update(job_id, "error")
                            return

                        elif status_code in (400, 401, 403):
                            logger.error(
                                '"job":"%s","masked_nid":"%s","result":"error","reason":"http_%d","no_retry":true',
                                job_id, masked, status_code,
                            )
                            await job_store.update(job_id, "error")
                            return

                        else:
                            logger.warning(
                                '"job":"%s","masked_nid":"%s","result":"retry","reason":"http_%d","attempt":%d',
                                job_id, masked, status_code, attempt,
                            )
                            if attempt < len(backoff_seconds):
                                await asyncio.sleep(backoff_seconds[attempt])
                                attempt += 1
                                continue
                            await job_store.update(job_id, "error")
                            return

                    except (httpx.NetworkError, httpx.TimeoutException) as exc:
                        logger.warning(
                            '"job":"%s","masked_nid":"%s","result":"retry","reason":"%s","attempt":%d',
                            job_id, masked, type(exc).__name__, attempt,
                        )
                        if attempt < len(backoff_seconds):
                            await asyncio.sleep(backoff_seconds[attempt])
                            attempt += 1
                            continue
                        await job_store.update(job_id, "error")
                        return

        await job_store.update(job_id, "error")

    except Exception as exc:
        logger.error(
            '"job":"%s","masked_nid":"%s","result":"error","reason":"%s"',
            job_id, masked, type(exc).__name__,
        )
        await job_store.update(job_id, "error")
    finally:
        nid = ""
        dob = ""
        profile = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

_JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")


@app.post("/jobs", status_code=202)
async def submit_job(
    body: SubmitRequest,
    background_tasks: BackgroundTasks,
    x_worker_secret: Optional[str] = Header(default=None, alias="x-worker-secret"),
) -> dict:
    """Submit a new NID verification job. Returns {jobId}."""
    _require_secret(x_worker_secret)

    job_id = uuid.uuid4().hex  # 32 hex chars
    await job_store.set(job_id, JobRecord(status="pending"))

    masked = _mask_nid(body.nid)
    logger.info('"job":"%s","masked_nid":"%s","event":"submitted"', job_id, masked)

    background_tasks.add_task(_run_job, job_id, body.nid, body.dob)
    return {"jobId": job_id}


@app.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    x_worker_secret: Optional[str] = Header(default=None, alias="x-worker-secret"),
) -> dict:
    """Poll job status. Returns {status, match?, profile?, images?}."""
    _require_secret(x_worker_secret)

    if not _JOB_ID_RE.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    record = await job_store.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Job not found")

    response: dict = {"status": record.status}
    if record.status == "done" and record.match is not None:
        response["match"] = record.match
        if record.match and record.profile is not None:
            response["profile"] = record.profile
        response["images"] = {
            "photo": record.img_photo,
            "document": record.img_document,
            "documentType": record.img_document_type,
            "documentBack": record.img_document_back,
            "documentBackType": record.img_document_back_type,
            "photoSize": [300, 300] if record.img_photo else None,
        }
    return response


@app.get("/jobs/{job_id}/image/{which}")
async def get_job_image(
    job_id: str,
    which: str,
    x_worker_secret: Optional[str] = Header(default=None, alias="x-worker-secret"),
) -> Response:
    """
    Return stored photo or document bytes for a completed job.
    which must be "photo", "document", or "documentBack".
    """
    _require_secret(x_worker_secret)

    if not _JOB_ID_RE.fullmatch(job_id):
        raise HTTPException(status_code=404, detail="Not found")

    if which not in ("photo", "document", "documentBack"):
        raise HTTPException(status_code=404, detail="Not found")

    record = await job_store.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Not found")

    if which == "photo":
        data = record.images.photo_bytes
        ct = record.images.photo_content_type
    elif which == "document":
        data = record.images.document_bytes
        ct = record.images.document_content_type
    elif which == "documentBack":
        data = record.images.document_back_bytes
        ct = record.images.document_back_content_type
    else:
        raise HTTPException(status_code=404, detail="Not found")

    if not data or not ct:
        raise HTTPException(status_code=404, detail="Not found")

    return Response(content=data, media_type=ct)


# ---------------------------------------------------------------------------
# Submit-Jobs Endpoints (ICC subscriber creation)
# ---------------------------------------------------------------------------

async def _run_submit_job(
    job_id: str,
    fields: dict,
    photo_bytes: Optional[bytes],
    photo_ct: str,
    photo_fn: str,
    doc_bytes: Optional[bytes],
    doc_ct: str,
    doc_fn: str,
    doc_back_bytes: Optional[bytes] = None,
    doc_back_ct: str = "image/jpeg",
    doc_back_fn: str = "document-back.jpg",
) -> None:
    """Background task: submit a subscriber to the ICC admin panel."""
    nid = fields.get("nationalIdNumber", "")
    masked = _mask_nid(nid) if nid else "no-nid"

    await submit_job_store.update(job_id, "pending", stage="submitting")

    provider = str(fields.get("provider", "ICC")).upper()
    login_url = fields.get("providerLoginUrl")
    username = fields.get("providerUsername")
    password = fields.get("providerPassword")

    if provider == "ICON":
        if username or password or login_url:
            icon_client.set_credentials(username=username, password=password, login_url=login_url)
    else:
        if username or password or login_url:
            icc_client.set_credentials(username=username, password=password, login_url=login_url)

    sem = _get_icc_semaphore()
    async with sem:
        try:
            if provider == "ICON":
                result = await icon_client.submit_subscriber(
                    job_id=job_id,
                    fields=fields,
                    photo_bytes=photo_bytes,
                    photo_content_type=photo_ct,
                    photo_filename=photo_fn,
                    document_bytes=doc_bytes,
                    document_content_type=doc_ct,
                    document_filename=doc_fn,
                    document_back_bytes=doc_back_bytes,
                    document_back_content_type=doc_back_ct,
                    document_back_filename=doc_back_fn,
                )
            else:
                result = await icc_client.submit_subscriber(
                    job_id=job_id,
                    fields=fields,
                    photo_bytes=photo_bytes,
                    photo_content_type=photo_ct,
                    photo_filename=photo_fn,
                    document_bytes=doc_bytes,
                    document_content_type=doc_ct,
                    document_filename=doc_fn,
                    document_back_bytes=doc_back_bytes,
                    document_back_content_type=doc_back_ct,
                    document_back_filename=doc_back_fn,
                )

            if result.ok:
                await submit_job_store.update(
                    job_id, "done",
                    stage=result.stage,
                    duration_ms=result.duration_ms,
                )
                logger.info(
                    '"submit_job":"%s","masked_nid":"%s","result":"done","ms":%d',
                    job_id, masked, result.duration_ms,
                )
            else:
                await submit_job_store.update(
                    job_id, "error",
                    stage=result.stage,
                    reason=result.reason,
                    duration_ms=result.duration_ms,
                )
                logger.warning(
                    '"submit_job":"%s","masked_nid":"%s","result":"error","reason":"%s","ms":%d',
                    job_id, masked, result.reason, result.duration_ms,
                )
        except Exception as exc:
            logger.error(
                '"submit_job":"%s","masked_nid":"%s","result":"error","reason":"%s"',
                job_id, masked, type(exc).__name__,
            )
            await submit_job_store.update(
                job_id, "error",
                stage="unexpected",
                reason="unknown",
            )
    # Release file bytes from memory
    photo_bytes = None
    doc_bytes = None
    doc_back_bytes = None


@app.post("/submit-jobs", status_code=202)
async def submit_to_icc(
    request: Request,
    background_tasks: BackgroundTasks,
    x_worker_secret: Optional[str] = Header(default=None, alias="x-worker-secret"),
) -> dict:
    """
    Submit a subscriber record to the ICC admin panel.
    Accepts multipart/form-data with:
      - "fields" part: JSON string with all subscriber form values
      - "photo" part (optional): JPEG/PNG image, max 2 MB
      - "document" part (optional): PDF/JPEG/PNG, max 15 MB
      - "documentBack" part (optional): PDF/JPEG/PNG, max 15 MB
    Returns {submitJobId}.
    """
    _require_secret(x_worker_secret)

    # Parse multipart form
    try:
        form = await request.form()
    except Exception as exc:
        logger.warning('"submit_form_error","detail":"%s"', exc)
        raise HTTPException(status_code=400, detail=f"Invalid multipart form data: {exc}")

    # Extract fields JSON
    fields_raw = form.get("fields")
    if not fields_raw:
        raise HTTPException(status_code=400, detail="Missing 'fields' part")

    try:
        if hasattr(fields_raw, "read"):
            fields_content = (await fields_raw.read()).decode("utf-8")
        else:
            fields_content = str(fields_raw)
        fields = json.loads(fields_content)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON in 'fields' part")

    if not isinstance(fields, dict):
        raise HTTPException(status_code=400, detail="'fields' must be a JSON object")

    # Validate required fields
    required = ["subscriberName", "subscriberType", "phoneNumber", "birthDate", "validEmail"]
    missing = [f for f in required if not str(fields.get(f, "")).strip()]
    nid_val = str(fields.get("nationalIdNumber", "")).strip()
    passport_val = str(fields.get("passportNumber", "")).strip()
    if not nid_val and not passport_val:
        missing.append("nationalIdNumber or passportNumber")
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing)}",
        )

    # Extract photo file
    photo_bytes: Optional[bytes] = None
    photo_ct = "image/jpeg"
    photo_fn = "photo.jpg"
    photo_part = form.get("photo")
    if photo_part and hasattr(photo_part, "read"):
        photo_bytes = await photo_part.read()
        photo_ct = getattr(photo_part, "content_type", "image/jpeg") or "image/jpeg"
        photo_fn = getattr(photo_part, "filename", "photo.jpg") or "photo.jpg"
        if photo_ct not in _SUBMIT_PHOTO_TYPES:
            raise HTTPException(status_code=400, detail=f"Photo type {photo_ct} not allowed. Use JPEG or PNG.")
        if len(photo_bytes) > _SUBMIT_PHOTO_MAX_BYTES:
            raise HTTPException(status_code=400, detail="Photo exceeds 2 MB size limit.")

    # Extract document file (Front NID)
    doc_bytes: Optional[bytes] = None
    doc_ct = "image/jpeg"
    doc_fn = "document.jpg"
    doc_part = form.get("document")
    if doc_part and hasattr(doc_part, "read"):
        doc_bytes = await doc_part.read()
        doc_ct = getattr(doc_part, "content_type", "image/jpeg") or "image/jpeg"
        doc_fn = getattr(doc_part, "filename", "document.jpg") or "document.jpg"
        if doc_ct not in _SUBMIT_DOC_TYPES:
            raise HTTPException(status_code=400, detail=f"Document type {doc_ct} not allowed. Use PDF, JPEG, or PNG.")
        if len(doc_bytes) > _SUBMIT_DOC_MAX_BYTES:
            raise HTTPException(status_code=400, detail="Document exceeds 15 MB size limit.")

    # Extract back document file (Back NID)
    doc_back_bytes: Optional[bytes] = None
    doc_back_ct = "image/jpeg"
    doc_back_fn = "document-back.jpg"
    doc_back_part = form.get("documentBack")
    if doc_back_part and hasattr(doc_back_part, "read"):
        doc_back_bytes = await doc_back_part.read()
        doc_back_ct = getattr(doc_back_part, "content_type", "image/jpeg") or "image/jpeg"
        doc_back_fn = getattr(doc_back_part, "filename", "document-back.jpg") or "document-back.jpg"
        if doc_back_ct not in _SUBMIT_DOC_TYPES:
            raise HTTPException(status_code=400, detail=f"Back document type {doc_back_ct} not allowed. Use PDF, JPEG, or PNG.")
        if len(doc_back_bytes) > _SUBMIT_DOC_MAX_BYTES:
            raise HTTPException(status_code=400, detail="Back document exceeds 15 MB size limit.")

    # Create job
    job_id = uuid.uuid4().hex
    await submit_job_store.create(job_id)

    masked = _mask_nid(nid_val) if nid_val else "no-nid"
    logger.info('"submit_job":"%s","masked_nid":"%s","event":"queued"', job_id, masked)

    background_tasks.add_task(
        _run_submit_job, job_id, fields,
        photo_bytes, photo_ct, photo_fn,
        doc_bytes, doc_ct, doc_fn,
        doc_back_bytes, doc_back_ct, doc_back_fn,
    )

    return {"submitJobId": job_id}


@app.get("/submit-jobs/{job_id}")
async def get_submit_job(
    job_id: str,
    x_worker_secret: Optional[str] = Header(default=None, alias="x-worker-secret"),
) -> dict:
    """Poll submit job status. Returns {status, stage?, reason?, durationMs?}."""
    _require_secret(x_worker_secret)

    if not _JOB_ID_RE.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    record = await submit_job_store.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Submit job not found")

    response: dict = {"status": record.status}
    if record.stage:
        response["stage"] = record.stage
    if record.reason:
        response["reason"] = record.reason
    if record.duration_ms:
        response["durationMs"] = record.duration_ms
    return response


# ---------------------------------------------------------------------------
# Direct Number Activation Endpoint
# ---------------------------------------------------------------------------

class ActivateNumberRequest(BaseModel):
    number: str
    provider: str = "ICC"
    subscriberName: str
    nationalIdNumber: Optional[str] = ""
    passportNumber: Optional[str] = ""
    phoneNumber: str
    birthDate: Optional[str] = "1990-01-01"
    validEmail: str
    subscriberType: str = "Individual"
    gender: str = "Male"
    fatherName: Optional[str] = ""
    motherName: Optional[str] = ""
    presentStreet: Optional[str] = ""
    presentCity: Optional[str] = ""
    presentPostalZip: Optional[str] = ""
    presentCountry: Optional[str] = "Bangladesh"


@app.post("/activate-number")
async def activate_number(
    body: ActivateNumberRequest,
    x_worker_secret: Optional[str] = Header(default=None, alias="x-worker-secret"),
) -> dict:
    """Direct synchronous/asynchronous number activation with provider portal."""
    _require_secret(x_worker_secret)
    prov = body.provider.upper()
    fields = body.model_dump()
    fields["provider"] = prov
    job_id = uuid.uuid4().hex

    login_url = fields.get("providerLoginUrl")
    username = fields.get("providerUsername")
    password = fields.get("providerPassword")

    if prov == "ICON":
        if username or password or login_url:
            icon_client.set_credentials(username=username, password=password, login_url=login_url)
        res = await icon_client.submit_subscriber(job_id=job_id, fields=fields)
    else:
        if username or password or login_url:
            icc_client.set_credentials(username=username, password=password, login_url=login_url)
        res = await icc_client.submit_subscriber(job_id=job_id, fields=fields)

    return {
        "ok": res.ok,
        "provider": prov,
        "number": body.number,
        "stage": res.stage,
        "durationMs": res.duration_ms,
        "reason": res.reason,
    }


# ---------------------------------------------------------------------------
# ICC Talk Pin Recharge Endpoints
# ---------------------------------------------------------------------------

class RechargeJobRequest(BaseModel):
    phone: str
    amount: float
    idempotencyKey: Optional[str] = None
    provider: Optional[str] = "ICC"
    loginUrl: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        clean = re.sub(r"\D", "", v.strip())
        if not (8 <= len(clean) <= 15):
            raise ValueError("Phone must be 8 to 15 digits")
        return clean

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: float) -> float:
        if v < MIN_RECHARGE or v > MAX_RECHARGE:
            raise ValueError(f"Amount must be between {MIN_RECHARGE} and {MAX_RECHARGE}")
        if round(v, 2) != v:
            raise ValueError("Amount can have at most 2 decimal places")
        return round(v, 2)


@app.post("/recharge-jobs")
async def create_recharge_job(
    body: RechargeJobRequest,
    background_tasks: BackgroundTasks,
    x_worker_secret: Optional[str] = Header(default=None, alias="x-worker-secret"),
) -> dict:
    """Create a new automated recharge job for ICC Talk or ICON billing portal."""
    _require_secret(x_worker_secret)

    prov = (body.provider or "ICC").upper()

    # Apply runtime credential overrides if provided
    if body.loginUrl or body.username or body.password:
        if prov == "ICON":
            icon_billing_client.set_credentials(
                username=body.username, password=body.password, login_url=body.loginUrl
            )
        else:
            icctalk_client.set_credentials(
                username=body.username, password=body.password, login_url=body.loginUrl
            )

    job_id = uuid.uuid4().hex

    if prov == "RANKSITT":
        job, is_existing = ranksitt_client.register_job(
            job_id=job_id,
            phone=body.phone,
            amount=body.amount,
            idempotency_key=body.idempotencyKey,
        )
        if not is_existing and job.status != "error":
            background_tasks.add_task(ranksitt_client.execute_recharge, job.id)
    elif prov == "ICON":
        job, is_existing = icon_billing_client.register_job(
            job_id=job_id,
            phone=body.phone,
            amount=body.amount,
            idempotency_key=body.idempotencyKey,
        )
        if not is_existing and job.status != "error":
            background_tasks.add_task(icon_billing_client.execute_recharge, job.id)
    else:
        job, is_existing = icctalk_client.register_job(
            job_id=job_id,
            phone=body.phone,
            amount=body.amount,
            idempotency_key=body.idempotencyKey,
        )
        if not is_existing and job.status != "error":
            background_tasks.add_task(icctalk_client.execute_recharge, job.id)

    return {"rechargeJobId": job.id}


class ProviderCredentialsRequest(BaseModel):
    provider: str
    kyc: Optional[dict] = None
    recharge: Optional[dict] = None


@app.post("/credentials")
async def update_provider_credentials(
    body: ProviderCredentialsRequest,
    x_worker_secret: Optional[str] = Header(default=None, alias="x-worker-secret"),
) -> dict:
    """Dynamically update provider credentials in real-time."""
    _require_secret(x_worker_secret)
    prov = body.provider.upper()

    if body.kyc:
        u = body.kyc.get("username")
        p = body.kyc.get("password")
        l = body.kyc.get("loginUrl")
        if prov == "ICC":
            icc_client.set_credentials(username=u, password=p, login_url=l)
        elif prov == "ICON":
            icon_client.set_credentials(username=u, password=p, login_url=l)

    if body.recharge:
        u = body.recharge.get("username")
        p = body.recharge.get("password")
        l = body.recharge.get("loginUrl")
        if prov == "ICC":
            icctalk_client.set_credentials(username=u, password=p, login_url=l)
        elif prov == "ICON":
            icon_billing_client.set_credentials(username=u, password=p, login_url=l)

    return {"ok": True, "provider": prov}


class TestCredentialsRequest(BaseModel):
    provider: str
    type: str  # "kyc" | "recharge"
    loginUrl: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None


@app.get("/health")
async def health_check() -> dict:
    return {"status": "ok", "service": "data-check-worker"}


@app.post("/test-credentials")
async def test_provider_credentials(
    body: TestCredentialsRequest,
    x_worker_secret: Optional[str] = Header(default=None, alias="x-worker-secret"),
) -> dict:
    """Live verify provider login credentials."""
    import time
    _require_secret(x_worker_secret)
    prov = body.provider.upper()
    test_type = body.type.lower()
    url = (body.loginUrl or "").strip()
    user = (body.username or "").strip()
    pwd = (body.password or "").strip()
    t0 = time.perf_counter()

    if test_type == "kyc":
        if prov == "ICC":
            target_url = url or icc_client.login_url
            target_user = user or icc_client.username
            target_pwd = pwd or icc_client.password
            try:
                async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
                    get_resp = await client.get(target_url, follow_redirects=True)
                    if get_resp.status_code != 200:
                        ms = int((time.perf_counter() - t0) * 1000)
                        return {"ok": False, "reason": f"Login page unreachable (HTTP {get_resp.status_code})", "durationMs": ms}

                    post_resp = await client.post(
                        target_url,
                        data={"user_name": target_user, "password": target_pwd},
                    )
                    ms = int((time.perf_counter() - t0) * 1000)
                    loc = post_resp.headers.get("location", "")
                    if post_resp.status_code in (301, 302, 303, 307, 308) and "/admin/" in loc:
                        return {"ok": True, "message": "ICC KYC Portal login verified (Redirect to /admin/my_subscriber)", "durationMs": ms}
                    elif post_resp.status_code == 200 and ("Invalid" in post_resp.text or "invalid" in post_resp.text):
                        return {"ok": False, "reason": "Invalid credentials rejected by ICC portal", "durationMs": ms}
                    else:
                        return {"ok": False, "reason": f"Login failed (HTTP {post_resp.status_code})", "durationMs": ms}
            except Exception as exc:
                ms = int((time.perf_counter() - t0) * 1000)
                return {"ok": False, "reason": f"Connection error: {type(exc).__name__}", "durationMs": ms}

        elif prov == "ICON":
            target_url = url or icon_client.login_url
            target_user = user or icon_client.username
            target_pwd = pwd or icon_client.password
            from urllib.parse import urlparse
            p = urlparse(target_url)
            base = f"{p.scheme}://{p.netloc}" if p.scheme and p.netloc else target_url.rstrip("/")
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(f"{base}/login", json={"username": target_user, "password": target_pwd})
                    ms = int((time.perf_counter() - t0) * 1000)
                    if resp.status_code == 200:
                        try:
                            data = resp.json()
                            if data.get("message") == "Login Successfully":
                                return {"ok": True, "message": "ICON KYC login verified successfully", "durationMs": ms}
                            return {"ok": False, "reason": data.get("message", "Rejected by ICON portal"), "durationMs": ms}
                        except Exception:
                            return {"ok": True, "message": "ICON portal responded 200 OK", "durationMs": ms}
                    return {"ok": False, "reason": f"HTTP {resp.status_code}", "durationMs": ms}
            except Exception as exc:
                ms = int((time.perf_counter() - t0) * 1000)
                return {"ok": False, "reason": f"Connection error: {type(exc).__name__}", "durationMs": ms}

        return {"ok": True, "message": f"{prov} KYC configuration registered", "durationMs": int((time.perf_counter() - t0) * 1000)}

    elif test_type == "recharge":
        if prov == "ICC":
            target_url = url or icctalk_client.login_url
            target_user = user or icctalk_client.username
            target_pwd = pwd or icctalk_client.password
            post_url = target_url.split('?')[0] if "login" in target_url.lower() else "https://icctalk.com:2020/OTTSSO/login"
            try:
                async with httpx.AsyncClient(verify=False, timeout=10.0, follow_redirects=False) as client:
                    resp = await client.post(
                        post_url,
                        data={"username": target_user, "password": target_pwd, "rememberMe": "on"},
                    )
                    ms = int((time.perf_counter() - t0) * 1000)
                    loc = resp.headers.get("location", "")
                    if resp.status_code in (301, 302, 303, 307, 308) and "error" not in loc.lower():
                        return {"ok": True, "message": "ICC Talk Billing SSO login verified successfully", "durationMs": ms}
                    elif "error" in loc.lower() or resp.status_code == 401:
                        return {"ok": False, "reason": "Invalid credentials rejected by ICC Talk SSO", "durationMs": ms}
                    else:
                        return {"ok": True, "message": f"ICC Talk portal responded (HTTP {resp.status_code})", "durationMs": ms}
            except Exception as exc:
                ms = int((time.perf_counter() - t0) * 1000)
                return {"ok": False, "reason": f"Connection error: {type(exc).__name__}", "durationMs": ms}

        elif prov == "ICON":
            target_url = url or icon_billing_client.sso_post_url
            target_user = user or icon_billing_client.username
            target_pwd = pwd or icon_billing_client.password
            # Derive SSO POST URL
            from urllib.parse import urlparse as _up
            _p = _up(target_url)
            sso_post = (
                f"{_p.scheme}://{_p.netloc}/OTTSSO/login"
                if _p.scheme and _p.netloc
                else "https://sip.italk.com.bd:2020/OTTSSO/login"
            )
            try:
                async with httpx.AsyncClient(verify=False, timeout=12.0, follow_redirects=False) as client:
                    resp = await client.post(
                        sso_post,
                        data={"username": target_user, "password": target_pwd, "rememberMe": "on"},
                    )
                    ms = int((time.perf_counter() - t0) * 1000)
                    loc = resp.headers.get("location", "")
                    if resp.status_code in (301, 302, 303, 307, 308) and "error" not in loc.lower():
                        return {"ok": True, "message": "ICON Billing SSO login verified successfully", "durationMs": ms}
                    elif "error" in loc.lower() or resp.status_code == 401:
                        return {"ok": False, "reason": "Invalid credentials rejected by ICON Billing SSO", "durationMs": ms}
                    else:
                        return {"ok": True, "message": f"ICON Billing portal responded (HTTP {resp.status_code})", "durationMs": ms}
            except Exception as exc:
                ms = int((time.perf_counter() - t0) * 1000)
                return {"ok": False, "reason": f"Connection error: {type(exc).__name__}", "durationMs": ms}

        elif prov == "RANKSITT":
            target_user = user or RANKSITT_USERNAME
            target_pwd = pwd or RANKSITT_PASSWORD
            login_url = url or RANKSITT_LOGIN_URL
            try:
                async with httpx.AsyncClient(verify=False, timeout=12.0) as client:
                    resp = await client.post(
                        login_url,
                        json={
                            "UserName": target_user,
                            "Password": target_pwd,
                            "AccountType": "reseller",
                            "RememberMe": True,
                            "TimeZoneOffset": "6.00",
                        },
                    )
                    ms = int((time.perf_counter() - t0) * 1000)
                    if resp.status_code == 200:
                        return {"ok": True, "message": "RANKS ITT VSM4 reseller login verified successfully", "durationMs": ms}
                    return {"ok": False, "reason": f"RANKS ITT login failed (HTTP {resp.status_code})", "durationMs": ms}
            except Exception as exc:
                ms = int((time.perf_counter() - t0) * 1000)
                return {"ok": False, "reason": f"Connection error: {type(exc).__name__}", "durationMs": ms}

        return {"ok": True, "message": f"{prov} Recharge configuration registered", "durationMs": int((time.perf_counter() - t0) * 1000)}

    return {"ok": False, "reason": "Invalid test type. Use 'kyc' or 'recharge'."}


@app.get("/recharge-jobs/{job_id}")
async def get_recharge_job(
    job_id: str,
    provider: Optional[str] = None,
    x_worker_secret: Optional[str] = Header(default=None, alias="x-worker-secret"),
) -> dict:
    """Poll recharge job status. Looks up job in the correct provider client."""
    _require_secret(x_worker_secret)

    if not _JOB_ID_RE.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID format")

    prov = (provider or "").upper()

    if prov == "RANKSITT":
        job = ranksitt_client.get_job(job_id)
    elif prov == "ICON":
        job = icon_billing_client.get_job(job_id)
    else:
        # Try ICC Talk first, then ICON billing, then RANKS ITT
        job = icctalk_client.get_job(job_id)
        if job is None:
            job = icon_billing_client.get_job(job_id)
        if job is None:
            job = ranksitt_client.get_job(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Recharge job not found")

    return job.to_dict()


_RANKSITT_PHONE_RE = re.compile(r"^\+?(\d{10,15})$")


@app.get("/ranksitt-balance/{number}")
async def get_ranksitt_balance(
    number: str,
    x_worker_secret: Optional[str] = Header(default=None, alias="x-worker-secret"),
) -> dict:
    """
    Query live balance of a RANKS ITT phone number.
    Protected by x-worker-secret header.
    Returns { ok: True, balance: float, number: str, updatedAt: str, cached: bool }
    """
    _require_secret(x_worker_secret)

    clean_number = number.strip()
    if not _RANKSITT_PHONE_RE.match(clean_number):
        raise HTTPException(status_code=400, detail="Invalid phone number format")

    try:
        res = await ranksitt_client.get_balance(clean_number)
        return {
            "ok": True,
            "balance": res["balance"],
            "number": res["number"],
            "updatedAt": res["updatedAt"],
            "cached": res.get("cached", False),
            "provider": "RANKSITT",
        }
    except RanksIttError as err:
        raise HTTPException(status_code=err.status_code, detail=str(err))
    except Exception as exc:
        logger.error('{"event":"ranksitt_balance_route_error","error":"%s"}', type(exc).__name__)
        raise HTTPException(status_code=502, detail="Failed to fetch RANKS ITT balance")


class RanksIttRechargeRequest(BaseModel):
    phone: str
    amount: float
    idempotencyKey: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        clean = re.sub(r"\D", "", v.strip())
        if not (8 <= len(clean) <= 15):
            raise ValueError("Phone must be 8 to 15 digits")
        return clean

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: float) -> float:
        if v < MIN_RECHARGE or v > MAX_RECHARGE:
            raise ValueError(f"Amount must be between {MIN_RECHARGE} and {MAX_RECHARGE}")
        if round(v, 2) != v:
            raise ValueError("Amount can have at most 2 decimal places")
        return round(v, 2)


@app.post("/ranksitt-recharge")
async def ranksitt_recharge_endpoint(
    body: RanksIttRechargeRequest,
    background_tasks: BackgroundTasks,
    x_worker_secret: Optional[str] = Header(default=None, alias="x-worker-secret"),
) -> dict:
    """Dedicated route to initiate RANKS ITT recharge."""
    _require_secret(x_worker_secret)
    job_id = uuid.uuid4().hex
    job, is_existing = ranksitt_client.register_job(
        job_id=job_id,
        phone=body.phone,
        amount=body.amount,
        idempotency_key=body.idempotencyKey,
    )
    if not is_existing and job.status != "error":
        background_tasks.add_task(ranksitt_client.execute_recharge, job.id)
    return {"rechargeJobId": job.id, "status": job.status}


if __name__ == "__main__":
    import uvicorn

    verifier_dir = os.path.dirname(os.path.abspath(__file__))
    if verifier_dir not in sys.path:
        sys.path.insert(0, verifier_dir)
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True)
