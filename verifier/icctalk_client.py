"""
ICC Talk Billing Client — Automated Pin Recharge Automation
Manages a persistent httpx session to search and recharge ICC Talk prepaid phone numbers.

Security & Safety Rules:
  - Credentials are hardcoded constants (per project instructions).
  - Passwords, cookies, and raw page bodies are NEVER logged.
  - Only job ID, masked phone (first 4 + last 3), stage, status, and duration (ms) are logged.
  - A single global lock serializes the critical section: search -> read_before -> recharge -> verify.
  - The recharge POST is NEVER auto-retried.
"""

from __future__ import annotations

import asyncio
from decimal import Decimal, ROUND_HALF_UP
import logging
import re
import time
from typing import Optional
from urllib.parse import urljoin

import httpx

logger = logging.getLogger("verifier.icctalk")

# ─── ICC Talk Constants (Hardcoded per project requirement) ───────────────────
ICCTALK_LOGIN_URL = (
    "https://icctalk.com:2020/OTTSSO/"
    "?redirect=https%3A%2F%2Ficctalk.com%2FICC%2FLogin.do"
    "&logout=https%3A%2F%2Ficctalk.com%2FICC%2FLogout.do"
    "&audience=sso&app=billing"
)
ICCTALK_RECHARGE_URL = "https://icctalk.com/ICC/pin/pinRecharge.jsp"
ICCTALK_VIEW_RECHARGE_URL = "https://icctalk.com/ICC/ViewPinRecharge.do"
ICCTALK_SUBMIT_RECHARGE_URL = "https://icctalk.com/ICC/RechargePin.do"
ICCTALK_DASHBOARD_URL = "https://icctalk.com/ICC/dashboard/dashboardLite.jsp"
ICCTALK_USERNAME = "Softcents"
ICCTALK_PASSWORD = "soft123456"

# Recharge Limits
MIN_RECHARGE = 1.0
MAX_RECHARGE = 5000.0


