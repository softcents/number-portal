"""
ICON Billing Client -- Automated Pin/Wallet Recharge Automation
Manages a persistent httpx session to search and recharge ICON prepaid phone numbers
via the ICON OTT SSO billing portal (sip.italk.com.bd:2020).

Portal Navigation Flow:
  Login -> Client -> Manage Pin -> Recharge -> Search number -> Enter amount -> Submit

Security & Safety Rules:
  - Credentials are configurable at runtime via set_credentials().
  - Passwords, cookies, and raw page bodies are NEVER logged.
  - Only job ID, masked phone (first 4 + last 3), stage, status, and duration (ms) are logged.
  - A single global lock serializes the critical section: search -> read_before -> recharge -> verify.
  - The recharge POST is NEVER auto-retried.
"""

from __future__ import annotations

import asyncio
from decimal import Decimal
import logging
import re
import time
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx

logger = logging.getLogger("verifier.icon_billing")

# --- ICON Billing Portal Constants ---
ICON_BILLING_LOGIN_URL = (
    "https://sip.italk.com.bd:2020/OTTSSO/"
    "?redirect=https%3A%2F%2Fsip.italk.com.bd%2Ficoniptsp%2FLogin.do"
    "&logout=https%3A%2F%2Fsip.italk.com.bd%2Ficoniptsp%2FLogout.do"
    "&audience=sso&app=billing"
)
ICON_BILLING_SSO_POST_URL = "https://sip.italk.com.bd:2020/OTTSSO/login"
ICON_BILLING_DASHBOARD_URL = "https://sip.italk.com.bd/iconiptsp/dashboard/dashboardLite.jsp"
ICON_BILLING_VIEW_RECHARGE_URL = "https://sip.italk.com.bd/iconiptsp/ViewPinRecharge.do"
ICON_BILLING_SUBMIT_RECHARGE_URL = "https://sip.italk.com.bd/iconiptsp/RechargePin.do"

# Default credentials (overridden at runtime from DB)
ICON_BILLING_USERNAME = "Softcents_Systems"
ICON_BILLING_PASSWORD = "SoFTCeNt@1971"

# Recharge limits
ICON_MIN_RECHARGE = 1.0
ICON_MAX_RECHARGE = 5000.0


def normalize_icon_phone(phone: str) -> str:
    if not phone:
        return ""
    digits = re.sub(r"\D", "", str(phone).strip())
    if digits.startswith("880") and len(digits) == 13:
        digits = "0" + digits[3:]
    elif len(digits) == 10 and digits.startswith("9"):
        digits = "0" + digits
    return digits


def mask_phone_icon(phone: str) -> str:
    clean = re.sub(r"\D", "", phone)
    if len(clean) <= 7:
        return clean[:2] + "***" + clean[-2:] if len(clean) >= 4 else "****"
    return clean[:4] + "***" + clean[-3:]


