# برنامهٔ پیاده‌سازی MVP پلتفرم مادر تعاون‌آفرینی برای Sonnet 5

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **برای عامل اجرایی:** این سند برای یک عامل «کارگر» نوشته شده است: حق بازطراحی دامنه، حذف تسک، ادغام خودسرانهٔ تسک‌ها یا عبور از Gate را ندارد. هر تسک فقط پس از تأیید Review تسک قبلی اجرا می‌شود.

**هدف:** تبدیل نمونهٔ نمایشی `tMessenger` به MVP واقعی، قابل Deploy و قابل آزمون پلتفرم مادر تعاون‌آفرینی برای ۲۰٬۰۰۰ عضو و ۴٬۰۰۰ تا ۵٬۰۰۰ کاربر فعال روزانه.

**معماری:** رابط فارسی PWA در Next.js، یک API ماژولار Fastify، worker صف، PostgreSQL، Redis و ذخیره‌سازی S3-compatible. سامانه در MVP یک modular monolith است و مرزهای دامنه، قرارداد REST، event/outbox و adapterهای provider از ابتدا صریح می‌مانند.

**فناوری:** Node.js 24 LTS، Next.js 16.2.11، React 19.2، TypeScript، Fastify 5، Prisma 7، PostgreSQL 16، Redis 7، BullMQ 5، Socket.IO 4، Zod 4، Vitest، Playwright و Docker Compose.

**سند مبنا:** `../../../../outputs/taavonafarin-master-platform-architecture-v3.md`

**مخزن هدف:** `work/tMessenger`

**خط مبنای ثبت‌شده در ۱۴۰۵/۰۶/۱۱:** `npm run lint` و `npm run build` روی Next.js 14.2.35 بدون خطا اجرا شده‌اند؛ پروژه در حال حاضر دادهٔ seed و state حافظه‌ای دارد و backend، database، auth و test runner واقعی ندارد.

---

## ۱. تعریف محصول MVP

MVP زمانی قابل پذیرش است که یک کاربر بتواند با شمارهٔ موبایل وارد شود، پروفایل بسازد، زیربستر عمومی ایجاد کند، کارت آگاهی منتشر کند، در thread عمومی مشارکت کند، کارت عملیاتی را رزرو و در چرخهٔ استفاده حرکت دهد، چت خصوصی داشته باشد و محتوای نامناسب را گزارش کند. مدیر رسیدگی باید پرونده را ببیند، توضیح بخواهد و تصمیم ثبت کند. AI باید ایجاد بستر و کارت را هدایت کند، اما قطع AI نباید مسیر اصلی را از کار بیندازد.

### ۱.۱ در دامنهٔ MVP

- ورود OTP برای همه و session امن؛
- پذیرش شماره‌های E.164 ایران و کشورهای همسایه، با رابط فارسی و بدون age gate؛
- username، نام، avatar، bio و انتخاب عمومی‌بودن شماره؛
- bootstrap امن مدیر کل برای `+989191953219`؛
- MFA، RBAC، audit و تأیید دوم برای عملیات برگشت‌ناپذیر؛
- ساخت آزاد زیربستر عمومی و پیشنهاد زیربستر مشابه؛
- هدایت AI بر اساس معیارهای تعاون‌آفرینی، بدون امتیازدهی تقوا به انسان؛
- کارت آگاهی، نظر عمومی، رزرو و چرخهٔ منبع قابل‌بازگشت؛
- گفت‌وگوی خصوصی با عدم افشای خودکار شماره و هویت رسمی؛
- گزارش بستر، کارت، نظر، پیام و پروفایل؛
- تشخیص گزارش تکراری/هماهنگ؛
- تعلیق موقت، SLA چهل‌وهشت‌ساعته، آزادی خودکار مورد عادی و قرنطینهٔ خطر شدید؛
- درخواست توضیح، پاسخ کاربر و بازبینی همان مدیر؛
- dashboard پایهٔ آگاهی، سلامت بستر و صف مدیریت؛
- deploy ساده و rollback‌پذیر با Docker Compose.

### ۱.۲ خارج از دامنهٔ MVP

- پرداخت، کیف پول، بیعانه، تسویه یا ارزش انتقال‌پذیر؛
- زیربستر خصوصی؛
- رمزنگاری سرتاسری؛
- چندزبانه‌بودن رابط؛
- Site-Manager و برنامهٔ اختصاصی سطح ۳؛
- معماری توزیع‌شده یا microservice؛
- appeal مستقل چندمرحله‌ای؛
- امتیاز اجتماعی، امتیاز ایمان یا رتبه‌بندی کرامت اشخاص؛
- قرارداد حقوقی یا تعهد مالی ساخت‌یافته؛
- احراز سن عمومی.

---

## Global Constraints — قیود قطعی برای عامل Sonnet 5

1. فقط یک تسک را در هر نوبت اجرا کن.
2. پیش از هر تسک، بخش «Gate پیش از شروع» همان تسک را عیناً اجرا کن.
3. اگر Review قبلی `APPROVED` نیست، کار را متوقف و فقط دلیل را گزارش کن.
4. ابتدا تست شکست‌خورده، سپس حداقل پیاده‌سازی، سپس refactor انجام بده.
5. هیچ تستی را skip، حذف یا ضعیف نکن.
6. هیچ تصمیم دامنه‌ای را تغییر نده؛ ابهام را با `BLOCKED:` گزارش کن.
7. secret، OTP، شمارهٔ خصوصی یا متن چت خصوصی را log نکن.
8. migration اعمال‌شده را rewrite نکن؛ migration جدید بساز.
9. هر تسک دقیقاً یک commit پیاده‌سازی و پس از آن یک commit مدرک Review دارد.
10. بعد از هر Milestone، Deploy Packet تولید کن و متوقف شو.
11. شروع Milestone بعد فقط با پیام صریح مالک به شکل `MILESTONE-N APPROVED` مجاز است.
12. عبارت «تمام شد» فقط پس از اجرای تازهٔ همهٔ فرمان‌های Review مجاز است.

### ۲.۱ پروندهٔ Review هر تسک

عامل در پایان هر تسک فایل `docs/reviews/task-NN.md` را با این بخش‌ها ایجاد می‌کند:

```markdown
# Task NN Review
Status: APPROVED
Implementation-Commit: SHA واقعی commit پیاده‌سازی
Scope: فهرست فایل‌های تغییرکرده
Commands: فرمان‌های واقعاً اجراشده
Results: exit code و تعداد تست‌های موفق/ناموفق
Acceptance: نتیجهٔ تک‌تک معیارهای پذیرش با PASS یا FAIL
Security: نتیجهٔ بررسی مجوز، دادهٔ خصوصی و log
Regressions: نتیجهٔ npm run verify
Reviewer note: توضیح کوتاه و واقعی
```

`Status: APPROVED` فقط وقتی نوشته می‌شود که تمام تست‌ها و معیارها PASS باشند. روند پایان تسک دقیقاً این است:

1. تست‌ها اجرا می‌شوند؛
2. فایل‌های پیاده‌سازی با پیام commit تعیین‌شده در تسک commit می‌شوند؛
3. SHA همان commit در `Implementation-Commit` نوشته می‌شود؛
4. فایل Review در commit دوم با پیام `docs(review): approve task NN` ثبت می‌شود.

در صورت شکست، status برابر `REJECTED` است، commit پیاده‌سازی ساخته نمی‌شود و عامل همان تسک را اصلاح می‌کند. بدین ترتیب SHA خودارجاع نیست و Gate بعدی می‌تواند وجود commit پیاده‌سازی و commit Review را مستقل بررسی کند.

در تمام بخش‌های «ارزیابی و Review پایان تسک»، عبارت `commit ...` به commit اول یعنی پیاده‌سازی اشاره دارد. پس از آن، commit دوم Review با الگوی ثابت `docs(review): approve task NN` ساخته می‌شود. `review-gate.mjs` باید هر دو commit، تمیزی worktree و موفقیت `npm run verify` را کنترل کند.

### ۲.۲ Gate مشترک پیش از هر تسک

از تسک ۰۲ به بعد:

```powershell
npm run review:gate -- --task NN-1
npm run verify
git status --short
```

انتظار:

- review قبلی وجود دارد و `APPROVED` است؛
- SHA ثبت‌شده در history فعلی وجود دارد؛
- `npm run verify` با exit code صفر تمام می‌شود؛
- working tree پیش از شروع تمیز است.

### ۲.۳ Review مشترک پایان هر تسک

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

سپس معیارهای همان تسک بررسی، فایل Review ثبت و commit ساخته می‌شود. برای تسک‌هایی که migration، realtime یا E2E دارند، فرمان تکمیلی همان تسک نیز اجباری است.

---

## ۳. نقشهٔ Milestoneها

| Milestone | خروجی قابل مشاهده | شرط توقف |
|---|---|---|
| M0 — پایهٔ مهندسی | رابط فعلی + صفحهٔ وضعیت واقعی API/DB/Redis | Deploy و تأیید مالک |
| M1 — هویت | ورود OTP، پروفایل و ورود امن مدیر کل | Deploy و آزمون با موبایل |
| M2 — زیربستر | ساخت، مشاهده، دنبال‌کردن و جست‌وجوی زیربستر عمومی | ساخت یک بستر واقعی توسط مالک |
| M3 — آگاهی و اقدام | کارت، thread عمومی، رزرو و سناریوی نردبان | اجرای end-to-end سناریوی نردبان |
| M4 — پیام خصوصی | چت realtime دو کاربر بدون افشای خودکار اطلاعات | آزمون در دو مرورگر/دستگاه |
| M5 — هوش مصنوعی | هدایت بستر/کارت، fallback و خلاصهٔ رضایتی | مقایسهٔ AI روشن/خاموش |
| M6 — گزارش و حکمرانی | پرونده، تعلیق ۴۸ساعته، پاسخ و audit | اجرای سناریوی گزارش تا بازبینی |
| M7 — Release Candidate | امنیت، مشاهده‌پذیری، backup و آزمون بار | Deploy نسخهٔ RC و تأیید عرضه |

---

## ۴. ساختار فایل هدف

```text
work/tMessenger/
├── app/                         # Next.js PWA موجود؛ route و pageها
├── components/                  # UI دامنه‌ای
├── lib/
│   ├── api/                     # client تایپ‌شدهٔ REST
│   ├── auth/                    # session client/server
│   └── validation/              # schemaهای UI
├── services/
│   ├── api/src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── config/
│   │   ├── plugins/
│   │   └── modules/{auth,profiles,spaces,cards,awareness,messaging,ai,moderation,governance,audit}/
│   └── worker/src/
│       ├── worker.ts
│       └── jobs/{ai,moderation,notifications,expiry}/
├── packages/
│   ├── contracts/src/           # Zod schema + type قراردادها
│   └── database/
│       ├── prisma/schema.prisma
│       ├── prisma/migrations/
│       └── src/client.ts
├── tests/
│   ├── e2e/
│   ├── fixtures/
│   └── load/
├── scripts/                     # review gate، bootstrap، backup/restore
├── deploy/                      # reverse proxy و runbook
├── docs/reviews/
├── docker-compose.yml
└── .github/workflows/ci.yml
```

اصل نام‌گذاری: `space` نام فنی زیربستر، `card` ظرف آگاهی، `publicComment` گفت‌وگوی عمومی، `conversation/message` گفت‌وگوی خصوصی و `moderationCase` پروندهٔ رسیدگی است.