def normalize_icc_phone(phone: str) -> str:
    """Normalize phone to ICC Talk format: digits only; 880 prefix -> 0; 9 prefix (10 digits) -> 0."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", str(phone).strip())
    if digits.startswith("880") and len(digits) == 13:
        digits = "0" + digits[3:]
    elif len(digits) == 10 and digits.startswith("9"):
        digits = "0" + digits
    return digits


def mask_phone(phone: str) -> str:
    """Mask phone keeping first 4 and last 3 digits (e.g. 0963***441)."""
    clean = re.sub(r"\D", "", phone)
    if len(clean) <= 7:
        return clean[:2] + "***" + clean[-2:] if len(clean) >= 4 else "****"
    return clean[:4] + "***" + clean[-3:]


class RechargeJobRecord:
    """In-memory record of an ICC Talk recharge job."""
    __slots__ = (
        "id", "phone", "amount", "idempotency_key", "status", "stage",
        "reason", "balance_before", "balance_after", "expected_after",
        "reference", "duration_ms", "created_at",
    )

    def __init__(
        self,
        job_id: str,
        phone: str,
        amount: float,
        idempotency_key: Optional[str] = None,
    ) -> None:
        self.id = job_id
        self.phone = phone
        self.amount = amount
        self.idempotency_key = idempotency_key
        self.status = "pending"  # pending | done | error | uncertain
        self.stage = "queued"
        self.reason: Optional[str] = None
        self.balance_before: Optional[float] = None
        self.balance_after: Optional[float] = None
        self.expected_after: Optional[float] = None
        self.reference: Optional[str] = None
        self.duration_ms: int = 0
        self.created_at: float = time.monotonic()

    def to_dict(self) -> dict:
        data: dict = {
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


class IccTalkClient:
    """
    Manages persistent HTTP interaction with ICC Talk billing.
    """

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None
        self._login_lock = asyncio.Lock()
        self._recharge_lock = asyncio.Lock()  # Single global critical-section lock
        self._jobs: dict[str, RechargeJobRecord] = {}
        self._idempotency_map: dict[str, str] = {}  # idempotency_key -> job_id
        self._recent_attempts: list[tuple[str, float, float]] = []  # (phone, amount, timestamp)
        self._logged_in = False
        self.login_url = ICCTALK_LOGIN_URL
        self.username = ICCTALK_USERNAME
        self.password = ICCTALK_PASSWORD

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
            logger.info('{"icctalk_client":"credentials_updated"}')
            self._logged_in = False

    async def startup(self) -> None:
        """Initialize client and pre-warm login."""
        self._client = httpx.AsyncClient(
            verify=False,
            timeout=httpx.Timeout(connect=5.0, read=20.0, write=20.0, pool=10.0),
            follow_redirects=False,
        )
        logger.info('{"icctalk_client":"startup","stage":"login_prewarm"}')
        try:
            ok = await self._ensure_login()
            if ok:
                logger.info('{"icctalk_client":"startup","stage":"login_prewarm_ok"}')
            else:
                logger.warning('{"icctalk_client":"startup","stage":"login_prewarm_failed"}')
        except Exception as exc:
            logger.warning('{"icctalk_client":"startup","stage":"login_prewarm_exception","reason":"%s"}', type(exc).__name__)

    async def shutdown(self) -> None:
        """Close client."""
        if self._client:
            await self._client.aclose()
            self._client = None
            self._logged_in = False

    async def cleanup_jobs(self, ttl_seconds: int = 600) -> None:
        """Remove jobs older than 10 minutes (TTL)."""
        now = time.monotonic()
        expired_ids = [
            jid for jid, job in self._jobs.items()
            if (now - job.created_at) > ttl_seconds
        ]
        for jid in expired_ids:
            job = self._jobs.pop(jid, None)
            if job and job.idempotency_key:
                self._idempotency_map.pop(job.idempotency_key, None)

        # Also cleanup recent attempts older than 30s
        self._recent_attempts = [
            (p, a, t) for p, a, t in self._recent_attempts
            if (now - t) < 35.0
        ]

    def get_job(self, job_id: str) -> Optional[RechargeJobRecord]:
        return self._jobs.get(job_id)

    def register_job(self, job_id: str, phone: str, amount: float, idempotency_key: Optional[str]) -> tuple[RechargeJobRecord, bool]:
        """
        Check idempotency and 30s duplicate guard, register job if valid.
        Returns (job, is_existing).
        """
        now = time.monotonic()

        # Idempotency check: return existing job if key matched
        if idempotency_key and idempotency_key in self._idempotency_map:
            existing_id = self._idempotency_map[idempotency_key]
            existing_job = self._jobs.get(existing_id)
            if existing_job:
                return existing_job, True

        # Duplicate check: same phone + amount within 30 seconds
        for prev_phone, prev_amount, prev_time in self._recent_attempts:
            if prev_phone == phone and abs(prev_amount - amount) < 0.001 and (now - prev_time) < 30.0:
                job = RechargeJobRecord(job_id, phone, amount, idempotency_key)
                job.status = "error"
                job.stage = "rejected"
                job.reason = "duplicate_request"
                self._jobs[job_id] = job
                return job, False

        job = RechargeJobRecord(job_id, phone, amount, idempotency_key)
        self._jobs[job_id] = job
        if idempotency_key:
            self._idempotency_map[idempotency_key] = job_id
        self._recent_attempts.append((phone, amount, now))
        return job, False

    async def _do_login(self) -> bool:
        """
        Execute full SSO login flow:
          1. GET SSO login page
          2. POST credentials
          3. Follow redirects to dashboard/landing page
        """
        if not self._client:
            return False

        try:
            # Step 1: SSO GET
            await self._client.get(self.login_url)

            # Step 2: SSO POST
            login_data = {
                "username": self.username,
                "password": self.password,
                "rememberMe": "on",
            }
            post_url = "https://icctalk.com:2020/OTTSSO/login"
            resp = await self._client.post(
                post_url,
                data=login_data,
            )

            # Step 3: Follow 302 redirects
            curr = resp
            max_hops = 8
            while curr.status_code in (301, 302, 303, 307, 308) and max_hops > 0:
                loc = curr.headers.get("location", "")
                if not loc:
                    break
                loc = urljoin(str(curr.url), loc)
                curr = await self._client.get(loc)
                max_hops -= 1

            landing_url = str(curr.url)
            landing_text = curr.text.lower()
            if "login" in landing_url.lower() or "user name" in landing_text:
                self._logged_in = False
                return False

            self._logged_in = True
            return True
        except Exception as exc:
            logger.warning('{"icctalk_client":"login_failed","reason":"%s"}', type(exc).__name__)
            self._logged_in = False
            return False

    async def _ensure_login(self) -> bool:
        """Ensure active login session under lock."""
        async with self._login_lock:
            if self._logged_in:
                # Test liveness with lightweight GET to ViewPinRecharge
                try:
                    chk = await self._client.get(ICCTALK_VIEW_RECHARGE_URL, params={"PinBatchID": "-2"})
                    if chk.status_code == 200 and "login" not in str(chk.url).lower():
                        return True
                except Exception:
                    pass
            return await self._do_login()

    def _parse_reseller_balance(self, html: str) -> Optional[float]:
        """Extract reseller balance from header."""
        m = re.search(r"Your\s+Balance\s+is\s*:\s*([\d,.]+)\s*(BDT)?", html, re.I)
        if m:
            clean = m.group(1).replace(",", "")
            try:
                return float(clean)
            except ValueError:
                pass
        return None

    def _parse_phone_row(self, html: str, target_phone: str) -> tuple[Optional[dict], int]:
        """
        Parse table `#myTable` on result page.
        Returns (matched_row_dict, total_matching_rows).
        matched_row_dict contains: {account_id, pin_no, current_balance, credit_limit}
        """
        tbody_match = re.search(r"<table id=[\"']myTable[\"'][^>]*>.*?<tbody>(.*?)</tbody>", html, re.S | re.I)
        if not tbody_match:
            return None, 0

        tbody = tbody_match.group(1)
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tbody, re.S | re.I)
        matching = []

        clean_target = target_phone.strip()
        norm_target = normalize_icc_phone(target_phone)

        for r in rows:
            tds = re.findall(r"<td\b[^>]*>(.*?)</td>", r, re.S | re.I)
            if len(tds) < 4:
                continue

            # Cell 0 text is phone
            phone_text = re.sub(r"<[^>]+>", " ", tds[0]).strip()
            # Cell 1 text is caller ID
            caller_text = re.sub(r"<[^>]+>", " ", tds[1]).strip()

            acc_id_match = re.search(r'name=[\"\']AccountID[\"\']\s+value=[\"\']([^\"\']*)[\"\']', r, re.I)
            pin_no_match = re.search(r'name=[\"\']pinNO[\"\']\s+value=[\"\']([^\"\']*)[\"\']', r, re.I)

            account_id = acc_id_match.group(1) if acc_id_match else ""
            pin_no = pin_no_match.group(1) if pin_no_match else phone_text

            is_match = (
                clean_target in (phone_text, caller_text, pin_no) or
                (norm_target and norm_target in (
                    normalize_icc_phone(phone_text),
                    normalize_icc_phone(caller_text),
                    normalize_icc_phone(pin_no)
                ))
            )

            if is_match:
                # Current balance is in cell 3
                bal_text = re.sub(r"<[^>]+>", " ", tds[3]).strip().replace(",", "")
                try:
                    cur_bal = float(bal_text)
                except ValueError:
                    cur_bal = 0.0

                credit_text = re.sub(r"<[^>]+>", " ", tds[5]).strip().replace(",", "") if len(tds) > 5 else "0"
                try:
                    cred_lim = float(credit_text)
                except ValueError:
                    cred_lim = 0.0

                matching.append({
                    "account_id": account_id,
                    "pin_no": pin_no,
                    "current_balance": cur_bal,
                    "credit_limit": cred_lim,
                })

        if len(matching) == 1:
            return matching[0], 1
        return None, len(matching)

    async def execute_recharge(self, job_id: str) -> None:
        """
        Execute full recharge workflow inside the single global lock:
          1. login_check
          2. search
          3. read_before
          4. recharge (NO RETRY)
          5. verify
        """
        job = self._jobs.get(job_id)
        if not job:
            return

        t_start = time.monotonic()
        phone = job.phone
        amount = job.amount
        masked = mask_phone(phone)

        # Try acquiring single global recharge lock (max wait 20s)
        try:
            await asyncio.wait_for(self._recharge_lock.acquire(), timeout=20.0)
        except asyncio.TimeoutError:
            job.status = "error"
            job.stage = "busy"
            job.reason = "busy"
            job.duration_ms = int((time.monotonic() - t_start) * 1000)
            logger.warning('{"job":"%s","phone":"%s","stage":"busy","status":"error","ms":%d}', job_id, masked, job.duration_ms)
            return

        try:
            # ─── STAGE 1: login_check ──────────────────────────────────────────
            job.stage = "login_check"
            logger.info('{"job":"%s","phone":"%s","stage":"login_check","status":"running"}', job_id, masked)
            ok = await self._ensure_login()
            if not ok:
                job.status = "error"
                job.reason = "login_failed"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                logger.error('{"job":"%s","phone":"%s","stage":"login_check","status":"error","reason":"login_failed","ms":%d}', job_id, masked, job.duration_ms)
                return

            # ─── STAGE 2: search ──────────────────────────────────────────────
            job.stage = "search"
            logger.info('{"job":"%s","phone":"%s","stage":"search","status":"running"}', job_id, masked)
            norm_phone = normalize_icc_phone(phone)
            search_phone = norm_phone or phone

            search_data = {
                "clCustomerID": search_phone,
                "cdCustomerName": "",
                "ciCallerIDCode": "",
                "RECORDS_PER_PAGE": "200",
                "search": "yes",
                "PinBatchID": "-2",
            }

            try:
                search_resp = await self._client.post(ICCTALK_VIEW_RECHARGE_URL, data=search_data)
            except Exception as exc:
                job.status = "error"
                job.reason = "site_unavailable"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                logger.error('{"job":"%s","phone":"%s","stage":"search","status":"error","reason":"site_unavailable","ms":%d}', job_id, masked, job.duration_ms)
                return

            if search_resp.status_code in (301, 302, 303, 307, 308) and "pinRecharge" in search_resp.headers.get("location", ""):
                try:
                    search_resp = await self._client.get("https://icctalk.com" + search_resp.headers["location"])
                except Exception:
                    job.status = "error"
                    job.reason = "site_unavailable"
                    job.duration_ms = int((time.monotonic() - t_start) * 1000)
                    return
            if search_resp.status_code != 200:
                logger.error('{"job":"%s","stage":"search","http":%d,"location":"%s"}', job_id, search_resp.status_code, search_resp.headers.get("location", ""))
                job.status = "error"
                job.reason = "site_unavailable"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                return

            search_html = search_resp.text
            row_data, count = self._parse_phone_row(search_html, search_phone)

            # Fallback search: if 0 rows matched, try alternative phone format (e.g. 880 prefix or raw)
            if count == 0:
                alt_phone = ""
                if search_phone.startswith("0") and len(search_phone) == 11:
                    alt_phone = "880" + search_phone[1:]
                elif search_phone.startswith("880") and len(search_phone) == 13:
                    alt_phone = "0" + search_phone[3:]
                elif phone != search_phone:
                    alt_phone = phone

                if alt_phone:
                    search_data["clCustomerID"] = alt_phone
                    try:
                        fb_resp = await self._client.post(ICCTALK_VIEW_RECHARGE_URL, data=search_data)
                        if fb_resp.status_code == 200:
                            fb_row_data, fb_count = self._parse_phone_row(fb_resp.text, search_phone)
                            if fb_count == 1:
                                row_data = fb_row_data
                                count = fb_count
                                search_html = fb_resp.text
                    except Exception:
                        pass

            # ─── STAGE 3: read_before ─────────────────────────────────────────
            job.stage = "read_before"
            if count == 0 or not row_data:
                job.status = "error"
                job.reason = "phone_not_found"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                logger.warning('{"job":"%s","phone":"%s","stage":"read_before","status":"error","reason":"phone_not_found","ms":%d}', job_id, masked, job.duration_ms)
                return
            elif count > 1:
                job.status = "error"
                job.reason = "ambiguous_phone"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                logger.warning('{"job":"%s","phone":"%s","stage":"read_before","status":"error","reason":"ambiguous_phone","ms":%d}', job_id, masked, job.duration_ms)
                return

            job.balance_before = row_data["current_balance"]
            account_id = row_data["account_id"]
            pin_no = row_data["pin_no"]
            expected = round(job.balance_before + amount, 2)
            job.expected_after = expected

            # Check reseller balance in header
            reseller_bal = self._parse_reseller_balance(search_html)
            if reseller_bal is not None and reseller_bal < amount:
                job.status = "error"
                job.reason = "insufficient_reseller_balance"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                logger.warning('{"job":"%s","phone":"%s","stage":"read_before","status":"error","reason":"insufficient_reseller_balance","ms":%d}', job_id, masked, job.duration_ms)
                return

            # ─── STAGE 4: recharge (NEVER AUTO-RETRIED) ────────────────────────
            job.stage = "recharge"
            logger.info('{"job":"%s","phone":"%s","stage":"recharge","status":"submitting","amount":%.2f}', job_id, masked, amount)

            amount_str = f"{Decimal(str(amount)):.2f}"
            recharge_payload = {
                "AccountID": account_id,
                "pinNO": pin_no,
                "RechargeAmount": amount_str,
                "CreditAmount": "0",
                "PackageID": "-1",
                "RechargeDescription": "Waiver",
                "B2": "Recharge",
                "PinBatchID": "-2",
            }

            recharge_posted = False
            recharge_error_hint = ""
            try:
                rec_resp = await self._client.post(
                    ICCTALK_SUBMIT_RECHARGE_URL,
                    data=recharge_payload,
                    follow_redirects=True,
                )
                recharge_posted = True
                rec_body = rec_resp.text.lower()
                if "insufficient balance" in rec_body:
                    recharge_error_hint = "insufficient_reseller_balance"
                elif "invalid amount" in rec_body:
                    recharge_error_hint = "invalid_amount"
                elif "error" in rec_body and "recharge failed" in rec_body:
                    recharge_error_hint = "icc_rejected"
            except Exception as exc:
                # Network glitch / timeout after or during send: DO NOT RETRY POST!
                logger.error('{"job":"%s","phone":"%s","stage":"recharge","exception":"%s"}', job_id, masked, type(exc).__name__)
                recharge_posted = True  # Must proceed to verify

            # ─── STAGE 5: verify ──────────────────────────────────────────────
            job.stage = "verify"
            logger.info('{"job":"%s","phone":"%s","stage":"verify","status":"verifying"}', job_id, masked)

            # Verification loop: check up to 4 attempts (initial + 3 retries with 700ms sleep)
            verified = False
            last_balance: Optional[float] = None

            for attempt in range(4):
                if attempt > 0:
                    await asyncio.sleep(0.700)

                try:
                    chk_resp = await self._client.post(ICCTALK_VIEW_RECHARGE_URL, data=search_data)
                    if chk_resp.status_code == 200:
                        vrow, vcount = self._parse_phone_row(chk_resp.text, phone)
                        if vrow and vcount == 1:
                            last_balance = vrow["current_balance"]
                            # Check with 0.005 tolerance
                            diff = abs(last_balance - expected)
                            if diff <= 0.005:
                                job.balance_after = last_balance
                                job.status = "done"
                                job.reference = f"ICC-{int(time.time())}-{job_id[:6].upper()}"
                                verified = True
                                break
                            elif abs(last_balance - job.balance_before) > 0.005:
                                # Balance changed, but not by expected amount!
                                job.balance_after = last_balance
                                job.status = "uncertain"
                                job.reason = "balance_mismatch"
                                verified = True
                                break
                except Exception as chk_exc:
                    logger.warning('{"job":"%s","stage":"verify_check_failed","attempt":%d,"reason":"%s"}', job_id, attempt, type(chk_exc).__name__)

            if not verified:
                job.balance_after = last_balance
                if recharge_error_hint and last_balance == job.balance_before:
                    job.status = "error"
                    job.reason = recharge_error_hint
                else:
                    # Outcome could not be confirmed: mark uncertain
                    job.status = "uncertain"
                    job.reason = "unconfirmed"

            job.duration_ms = int((time.monotonic() - t_start) * 1000)
            logger.info(
                '{"job":"%s","phone":"%s","stage":"%s","status":"%s","reason":"%s","ms":%d}',
                job_id, masked, job.stage, job.status, job.reason or "", job.duration_ms,
            )

        finally:
            self._recharge_lock.release()


# Shared singleton instance
icctalk_client = IccTalkClient()
