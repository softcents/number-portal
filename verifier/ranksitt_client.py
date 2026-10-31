"""
RANKS ITT Reseller Client
Pure-HTTP client for https://sip.ranksitt.net (VSM4 Reseller Portal).

Features:
  - Persistent httpx.AsyncClient with cookie jar and connection pooling
  - Pre-warmed session: logs in at worker startup so customer queries are immediate
  - Automatic re-login under asyncio.Lock on session expiration
  - In-memory 30-second TTL cache for retail clients to avoid flooding the portal
  - Single global lock serializing portal recharge/credit operations
  - Per-phone serialized locks preventing concurrent credits to the same number
  - Automated Add Payment credit workflow with before/after balance verification
  - Strict security: NEVER logs passwords, cookies, or raw HTML/JSON bodies
  - Job-style structured logging with masked phone numbers and duration ms
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger("verifier.ranksitt")

# ---------------------------------------------------------------------------
# Credentials & Portal Endpoints (Hardcoded per system architecture)
# ---------------------------------------------------------------------------

RANKSITT_USERNAME = "Ominaz_Online_L1"
RANKSITT_PASSWORD = "R!TT@OminazL1"

RANKSITT_BASE_URL = "https://sip.ranksitt.net"
RANKSITT_LOGIN_URL = "https://sip.ranksitt.net/vsm4/api/Account/SignIn"
RANKSITT_IS_AUTH_URL = "https://sip.ranksitt.net/vsm4/api/Account/IsAuthenticated"
RANKSITT_CLIENTS_LIST_URL = "https://sip.ranksitt.net/vsm4/api/ResellerClientsRetail/GetClientsRetailsList"
RANKSITT_CLIENT_DETAILS_URL = "https://sip.ranksitt.net/vsm4/api/ResellerClientsRetail/GetClientRetail"
RANKSITT_ADD_PAYMENT_URL = "https://sip.ranksitt.net/vsm4/api/ResellerClients/AddPayment"

CACHE_TTL_SECONDS = 30.0


def normalize_ranksitt_phone(phone: str) -> str:
    """Normalize phone number to standard 11-digit Bangladesh local format (09617XXXXXX)."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", str(phone).strip())
    if digits.startswith("880") and len(digits) == 13:
        digits = "0" + digits[3:]
    elif len(digits) == 10 and digits.startswith("9"):
        digits = "0" + digits
    return digits


def mask_phone_ranksitt(phone: str) -> str:
    """Mask phone number for safe logging (first 5 + stars + last 2)."""
    clean = re.sub(r"\D", "", str(phone))
    if len(clean) <= 6:
        return "****"
    return clean[:5] + "***" + clean[-2:]


class RanksIttError(Exception):
    def __init__(self, message: str, status_code: int = 502, error_code: str = "ranksitt_error"):
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code


class RanksIttJobRecord:
    """In-memory record of a RANKS ITT top-up recharge job."""

    __slots__ = (
        "id",
        "phone",
        "amount",
        "idempotency_key",
        "status",
        "stage",
        "reason",
        "balance_before",
        "balance_after",
        "expected_after",
        "reference",
        "duration_ms",
        "created_at",
    )

    def __init__(self, job_id: str, phone: str, amount: float, idempotency_key: Optional[str] = None):
        self.id = job_id
        self.phone = phone
        self.amount = amount
        self.idempotency_key = idempotency_key
        self.status = "pending"
        self.stage = "queued"
        self.reason: Optional[str] = None
        self.balance_before: Optional[float] = None
        self.balance_after: Optional[float] = None
        self.expected_after: Optional[float] = None
        self.reference: Optional[str] = None
        self.duration_ms: int = 0
        self.created_at: float = time.monotonic()

    def to_dict(self) -> dict:
        data: Dict[str, Any] = {
            "status": self.status,
            "stage": self.stage,
            "phone": self.phone,
            "amount": self.amount,
            "durationMs": self.duration_ms,
        }
        if self.reason is not None:
            data["reason"] = self.reason
        if self.balance_before is not None:
            data["balanceBefore"] = self.balance_before
        if self.balance_after is not None:
            data["balanceAfter"] = self.balance_after
        if self.expected_after is not None:
            data["expectedAfter"] = self.expected_after
        if self.reference is not None:
            data["reference"] = self.reference
        return data