---

# M0 — پایهٔ مهندسی و محیط قابل Deploy

## Task 01 — ارتقای امن frontend و افزودن تست پایه

**Files:**

- Modify: `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`
- Delete after replacement: `next.config.js`, `.eslintrc.json`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`
- Create: `components/__tests__/AppShell.test.tsx`, `tests/e2e/baseline.spec.ts`
- Create: `scripts/review-gate.mjs`, `scripts/review-gate.test.mjs`

**Interfaces:**

- Produces scripts: `lint`, `typecheck`, `test`, `test:e2e`, `build`, `verify`, `review:gate`.
- `verify` دقیقاً برابر اجرای ترتیبی lint، typecheck، unit test و build است.

**Gate پیش از شروع:** این اولین تسک است. ابتدا `npm run lint` و `npm run build` را اجرا کن؛ هر دو باید روی baseline موفق باشند. سپس `git status --short` باید تمیز باشد.

**مراحل:**

- [ ] Node 24 را در `.nvmrc` و `package.json#engines` ثبت کن.
- [ ] Next را به `16.2.11`، React/ReactDOM را به `19.2.0` و eslint-config-next را به `16.2.11` ارتقا بده؛ lockfile را commit کن.
- [ ] فرمان قدیمی `next lint` را با `eslint . --max-warnings=0` جایگزین کن.
- [ ] Vitest، Testing Library، jsdom و Playwright را نصب و پیکربندی کن.
- [ ] ابتدا تست render پوسته و smoke مسیر `/` را بنویس و شکست مورد انتظار را ثبت کن.
- [ ] ناسازگاری‌های Next 16 را با حداقل تغییر رفع کن؛ رفتار ظاهری prototype را تغییر نده.
- [ ] `review-gate.mjs` را بساز تا فایل Review قبلی، Status و SHA را کنترل کند؛ تست node برای حالت missing، rejected و approved بنویس.
- [ ] همهٔ فرمان‌های Review پایان تسک را اجرا کن.