class IconBillingJobRecord:
    __slots__ = (
        "id", "phone", "amount", "idempotency_key", "status", "stage",
        "reason", "balance_before", "balance_after", "expected_after",
        "reference", "duration_ms", "created_at",
    )

    def __init__(self, job_id, phone, amount, idempotency_key=None):
        self.id = job_id
        self.phone = phone
        self.amount = amount
        self.idempotency_key = idempotency_key
        self.status = "pending"
        self.stage = "queued"
        self.reason = None
        self.balance_before = None
        self.balance_after = None
        self.expected_after = None
        self.reference = None
        self.duration_ms = 0
        self.created_at = time.monotonic()

    def to_dict(self):
        data = {
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


class IconBillingClient:
    def __init__(self):
        self._client = None
        self._login_lock = asyncio.Lock()
        self._recharge_lock = asyncio.Lock()
        self._jobs = {}
        self._idempotency_map = {}
        self._recent_attempts = []
        self._logged_in = False
        self.login_url = ICON_BILLING_LOGIN_URL
        self.sso_post_url = ICON_BILLING_SSO_POST_URL
        self.username = ICON_BILLING_USERNAME
        self.password = ICON_BILLING_PASSWORD

    def set_credentials(self, username=None, password=None, login_url=None):
        changed = False
        if username and username.strip() and username.strip() != self.username:
            self.username = username.strip()
            changed = True
        if password and password.strip() and password.strip() != self.password:
            self.password = password.strip()
            changed = True
        if login_url and login_url.strip() and login_url.strip() != self.login_url:
            self.login_url = login_url.strip()
            p = urlparse(self.login_url)
            if p.scheme and p.netloc:
                self.sso_post_url = f"{p.scheme}://{p.netloc}/OTTSSO/login"
            changed = True
        if changed:
            logger.info('{\"icon_billing_client\":\"credentials_updated\"}')
            self._logged_in = False

    async def startup(self):
        self._client = httpx.AsyncClient(
            verify=False,
            timeout=httpx.Timeout(connect=8.0, read=25.0, write=25.0, pool=10.0),
            follow_redirects=False,
        )
        logger.info('{\"icon_billing_client\":\"startup\",\"stage\":\"login_prewarm\"}')
        try:
            ok = await self._ensure_login()
            if ok:
                logger.info('{\"icon_billing_client\":\"startup\",\"stage\":\"login_prewarm_ok\"}')
            else:
                logger.warning('{\"icon_billing_client\":\"startup\",\"stage\":\"login_prewarm_failed\"}')
        except Exception as exc:
            logger.warning('{\"icon_billing_client\":\"startup\",\"stage\":\"login_prewarm_exception\",\"reason\":\"%s\"}', type(exc).__name__)

    async def shutdown(self):
        if self._client:
            await self._client.aclose()
            self._client = None
            self._logged_in = False

    async def cleanup_jobs(self, ttl_seconds=600):
        now = time.monotonic()
        expired_ids = [jid for jid, job in self._jobs.items() if (now - job.created_at) > ttl_seconds]
        for jid in expired_ids:
            job = self._jobs.pop(jid, None)
            if job and job.idempotency_key:
                self._idempotency_map.pop(job.idempotency_key, None)
        self._recent_attempts = [(p, a, t) for p, a, t in self._recent_attempts if (now - t) < 35.0]

    def get_job(self, job_id):
        return self._jobs.get(job_id)

    def register_job(self, job_id, phone, amount, idempotency_key):
        now = time.monotonic()
        if idempotency_key and idempotency_key in self._idempotency_map:
            existing_id = self._idempotency_map[idempotency_key]
            existing_job = self._jobs.get(existing_id)
            if existing_job:
                return existing_job, True
        for prev_phone, prev_amount, prev_time in self._recent_attempts:
            if prev_phone == phone and abs(prev_amount - amount) < 0.001 and (now - prev_time) < 30.0:
                job = IconBillingJobRecord(job_id, phone, amount, idempotency_key)
                job.status = "error"
                job.stage = "rejected"
                job.reason = "duplicate_request"
                self._jobs[job_id] = job
                return job, False
        job = IconBillingJobRecord(job_id, phone, amount, idempotency_key)
        self._jobs[job_id] = job
        if idempotency_key:
            self._idempotency_map[idempotency_key] = job_id
        self._recent_attempts.append((phone, amount, now))
        return job, False

    async def _do_login(self):
        if not self._client:
            return False
        try:
            await self._client.get(self.login_url)
            login_data = {"username": self.username, "password": self.password, "rememberMe": "on"}
            resp = await self._client.post(self.sso_post_url, data=login_data)
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
            logger.info('{\"icon_billing_login\":\"ok\"}')
            return True
        except Exception as exc:
            logger.warning('{\"icon_billing_client\":\"login_failed\",\"reason\":\"%s\"}', type(exc).__name__)
            self._logged_in = False
            return False

    async def _ensure_login(self):
        async with self._login_lock:
            if self._logged_in:
                try:
                    chk = await self._client.get(ICON_BILLING_VIEW_RECHARGE_URL, params={"PinBatchID": "-2"})
                    if chk.status_code == 200 and "login" not in str(chk.url).lower():
                        return True
                except Exception:
                    pass
            return await self._do_login()

    def _parse_reseller_balance(self, html):
        m = re.search(r"Your\s+Balance\s+is\s*:\s*([\d,.]+)\s*(BDT)?", html, re.I)
        if m:
            clean = m.group(1).replace(",", "")
            try:
                return float(clean)
            except ValueError:
                pass
        return None

    def _parse_phone_row(self, html, target_phone):
        tbody_match = re.search(r"<table id=[\"']myTable[\"'][^>]*>.*?<tbody>(.*?)</tbody>", html, re.S | re.I)
        if not tbody_match:
            return None, 0
        tbody = tbody_match.group(1)
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tbody, re.S | re.I)
        matching = []
        clean_target = target_phone.strip()
        norm_target = normalize_icon_phone(target_phone)
        for r in rows:
            tds = re.findall(r"<td\b[^>]*>(.*?)</td>", r, re.S | re.I)
            if len(tds) < 4:
                continue
            phone_text = re.sub(r"<[^>]+>", " ", tds[0]).strip()
            caller_text = re.sub(r"<[^>]+>", " ", tds[1]).strip()
            acc_id_match = re.search(r'name=["\']AccountID["\'] value=["\']([^"\']*)["\']', r, re.I)
            pin_no_match = re.search(r'name=["\']pinNO["\'] value=["\']([^"\']*)["\']', r, re.I)
            account_id = acc_id_match.group(1) if acc_id_match else ""
            pin_no = pin_no_match.group(1) if pin_no_match else phone_text
            is_match = clean_target in (phone_text, caller_text, pin_no) or (
                norm_target and norm_target in (normalize_icon_phone(phone_text), normalize_icon_phone(caller_text), normalize_icon_phone(pin_no))
            )
            if is_match:
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
                matching.append({"account_id": account_id, "pin_no": pin_no, "current_balance": cur_bal, "credit_limit": cred_lim})
        if len(matching) == 1:
            return matching[0], 1
        return None, len(matching)

    async def execute_recharge(self, job_id):
        job = self._jobs.get(job_id)
        if not job:
            return
        t_start = time.monotonic()
        phone = job.phone
        amount = job.amount
        masked = mask_phone_icon(phone)
        try:
            await asyncio.wait_for(self._recharge_lock.acquire(), timeout=20.0)
        except asyncio.TimeoutError:
            job.status = "error"
            job.stage = "busy"
            job.reason = "busy"
            job.duration_ms = int((time.monotonic() - t_start) * 1000)
            return
        try:
            job.stage = "login_check"
            ok = await self._ensure_login()
            if not ok:
                job.status = "error"
                job.reason = "login_failed"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                return
            job.stage = "search"
            norm_phone = normalize_icon_phone(phone)
            search_phone = norm_phone or phone
            search_data = {"clCustomerID": search_phone, "cdCustomerName": "", "ciCallerIDCode": "", "RECORDS_PER_PAGE": "200", "search": "yes", "PinBatchID": "-2"}
            try:
                search_resp = await self._client.post(ICON_BILLING_VIEW_RECHARGE_URL, data=search_data)
            except Exception:
                job.status = "error"
                job.reason = "site_unavailable"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                return
            _loc = search_resp.headers.get("location", "")
            if search_resp.status_code in (301, 302, 303, 307, 308) and "pinRecharge" in _loc:
                try:
                    _url = _loc if _loc.startswith("http") else "https://sip.italk.com.bd" + _loc
                    search_resp = await self._client.get(_url)
                except Exception:
                    job.status = "error"
                    job.reason = "site_unavailable"
                    return
            if search_resp.status_code in (301, 302, 303, 307, 308):
                self._logged_in = False
                relogin_ok = await self._ensure_login()
                if relogin_ok:
                    try:
                        search_resp = await self._client.post(ICON_BILLING_VIEW_RECHARGE_URL, data=search_data)
                    except Exception:
                        job.status = "error"
                        job.reason = "site_unavailable"
                        job.duration_ms = int((time.monotonic() - t_start) * 1000)
                        return
            if search_resp.status_code != 200:
                job.status = "error"
                job.reason = "site_unavailable"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                return
            search_html = search_resp.text
            row_data, count = self._parse_phone_row(search_html, search_phone)
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
                        fb_resp = await self._client.post(ICON_BILLING_VIEW_RECHARGE_URL, data=search_data)
                        if fb_resp.status_code == 200:
                            fb_row_data, fb_count = self._parse_phone_row(fb_resp.text, search_phone)
                            if fb_count == 1:
                                row_data = fb_row_data
                                count = fb_count
                                search_html = fb_resp.text
                    except Exception:
                        pass
            job.stage = "read_before"
            if count == 0 or not row_data:
                job.status = "error"
                job.reason = "phone_not_found"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                return
            elif count > 1:
                job.status = "error"
                job.reason = "ambiguous_phone"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                return
            job.balance_before = row_data["current_balance"]
            account_id = row_data["account_id"]
            pin_no = row_data["pin_no"]
            expected = round(job.balance_before + amount, 2)
            job.expected_after = expected
            reseller_bal = self._parse_reseller_balance(search_html)
            if reseller_bal is not None and reseller_bal < amount:
                job.status = "error"
                job.reason = "insufficient_reseller_balance"
                job.duration_ms = int((time.monotonic() - t_start) * 1000)
                return
            job.stage = "recharge"
            amount_str = f"{Decimal(str(amount)):.2f}"
            recharge_payload = {"AccountID": account_id, "pinNO": pin_no, "RechargeAmount": amount_str, "CreditAmount": "0", "PackageID": "-1", "RechargeDescription": "Waiver", "B2": "Recharge", "PinBatchID": "-2"}
            recharge_error_hint = ""
            try:
                rec_resp = await self._client.post(ICON_BILLING_SUBMIT_RECHARGE_URL, data=recharge_payload, follow_redirects=True)
                rec_body = rec_resp.text.lower()
                if "insufficient balance" in rec_body:
                    recharge_error_hint = "insufficient_reseller_balance"
                elif "invalid amount" in rec_body:
                    recharge_error_hint = "invalid_amount"
                elif "error" in rec_body and "recharge failed" in rec_body:
                    recharge_error_hint = "icon_rejected"
            except Exception as exc:
                logger.error('{\"job\":\"%s\",\"phone\":\"%s\",\"stage\":\"recharge\",\"exception\":\"%s\"}', job_id, masked, type(exc).__name__)
            job.stage = "verify"
            search_data["clCustomerID"] = search_phone
            verified = False
            last_balance = None
            for attempt in range(8):
                if attempt > 0:
                    await asyncio.sleep(1.0)
                try:
                    chk_resp = await self._client.post(ICON_BILLING_VIEW_RECHARGE_URL, data=search_data)
                    _chk_loc = chk_resp.headers.get("location", "")
                    if chk_resp.status_code in (301, 302, 303, 307, 308) and "pinRecharge" in _chk_loc:
                        _chk_url = _chk_loc if _chk_loc.startswith("http") else "https://sip.italk.com.bd" + _chk_loc
                        chk_resp = await self._client.get(_chk_url)
                    if chk_resp.status_code == 200:
                        vrow, vcount = self._parse_phone_row(chk_resp.text, phone)
                        if vrow and vcount == 1:
                            last_balance = vrow["current_balance"]
                            if abs(last_balance - expected) <= 0.005:
                                job.balance_after = last_balance
                                job.status = "done"
                                job.reference = f"ICON-{int(time.time())}-{job_id[:6].upper()}"
                                verified = True
                                break
                            elif abs(last_balance - job.balance_before) > 0.005:
                                job.balance_after = last_balance
                                job.status = "uncertain"
                                job.reason = "balance_mismatch"
                                verified = True
                                break
                except Exception as chk_exc:
                    logger.warning('{\"job\":\"%s\",\"stage\":\"verify_check_failed\",\"attempt\":%d,\"reason\":\"%s\"}', job_id, attempt, type(chk_exc).__name__)
            if not verified:
                job.balance_after = last_balance
                if recharge_error_hint and last_balance == job.balance_before:
                    job.status = "error"
                    job.reason = recharge_error_hint
                else:
                    job.status = "uncertain"
                    job.reason = "unconfirmed"
            job.duration_ms = int((time.monotonic() - t_start) * 1000)
            logger.info('{\"job\":\"%s\",\"phone\":\"%s\",\"stage\":\"%s\",\"status\":\"%s\",\"reason\":\"%s\",\"ms\":%d}', job_id, masked, job.stage, job.status, job.reason or "", job.duration_ms)
        finally:
            self._recharge_lock.release()


# Shared singleton instance
icon_billing_client = IconBillingClient()
