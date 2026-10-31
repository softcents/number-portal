# 🛡️ Multi-Software VPS Safety & aaPanel Operation Guidelines
**নাম্বার পোর্টাল ও মাল্টি-সফটওয়্যার সার্ভার অপারেশন নির্দেশিকা**

---

## ⚠️ CRITICAL WARNING / সতর্কবার্তা
এই VPS সার্ভারে **Number Portal** ছাড়াও একাধিক লাইভ সফটওয়্যার ও প্রোডাকশন প্রজেক্ট চলছে:
1. **Central Account (`account.softcents.com`)**: Next.js & NestJS Application on Ports `3000` & `4000`.
2. **SMS Aggregator (`smsagri.softcents.com`)**: Go Microservices Suite on Ports `8080`, `8081`, `8082`, `8083`.
3. **Database Servers**: Shared PostgreSQL on `5432` and MariaDB on `3306`.
4. **aaPanel Web System**: Control Panel on Port `7788`.

সার্ভারে কোনো কাজ বা ডিপ্লয়মেন্ট করার সময় **কখনোই কোনো গ্লোবাল কিল (`pkill node`, `killall`) বা গ্লোবাল কনফিগ পরিবর্তন করা যাবে না**, যাতে অন্য কোনো সফটওয়্যারের কোনো ক্ষতি বা ডাউনটাইম না ঘটে।

---

## 📌 ১. প্রজেক্ট ও পোর্ট আইসোলেশন চার্ট (Port Isolation Matrix)

| Software / Project | Tech Stack | Port(s) | Directory Path | Isolation Rule |
|---|---|---|---|---|
| **Number Portal (API)** | NestJS 10 | `5000` | `/www/wwwroot/number-portal.softcents.com/backend` | **শুধু এই পোর্টের প্রসেস রিস্টার্ট হবে** |
| **Number Portal (Web)** | Next.js 16 | `3001` | `/www/wwwroot/number-portal.softcents.com` | **শুধু এই পোর্টের প্রসেস রিস্টার্ট হবে** |
| **Central Account Web** | Next.js 14 | `3000` | `/www/wwwroot/account.softcents.com/apps/web` | **🚫 কোনোভাবেই স্পর্শ করা যাবে না** |
| **Central Account API** | NestJS | `4000` | `/www/wwwroot/account.softcents.com/apps/api` | **🚫 কোনোভাবেই স্পর্শ করা যাবে না** |
| **SMS Agri Orchestrator** | Go Binary | `8080` | `/www/wwwroot/smsagri.softcents.com` | **🚫 কোনোভাবেই স্পর্শ করা যাবে না** |
| **SMS Agri Superman API** | Go Binary | `8081` | `/www/wwwroot/smsagri.softcents.com/superman-api` | **🚫 কোনোভাবেই স্পর্শ করা যাবে না** |
| **SMS Agri Customer API** | Go Binary | `8082` | `/www/wwwroot/smsagri.softcents.com/customer-api` | **🚫 কোনোভাবেই স্পর্শ করা যাবে না** |
| **SMS Agri SP API** | Go Binary | `8083` | `/www/wwwroot/smsagri.softcents.com/sp-api` | **🚫 কোনোভাবেই স্পর্শ করা যাবে না** |
| **PostgreSQL Database** | PostgreSQL 15 | `5432` | Shared Engine | **শুধুমাত্র `noportal_sc` ডাটাবেজ ব্যবহার করবে** |
| **aaPanel Web Control** | Python/Nginx | `7788` | `/www/server/panel` | সিস্টেম কনফিগারেশন সুরক্ষিত |

---

## 🚫 ২. কঠোরভাবে নিষিদ্ধ কাজসমূহ (STRICT PROHIBITIONS)

1. **🚫 `pkill -f node` বা `killall node` চালানো যাবে না:**
   সার্ভারে সেন্ট্রাল অ্যাকাউন্টের নোড ও নেক্সটজেএস প্রসেস চলছে। গ্লোবাল নোড কিল দিলে সেন্ট্রাল অ্যাকাউন্ট ডাউন হয়ে যাবে।
2. **🚫 অন্য প্রজেক্ট ডিরেক্টরি স্পর্শ করা যাবে না:**
   `/www/wwwroot/account.softcents.com` অথবা `/www/wwwroot/smsagri.softcents.com` ফোল্ডারে কোনো ফাইল পরিবর্তন বা ডিলিট করা সম্পূর্ণ নিষিদ্ধ।
3. **🚫 গ্লোবাল Nginx মেইন কনফিগ পরিবর্তন নিষিদ্ধ:**
   মেইন কনফিগ `/www/server/nginx/conf/nginx.conf` পরিবর্তন করা যাবে না। প্রতিটি সাইটের নিজস্ব vhost কনফিগ ফাইল আলাদাভাবে ব্যবহৃত হবে।
4. **🚫 ডাটাবেজ ড্রপ বা ফ্লাশ করা নিষিদ্ধ:**
   `DROP DATABASE`, `FLUSHALL` (Redis) কমান্ড সম্পূর্ণ নিষিদ্ধ। অন্যান্য প্রজেক্টের লাইভ ডাটা ধ্বংস হয়ে যেতে পারে।
5. **🚫 সার্ভার রিবুট (Reboot) দেওয়া যাবে না:**
   সার্ভার রিবুট দিলে অন্যান্য সব সফটওয়্যার একই সাথে ডাউন হয়ে যাবে।

---

## ✅ ৩. নাম্বার পোর্টাল নিরাপদভাবে রিস্টার্ট করার নিয়ম (SAFE RESTART)

### ক. aaPanel ড্যাশবোর্ড থেকে (Best & Recommended):
1. **aaPanel** এ লগইন করুন (`http://<SERVER_IP>:7788`).
2. **Website** > **Node project** মেনুতে যান।
3. `number-portal.softcents.com` প্রজেক্টের ডানপাশে **Restart** বাটন চাপুন।

### খ. কমান্ড লাইন / টার্মিনাল থেকে নিরাপদ রিস্টার্ট:
```bash
# শুধুমাত্র পোর্ট ৩০০০ ও ৫০০০ বাদে পোর্ট ৩০০১ ও ৫০০০ বন্ধ করা:
fuser -k 3001/tcp 5000/tcp

# ব্যাকগ্রাউন্ডে Node প্রজেক্ট চালু করা:
cd /www/wwwroot/number-portal.softcents.com
nohup /www/server/nodejs/v26.13.0/bin/npm run start >> /www/wwwlogs/nodejs/number-portal.softcents.com.log 2>&1 &
```

---

## 🔄 ৪. গিট আপডেট ও সিঙ্ক নিয়ম (Git Workflow)

```bash
cd /www/wwwroot/number-portal.softcents.com
./scripts/git-push.sh "আপনার আপডেট নোট"
```

---

## 🔒 ৫. ফাইল পারমিশন সতর্কতা (Permissions)
aaPanel ওয়েব সার্ভার `www:www` ইউজার দ্বারা পরিচালিত:
```bash
chown -R www:www /www/wwwroot/number-portal.softcents.com
chmod -R 775 /www/wwwroot/number-portal.softcents.com
```