**تست پایهٔ اجباری:**

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npx playwright test tests/e2e/baseline.spec.ts
node --test scripts/review-gate.test.mjs
```

**ارزیابی و Review پایان تسک:**

- [ ] صفحهٔ `/` بدون خطای console باز می‌شود.
- [ ] هفت زیربستر seed فعلی هنوز دیده می‌شوند.
- [ ] `verify` با exit code صفر است.
- [ ] review gate هر سه حالت را درست تشخیص می‌دهد.
- [ ] dependency audit دارای آسیب‌پذیری critical حل‌نشده نیست.
- [ ] `docs/reviews/task-01.md` با Status واقعی ثبت شده است.
- [ ] Commit: `chore: establish tested Next 16 baseline`.

## Task 02 — workspace، API سلامت و قرارداد مشترک

**Files:**

- Modify: `package.json`, `package-lock.json`, `.gitignore`
- Create: `services/api/package.json`, `services/api/tsconfig.json`, `services/api/src/app.ts`, `services/api/src/server.ts`
- Create: `services/api/src/modules/health/health.route.ts`, `services/api/src/modules/health/health.test.ts`
- Create: `packages/contracts/package.json`, `packages/contracts/src/health.ts`, `packages/contracts/src/index.ts`
- Create: `lib/api/client.ts`, `app/system-status/page.tsx`

**Interfaces:**

- `GET /v1/health/live -> { status: 'ok', version: string }`
- `GET /v1/health/ready -> { status: 'ok'|'degraded', checks: { database, redis } }`
- `apiFetch<T>(path, init): Promise<T>` تنها client مجاز web است.

**Gate پیش از شروع:** `npm run review:gate -- --task 01`، سپس `npm run verify` و تمیزی worktree را تأیید کن. در نبود `APPROVED` شروع نکن.

**مراحل:**

- [ ] npm workspaces را برای `services/*` و `packages/*` اضافه کن، بدون جابه‌جایی frontend موجود.
- [ ] Fastify 5 و Zod 4 را در API نصب کن.
- [ ] قرارداد health را اول در package contracts بنویس.
- [ ] تست inject برای live و ready را بنویس و شکست را ثبت کن.
- [ ] `buildApp()` را بدون listen side effect و `server.ts` را فقط برای listen پیاده کن.
- [ ] client وب را با timeout ده‌ثانیه‌ای، correlation ID و error تایپ‌شده بساز.
- [ ] صفحهٔ `/system-status` را به ready endpoint متصل کن و هر check را فارسی نمایش بده.

**تست پایهٔ اجباری:**

```powershell
npm run test --workspace services/api -- health.test.ts
npm run verify
npm run build --workspaces --if-present
```

**ارزیابی و Review پایان تسک:**

- [ ] live در قطع DB نیز 200 می‌دهد؛ ready در قطع dependency مقدار degraded می‌دهد.
- [ ] API با import شدن شروع به listen نمی‌کند.
- [ ] صفحهٔ وضعیت، loading/error/success دارد.
- [ ] پاسخ API با schema مشترک validate می‌شود.
- [ ] `docs/reviews/task-02.md` ثبت شده است.
- [ ] Commit: `feat: add modular API health foundation`.

## Task 03 — PostgreSQL، Redis، Prisma و محیط محلی

**Files:**

- Create: `docker-compose.yml`, `.env.example`
- Create: `packages/database/package.json`, `packages/database/prisma/schema.prisma`, `packages/database/src/client.ts`
- Create: `services/api/src/config/env.ts`, `services/api/src/plugins/database.ts`, `services/api/src/plugins/redis.ts`
- Create: `services/api/src/config/env.test.ts`, `packages/database/src/client.test.ts`

**Interfaces:**

- `getPrisma(): PrismaClient`
- Fastify decorators: `app.db`, `app.redis`
- env اجباری: `DATABASE_URL`, `REDIS_URL`, `SESSION_HMAC_KEY`, `PHONE_ENCRYPTION_KEY`, `APP_ORIGIN`.

**Gate پیش از شروع:** Review تسک ۰۲، اجرای `npm run verify` و worktree تمیز را تأیید کن.

**مراحل:**

- [ ] PostgreSQL 16 و Redis 7 را با healthcheck و volume نام‌دار در Compose تعریف کن.
- [ ] env schema را با Zod بنویس؛ production با secret پیش‌فرض یا کوتاه باید fail-fast شود.
- [ ] Prisma 7 را با UUID، timezone UTC و naming صریح پیکربندی کن.
- [ ] migration پایه فقط جداول `SystemSetting` و `OutboxEvent` را ایجاد کند.
- [ ] pluginهای DB/Redis را با lifecycle درست connect/disconnect بساز.
- [ ] ready endpoint را به ping واقعی DB و Redis وصل کن.
- [ ] تست env و integration DB را ابتدا شکست بده، سپس پیاده‌سازی کن.

**تست پایهٔ اجباری:**

```powershell
docker compose up -d postgres redis
npm run db:migrate
npm run test:integration --workspace services/api
npm run verify
docker compose ps
```

**ارزیابی و Review پایان تسک:**

- [ ] restart دادهٔ PostgreSQL را از بین نمی‌برد.
- [ ] ready هر دو dependency را `ok` گزارش می‌کند.
- [ ] env نامعتبر مانع شروع API می‌شود.
- [ ] migration از database خالی و روی database migrated هر دو موفق است.
- [ ] `docs/reviews/task-03.md` ثبت شده است.
- [ ] Commit: `feat: add persistent runtime services`.

## Task 04 — CI، Docker image و صفحهٔ وضعیت قابل Deploy

**Files:**

- Create: `Dockerfile.web`, `Dockerfile.api`, `.dockerignore`
- Create: `.github/workflows/ci.yml`, `deploy/Caddyfile`, `deploy/README.md`
- Modify: `docker-compose.yml`, `README.md`
- Create: `tests/e2e/system-status.spec.ts`

**Interfaces:**

- مسیر عمومی `/api/*` به API و `/socket.io/*` به realtime proxy می‌شود.
- healthcheck container از `/v1/health/live` استفاده می‌کند.

**Gate پیش از شروع:** Review تسک ۰۳، verify کامل، migration check و worktree تمیز را تأیید کن.

**مراحل:**

- [ ] multi-stage image برای web و API روی Node 24 بساز.
- [ ] Compose را با web، api و reverse proxy کامل کن.
- [ ] CI را با install قفل‌شده، lint، typecheck، unit، integration، build و migration-from-zero بساز.
- [ ] secret را در image یا build argument قرار نده.
- [ ] E2E صفحهٔ وضعیت را علیه stack Compose بنویس.
- [ ] README را با فرمان‌های دقیق توسعه و Deploy اصلاح کن.

**تست پایهٔ اجباری:**

```powershell
docker compose build
docker compose up -d
npx playwright test tests/e2e/system-status.spec.ts
docker compose logs api --since 5m
npm run verify
```

**ارزیابی و Review پایان تسک:**

- [ ] `/` و `/system-status` از طریق reverse proxy باز می‌شوند.
- [ ] API/DB/Redis روی status سبز هستند.
- [ ] log هیچ secret یا مقدار env حساس ندارد.
- [ ] image با user غیر root اجرا می‌شود.
- [ ] `docs/reviews/task-04.md` ثبت شده است.
- [ ] Commit: `chore: ship deployable engineering baseline`.

### توقف اجباری M0

عامل باید Deploy Packet شامل SHA، migration، envهای لازم، URLهای `/` و `/system-status`، نتیجهٔ تست‌ها و فرمان rollback تولید کند و سپس متوقف شود. مالک stack را Deploy و صفحهٔ وضعیت را مشاهده می‌کند. ادامه فقط با `MILESTONE-0 APPROVED`.

---

# M1 — هویت، پروفایل و مدیر کل

## Task 05 — مدل هویت، رمزنگاری شماره و bootstrap مدیر کل

**Files:** `packages/database/prisma/schema.prisma`، migration هویت، `services/api/src/modules/auth/{phone,bootstrap}.ts` و تست‌ها، `scripts/bootstrap-superadmin.mjs`.

**Interfaces:** مدل‌های `User`, `UserProfile`, `PhoneIdentity`, `Session`, `Device`, `Role`, `RoleAssignment`, `OfficialIdentityClaim`, `AuditEvent`؛ `normalizePhone(input, defaultCountry): E164` با پشتیبانی IR, IQ, TR, AZ, AM, TM, AF, PK؛ `normalizePhone('09191953219','IR') -> '+989191953219'`؛ `bootstrapSuperadmin(phoneE164): Promise<{userId, created, roleAssigned}>` باید idempotent باشد.

**Gate پیش از شروع:** Review APPROVED تسک ۰۴ و تأیید مالک M0 را کنترل کن؛ `npm run verify`، migration status و تمیزی worktree الزامی است.

**مراحل:**

- [ ] با libphonenumber تست normalization برای `09...`، `+98...`، ارقام فارسی، هر کشور همسایه، country code ناسازگار و شمارهٔ نامعتبر بنویس.
- [ ] شماره را به `phoneHash` برای lookup و `phoneCiphertext` برای بازیابی محدود تبدیل کن؛ plaintext ذخیره نکن.
- [ ] schema هویت را با UUID، unique constraint و UTC اضافه کن.
- [ ] bootstrap فقط از `BOOTSTRAP_SUPERADMIN_PHONE` بخواند؛ شماره در client یا شرط درخواست hardcode نشود.
- [ ] نقش‌های `USER`, `SPACE_ADMIN`, `MODERATOR`, `SENIOR_ADMIN`, `SUPERADMIN`, `OPS` را seed کن.
- [ ] bootstrap را دو بار اجرا و idempotency را تست کن.

**تست پایه:** تست‌های phone/bootstrap، migration، دو اجرای bootstrap و `npm run verify`.

**ارزیابی و Review پایان تسک:** دقیقاً یک user و role assignment؛ نبود plaintext شماره در DB/log/bundle؛ audit موجود؛ Review 05 APPROVED؛ commit `feat: add encrypted identity and superadmin bootstrap`.

## Task 06 — درخواست و تأیید OTP با session چرخان

**Files:** `services/api/src/modules/auth/auth.{schemas,repository,service,route}.ts`، providerهای SMS، تست service/route و `packages/contracts/src/auth.ts`.

**Interfaces:** `POST /v1/auth/otp/request` همیشه 202 با `challengeId` و انقضای ۳۰۰ ثانیه؛ `POST /v1/auth/otp/verify` با cookie HttpOnly؛ `POST /v1/auth/refresh` با rotation؛ `POST /v1/auth/logout`؛ رابط `SmsProvider.sendOtp(phoneE164, code)`.

**Gate پیش از شروع:** `npm run review:gate -- --task 05`، verify و جست‌وجوی plaintext شماره؛ در failure شروع نکن.

**مراحل:**

- [ ] تست پاسخ یکسان، انقضا، حداکثر پنج تلاش و rate limit را ابتدا بنویس.
- [ ] OTP را با CSPRNG بساز و فقط HMAC آن را ذخیره کن.
- [ ] dev provider فقط خارج production sink تست داشته باشد؛ production بدون provider معتبر start نشود.
- [ ] production provider کشور مقصد را از E.164 تشخیص دهد و اگر route فعال ندارد پیش از ساخت challenge پاسخ کنترل‌شده بدهد؛ allow-list کشورها config نسخه‌دار باشد.
- [ ] access session پانزده‌دقیقه‌ای و refresh session سی‌روزهٔ چرخان بساز.
- [ ] reuse refresh token کل خانوادهٔ session را revoke کند.
- [ ] cookieها را HttpOnly، در production امن، SameSite=Lax و محدود به path تنظیم کن.
- [ ] audit بدون شماره و code خام ثبت شود.

**تست پایه:** تست‌های auth service/route، integration auth و verify.

**ارزیابی و Review پایان تسک:** enumeration نیست؛ OTP مصرف‌شده/منقضی رد می‌شود؛ reuse sessionها را revoke می‌کند؛ log پاک است؛ Review 06 APPROVED؛ commit `feat: implement secure mobile OTP sessions`.

## Task 07 — رابط ورود و حفاظت مسیرها

**Files:** `app/login/page.tsx`، `components/auth/{PhoneForm,OtpForm}.tsx`، `lib/auth/{session,require-user}.ts`، `proxy.ts`، تغییر layout/client و تست component/E2E.

**Interfaces:** `getCurrentUser(): Promise<AuthUser|null>`؛ مسیرهای عمومی `/login` و `/system-status`؛ مسیر بازگشت login فقط داخلی و allow-listed؛ فرم شماره country selector فارسی با پیش‌فرض ایران دارد.

**Gate پیش از شروع:** Review 06، verify، integration auth و تمیزی worktree.

**مراحل:**

- [ ] تست RTL ورود شماره، شمارش معکوس، code نامعتبر و resend بنویس.
- [ ] فرم را با ارقام فارسی/لاتین و خطای دسترس‌پذیر بساز.
- [ ] کشورهای همسایهٔ allow-list را در selector نشان بده و هیچ فیلد سن یا مانع age gate اضافه نکن.
- [ ] OTP شش‌رقمی و قابل paste باشد و در localStorage ذخیره نشود.
- [ ] API client را به cookie session و CSRF header متصل کن.
- [ ] Proxy در `proxy.ts` فقط redirect اولیه انجام دهد؛ authorization در API بماند.
- [ ] E2E ورود dev، refresh، logout و redirect را بنویس.

**تست پایه:** تست PhoneForm، E2E auth و verify.

**ارزیابی و Review پایان تسک:** ورود و ماندگاری session موفق؛ route محافظت‌شده بسته؛ open redirect/token storage وجود ندارد؛ Review 07 APPROVED؛ commit `feat: add Persian OTP login flow`.

## Task 08 — پروفایل عمومی و حریم شماره

**Files:** module profiles در API، `packages/contracts/src/profile.ts`، صفحات profile و `u/[username]`، `ProfileForm.tsx` و تست‌ها.

**Interfaces:** `GET /v1/me`، `PATCH /v1/me/profile`، `GET /v1/users/:username`؛ username لاتین کوچک/عدد/underscore با طول ۳ تا ۳۰ و unique بدون حساسیت به بزرگی؛ `phoneVisibility: 'PRIVATE'|'PUBLIC'` با پیش‌فرض PRIVATE.

**Gate پیش از شروع:** Review 07، E2E auth و verify.

**مراحل:**

- [ ] تست uniqueness، reserved username، XSS و عدم نمایش شمارهٔ خصوصی بنویس.
- [ ] API را با allow-list فیلدها بساز؛ mass assignment ممنوع.
- [ ] فرم نام، username، bio تا ۳۲۰ نویسه و visibility بساز؛ تا Task 32 avatar از حروف اول نام و رنگ پایدار تولید شود و URL دلخواه کاربر پذیرفته نشود.
- [ ] عمومی‌کردن شماره با هشدار و تأیید صریح دومرحله‌ای باشد.
- [ ] صفحهٔ عمومی را برای PRIVATE و PUBLIC تست کن.

**تست پایه:** تست API profile، E2E profile و verify.

**ارزیابی و Review پایان تسک:** شماره پیش‌فرض خصوصی و تغییرش قابل بازگشت؛ XSS نیست؛ claim رسمی/phoneHash نشت نمی‌کند؛ Review 08 APPROVED؛ commit `feat: add privacy-first public profiles`.

## Task 09 — MFA مدیر، RBAC و صفحهٔ مدیریت اولیه

**Files:** تغییر schema، `services/api/src/plugins/authorize.ts`، moduleهای MFA/role، صفحات admin/security و تست‌ها.

**Interfaces:** `requireRole(...roles)` با deny-by-default؛ endpointهای `/v1/auth/mfa/{enroll,confirm,challenge}`؛ `OfficialIdentityClaim.status = PENDING|VERIFIED|REJECTED`؛ `POST /v1/admin/identity-claims/:userId/verify`؛ `POST /v1/admin/role-assignments` فقط SUPERADMIN دارای MFA و برای مدیران غیر bootstrap فقط پس از VERIFIED شدن claim.

**Gate پیش از شروع:** Review 08، verify و تست عدم افشای شماره.

**مراحل:**

- [ ] تست matrix مجوز و عدم اتکا به role ارسالی client بنویس.
- [ ] secret TOTP رمز‌شده و recovery codeها hash شوند.
- [ ] مدیر بدون challenge دوم به `/admin` نرسد.
- [ ] مدیر کل moderator و senior admin تعیین کند و تغییرها audit شوند.
- [ ] پذیرش مسئولیت مدیریتی برای افراد غیر bootstrap به ثبت و تأیید claim رسمی خصوصی وابسته باشد؛ مدرک یا نتیجهٔ آن در پروفایل عمومی نمایش داده نشود.
- [ ] OPS به متن چت و پروندهٔ محتوا دسترسی نداشته باشد.
- [ ] E2E bootstrap، MFA و انتصاب moderator اجرا شود.

**تست پایه:** تست mfa/role، E2E superadmin و verify.

**ارزیابی و Review پایان تسک:** شماره bootstrap فقط پس از OTP+MFA مدیر کل؛ دستکاری client بی‌اثر؛ OPS/moderator جدا؛ enrollment ناقص secret فعال ندارد؛ Review 09 APPROVED؛ commit `feat: secure superadmin with MFA and RBAC`.

### توقف اجباری M1

Deploy Packet شامل URL ورود، روش امن OTP آزمایشی، دستور bootstrap، مسیر پروفایل، migration و rollback است. مالک وارد می‌شود، MFA را فعال می‌کند، moderator می‌سازد و privacy شماره را می‌بیند. ادامه فقط با `MILESTONE-1 APPROVED`.

---

# M2 — زیربستر عمومی و کشف

## Task 10 — مدل و API زیربستر نسخه‌دار

**Files:** schema و migration spaces، `services/api/src/modules/spaces/space.{schemas,repository,service,route}.ts`، `packages/contracts/src/space.ts` و تست.

**Interfaces:** مدل‌های `Space`, `SpaceDefinitionVersion`, `SpaceAdmin`, `SpaceFollower`؛ statusهای `DRAFT|PUBLISHED|TEMPORARILY_SUSPENDED|ARCHIVED|REMOVED`؛ endpointهای create/update/publish/get؛ هر edit یک version immutable.

**Gate پیش از شروع:** Review 09 و تأیید مالک M1، سپس verify، E2E superadmin و migration status.

**مراحل:**

- [ ] تست ساخت draft توسط هر user و ویرایش فقط توسط creator/admin بنویس.
- [ ] definition شامل purpose، audience، participationMethods، cardHints و policyVersion باشد.
- [ ] slug فارسی/لاتین امن و collision strategy قطعی پیاده کن.
- [ ] publish حداقل title، purpose و یک participation method بخواهد.
- [ ] دسترسی عمومی فقط PUBLISHED را برگرداند.
- [ ] eventهای `space.created`, `space.published`, `space.versioned` در outbox همان transaction ثبت شوند.

**تست پایه:** unit/integration spaces، migration و verify.

**ارزیابی و Review پایان تسک:** ساخت آزاد؛ version immutable؛ edit هم‌زمان 409؛ draft نشت نمی‌کند؛ Review 10 APPROVED؛ commit `feat: add versioned public spaces`.

## Task 11 — جست‌وجو، دنبال‌کردن و مشابهت پایه

**Files:** `space-search.service.ts`, `space-search.route.ts`, `space-similarity.service.ts` و تست، migration index و `packages/contracts/src/pagination.ts`.

**Interfaces:** `GET /v1/spaces?q=&cursor=&limit=20&scope=all|following`؛ follow/unfollow idempotent؛ `GET /v1/spaces/similar?title=&purpose=` حداکثر پنج نتیجه؛ cursor opaque و limit ۱ تا ۵۰.

**Gate پیش از شروع:** Review 10، integration spaces، migration status و verify.

**مراحل:**

- [ ] تست pagination پایدار، ی/ي، ک/ك و follow idempotent بنویس.
- [ ] normalization فارسی و full-text/trigram index PostgreSQL را migration کن.
- [ ] similarity قاعده‌محور را با token overlap عنوان/هدف بساز؛ AI در M5 تکمیل می‌کند.
- [ ] ranking بر relevance، تازگی و health باشد؛ popularity تنها عامل نباشد.
- [ ] suspended/removed در نتیجهٔ عمومی نباشد.

**تست پایه:** unit/integration space-search و verify.

**ارزیابی و Review پایان تسک:** query فارسی ثابت؛ cursor بدون تکرار/حذف؛ مشابهت قبل انتشار؛ محتوای معلق پنهان؛ Review 11 APPROVED؛ commit `feat: add fair space discovery`.

## Task 12 — رابط ساخت، فهرست و صفحهٔ زیربستر

**Files:** `app/spaces/new/page.tsx`، componentهای SpaceComposer/SimilarSpaces، `app/spaces/[slug]/page.tsx`، SpaceHeader/SpaceFeed، تغییر صفحهٔ خانه و تست‌ها.

**Interfaces:** UI فقط قرارداد Task 10/11؛ seed فقط fixture توسعه؛ پیشنهاد مشابهت دو CTA «مشارکت در بستر موجود» و «ادامه ساخت» دارد و تصمیم با کاربر است.

**Gate پیش از شروع:** Review 11، integration API و verify.

**مراحل:**

- [ ] test-first فرم شرح آزاد، preview و validation فارسی بساز.
- [ ] خانه را از API تغذیه کن؛ loading، empty و retry داشته باشد.
- [ ] جریان ساخت را به draft، preview و publish تفکیک کن.
- [ ] مشابهت را نشان بده ولی publish مستقل را مسدود نکن.
- [ ] follow/unfollow و creator را متصل کن.
- [ ] URL قدیمی `/platforms/:id` را سازگار redirect کن تا prototype نشکند.

**تست پایه:** component test، `npx playwright test tests/e2e/spaces.spec.ts` و verify.

**ارزیابی و Review پایان تسک:** ساخت با متن طبیعی؛ پیشنهاد غیرتحمیلی؛ منع edit توسط دیگری؛ UI در ۳۶۰px و desktop؛ Review 12 APPROVED؛ commit `feat: deliver public space creation journey`.

## Task 13 — سلامت زیربستر و worker پایه

**Files:** schema snapshot، `services/worker/{package.json,tsconfig.json}`، `services/worker/src/{worker.ts,jobs/space-health.ts}` و تست، route health و `SpaceHealthPanel.tsx`.

**Interfaces:** `SpaceHealthSnapshot` فقط cardCount، contributorCount، meaningfulViewCount و lastActivityAt؛ وضعیت `NEW|ACTIVE|FRAGILE|DORMANT`؛ endpoint health فقط creator/admin.

**Gate پیش از شروع:** Review 12، E2E spaces و verify.

**مراحل:**

- [ ] تست مرز وضعیت‌ها با clock ثابت بنویس.
- [ ] BullMQ worker و job روزانهٔ idempotent بساز.
- [ ] پیشنهاد اولین کارت، بهبود معرفی و ادغام داوطلبانه نمایش بده.
- [ ] در MVP آرشیو خودکار نکن؛ فقط پیشنهاد و اعلان ثبت کن.
- [ ] dashboard سازنده بدون ranking عمومی بساز.

**تست پایه:** تست worker health، E2E spaces و verify.

**ارزیابی و Review پایان تسک:** health فقط رفتار بستر را می‌سنجد؛ job دوگانه نمی‌سازد؛ کم‌فعال خودکار حذف نمی‌شود؛ Review 13 APPROVED؛ commit `feat: add non-punitive space health guidance`.

### توقف اجباری M2

Deploy Packet شامل حساب user، مسیر ساخت، query جست‌وجو، نتیجهٔ مشابهت و health panel است. مالک یک بستر محله/مسجد می‌سازد، publish و با حساب دوم follow می‌کند. ادامه فقط با `MILESTONE-2 APPROVED`.

---

# M3 — کارت آگاهی، گفت‌وگوی عمومی و اقدام

## Task 14 — مدل کارت، revision و گونهٔ استنباطی

**Files:** schema/migration cards، module `services/api/src/modules/cards/` شامل schemas/repository/service/route/state-machine و تست، `packages/contracts/src/card.ts`.

**Interfaces:** `CardKind = AWARENESS|OBSERVATION|REUSABLE_RESOURCE|CONSUMABLE_RESOURCE|REQUEST|SERVICE|PARTICIPATION|EVENT`؛ این kind داخلی و قابل اصلاح است؛ user مجبور به انتخاب نیست. endpointهای create/update/get/list و revision immutable.

**Gate پیش از شروع:** Review 13 و تأیید M2، سپس verify، worker test و migration status.

**مراحل:**

- [ ] تست ساخت کارت فقط با `body`، derivation عنوان و مجوز owner بنویس.
- [ ] مدل‌های `Card`, `CardRevision`, `CardSemanticProfile`, `CardEvent` را اضافه کن.
- [ ] کارت با `PUBLISHED/ACTIVE` آغاز شود؛ kind پیش‌فرض AWARENESS است.
- [ ] edit revision و outbox event بسازد؛ حذف فیزیکی انجام نشود.
- [ ] فهرست کارت cursor-based و ترتیب آن ترکیب تازگی/relevance باشد.
- [ ] suspended space اجازهٔ ساخت کارت عمومی ندهد.

**تست پایه:** unit state machine، integration card CRUD و verify.

**ارزیابی و Review پایان تسک:** متن تنها کافی؛ kind اجباری نیست؛ revision حفظ؛ مجوزها صحیح؛ Review 14 APPROVED؛ commit `feat: add awareness-first cards`.

## Task 15 — thread عمومی، reply و ویرایش امن

**Files:** schema comments/revisions، `services/api/src/modules/cards/public-comment.{schemas,repository,service,route}.ts` و تست، `packages/contracts/src/public-comment.ts`، componentهای PublicThread/CommentComposer.

**Interfaces:** list/create/edit/delete-soft/reply؛ reply فقط به comment همان card؛ متن ۱ تا ۴۰۰۰ نویسه؛ edit history فقط owner/moderator طبق policy.

**Gate پیش از شروع:** Review 14، integration cards و verify.

**مراحل:**

- [ ] تست comment، reply cross-card، edit owner و delete-soft بنویس.
- [ ] comment و revision را transactionally ذخیره کن.
- [ ] public-first CTA را «پرسش یا مشارکت عمومی» قرار بده.
- [ ] متن را plain text render کن و link را با rel امن نمایش بده.
- [ ] system event با comment انسانی type مشترک نداشته باشد.
- [ ] thread را با pagination و optimistic UI متصل کن.

**تست پایه:** تست API comment، component thread، E2E public discussion و verify.

**ارزیابی و Review پایان تسک:** reply نادرست رد؛ حذف متن را پنهان ولی audit را حفظ؛ XSS نیست؛ CTA عمومی اصلی است؛ Review 15 APPROVED؛ commit `feat: add public card discussions`.

## Task 16 — رزرو idempotent و چرخهٔ منبع

**Files:** schema reservation/operational state/idempotency، `card-state-machine.ts`، `reservation.{service,route}.ts` و تست concurrency، `packages/contracts/src/reservation.ts`.

**Interfaces:** stateها `ACTIVE|RESERVED|IN_USE|COMPLETED|CANCELLED|RETURNED|EXHAUSTED|EXPIRED|TEMPORARILY_SUSPENDED`؛ endpoint reserve/accept/cancel/mark-in-use/complete/return؛ header `Idempotency-Key` اجباری برای mutation.

**Gate پیش از شروع:** Review 15، public discussion E2E و verify.

**مراحل:**

- [ ] جدول transition مجاز را در تست بنویس؛ transition نامعتبر 409.
- [ ] دو رزرو هم‌زمان را با transaction و version column تست کن؛ فقط یکی موفق.
- [ ] owner رزرو را accept/release و requester رزرو خود را cancel کند.
- [ ] REUSABLE بعد RETURNED به ACTIVE بازگردد؛ CONSUMABLE بعد EXHAUSTED پایان یابد.
- [ ] هر transition CardEvent و AwarenessEvent بسازد.
- [ ] AI یا client حق قطعی‌کردن state بدون command مجاز ندارد.

**تست پایه:** unit transition، integration concurrency/idempotency و verify.

**ارزیابی و Review پایان تسک:** رزرو دوگانه نیست؛ retry پاسخ یکسان؛ سناریوی نردبان بازفعال؛ audit event کامل؛ Review 16 APPROVED؛ commit `feat: implement card reservation lifecycle`.

## Task 17 — رابط ایجاد کارت و سناریوی نردبان

**Files:** بازنویسی `CreateCardSheet.tsx`, `CardTemplate.tsx`, `CardDetailView.tsx` برای API؛ create `CardComposer.tsx`, `ReservationActions.tsx`, `CardStateBadge.tsx` و تست E2E `ladder-flow.spec.ts`.

**Interfaces:** کاربر متن طبیعی می‌نویسد؛ سؤال عملیاتی فقط اگر behavior را تغییر دهد؛ state button بر اساس actor/state از API می‌آید، نه منطق مستقل client.

**Gate پیش از شروع:** Review 16، تست concurrency، migration و verify.

**مراحل:**

- [ ] تست component برای کارت آگاهی بدون state و نردبان REUSABLE بنویس.
- [ ] composer را تک‌ورودی و preview-first بساز؛ انتخاب kind اجباری نباشد.
- [ ] صفحهٔ card detail را به thread عمومی و actionها متصل کن.
- [ ] E2E دو user: ایجاد نردبان، نظر، رزرو، accept، in-use، return و active.
- [ ] refresh در هر مرحله state server را حفظ کند.

**تست پایه:** component cards، `npx playwright test tests/e2e/ladder-flow.spec.ts` و verify.

**ارزیابی و Review پایان تسک:** چرخه کامل در UI؛ کارت آگاهی دکمهٔ بی‌معنا ندارد؛ refresh امن؛ خطای conflict قابل فهم؛ Review 17 APPROVED؛ commit `feat: deliver reusable resource card journey`.

## Task 18 — رخداد و dashboard قیف آگاهی

**Files:** schema awareness، module `services/api/src/modules/awareness/`، worker aggregation، `app/admin/metrics/page.tsx`, `components/metrics/AwarenessFunnel.tsx` و تست.

**Interfaces:** eventهای `PRODUCED|MEANINGFUL_VIEW|PUBLIC_CONTRIBUTION|RESERVED|PRIVATE_CHAT_STARTED|APPLIED|PUBLIC_SUMMARY_RETURNED`؛ event دارای actor pseudonymous، subject و idempotency key؛ metric اصلی تعداد کارت‌های به‌کارگرفته‌شده است.

**Gate پیش از شروع:** Review 17، ladder E2E و verify.

**مراحل:**

- [ ] dedup view و bot/internal traffic را در تست تعریف کن.
- [ ] event ingestion را append-only و فاقد متن خصوصی بساز.
- [ ] aggregation روزانه produced/received/applied و public/private ratio بساز.
- [ ] dashboard فقط آمار تجمیعی و بدون score انسان نمایش دهد.
- [ ] retention شناسهٔ خام analytics را حداقل کن.

**تست پایه:** unit awareness، integration aggregation، dashboard component و verify.

**ارزیابی و Review پایان تسک:** refresh view را باد نمی‌کند؛ private text ثبت نیست؛ قیف با fixture قابل محاسبه؛ score شخصی وجود ندارد؛ Review 18 APPROVED؛ commit `feat: measure awareness without social scoring`.

### توقف اجباری M3

Deploy Packet شامل دو حساب، URL بستر و کارت، fixture پاک و dashboard آگاهی است. مالک سناریوی نردبان را تا بازگشت به ACTIVE اجرا و گفت‌وگوی عمومی را مشاهده می‌کند. ادامه فقط با `MILESTONE-3 APPROVED`.

---

# M4 — پیام‌رسان خصوصی realtime

## Task 19 — مدل conversation و API پیام خصوصی

**Files:** schema conversation/member/message/revision/receipt، module `services/api/src/modules/messaging/` و تست، `packages/contracts/src/messaging.ts`.

**Interfaces:** direct conversation یکتا برای یک زوج؛ create/list/messages/send/edit-own/delete-own؛ message ۱ تا ۸۰۰۰ نویسه؛ cursor؛ `reported_message_context_grants` در M6 استفاده می‌شود.

**Gate پیش از شروع:** Review 18 و تأیید M3، سپس verify و awareness integration.

**مراحل:**

- [ ] تست منع خواندن/نوشتن non-member و یکتایی direct conversation بنویس.
- [ ] create-or-get را transactionally و idempotent بساز.
- [ ] message persistence، receipt و soft delete را پیاده کن.
- [ ] serialization هرگز phone، identity claim یا member خصوصی را ضمیمه نکند.
- [ ] audit فقط metadata لازم داشته باشد، نه متن پیام.

**تست پایه:** unit permission، integration دو/سه کاربر و verify.

**ارزیابی و Review پایان تسک:** non-member پاسخ 404؛ conversation تکراری نیست؛ متن در log نیست؛ pagination ثابت؛ Review 19 APPROVED؛ commit `feat: add private conversation persistence`.

## Task 20 — Socket.IO gateway با authorization

**Files:** `services/api/src/modules/messaging/realtime.gateway.ts`, `realtime-auth.ts` و تست؛ `lib/realtime/client.ts`; تغییر reverse proxy.

**Interfaces:** eventهای `message:send`, `message:created`, `receipt:read`, `typing:start/stop`؛ هر join عضویت را از DB کنترل می‌کند؛ reconnect با cursor پیام‌های ازدست‌رفته را REST می‌گیرد.

**Gate پیش از شروع:** Review 19، integration messaging، verify و proxy health.

**مراحل:**

- [ ] تست socket بدون session، non-member room و token revoked بنویس.
- [ ] handshake را به session cookie و CSRF/origin policy متصل کن.
- [ ] message ابتدا persist و سپس emit شود.
- [ ] typing در Redis TTL کوتاه داشته باشد و persist نشود.
- [ ] rate limit per-user/per-socket اعمال کن.
- [ ] reconnect و dedup clientMessageId را تست کن.

**تست پایه:** realtime integration، تست reconnect و verify.

**ارزیابی و Review پایان تسک:** join غیرمجاز ممکن نیست؛ پیام گم/دوتایی نمی‌شود؛ revoke اتصال را می‌بندد؛ proxy WebSocket کار می‌کند؛ Review 20 APPROVED؛ commit `feat: add authorized realtime messaging`.

## Task 21 — رابط چت و هشدار افشای اطلاعات

**Files:** بازنویسی `hooks/useChats.tsx`, `ChatRoom.tsx`, `ChatsList.tsx`, `MessageBubble.tsx`؛ create `SensitiveDataWarning.tsx` و E2E `private-chat.spec.ts`.

**Interfaces:** شروع چت از profile یا card؛ شماره/نشانی احتمالی هشدار غیرمسدودکننده دارد؛ user می‌تواند با آگاهی ارسال کند؛ هیچ contact خودکار نمایش داده نمی‌شود.

**Gate پیش از شروع:** Review 20، realtime tests و verify.

**مراحل:**

- [ ] component tests برای pending/sent/failed/retry و هشدار شماره بنویس.
- [ ] لیست و room را از seed به API/realtime منتقل کن.
- [ ] optimistic message را با clientMessageId reconciliation کن.
- [ ] هشدار دادهٔ حساس گزینه‌های «ویرایش» و «با آگاهی ارسال می‌کنم» داشته باشد.
- [ ] E2E را در دو browser context اجرا کن.
- [ ] public thread همچنان CTA اصلی card باشد و private chat آزاد بماند.

**تست پایه:** component chat، E2E private-chat و verify.

**ارزیابی و Review پایان تسک:** پیام زیر دو ثانیه در محیط محلی دیده می‌شود؛ reload تاریخچه را حفظ می‌کند؛ شماره خودکار نیست؛ هشدار اجباری نیست؛ Review 21 APPROVED؛ commit `feat: deliver privacy-aware private chat`.

## Task 22 — اعلان درون‌برنامه‌ای و وضعیت خواندن

**Files:** schema notification/delivery، worker notification، API route و `components/notifications/NotificationCenter.tsx` و تست.

**Interfaces:** notification typeهای `NEW_PUBLIC_REPLY|RESERVATION_CHANGED|NEW_PRIVATE_MESSAGE|MODERATION_UPDATE|SPACE_GUIDANCE`؛ dedupKey unique؛ channel MVP فقط IN_APP.

**Gate پیش از شروع:** Review 21، E2E chat و verify.

**مراحل:**

- [ ] تست dedup، read-all و منع مشاهدهٔ اعلان دیگری بنویس.
- [ ] outbox consumer notification را at-least-once و idempotent بساز.
- [ ] badge و notification center را با pagination متصل کن.
- [ ] preview پیام خصوصی حداکثر ۸۰ نویسه و قابل خاموش‌کردن باشد.
- [ ] delivery خارجی/SMS اطلاع‌رسانی در MVP اضافه نکن.

**تست پایه:** worker/API notification، component center و verify.

**ارزیابی و Review پایان تسک:** dedup درست؛ مجوز صحیح؛ private preview قابل خاموش‌شدن؛ queue retry تست شده؛ Review 22 APPROVED؛ commit `feat: add in-app activity notifications`.

### توقف اجباری M4

Deploy Packet شامل دو حساب و دو browser flow، URL چت، websocket health و روش پاک‌کردن fixture است. مالک در دو دستگاه پیام می‌فرستد، هشدار تماس را می‌بیند و تأیید می‌کند شماره خودکار آشکار نیست. ادامه فقط با `MILESTONE-4 APPROVED`.

---

# M5 — هوش مصنوعی هدایت‌گر و قابل خاموش‌شدن

## Task 23 — AI Orchestrator، provider adapter و خروجی ساخت‌یافته

**Files:** schema `AiRequest/AiResult/PromptVersion/ProviderUsage`، `services/api/src/modules/ai/{orchestrator,schemas,policy-guard}.ts`، `providers/ai-provider.ts`, `providers/gemini-provider.ts`, `providers/fake-provider.ts`، تست و `packages/contracts/src/ai.ts`.

**Interfaces:** `AiProvider.generate(input): Promise<ProviderResult>`؛ orchestrator ورودی minimization، quota، timeout ده‌ثانیه، budget، schema validation و policy guard دارد؛ نتیجه `suggestion|fallback|unavailable`؛ chain-of-thought ذخیره نمی‌شود.

**Gate پیش از شروع:** Review 22 و تأیید M4، سپس verify، E2E chat و queue health.

**مراحل:**

- [ ] تست timeout، JSON نامعتبر، provider failure، quota و circuit breaker بنویس.
- [ ] prompt/version و model metadata را بدون متن خصوصی غیرضروری ذخیره کن.
- [ ] adapter فعلی Gemini را از route مستقیم خارج و پشت interface قرار بده.
- [ ] Zod schema را پیش و پس از provider enforce کن.
- [ ] fallback قاعده‌محور بدون network برای هر قابلیت تعریف کن.
- [ ] AI result فقط پیشنهاد است و برای domain mutation نیازمند preview/confirm کاربر.

**تست پایه:** unit orchestrator با fake provider، failure injection، integration quota و verify.

**ارزیابی و Review پایان تسک:** خاموشی provider مسیر اصلی را نمی‌بندد؛ JSON خراب وارد domain نمی‌شود؛ secret/text خصوصی در log نیست؛ budget enforce؛ Review 23 APPROVED؛ commit `feat: add guarded AI orchestration`.

## Task 24 — هدایت ساخت زیربستر بر پایه معیارهای تعاون‌آفرینی

**Files:** `services/api/src/modules/ai/capabilities/space-guidance.ts` و prompt نسخه‌دار، `space-guidance.test.ts`، `components/spaces/CooperationGuidance.tsx` و fixture فارسی.

**Interfaces:** خروجی دقیق `{ strengths: string[], risks: string[], questions: string[], suggestedRevisions: {field,value,reason}[], safetyLevel: 'NORMAL'|'REVIEW'|'SEVERE', requiresHumanReview: boolean }`؛ هیچ `pietyScore` یا امتیاز انسان وجود ندارد.

**Gate پیش از شروع:** Review 23، failure injection، verify و بررسی نبود chain-of-thought.

**مراحل:**

- [ ] fixtureهای بستر مفید بدتوصیف، تبعیض‌آمیز، فریبنده، اختلاف مشروع و افشاگر اطلاعات بساز.
- [ ] تست کن خروجی اختلاف مشروع را تخلف شرعی اعلام نکند.
- [ ] معیارهای نفع روشن، امکان تعاون، عدم تعدی، عدالت دسترسی، تبیّن، امانت، کرامت، مشورت، پاسخ‌گویی و پایداری را در prompt ثبت کن.
- [ ] UI strength/risk/revision را قابل ویرایش نشان دهد؛ پذیرش پیشنهاد اختیاری باشد.
- [ ] فقط SEVERE ایمنی انتشار را به moderation precheck بفرستد؛ AI حذف دائمی نکند.
- [ ] منبع policyVersion در نتیجه و audit ثبت شود.

**تست پایه:** eval fixture space-guidance، component test، E2E ساخت با پذیرش/رد پیشنهاد و verify.

**ارزیابی و Review پایان تسک:** هدایت قابل توضیح؛ خلاقیت کاربر حفظ؛ score دینی انسان نیست؛ false block در fixture مشروع صفر؛ Review 24 APPROVED؛ commit `feat: guide spaces toward measurable cooperation`.

## Task 25 — استنباط کارت و سؤال حداقلی

**Files:** `services/api/src/modules/ai/capabilities/card-inference.ts` و تست/fixtures، تغییر CardComposer و قرارداد card inference.

**Interfaces:** خروجی `{kind, confidence, suggestedTitle, operationalPattern, clarifyingQuestions[]}`؛ هر سؤال دارای `behaviorAffected` است؛ اگر confidence پایین ولی behavior تغییر نمی‌کند، کارت با AWARENESS منتشر می‌شود.

**Gate پیش از شروع:** Review 24، eval guidance و verify.

**مراحل:**

- [ ] fixture نردبان، خبر محله، کالای مصرفی، خدمت، درخواست کمک و رویداد بنویس.
- [ ] تست کن «یک نردبان دارم...» REUSABLE و return-to-active پیشنهاد می‌دهد.
- [ ] سؤال فقط درباره بازگشت‌پذیری، ظرفیت، زمان/مکان یا رزرو باشد و قابل ردکردن بماند.
- [ ] پاسخ AI را preview کن؛ user بتواند kind/pattern را اصلاح یا نادیده بگیرد.
- [ ] در قطع AI fallback عنوان از خط اول و kind AWARENESS بسازد.
- [ ] نتیجهٔ تأییدشده را به CardSemanticProfile وصل کن.

**تست پایه:** fixture eval، component composer، E2E AI-off و verify.

**ارزیابی و Review پایان تسک:** فرم نوع اجباری نیست؛ نردبان درست؛ AI-off قابل انتشار؛ سؤال غیرحیاتی مانع نیست؛ Review 25 APPROVED؛ commit `feat: infer card behavior without form friction`.

## Task 26 — خلاصه عمومی با رضایت و مجموعه ارزیابی فارسی

**Files:** schema summary suggestion/consent، `services/api/src/modules/ai/capabilities/{public-thread-summary,private-summary}.ts`، route consent، `components/cards/SummarySuggestion.tsx`، `tests/ai/fa/*.json`, `scripts/run-ai-eval.mjs` و تست.

**Interfaces:** thread عمومی با پیوند source message خلاصه می‌شود؛ private summary فقط suggestion و با consent صریح هر دو عضو publish می‌شود؛ endpoint propose/approve/reject/publish؛ تغییر متن consent قبلی را باطل می‌کند.

**Gate پیش از شروع:** Review 25، AI-off E2E و verify.

**مراحل:**

- [ ] تست کن هیچ پیام خصوصی بدون درخواست و رضایت وارد prompt summary عمومی نشود.
- [ ] redaction شماره، نشانی و شناسهٔ حساس را پیش از preview اعمال کن.
- [ ] workflow دو رضایت و invalidation پس از edit را transactionally بساز.
- [ ] مجموعهٔ فارسی حداقل ۱۰۰ نمونه در ده دسته سند معماری بساز.
- [ ] runner شاخص‌های schema-validity، harmful miss، false suspension، latency و fallback را گزارش کند.
- [ ] baseline مورد قبول: schema-validity صددرصد، انتشار خصوصی بدون دو رضایت صفر، harmful miss شدید صفر در مجموعهٔ release.

**تست پایه:** unit consent/redaction، `npm run ai:eval`، E2E summary consent و verify.

**ارزیابی و Review پایان تسک:** source link عمومی؛ private leak صفر؛ consent قابل پس‌گرفتن پیش از publish؛ eval report versioned؛ Review 26 APPROVED؛ commit `feat: return consented knowledge to public cards`.

### توقف اجباری M5

Deploy Packet شامل کلید provider در secret manager، budget روزانه، کلید خاموش‌کردن AI، سه ورودی نمونه و گزارش eval است. مالک یک بستر و کارت را با AI روشن می‌سازد، پیشنهاد را رد/اصلاح می‌کند، سپس AI را خاموش و انتشار fallback را مشاهده می‌کند. ادامه فقط با `MILESTONE-5 APPROVED`.

---

# M6 — گزارش، رسیدگی و حکمرانی

## Task 27 — intake گزارش، privacy گزارش‌دهنده و dedup

**Files:** schema report/subject/cluster/case، module `services/api/src/modules/moderation/report.{schemas,repository,service,route}.ts`، worker `report-clustering.ts` و تست، UI `ReportDialog.tsx`.

**Interfaces:** subject typeهای `SPACE|CARD|PUBLIC_COMMENT|PRIVATE_MESSAGE|PROFILE|RESERVATION|ADMIN_ACTION`؛ `POST /v1/reports -> 202 {receiptId}`؛ reporter فقط moderator پرونده و senior admin با reason می‌بینند؛ subject هیچ reporter identifier نمی‌گیرد.

**Gate پیش از شروع:** Review 26 و تأیید M5، سپس AI eval، verify و migration status.

**مراحل:**

- [ ] تست گزارش هر subject، منع self-leak و پاسخ 202 ثابت بنویس.
- [ ] fingerprint از subject/reason/time bucket بساز و payload خام را در hash نگذار.
- [ ] تکرار یک user ادغام و rate-limit شود؛ report اصلی حذف نشود.
- [ ] signalهای موج زمانی، device/account correlation و متن کپی برای cluster ثبت شوند.
- [ ] AI فقط triage/priority پیشنهاد دهد و reporter را مجازات خودکار نکند.
- [ ] ReportDialog دلیل، توضیح اختیاری و هشدار سوءاستفاده داشته باشد.

**تست پایه:** unit/integration report، coordinated fixture، component dialog و verify.

**ارزیابی و Review پایان تسک:** reporter به subject نشت نمی‌کند؛ duplicate پرونده را باد نمی‌کند؛ receipt قابل پیگیری؛ مدیر مجاز reason دسترسی دارد؛ Review 27 APPROVED؛ commit `feat: add abuse-resistant private reporting`.

## Task 28 — پرونده مدیریت، تعلیق موقت و ساعت ۴۸ساعته

**Files:** schema actions/timers، `moderation-case.{service,route}.ts`, `suspension-policy.ts` و تست؛ worker `moderation-expiry.ts`؛ componentهای AdminCaseQueue/CaseDetail.

**Interfaces:** case status `OPEN|AI_TRIAGED|TEMPORARILY_SUSPENDED|EXPLANATION_REQUESTED|USER_RESPONDED|RECONSIDERING|RESTORED|LIMITED|REMOVED|NO_ACTION|CLOSED`؛ normal suspension دارای `expiresAt <= createdAt+48h`؛ severe با reason code در quarantine می‌ماند.

**Gate پیش از شروع:** Review 27، coordinated report tests و verify.

**مراحل:**

- [ ] clock-controlled tests برای auto-release دقیق ۴۸ ساعت، تصمیم قبل expiry و retry job بنویس.
- [ ] AI suspension فقط برای threshold مصوب و action برگشت‌پذیر ایجاد کند.
- [ ] subject تعلیق‌شده reason ساده، receipt و زمان پایان ببیند.
- [ ] normal بدون تصمیم خودکار RESTORED شود؛ severe فقط با reason ثبت‌شده ادامه یابد.
- [ ] queue عادی و incident cluster جدا و bulk view بدون bulk punishment بساز.
- [ ] هر action append-only audit و outbox event داشته باشد.

**تست پایه:** unit policy/clock، worker expiry با fake clock، E2E suspension banner و verify.

**ارزیابی و Review پایان تسک:** ۲۴ ساعت در کد وجود ندارد؛ normal در ۴۸ ساعت آزاد؛ severe دلیل دارد؛ حذف دائمی AI صفر؛ Review 28 APPROVED؛ commit `feat: enforce reversible 48-hour moderation`.

## Task 29 — درخواست توضیح، پاسخ و بازبینی همان مدیر

**Files:** schema explanation/user-response، `moderation-review.service.ts`, routeها و تست، صفحات `app/admin/cases/[id]/page.tsx`, `app/me/reports/[receiptId]/page.tsx` و component Timeline.

**Interfaces:** manager `request-explanation`؛ subject user `respond` با متن تا ۸۰۰۰ نویسه؛ case به همان assignee بازمی‌گردد؛ manager `reconsider` و تصمیم دوم/دلیل را ثبت می‌کند؛ در MVP تصمیم دوم نهایی است.

**Gate پیش از شروع:** Review 28، fake-clock expiry test، E2E suspension و verify.

**مراحل:**

- [ ] تست مجوز manager/user/other-user و assignment ثابت بنویس.
- [ ] درخواست توضیح deadline و سؤال روشن داشته باشد.
- [ ] پاسخ user immutable revision و attachment-free در MVP باشد.
- [ ] timeline برای user reporter identity/internal signals را حذف کند.
- [ ] moderator تصمیم دوم را با reason code و متن قابل فهم ثبت کند.
- [ ] appeal مستقل، reassignment خودکار یا شورا در این جریان اضافه نکن.

**تست پایه:** unit/integration reconsideration، authorization matrix، E2E user-response و verify.

**ارزیابی و Review پایان تسک:** user توضیح می‌فرستد؛ همان manager بازبینی می‌کند؛ اطلاعات reporter پنهان؛ status نهایی روشن؛ Review 29 APPROVED؛ commit `feat: add first-level moderation reconsideration`.

## Task 30 — دسترسی موردی به پیام خصوصی، policy version و dual approval

**Files:** schema context grant/policy/approval/council decision، moduleهای `private-context.service.ts`, `policy.service.ts`, `dual-approval.service.ts` و تست؛ صفحات admin policy/audit.

**Interfaces:** private context فقط برای case پیام خصوصی، message گزارش‌شده و حداکثر ۲۰ پیام زمینه، grant یک‌ساعته؛ actor/reason/messages viewed audit؛ actionهای `PERMANENT_REMOVE`, `ROLE_REVOKE_SUPERADMIN`, `ROTATE_MASTER_KEY`, `BULK_REMOVE` نیازمند دو مدیر متمایز؛ `GovernanceStatus` زمان عرضه عمومی، activeUsers، activeSpaces و councilRequiredAt را نگه می‌دارد.

**Gate پیش از شروع:** Review 29، reconsideration E2E، permission matrix و verify.

**مراحل:**

- [ ] تست کن manager بدون case/grant پیام خصوصی نمی‌بیند و OPS هرگز نمی‌بیند.
- [ ] grant را scope/expiry دار و پس از هر view audit کن.
- [ ] policy definition/version immutable و دارای source/reason/effectiveAt بساز.
- [ ] تا تشکیل شورا فقط SUPERADMIN policy موقت می‌سازد؛ metadata دورهٔ گذار ثبت شود.
- [ ] trigger تشکیل شورا را با اولین رخداد «شش ماه از عرضه عمومی»، «۵٬۰۰۰ کاربر فعال» یا «۱۰۰ زیربستر فعال» محاسبه کن؛ پس از trigger هشدار دائمی admin و audit ساخته شود.
- [ ] `CouncilDecision` مصوبه، رأی‌ها، policyVersion و مسئول اجرا را نگه دارد؛ مسئول اجرای مصوبات مدیر کل است.
- [ ] dual approval دو actor متمایز و MFA تازه زیر پنج دقیقه بخواهد.
- [ ] actor آغازگر نتواند approval دوم خود را ثبت کند یا audit را حذف کند.

**تست پایه:** security integration private-context، dual-approval race test، policy version test و verify.

**ارزیابی و Review پایان تسک:** دسترسی دائمی مدیر به private chat وجود ندارد؛ grant منقضی؛ dual approval قابل دورزدن نیست؛ audit append-only؛ Review 30 APPROVED؛ commit `feat: enforce scoped moderation governance`.

## Task 31 — داشبورد صف، SLA و سناریوی حمله گزارش هماهنگ

**Files:** `app/admin/cases/page.tsx`, componentهای QueueMetrics/IncidentCluster، route metrics، `tests/load/report-storm.js`, `tests/e2e/moderation-flow.spec.ts` و runbook.

**Interfaces:** metrics شامل queueDepth، oldestAge، dueWithin، breached، clusteredCount و falseSuspensionRate؛ dashboard فیلتر priority/status/cluster دارد؛ متن و reporter در metric عمومی نیست.

**Gate پیش از شروع:** Review 30، private-context security tests، dual approval و verify.

**مراحل:**

- [ ] تست aggregation صف و timezone را بنویس.
- [ ] UI صف را با نشانگر کمتر از ۴۸ ساعت و incident lane بساز.
- [ ] k6 scenario برای ۲٬۵۰۰ گزارش هماهنگ روی ۲۰۰ subject بساز.
- [ ] dedup، rate limit، queue depth و API p95 را اندازه بگیر.
- [ ] runbook تصمیم گروهی را فقط برای triage/cluster بنویس؛ نتیجهٔ هر subject جدا ثبت شود.
- [ ] E2E کامل report → suspension → explanation → response → reconsideration اجرا کن.

**تست پایه:** API metrics، `k6 run tests/load/report-storm.js`، E2E moderation-flow و verify.

**ارزیابی و Review پایان تسک:** سیستم storm را بدون crash می‌پذیرد؛ duplicate دست‌کم ۶۰٪ کم می‌شود؛ bulk punishment نیست؛ SLA قابل مشاهده؛ Review 31 APPROVED؛ commit `feat: operationalize moderation queue resilience`.

### توقف اجباری M6

Deploy Packet شامل سه نقش user/moderator/superadmin، fixture گزارش، لینک queue، ساعت تستی ۴۸ساعته فقط در محیط staging و audit export است. مالک چرخهٔ کامل را اجرا و private reporter، پاسخ user و تصمیم دوم را مشاهده می‌کند. ادامه فقط با `MILESTONE-6 APPROVED`.

---

# M7 — سخت‌سازی و Release Candidate

## Task 32 — ذخیره‌سازی avatar، rate limit و سخت‌سازی مرزها

**Files:** `services/api/src/modules/storage/` با adapterهای S3/fake، route upload avatar، `services/api/src/plugins/{rate-limit,security-headers}.ts`، تغییر profile UI، Compose object storage و تست امنیت.

**Interfaces:** فقط JPEG/PNG/WebP تا پنج مگابایت؛ magic-byte معتبر؛ decode/re-encode و حذف EXIF؛ object key تصادفی؛ signed URL خواندن؛ rate bucketهای جدا برای OTP، auth، message، card، AI و report.

**Gate پیش از شروع:** Review 31 و تأیید M6، سپس moderation E2E، report-storm و verify.

**مراحل:**

- [ ] تست extension جعلی، polyglot، فایل بزرگ، object traversal و دسترسی user دیگر بنویس.
- [ ] adapter storage را بساز تا domain به SDK وابسته نباشد.
- [ ] upload را decode/re-encode و metadata را حذف کند؛ فایل خام مستقیم public نشود.
- [ ] signed URL کوتاه‌عمر و حذف avatar قبلی با job idempotent بساز.
- [ ] rate limitهای route-specific با پاسخ 429 و Retry-After اعمال کن.
- [ ] CSP، HSTS production، frame-ancestors، nosniff و referrer policy را فعال کن.
- [ ] CSRF، SSRF در avatar URL قدیمی و host/origin WebSocket را تست کن.

**تست پایه:** storage security suite، rate-limit integration، E2E avatar، OWASP ZAP baseline روی staging و verify.

**ارزیابی و Review پایان تسک:** upload مخرب رد؛ EXIF پاک؛ object private؛ rate limit بدون قفل‌کردن عمومی service؛ headerها حاضر؛ Review 32 APPROVED؛ commit `feat: harden storage and request boundaries`.

## Task 33 — مشاهده‌پذیری، backup/restore و runbook رخداد

**Files:** pluginهای logging/metrics/tracing، endpoint metrics داخلی، dashboard تعریف‌شده در `deploy/observability/`، scripts backup/restore/verify، `deploy/runbooks/{incident,otp,ai,database,redis,realtime,moderation}.md` و تست.

**Interfaces:** correlation ID از edge تا outbox/worker؛ metricهای latency/error/queue/AI budget/SLA؛ log redaction برای phone، cookie، authorization، OTP، private text؛ backup رمز‌شده و restore به database جدا.

**Gate پیش از شروع:** Review 32، security suite، ZAP baseline و verify.

**مراحل:**

- [ ] تست redaction با payload واقعی auth/private message بنویس.
- [ ] structured JSON log و correlation propagation را اجرا کن.
- [ ] metrics با label کم‌کاردینال و alertهای availability، queue، DB، SMS و AI بساز.
- [ ] health با metrics یکی نشود؛ metrics فقط شبکهٔ مدیریتی باشد.
- [ ] backup روزانه PostgreSQL و object storage با retention ۱۴روزه و encryption بساز.
- [ ] restore drill خودکار به نام database جدا اجرا و count/checksum منطقی را مقایسه کن.
- [ ] runbookها trigger، تشخیص، کاهش آسیب، rollback، ارتباط و postmortem داشته باشند.

**تست پایه:** log-redaction test، metric contract test، `npm run backup:test`، `npm run restore:drill` و verify.

**ارزیابی و Review پایان تسک:** یک request در web/API/worker قابل ردیابی؛ دادهٔ خصوصی در log صفر؛ alert آزمایشی دریافت؛ restore واقعی موفق و زمان ثبت شده؛ Review 33 APPROVED؛ commit `chore: add observable recoverable operations`.

## Task 34 — آزمون بار، پذیرش کامل و ساخت Release Candidate

**Files:** `tests/load/{read-feed,card-write,realtime,otp-spike,report-storm}.js`، `tests/e2e/mvp-acceptance.spec.ts`، `scripts/release-check.mjs`، `deploy/release-checklist.md`, `deploy/rollback.md` و CI release job.

**Interfaces:** سناریوی پایه ۴٬۸۵۶ DAU و اوج ۱٬۳۵۰ اتصال هم‌زمان؛ سناریوی فشاری دو برابر نرخ API پایه؛ thresholdها: read p95 کمتر ۵۰۰ms، write p95 کمتر ۸۰۰ms، message delivery p95 کمتر دو ثانیه، HTTP error کمتر یک درصد، از‌دست‌رفتن پیام تأییدشده صفر.

**Gate پیش از شروع:** Review 33، restore drill، alert test و verify.

**مراحل:**

- [ ] fixture مولد ۲۰٬۰۰۰ user، ۶۷۸ space و ۱۱٬۱۸۳ card را با شماره‌های رزروشدهٔ تست بساز؛ هیچ پیامک واقعی نفرست.
- [ ] load profile را تدریجی ۱۰٪، ۲۵٪، ۵۰٪، ۱۰۰٪ و ۱۵۰٪ اجرا کن؛ در threshold failure مرحله بالاتر نرو.
- [ ] realtime را با reconnect و cursor recovery تحت ۱٬۳۵۰ connection تست کن.
- [ ] E2E پذیرش را برای OTP، profile، space، ladder، public/private chat، AI-off، report و reconsideration اجرا کن.
- [ ] migration را روی clone staging و rollback application را بدون rollback مخرب DB تمرین کن.
- [ ] SBOM، dependency audit، secret scan، image scan و license report بساز.
- [ ] `release-check.mjs` فقط وقتی tag RC می‌سازد که Reviewهای 01 تا 34 و تأیید Milestoneهای 0 تا 6 موجود باشند.
- [ ] artifactها را با SHA و image digest ثبت کن؛ Deploy production را خودکار اجرا نکن.

**تست پایهٔ نهایی:**

```powershell
npm ci
npm run db:migrate:test
npm run verify
npm run test:integration --workspaces --if-present
npx playwright test tests/e2e/mvp-acceptance.spec.ts
k6 run tests/load/read-feed.js
k6 run tests/load/card-write.js
k6 run tests/load/realtime.js
npm run security:scan
npm run restore:drill
node scripts/release-check.mjs
```

**ارزیابی و Review پایان تسک:** همه thresholdها PASS؛ zero acknowledged-message loss؛ zero critical vulnerability؛ restore موفق؛ همه ۳۴ Review APPROVED؛ تمام خروجی‌ها به SHA یکسان مربوط؛ Review 34 APPROVED؛ commit `release: prepare taavonafarin MVP candidate`.

### توقف اجباری M7

عامل Deploy Packet نهایی را تولید می‌کند و متوقف می‌شود. مالک image digest را در staging یا production مدنظر Deploy می‌کند و این مسیرها را می‌بیند: ورود، خانه، ساخت بستر، کارت نردبان، thread عمومی، چت خصوصی، گزارش، پنل مدیر و metrics. هیچ production deploy از سوی عامل بدون دستور صریح مالک مجاز نیست. عرضه فقط با `MILESTONE-7 APPROVED`.

---

## ۵. قالب Deploy Packet هر Milestone

```markdown
# Milestone N Deploy Packet
Git SHA: مقدار واقعی
Images: نام و digest واقعی
Database migrations: فهرست واقعی
Environment changes: نام متغیرها، بدون مقدار secret
Deploy commands: فرمان‌های دقیق همان محیط
Smoke URLs: URLهای دقیق
Demo identities: شماره‌های رزروشدهٔ محیط تست، بدون OTP production
Automated evidence: مسیر reportهای تست
Manual scenarios: گام‌های مشاهده توسط مالک
Known limitations: موارد واقعی باقی‌مانده در دامنه همان Milestone
Rollback: image قبلی و فرمان rollback application
Owner decision: WAITING_FOR_OWNER
```

پس از تولید Packet، عامل هیچ فایل یا migration دیگری را تغییر نمی‌دهد و منتظر تصمیم مالک می‌ماند.

---

## ۶. ماتریس تست الزامی

| سطح | ابزار | در هر تسک | در Milestone | در RC |
|---|---|---:|---:|---:|
| Unit | Vitest / node:test | بله | بله | بله |
| Contract | Zod + inject | هنگام تغییر API | بله | بله |
| Integration | PostgreSQL/Redis واقعی | هنگام تغییر domain | بله | بله |
| Component | Testing Library | هنگام تغییر UI | بله | بله |
| E2E | Playwright | مسیر تغییرکرده | همه مسیرهای milestone | کل MVP |
| Realtime | Socket client integration | هنگام تغییر پیام | بله | بله |
| AI eval | fixture فارسی + fake/real provider | قابلیت AI | بله | بله |
| Security | authorization/redaction/scan | تسک حساس | بله | بله |
| Load | k6 | تسک صف/بار | M6 | کامل |
| Recovery | backup/restore drill | عملیات | M7 | بله |

قواعد تست:

- زمان و UUID در تست‌ها injectable/fake هستند؛
- تست‌ها به ترتیب اجرا وابسته نیستند؛
- provider خارجی در unit/integration فراخوانی نمی‌شود؛
- E2E دادهٔ خود را می‌سازد و پاک می‌کند؛
- snapshot جای assertion رفتاری را نمی‌گیرد؛
- failure path به اندازهٔ happy path تست می‌شود؛
- flaky test با retry پنهان نمی‌شود و تا رفع علت Release را متوقف می‌کند.

---

## ۷. قرارداد خطا و API

تمام خطاها این envelope را دارند:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "پیام فارسی قابل فهم",
    "correlationId": "uuid",
    "details": []
  }
}
```

قواعد:

- 400 schema نامعتبر؛ 401 session نامعتبر؛ 403 مجوز ناکافی؛ 404 برای resource خارج از دسترس؛ 409 conflict/idempotency؛ 422 قاعدهٔ دامنه؛ 429 rate limit؛ 503 provider موقتاً قطع؛
- stack trace و نام table در پاسخ نیست؛
- `code` بعد از انتشار تغییر معنایی نمی‌کند؛
- mutationها correlation ID و در موارد رزرو idempotency key دارند؛
- تاریخ‌ها ISO-8601 UTC و UI فارسی/تهران نمایش می‌دهد؛
- pagination فقط cursor-based است.

---

## ۸. معیارهای غیرعملکردی MVP

- availability هدف ماهانه 99.5٪، بدون احتساب نگهداری اعلام‌شده؛
- read p95 زیر 500ms و write p95 زیر 800ms در بار هدف؛
- تحویل realtime p95 زیر دو ثانیه؛
- تصمیم یا آزادی خودکار تعلیق عادی حداکثر ۴۸ ساعت؛
- RPO پایگاه‌داده حداکثر ۲۴ ساعت و RTO اولیه حداکثر چهار ساعت؛
- صفر secret در repository/image/log؛
- صفر دسترسی private message بدون عضویت یا grant پرونده؛
- صفر پرداخت/کیف پول در MVP؛
- زبان UI فارسی و layout راست‌به‌چپ؛
- حداقل WCAG 2.2 AA برای مسیرهای ورود، ساخت کارت، چت و گزارش.

---

## ۹. Definition of Done نهایی محصول

- [ ] Reviewهای 01 تا 34 همگی APPROVED و به commit موجود اشاره دارند.
- [ ] تأییدهای مالک M0 تا M7 ثبت شده‌اند.
- [ ] کاربر جدید فقط با موبایل وارد و profile می‌سازد.
- [ ] شماره تا انتخاب صریح private است.
- [ ] مدیر کل bootstrap، MFA و انتصاب مدیر را انجام می‌دهد.
- [ ] هر user زیربستر عمومی می‌سازد و AI فقط هدایت می‌کند.
- [ ] کارت بدون انتخاب type ساخته می‌شود.
- [ ] سناریوی نردبان تا return/active کامل است.
- [ ] public thread CTA اصلی و private chat آزاد است.
- [ ] AI-off تمام مسیرهای اصلی را باز می‌گذارد.
- [ ] گزارش هماهنگ dedup و محدود می‌شود.
- [ ] normal suspension در نبود تصمیم پس از ۴۸ ساعت آزاد می‌شود.
- [ ] user توضیح می‌دهد و همان مدیر دوباره بررسی می‌کند.
- [ ] reporter identity به subject نشت نمی‌کند.
- [ ] مدیر فقط در پرونده و با audit متن خصوصی محدود را می‌بیند.
- [ ] پرداخت، بستر خصوصی، E2EE و Site-Manager در build فعال نیستند.
- [ ] بار هدف، security scan و restore drill موفق‌اند.
- [ ] Deploy و rollback توسط مالک قابل اجرا و مستند است.

---

## ۱۰. دستور شروع برای Sonnet 5

این متن را همراه همین فایل و سند معماری به عامل بدهید:

```text
شما فقط عامل اجرایی این برنامه هستید. ابتدا سند معماری نسخه ۳ و سپس این برنامه را کامل بخوانید. فقط Task 01 را اجرا کنید. حق حذف، ادغام، جابه‌جایی یا بازطراحی تسک‌ها را ندارید. قبل از هر Task، Gate همان Task را اجرا و نتیجه را گزارش کنید. توسعه test-first است. در پایان Task همه تست‌های تعیین‌شده را تازه اجرا کنید، فایل Review واقعی بسازید و فقط در صورت PASS بودن همه معیارها commit کنید. در پایان هر Milestone، Deploy Packet بسازید و بدون شروع Milestone بعد متوقف شوید. اگر تصمیمی خارج سند لازم شد، با BLOCKED و گزینه‌های دقیق متوقف شوید؛ خودتان تصمیم محصولی تازه نگیرید.
```

---

## ۱۱. منابع فنی نسخه‌ها

- Node.js 24 در تاریخ تدوین LTS است: [Node.js release schedule](https://nodejs.org/en/about/previous-releases).
- Next.js 16.2.11 نسخهٔ Active LTS امنیتی مبناست: [Next.js releases](https://nextjs.org/blog).
- Fastify 5 به Node.js 20 یا جدیدتر نیاز دارد: [Fastify v5 migration guide](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/).
- Prisma از PostgreSQL 16 پشتیبانی می‌کند و نسخه‌های Node پشتیبانی‌شده را مستند کرده است: [Prisma supported databases](https://docs.prisma.io/docs/orm/reference/supported-databases) و [system requirements](https://docs.prisma.io/docs/orm/reference/system-requirements).

این نسخه‌ها در `package-lock.json` و image digest قفل می‌شوند؛ ارتقای آن‌ها یک تسک مستقل با test/review کامل است، نه تغییر جانبی داخل feature.

---

## ۱۲. قرارداد حداقلی مدل داده

تمام مدل‌ها `id UUID`, `createdAt timestamptz`, `updatedAt timestamptz` دارند مگر رخداد append-only که `updatedAt` ندارد. شناسهٔ عمومی از sequence دیتابیس مشتق نمی‌شود.

| مدل | فیلدهای ضروری افزون بر پایه | قید و index ضروری |
|---|---|---|
| User | status, lastSeenAt | index status |
| PhoneIdentity | userId, phoneHash, phoneCiphertext, verifiedAt | unique phoneHash؛ cascade delete ممنوع |
| UserProfile | userId, username, displayName, bio, avatarObjectKey, phoneVisibility | unique lower(username) |
| Session | userId, tokenFamilyId, refreshHash, expiresAt, revokedAt, deviceId | unique refreshHash؛ index userId/expiresAt |
| RoleAssignment | userId, role, scopeType, scopeId, assignedBy | unique user/role/scope |
| Space | creatorId, slug, status, currentVersion, publishedAt | unique slug؛ index status/publishedAt |
| SpaceDefinitionVersion | spaceId, version, title, purpose, audience, participationMethods JSONB, cardHints JSONB, policyVersion | unique spaceId/version |
| SpaceFollower | spaceId, userId | unique spaceId/userId |
| SpaceHealthSnapshot | spaceId, day, state, counters JSONB | unique spaceId/day |
| Card | spaceId, authorId, status, kind, currentRevision, operationalVersion | index spaceId/status/createdAt |
| CardRevision | cardId, revision, title, body, editedBy | unique cardId/revision |
| CardSemanticProfile | cardId, inferredKind, confidence, operationalPattern JSONB, confirmedByUser | unique cardId |
| CardReservation | cardId, requesterId, status, version, acceptedAt, completedAt | partial unique active reservation per card |
| CardEvent | cardId, actorId, type, fromState, toState, metadata JSONB, idempotencyKey | unique actorId/idempotencyKey |
| PublicComment | cardId, authorId, parentId, body, status | index cardId/createdAt؛ parent همان card |
| Conversation | type, directPairKey | unique directPairKey برای DIRECT |
| ConversationMember | conversationId, userId, joinedAt, lastReadMessageId | unique conversationId/userId |
| Message | conversationId, senderId, clientMessageId, bodyCiphertext, status | unique senderId/clientMessageId؛ index conversationId/createdAt |
| AwarenessEvent | type, actorPseudonym, spaceId, cardId, dedupKey, metadata JSONB | unique dedupKey؛ متن خصوصی ممنوع |
| Report | reporterId, receiptId, reasonCode, detailsCiphertext, fingerprint | unique receiptId؛ index fingerprint/createdAt |
| ReportSubject | reportId, subjectType, subjectId | index subjectType/subjectId |
| ReportCluster | fingerprint, state, signalSummary JSONB | index state/createdAt |
| ModerationCase | assigneeId, status, priority, expiresAt, severeReason, policyVersion | index status/priority/expiresAt |
| ModerationAction | caseId, actorId, action, reasonCode, explanation | append-only؛ index caseId/createdAt |
| ContextGrant | caseId, moderatorId, conversationId, messageIds UUID[], expiresAt | index moderatorId/expiresAt |
| PolicyVersion | policyKey, version, document JSONB, source, effectiveAt, createdBy | unique policyKey/version؛ immutable |
| DualApproval | actionType, targetId, requestedBy, approvedBy, expiresAt, executedAt | requestedBy != approvedBy |
| AuditEvent | actorId, action, targetType, targetId, reason, correlationId, metadata JSONB | append-only؛ index actorId/createdAt و target |
| OutboxEvent | aggregateType, aggregateId, eventType, payload JSONB, availableAt, processedAt, attempts | index processedAt/availableAt |

قواعد migration:

- foreign keyهای محتوای حساس `ON DELETE RESTRICT` یا ناشناس‌سازی‌شده‌اند؛
- timestamp فقط UTC؛
- enum تغییرناپذیر فرض نشود و migration افزودن مقدار جدا باشد؛
- index مربوط به queue و pagination باید با `EXPLAIN ANALYZE` روی fixture هدف بررسی شود؛
- soft delete با status انجام می‌شود و delete فیزیکی job retention جدا می‌خواهد؛
- outbox event در همان transaction تغییر aggregate نوشته می‌شود.

---

## ۱۳. فهرست endpointهای MVP

تمام مسیرها prefix `/v1` دارند و جز health و درخواست OTP نیازمند session هستند.

| دامنه | Method و path | مجوز |
|---|---|---|
| Health | GET `/health/live`, `/health/ready` | عمومی |
| Auth | POST `/auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout` | عمومی/session |
| MFA | POST `/auth/mfa/enroll`, `/confirm`, `/challenge` | user/admin |
| Profile | GET/PATCH `/me`, GET `/users/:username` | user/public profile |
| Roles | POST/DELETE `/admin/role-assignments` | SUPERADMIN+MFA |
| Spaces | POST `/spaces`, PATCH `/spaces/:id`, POST `/spaces/:id/publish` | user/owner |
| Spaces | GET `/spaces`, GET `/spaces/:slug`, GET `/spaces/similar` | user |
| Spaces | POST/DELETE `/spaces/:id/follow`, GET `/spaces/:id/health` | user/owner |
| Cards | POST `/spaces/:id/cards`, GET `/spaces/:id/cards`, GET/PATCH `/cards/:id` | user/owner |
| Public | GET/POST `/cards/:id/comments`, PATCH/DELETE `/comments/:id` | user/owner |
| Reservation | POST `/cards/:id/reservations`, POST `/reservations/:id/{accept,cancel,in-use,complete,return}` | طرف مجاز |
| Messaging | POST `/conversations/direct`, GET `/conversations`, GET/POST `/conversations/:id/messages` | member |
| Notifications | GET `/notifications`, POST `/notifications/read-all` | user |
| AI | POST `/ai/space-guidance`, `/ai/card-inference`, `/ai/thread-summary` | user + quota |
| Summary | POST `/summaries/:id/{approve,reject,publish}` | عضو مربوط |
| Reports | POST `/reports`, GET `/me/reports/:receiptId` | user/گزارش‌دهنده یا subject |
| Moderation | GET `/admin/cases`, GET `/admin/cases/:id`, POST actionها | MODERATOR+MFA |
| Explanation | POST `/admin/cases/:id/request-explanation`, POST `/cases/:id/respond`, POST `/admin/cases/:id/reconsider` | manager/subject/manager |
| Context | POST `/admin/cases/:id/context-grants`, GET `/admin/context-grants/:id/messages` | moderator مجاز+MFA |
| Policy | GET/POST `/admin/policies`, POST `/admin/dual-approvals` | SUPERADMIN+MFA |
| Metrics | GET `/admin/metrics/awareness`, `/admin/metrics/moderation` | admin |

هیچ route عمومی برای فهرست phone، identity claim، reporter، private message، audit خام یا AI prompt خصوصی وجود ندارد.

---

## ۱۴. ترتیب خواندن محدود برای عامل کم‌استدلال

برای جلوگیری از پرشدن context، عامل در هر تسک فقط این منابع را بارگذاری کند:

1. بخش Global Constraints؛
2. تعریف Milestone جاری؛
3. متن کامل همان Task؛
4. Interfaces تسک‌هایی که همان Task صریحاً مصرف می‌کند؛
5. Review تسک قبل؛
6. فایل‌های ذکرشده در بخش Files؛
7. بخش مدل داده یا endpoint مربوط.

عامل نباید کل repository یا همهٔ فایل‌های seed را در هر تسک دوباره بخواند. اگر interface مصرفی با کد موجود ناسازگار بود، قبل از تغییر قرارداد با `BLOCKED: INTERFACE_MISMATCH` متوقف می‌شود.