class RanksIttClient:
    """Singleton HTTP client for RANKS ITT reseller portal balance queries and recharge."""

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None
        self._login_lock = asyncio.Lock()
        self._request_lock = asyncio.Lock()
        self._recharge_lock = asyncio.Lock()
        self._number_locks: Dict[str, asyncio.Lock] = {}
        self._number_locks_guard = asyncio.Lock()
        self._logged_in = False

        # In-memory jobs & idempotency tracking
        self._jobs: Dict[str, RanksIttJobRecord] = {}
        self._idempotency_map: Dict[str, str] = {}
        self._recent_attempts: List[Tuple[str, float, float]] = []

        # In-memory client cache: normalized_phone -> { balance: float, updatedAt: str, active: bool }
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_timestamp: float = 0.0

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                verify=False,
                timeout=httpx.Timeout(connect=10.0, read=25.0, write=10.0, pool=30.0),
                follow_redirects=True,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                },
            )
        return self._client

    async def startup(self) -> None:
        """Pre-warm login at worker startup."""
        try:
            await self._ensure_login(force=True)
            logger.info('{"event":"ranksitt_prewarm_success","username":"%s"}', RANKSITT_USERNAME)
        except Exception as exc:
            logger.warning('{"event":"ranksitt_prewarm_failed","reason":"%s"}', type(exc).__name__)

    async def shutdown(self) -> None:
        """Close HTTP client on worker shutdown."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
        self._logged_in = False

    async def _get_number_lock(self, phone: str) -> asyncio.Lock:
        async with self._number_locks_guard:
            if phone not in self._number_locks:
                self._number_locks[phone] = asyncio.Lock()
            return self._number_locks[phone]

    async def cleanup_jobs(self, ttl_seconds: int = 600) -> None:
        """Remove jobs older than TTL and prune idempotency map."""
        now = time.monotonic()
        expired_ids = [jid for jid, job in self._jobs.items() if (now - job.created_at) > ttl_seconds]
        for jid in expired_ids:
            job = self._jobs.pop(jid, None)
            if job and job.idempotency_key:
                self._idempotency_map.pop(job.idempotency_key, None)
        self._recent_attempts = [(p, a, t) for p, a, t in self._recent_attempts if (now - t) < 35.0]

    def get_job(self, job_id: str) -> Optional[RanksIttJobRecord]:
        return self._jobs.get(job_id)

    def register_job(
        self,
        job_id: str,
        phone: str,
        amount: float,
        idempotency_key: Optional[str] = None,
    ) -> Tuple[RanksIttJobRecord, bool]:
        """
        Atomically register a recharge job.
        Returns (job, is_existing).
        If idempotency_key is repeated, returns the existing job without creating a duplicate.
        """
        now = time.monotonic()
        if idempotency_key and idempotency_key in self._idempotency_map:
            existing_id = self._idempotency_map[idempotency_key]
            existing_job = self._jobs.get(existing_id)
            if existing_job:
                return existing_job, True

        # Duplicate spam prevention (30 second cooldown for identical phone + amount)
        for prev_phone, prev_amount, prev_time in self._recent_attempts:
            if prev_phone == phone and abs(prev_amount - amount) < 0.001 and (now - prev_time) < 30.0:
                job = RanksIttJobRecord(job_id, phone, amount, idempotency_key)
                job.status = "error"
                job.stage = "rejected"
                job.reason = "duplicate_request"
                self._jobs[job_id] = job
                return job, False

        job = RanksIttJobRecord(job_id, phone, amount, idempotency_key)
        self._jobs[job_id] = job
        if idempotency_key:
            self._idempotency_map[idempotency_key] = job_id
        self._recent_attempts.append((phone, amount, now))
        return job, False

    async def _ensure_login(self, force: bool = False) -> None:
        """Log in to RANKS ITT reseller portal under asyncio.Lock."""
        if self._logged_in and not force:
            return

        async with self._login_lock:
            # Double check after acquiring lock
            if self._logged_in and not force:
                return

            t0 = time.perf_counter()
            client = await self._get_client()

            payload = {
                "UserName": RANKSITT_USERNAME,
                "Email": None,
                "Password": RANKSITT_PASSWORD,
                "Reseller": None,
                "AccountType": "reseller",
                "RememberMe": True,
                "TimeZoneOffset": "6.00",
                "Otp": None,
            }

            try:
                resp = await client.post(RANKSITT_LOGIN_URL, json=payload)
                duration_ms = int((time.perf_counter() - t0) * 1000)

                if resp.status_code == 200:
                    self._logged_in = True
                    logger.info(
                        '{"event":"ranksitt_login_success","duration_ms":%d}',
                        duration_ms,
                    )
                else:
                    self._logged_in = False
                    logger.error(
                        '{"event":"ranksitt_login_failed","status":%d,"duration_ms":%d}',
                        resp.status_code,
                        duration_ms,
                    )
                    raise RanksIttError(
                        f"RANKS ITT login failed with HTTP {resp.status_code}",
                        status_code=502,
                        error_code="login_failed",
                    )
            except httpx.RequestError as exc:
                self._logged_in = False
                logger.error('{"event":"ranksitt_login_network_error","reason":"%s"}', type(exc).__name__)
                raise RanksIttError(
                    f"RANKS ITT login network error: {type(exc).__name__}",
                    status_code=503,
                    error_code="network_error",
                ) from exc

    async def _fetch_all_clients(self) -> Dict[str, Dict[str, Any]]:
        """Fetch all retail clients from portal and update cache."""
        client = await self._get_client()
        t0 = time.perf_counter()

        params = {
            "draw": "1",
            "start": "0",
            "length": "250",
            "search[value]": "",
            "search[regex]": "false",
        }

        # Attempt GET request; if 401, re-login once and retry
        for attempt in range(2):
            try:
                await self._ensure_login()
                resp = await client.get(RANKSITT_CLIENTS_LIST_URL, params=params)

                if resp.status_code == 401:
                    logger.warning('{"event":"ranksitt_session_expired","action":"reauthenticating"}')
                    self._logged_in = False
                    if attempt == 0:
                        await self._ensure_login(force=True)
                        continue

                if resp.status_code != 200:
                    raise RanksIttError(
                        f"RANKS ITT list returned HTTP {resp.status_code}",
                        status_code=502,
                        error_code="portal_error",
                    )

                data = resp.json()
                rows = data.get("data", [])
                duration_ms = int((time.perf_counter() - t0) * 1000)

                new_cache: Dict[str, Dict[str, Any]] = {}
                now_iso = datetime.now(timezone.utc).isoformat()

                for row in rows:
                    raw_login = str(row.get("login", "")).strip()
                    norm_num = normalize_ranksitt_phone(raw_login)
                    if not norm_num:
                        continue

                    raw_bal = row.get("balance", 0.0)
                    try:
                        balance_val = float(raw_bal) if raw_bal is not None else 0.0
                    except (ValueError, TypeError):
                        balance_val = 0.0

                    new_cache[norm_num] = {
                        "balance": balance_val,
                        "rawLogin": raw_login,
                        "tariffName": row.get("tariffName", ""),
                        "active": bool(row.get("active", True)),
                        "updatedAt": now_iso,
                    }

                self._cache = new_cache
                self._cache_timestamp = time.monotonic()

                logger.info(
                    '{"event":"ranksitt_cache_refreshed","rows_count":%d,"duration_ms":%d}',
                    len(new_cache),
                    duration_ms,
                )
                return self._cache

            except httpx.RequestError as exc:
                if attempt == 1:
                    logger.error('{"event":"ranksitt_fetch_network_error","reason":"%s"}', type(exc).__name__)
                    raise RanksIttError(
                        f"RANKS ITT network error: {type(exc).__name__}",
                        status_code=503,
                        error_code="network_error",
                    ) from exc
                await asyncio.sleep(0.5)

        return self._cache

    async def get_balance(self, number: str) -> Dict[str, Any]:
        """
        Query balance for a single phone number.
        Normalizes the number, uses cached client list if fresh (< 30s),
        requires EXACTLY ONE matching client, and returns { balance, updatedAt, number }.
        """
        norm_number = normalize_ranksitt_phone(number)
        if not norm_number or len(norm_number) < 10:
            raise RanksIttError(
                "Invalid phone number format",
                status_code=400,
                error_code="invalid_phone",
            )

        masked = mask_phone_ranksitt(norm_number)
        now_mono = time.monotonic()

        cache_is_fresh = (now_mono - self._cache_timestamp) < CACHE_TTL_SECONDS
        if cache_is_fresh and norm_number in self._cache:
            entry = self._cache[norm_number]
            logger.info(
                '{"event":"ranksitt_balance_hit_cache","number":"%s","balance":%.2f}',
                masked,
                entry["balance"],
            )
            return {
                "balance": entry["balance"],
                "number": norm_number,
                "updatedAt": entry["updatedAt"],
                "cached": True,
            }

        async with self._request_lock:
            now_mono = time.monotonic()
            if (now_mono - self._cache_timestamp) < CACHE_TTL_SECONDS and norm_number in self._cache:
                entry = self._cache[norm_number]
                return {
                    "balance": entry["balance"],
                    "number": norm_number,
                    "updatedAt": entry["updatedAt"],
                    "cached": True,
                }

            all_clients = await self._fetch_all_clients()

        matches = [val for k, val in all_clients.items() if k == norm_number]
        if len(matches) == 0:
            logger.warning('{"event":"ranksitt_number_not_found","number":"%s"}', masked)
            raise RanksIttError(
                f"Number {masked} not found in RANKS ITT reseller portal",
                status_code=404,
                error_code="phone_not_found",
            )
        elif len(matches) > 1:
            logger.error('{"event":"ranksitt_ambiguous_number","number":"%s","matches":%d}', masked, len(matches))
            raise RanksIttError(
                f"Multiple records matched number {masked} in RANKS ITT reseller portal",
                status_code=409,
                error_code="ambiguous_phone",
            )

        match = matches[0]
        logger.info(
            '{"event":"ranksitt_balance_live","number":"%s","balance":%.2f}',
            masked,
            match["balance"],
        )
        return {
            "balance": match["balance"],
            "number": norm_number,
            "updatedAt": match["updatedAt"],
            "cached": False,
        }

    async def execute_recharge(self, job_id: str) -> None:
        """
        Execute full recharge workflow inside serialized per-number and global locks:
          1. search (find client ID, verify active status)
          2. read_before (read baseline balance)
          3. recharge (POST AddPayment, NEVER AUTO-RETRIED)
          4. verify (read balance after, confirm delta == amount)
          5. handle failures/uncertainties with safe fallback
        """
        job = self._jobs.get(job_id)
        if not job:
            return

        t_start = time.monotonic()
        phone = job.phone
        amount = job.amount
        norm_phone = normalize_ranksitt_phone(phone)
        masked = mask_phone_ranksitt(norm_phone)

        # Acquire per-number lock to prevent concurrent recharges to the same number
        num_lock = await self._get_number_lock(norm_phone)
        try:
            await asyncio.wait_for(num_lock.acquire(), timeout=20.0)
        except asyncio.TimeoutError:
            job.status = "error"
            job.stage = "busy"
            job.reason = "busy"
            job.duration_ms = int((time.monotonic() - t_start) * 1000)
            logger.warning('{"job":"%s","phone":"%s","error":"number_lock_timeout"}', job_id, masked)
            return

        try:
            # Acquire single global recharge lock
            try:
                await asyncio.wait_for(self._recharge_lock.acquire(), timeout=25.0)
            except asyncio.TimeoutError:
                job.status = "error"
                job.stage = "busy"
                job.reason = "busy"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                logger.warning('{"job":"%s","phone":"%s","error":"global_lock_timeout"}', job_id, masked)
                return

            try:
                client = await self._get_client()

                # ─── STAGE 1: login_check ──────────────────────────────────────────
                job.stage = "login_check"
                try:
                    await self._ensure_login()
                except Exception as login_exc:
                    job.status = "error"
                    job.reason = "login_failed"
                    job.duration_ms = int((time.monotonic() - t_start) * 1000)
                    logger.error('{"job":"%s","phone":"%s","error":"login_failed","reason":"%s"}', job_id, masked, type(login_exc).__name__)
                    return

                # ─── STAGE 2: search ───────────────────────────────────────────────
                job.stage = "search"
                params = {
                    "draw": "1",
                    "start": "0",
                    "length": "10",
                    "login": norm_phone,
                    "active": "true",
                }

                client_id: Optional[int] = None
                try:
                    search_resp = await client.get(RANKSITT_CLIENTS_LIST_URL, params=params)
                    if search_resp.status_code == 401:
                        # Re-authenticate once on session expiry
                        await self._ensure_login(force=True)
                        search_resp = await client.get(RANKSITT_CLIENTS_LIST_URL, params=params)

                    if search_resp.status_code != 200:
                        job.status = "error"
                        job.reason = "site_unavailable"
                        job.duration_ms = int((time.monotonic() - t_start) * 1000)
                        return

                    rows = search_resp.json().get("data", [])
                    exact_matches = [r for r in rows if r.get("login") == norm_phone]

                    if len(exact_matches) == 0:
                        # Check if client exists as inactive
                        chk_params = {
                            "draw": "1",
                            "start": "0",
                            "length": "10",
                            "login": norm_phone,
                            "active": "",
                        }
                        chk_resp = await client.get(RANKSITT_CLIENTS_LIST_URL, params=chk_params)
                        chk_rows = chk_resp.json().get("data", []) if chk_resp.status_code == 200 else []
                        chk_matches = [r for r in chk_rows if r.get("login") == norm_phone]

                        if chk_matches and not chk_matches[0].get("active", True):
                            job.status = "error"
                            job.reason = "inactive_client"
                        else:
                            job.status = "error"
                            job.reason = "phone_not_found"

                        job.duration_ms = int((time.monotonic() - t_start) * 1000)
                        return

                    if len(exact_matches) > 1:
                        job.status = "error"
                        job.reason = "ambiguous_phone"
                        job.duration_ms = int((time.monotonic() - t_start) * 1000)
                        return

                    client_id = exact_matches[0].get("id")
                    if not client_id:
                        job.status = "error"
                        job.reason = "phone_not_found"
                        job.duration_ms = int((time.monotonic() - t_start) * 1000)
                        return

                except Exception as search_exc:
                    job.status = "error"
                    job.reason = "site_unavailable"
                    job.duration_ms = int((time.monotonic() - t_start) * 1000)
                    logger.error('{"job":"%s","phone":"%s","error":"search_failed","reason":"%s"}', job_id, masked, type(search_exc).__name__)
                    return

                # ─── STAGE 3: read_before ──────────────────────────────────────────
                job.stage = "read_before"
                try:
                    det_resp = await client.get(f"{RANKSITT_CLIENT_DETAILS_URL}?id={client_id}")
                    if det_resp.status_code != 200:
                        job.status = "error"
                        job.reason = "site_unavailable"
                        job.duration_ms = int((time.monotonic() - t_start) * 1000)
                        return

                    det_json = det_resp.json()
                    job.balance_before = float(det_json.get("balance", 0.0))
                    expected = round(job.balance_before + amount, 6)
                    job.expected_after = expected

                except Exception as det_exc:
                    job.status = "error"
                    job.reason = "site_unavailable"
                    job.duration_ms = int((time.monotonic() - t_start) * 1000)
                    logger.error('{"job":"%s","phone":"%s","error":"read_before_failed","reason":"%s"}', job_id, masked, type(det_exc).__name__)
                    return

                # ─── STAGE 4: recharge (NEVER AUTO-RETRIED) ────────────────────────
                job.stage = "recharge"
                now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
                order_ref = job.idempotency_key or job.id
                description = f"Ominaz portal order {order_ref}"

                payment_payload = {
                    "clientId": client_id,
                    "clientType": 32,
                    "amount": float(amount),
                    "balance": round(expected, 6),
                    "credit": 0.0,
                    "type": "Payment",
                    "date": now_iso,
                    "addToInvoice": False,
                    "sendConfirmation": False,
                    "description": description,
                }

                recharge_error_hint = ""
                try:
                    rec_resp = await client.post(RANKSITT_ADD_PAYMENT_URL, json=payment_payload)
                    if rec_resp.status_code != 200:
                        try:
                            err_json = rec_resp.json()
                            msg = (err_json.get("Message") or err_json.get("message") or "").lower()
                            if "insufficient" in msg:
                                recharge_error_hint = "insufficient_reseller_balance"
                            elif "invalid amount" in msg:
                                recharge_error_hint = "invalid_amount"
                            else:
                                recharge_error_hint = "ranksitt_rejected"
                        except Exception:
                            recharge_error_hint = f"ranksitt_http_{rec_resp.status_code}"
                except Exception as rec_exc:
                    logger.error(
                        '{"job":"%s","phone":"%s","stage":"recharge","exception":"%s"}',
                        job_id,
                        masked,
                        type(rec_exc).__name__,
                    )
                    recharge_error_hint = "portal_network_error"

                # ─── STAGE 5: verify ───────────────────────────────────────────────
                job.stage = "verify"
                verified = False
                last_balance = None

                for attempt in range(6):
                    if attempt > 0:
                        await asyncio.sleep(1.0)
                    try:
                        chk_resp = await client.get(f"{RANKSITT_CLIENT_DETAILS_URL}?id={client_id}")
                        if chk_resp.status_code == 200:
                            chk_det = chk_resp.json()
                            last_balance = float(chk_det.get("balance", 0.0))

                            if abs((last_balance - job.balance_before) - amount) <= 0.005:
                                job.balance_after = last_balance
                                job.status = "done"
                                job.reference = f"RANKSITT-{int(time.time())}-{job_id[:6].upper()}"
                                verified = True
                                break
                            elif abs(last_balance - job.balance_before) > 0.005:
                                # Balance shifted but delta mismatch
                                job.balance_after = last_balance
                                job.status = "uncertain"
                                job.reason = "balance_mismatch"
                                verified = True
                                break
                    except Exception as chk_exc:
                        logger.warning(
                            '{"job":"%s","stage":"verify_check_failed","attempt":%d,"reason":"%s"}',
                            job_id,
                            attempt,
                            type(chk_exc).__name__,
                        )

                if not verified:
                    job.balance_after = last_balance
                    if recharge_error_hint and last_balance is not None and abs(last_balance - job.balance_before) < 0.005:
                        job.status = "error"
                        job.reason = recharge_error_hint
                    else:
                        job.status = "uncertain"
                        job.reason = "unconfirmed"

                # Invalidate in-memory cache for this phone so next read is live
                self._cache.pop(norm_phone, None)

                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                logger.info(
                    '{"job":"%s","phone":"%s","stage":"%s","status":"%s","reason":"%s","ms":%d}',
                    job_id,
                    masked,
                    job.stage,
                    job.status,
                    job.reason or "",
                    job.duration_ms,
                )

            finally:
                self._recharge_lock.release()

        finally:
            num_lock.release()


# Global singleton instance
ranksitt_client = RanksIttClient()
