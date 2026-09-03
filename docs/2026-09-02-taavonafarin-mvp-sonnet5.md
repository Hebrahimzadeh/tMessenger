# برنامهٔ پیاده‌سازی MVP پلتفرم مادر تعاون‌آفرینی برای Sonnet 5

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **برای عامل اجرایی:** این سند برای یک عامل «کارگر» نوشته شده است: حق بازطراحی دامنه، حذف تسک، ادغام خودسرانهٔ تسک‌ها یا عبور از Gate را ندارد. هر تسک فقط پس از تأیید Review تسک قبلی اجرا می‌شود.

**هدف:** تبدیل نمونهٔ نمایشی `tMessenger` به MVP واقعی، قابل Deploy و قابل آزمون پلتفرم مادر تعاون‌آفرینی برای ۲۰٬۰۰۰ عضو و ۴٬۰۰۰ تا ۵٬۰۰۰ کاربر فعال روزانه.

**معماری:** رابط فارسی PWA در Next.js، یک API ماژولار Fastify، worker صف، PostgreSQL، Redis و ذخیره‌سازی S3-compatible. سامانه در MVP یک modular monolith است و مرزهای دامنه، قرارداد REST، event/outbox و adapterهای provider از ابتدا صریح می‌مانند.

**فناوری:** Node.js 24 LTS، Next.js 16.2.11، React 19.2، TypeScript، Fastify 5، Prisma 7، PostgreSQL 16، Redis 7، BullMQ 5، Socket.IO 4، Zod 4، Vitest، Playwright و Docker Compose.

**سند مبنا:** `taavonafarin-master-platform-architecture-v3.md`، نسخهٔ ۳.۲

**مخزن هدف:** `tMessenger`

**خط مبنای ثبت‌شده در ۱۴۰۵/۰۶/۱۱:** `npm run lint` و `npm run build` روی Next.js 14.2.35 بدون خطا اجرا شده‌اند؛ پروژه در حال حاضر دادهٔ seed و state حافظه‌ای دارد و backend، database، auth و test runner واقعی ندارد.

---

## ۱. تعریف محصول MVP

MVP زمانی قابل پذیرش است که کاربر پس از مشاهده و پذیرش نسخهٔ مقررات با موبایل وارد شود، زیربستر عمومی مجاز را از متن حتی کلی بسازد، کارت چندرسانه‌ای آگاهی منتشر کند، در thread عمومی مشارکت کند و اقدام عمومی رزرو او را به چت خصوصی صاحب کارت ببرد. صاحب کارت پس از بازگشت/اتمام، رزرو را برای همیشه می‌بندد و برای عرضهٔ بعد کارت تازه می‌سازد. «مشارکت‌های من» فقط فهرست زمانی ساده است. همیار تعاون گزارش‌ها را با درصد ریسک اولویت‌بندی می‌کند و مدیر تصمیم نهایی می‌گیرد. چت خصوصی کاربر-با-کاربر هرگز ورودی خلاصه، پیشنهاد، analytics یا تبلیغ AI نیست.

### ۱.۱ در دامنهٔ MVP

- ورود OTP برای همه و session امن؛
- اعلام پذیرش قوانین پیش از OTP و receipt نسخه‌دار هنگام تأیید؛
- پذیرش شماره‌های E.164 ایران و کشورهای همسایه، با رابط فارسی و بدون age gate؛
- username، نام، avatar، bio و انتخاب عمومی‌بودن شماره؛
- bootstrap امن مدیر کل برای `+989191953219`؛
- MFA، RBAC، audit و تأیید دوم برای عملیات برگشت‌ناپذیر؛
- ساخت آزاد زیربستر عمومی و پیشنهاد زیربستر مشابه؛
- تکمیل خلاق زیربستر/کارت از متن کلی در محدودهٔ schema، policy و تأیید کاربر؛
- جلوگیری پیشینی از ساخت/انتشار زیربستر صریحاً غیرقانونی یا ممنوع طبق rule نسخه‌دار و مسیر انسانی برای ابهام؛
- نبود هرگونه merge یا transfer زیربستر؛ فقط ساخت مستقل و archive؛
- نقش‌های مشارکتی ۲+ با دو نقش اصلی نمایشی، بدون اجبار کاربر به انتخاب نقش؛
- صفحهٔ استاندارد زیربستر شامل هدف، نقش‌ها، دعوت، جست‌وجوی داخلی، pin، feed، ساخت کارت و قواعد؛
- هدایت AI بر اساس معیارهای تعاون‌آفرینی، بدون امتیازدهی تقوا به انسان؛
- تحلیل اختیاری زنجیرهٔ ارزش و جهت‌دهی تعاون‌آفرینانه فقط با تأیید کاربر؛
- کارت آگاهی متنی/تصویری/صوتی/ویدئویی/فایلی، نظر، واکنش ضعیف، pin و رزرو عمومی یک‌بارمصرف با direct chat؛
- کارت نمونهٔ آشکار و حذف‌شده از آمار/تعامل؛ داده و هویت جعلی ممنوع؛
- صفحهٔ خصوصی «مشارکت‌های من» به‌شکل timeline بدون filter/category/score؛
- گفت‌وگوی خصوصی با عدم افشای خودکار شماره و هویت رسمی؛
- UI/UX تلگرام‌آشنا در chat list، room، composer، sheet و وضعیت پیام؛
- منع فنی ارسال متن چت خصوصی کاربر-با-کاربر به AI، analytics، recommendation یا advertising؛
- گفت‌وگوی سیستمی قابل تشخیص «همیار تعاون» با preview/confirm و قابلیت mute؛
- بلوک‌های قابلیت allowlist سطح ۲ که فقط Draft Card تولید می‌کنند؛
- پیکربندی خودکار و بدون پرسش‌نامهٔ دستیار اختیاری زیربستر، با فعال‌سازی تعرفه/سقف و اعتبار بیرونی ثبت‌شده؛
- گزارش بستر، کارت، نظر، پیام و پروفایل؛
- تشخیص گزارش تکراری/هماهنگ؛
- triage همیار با `violationRiskPercent` و `abuseRiskPercent` جدا، بدون حکم خودکار؛
- تعلیق موقت، SLA چهل‌وهشت‌ساعته، آزادی خودکار مورد عادی و قرنطینهٔ خطر شدید؛
- درخواست توضیح، پاسخ کاربر و بازبینی همان مدیر؛
- dashboard پایهٔ آگاهی، سلامت بستر و صف مدیریت؛
- deploy ساده و rollback‌پذیر با Docker Compose.

### ۱.۲ خارج از دامنهٔ MVP

- پرداخت، کیف پول، بیعانه، تسویهٔ درون‌پلتفرمی یا ارزش انتقال‌پذیر؛ تأمین اعتبار AI در MVP بیرون سامانه است؛
- دامنهٔ اختصاصی زیربستر و تبلیغ زیربستر در زیربسترهای دیگر؛ این دو در برنامهٔ تجاری پس از MVP می‌آیند؛
- زیربستر خصوصی؛
- رمزنگاری سرتاسری؛
- چندزبانه‌بودن رابط؛
- Site-Manager و برنامهٔ اختصاصی سطح ۳؛
- معماری توزیع‌شده یا microservice؛
- appeal مستقل چندمرحله‌ای؛
- امتیاز اجتماعی، امتیاز ایمان یا رتبه‌بندی کرامت اشخاص؛
- قرارداد حقوقی یا تعهد مالی ساخت‌یافته؛
- پیشنهاد شخصی یا کشف بین‌زیربستری بر پایهٔ محتوای چت خصوصی؛
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
13. متن چت خصوصی کاربر-با-کاربر را به هیچ provider AI، analytics event، ad signal یا recommendation input ارسال نکن.
14. API یا job با معنای merge، transfer ownership/content/member/follower برای زیربستر نساز.
15. دامنهٔ اختصاصی و تبلیغات را در MVP پیاده‌سازی نکن؛ فقط extension point مستند معماری را حفظ کن.

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
| M1 — هویت | پذیرش نسخهٔ مقررات، ورود OTP، پروفایل و مدیر کل | Deploy و آزمون با موبایل |
| M2 — زیربستر | ساخت خلاقِ مجاز، نقش‌ها، کشف، archive بدون merge و health | ساخت بستر مجاز و رد بستر ممنوع |
| M3 — آگاهی و اقدام | کارت، thread، رزرو عمومی→چت، بسته‌شدن نهایی و timeline ساده | اجرای end-to-end سناریوی نردبان |
| M4 — پیام خصوصی | چت تلگرام‌آشنا و همیار بدون افشا یا پردازش خصوصی | آزمون در دو مرورگر/دستگاه |
| M5 — هوش مصنوعی | تولید خلاق، policy gate، دستیار بودجه‌دار و ابزارهای Draft Card | مقایسهٔ AI/بودجه روشن و خاموش |
| M6 — گزارش و حکمرانی | دو درصد ریسک همیار، پرونده، تعلیق ۴۸ساعته و audit | اجرای گزارش تا تصمیم خلاف/موافق AI |
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
│   │   └── modules/{auth,profiles,spaces,cards,awareness,messaging,ai,storage,moderation,governance,audit}/
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

**تست پایه:**

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

**تست پایه:**

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

## Task 03 — PostgreSQL، Redis، object storage، Prisma و محیط محلی

**Files:**

- Create: `docker-compose.yml`, `.env.example`
- Create: `packages/database/package.json`, `packages/database/prisma/schema.prisma`, `packages/database/src/client.ts`
- Create: `services/api/src/config/env.ts`, `services/api/src/plugins/database.ts`, `services/api/src/plugins/redis.ts`
- Create: `services/api/src/modules/storage/{storage-provider.ts,fake-storage-provider.ts,s3-storage-provider.ts,storage.test.ts}`
- Create: `services/api/src/config/env.test.ts`, `packages/database/src/client.test.ts`

**Interfaces:**

- `getPrisma(): PrismaClient`
- Fastify decorators: `app.db`, `app.redis`
- `StorageProvider.putPrivate/getSignedRead/delete`؛ domain فقط objectKey نگه می‌دارد.
- env اجباری: `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `SESSION_HMAC_KEY`, `PHONE_ENCRYPTION_KEY`, `APP_ORIGIN`.

**Gate پیش از شروع:** Review تسک ۰۲، اجرای `npm run verify` و worktree تمیز را تأیید کن.

**مراحل:**

- [ ] PostgreSQL 16، Redis 7 و object storage سازگار با S3 را با healthcheck، bucket خصوصی و volume نام‌دار در Compose تعریف کن.
- [ ] env schema را با Zod بنویس؛ production با secret پیش‌فرض یا کوتاه باید fail-fast شود.
- [ ] Prisma 7 را با UUID، timezone UTC و naming صریح پیکربندی کن.
- [ ] migration پایه فقط جداول `SystemSetting` و `OutboxEvent` را ایجاد کند.
- [ ] pluginهای DB/Redis را با lifecycle درست connect/disconnect بساز.
- [ ] adapter ذخیره‌سازی را با fake برای تست و S3 برای runtime بساز؛ هیچ object به‌صورت anonymous public نباشد.
- [ ] ready endpoint را به ping واقعی DB، Redis و storage وصل کن.
- [ ] تست env و integration DB/storage را ابتدا شکست بده، سپس پیاده‌سازی کن.

**تست پایه:**

```powershell
docker compose up -d postgres redis object-storage
npm run db:migrate
npm run test:integration --workspace services/api
npm run verify
docker compose ps
```

**ارزیابی و Review پایان تسک:**

- [ ] restart دادهٔ PostgreSQL را از بین نمی‌برد.
- [ ] ready هر سه dependency را `ok` گزارش می‌کند.
- [ ] put/read/delete در fake و S3 adapter قرارداد یکسان دارد و object بدون signed URL خوانده نمی‌شود.
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

**تست پایه:**

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

**Files:** `packages/database/prisma/schema.prisma`، migration هویت/اسناد حقوقی، `services/api/src/modules/auth/{phone,bootstrap}.ts`، `services/api/src/modules/legal/legal-document.{repository,service,route}.ts` و تست‌ها، `scripts/bootstrap-superadmin.mjs`.

**Interfaces:** مدل‌های `User`, `UserProfile`, `PhoneIdentity`, `LegalDocumentVersion`, `TermsAcceptance`, `Session`, `Device`, `Role`, `RoleAssignment`, `OfficialIdentityClaim`, `AuditEvent`؛ `GET /v1/legal/current -> {termsVersion,privacyVersion,termsUrl,privacyUrl}` عمومی؛ `normalizePhone(input, defaultCountry): E164` با پشتیبانی IR, IQ, TR, AZ, AM, TM, AF, PK؛ `bootstrapSuperadmin(phoneE164): Promise<{userId, created, roleAssigned}>` باید idempotent باشد.

**Gate پیش از شروع:** Review APPROVED تسک ۰۴ و تأیید مالک M0 را کنترل کن؛ `npm run verify`، migration status و تمیزی worktree الزامی است.

**مراحل:**

- [ ] با libphonenumber تست normalization برای `09...`، `+98...`، ارقام فارسی، هر کشور همسایه، country code ناسازگار و شمارهٔ نامعتبر بنویس.
- [ ] شماره را به `phoneHash` برای lookup و `phoneCiphertext` برای بازیابی محدود تبدیل کن؛ plaintext ذخیره نکن.
- [ ] schema هویت را با UUID، unique constraint و UTC اضافه کن.
- [ ] نسخهٔ immutable قوانین و حریم خصوصی و receipt پذیرش append-only با unique user/version/type اضافه کن؛ متن منتشرشده rewrite نشود.
- [ ] bootstrap فقط از `BOOTSTRAP_SUPERADMIN_PHONE` بخواند؛ شماره در client یا شرط درخواست hardcode نشود.
- [ ] نقش‌های `USER`, `SPACE_ADMIN`, `MODERATOR`, `SENIOR_ADMIN`, `SUPERADMIN`, `OPS` را seed کن.
- [ ] bootstrap را دو بار اجرا و idempotency را تست کن.

**تست پایه:** تست‌های phone/legal-version/bootstrap، migration، دو اجرای bootstrap و `npm run verify`.

**ارزیابی و Review پایان تسک:** دقیقاً یک user و role assignment؛ نسخهٔ حقوقی immutable؛ نبود plaintext شماره در DB/log/bundle؛ audit موجود؛ Review 05 APPROVED؛ commit `feat: add versioned legal identity foundation`.

## Task 06 — درخواست و تأیید OTP با session چرخان

**Files:** `services/api/src/modules/auth/auth.{schemas,repository,service,route}.ts`، providerهای SMS، تست service/route و `packages/contracts/src/auth.ts`.

**Interfaces:** `POST /v1/auth/otp/request` همیشه 202 با `challengeId` و انقضای ۳۰۰ ثانیه و نسخهٔ حقوقی ارائه‌شده؛ `POST /v1/auth/otp/verify {challengeId,code,termsVersion,privacyVersion}` با cookie HttpOnly و ثبت idempotent receipt؛ نسخهٔ ارائه‌شده باید هنگام verify همچنان current باشد وگرنه `LEGAL_VERSION_CHANGED`؛ refresh/logout؛ رابط `SmsProvider.sendOtp(phoneE164, code)`.

**Gate پیش از شروع:** `npm run review:gate -- --task 05`، verify و جست‌وجوی plaintext شماره؛ در failure شروع نکن.

**مراحل:**

- [ ] تست پاسخ یکسان، انقضا، حداکثر پنج تلاش و rate limit را ابتدا بنویس.
- [ ] OTP را با CSPRNG بساز و فقط HMAC آن را ذخیره کن.
- [ ] challenge نسخهٔ قوانین/حریم خصوصی دیده‌شده را نگه دارد؛ verify موفق همان نسخه را به user و timestamp متصل و تکرار را idempotent کند.
- [ ] اگر نسخه بین request و verify تغییر کرد، session نساز و client را برای نمایش/پذیرش نسخهٔ تازه برگردان.
- [ ] dev provider فقط خارج production sink تست داشته باشد؛ production بدون provider معتبر start نشود.
- [ ] production provider کشور مقصد را از E.164 تشخیص دهد و اگر route فعال ندارد پیش از ساخت challenge پاسخ کنترل‌شده بدهد؛ allow-list کشورها config نسخه‌دار باشد.
- [ ] access session پانزده‌دقیقه‌ای و refresh session سی‌روزهٔ چرخان بساز.
- [ ] reuse refresh token کل خانوادهٔ session را revoke کند.
- [ ] cookieها را HttpOnly، در production امن، SameSite=Lax و محدود به path تنظیم کن.
- [ ] audit بدون شماره و code خام ثبت شود.

**تست پایه:** تست‌های auth service/route، integration auth و verify.

**ارزیابی و Review پایان تسک:** enumeration نیست؛ OTP مصرف‌شده/منقضی رد؛ session بدون receipt نسخهٔ جاری صفر؛ تغییر نسخه کنترل‌شده؛ reuse sessionها revoke؛ log پاک؛ Review 06 APPROVED؛ commit `feat: bind OTP sessions to legal acceptance`.

## Task 07 — رابط ورود و حفاظت مسیرها

**Files:** `app/login/page.tsx`، `components/auth/{PhoneForm,OtpForm}.tsx`، `lib/auth/{session,require-user}.ts`، `proxy.ts`، تغییر layout/client و تست component/E2E.

**Interfaces:** `getCurrentUser(): Promise<AuthUser|null>`؛ مسیرهای عمومی `/login`، `/legal/terms`، `/legal/privacy` و `/system-status`؛ مسیر بازگشت login فقط داخلی و allow-listed؛ فرم شماره country selector فارسی با پیش‌فرض ایران دارد؛ بالای CTA متن مصوب پذیرش با دو پیوند دیده می‌شود.

**Gate پیش از شروع:** Review 06، verify، integration auth و تمیزی worktree.

**مراحل:**

- [ ] تست RTL ورود شماره، شمارش معکوس، code نامعتبر و resend بنویس.
- [ ] فرم را با ارقام فارسی/لاتین و خطای دسترس‌پذیر بساز.
- [ ] متن «ثبت‌نام و ورود به منزلهٔ پذیرش قوانین و مقررات جامعهٔ تعاون‌آفرینی است» را پیش از دریافت کد با پیوند نسخهٔ جاری قوانین/حریم خصوصی نمایش بده؛ checkbox اجباری جدا نساز.
- [ ] termsVersion/privacyVersion دریافتی را فقط در state همان challenge نگه دار و در verify بفرست؛ خطای LEGAL_VERSION_CHANGED متن جدید را پیش از retry نمایش دهد.
- [ ] کشورهای همسایهٔ allow-list را در selector نشان بده و هیچ فیلد سن یا مانع age gate اضافه نکن.
- [ ] OTP شش‌رقمی و قابل paste باشد و در localStorage ذخیره نشود.
- [ ] API client را به cookie session و CSRF header متصل کن.
- [ ] Proxy در `proxy.ts` فقط redirect اولیه انجام دهد؛ authorization در API بماند.
- [ ] E2E ورود dev، refresh، logout و redirect را بنویس.

**تست پایه:** تست PhoneForm، E2E auth و verify.

**ارزیابی و Review پایان تسک:** متن پذیرش پیش از CTA و linkها قابل مشاهده؛ receipt جاری شرط session؛ ورود و ماندگاری موفق؛ route محافظت‌شده بسته؛ open redirect/token storage نیست؛ Review 07 APPROVED؛ commit `feat: add terms-aware Persian OTP login`.

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

**Interfaces:** مدل‌های `Space`, `SpaceDefinitionVersion`, `SpaceParticipationRole`, `SpaceRoleMembership`, `SpaceInvite`, `SpaceAdmin`, `SpaceFollower`؛ statusهای `DRAFT|PRECHECK_REQUIRED|HUMAN_REVIEW|PUBLISHED|TEMPORARILY_SUSPENDED|ARCHIVED|REMOVED`؛ `SpaceCreationGate.evaluate(definition)->ALLOW|REVISE|HUMAN_REVIEW|BLOCK`؛ endpointهای create/update/precheck/publish/archive/get و role/invite؛ هیچ merge/transfer endpoint؛ هر edit یک version immutable.

**Gate پیش از شروع:** Review 09 و تأیید مالک M1، سپس verify، E2E superadmin و migration status.

**مراحل:**

- [ ] تست ساخت draft توسط هر user و ویرایش فقط توسط creator/admin بنویس.
- [ ] contract test دروازه را بنویس: publish بدون ALLOW ممنوع؛ BLOCK هیچ slug/Space عمومی نسازد؛ HUMAN_REVIEW قابل انتشار نباشد.
- [ ] definition شامل purpose، audience، participationMethods، cardHints، دو `primaryRoleId`، نقش‌های تکمیلی و policyVersion باشد.
- [ ] هر بستر حداقل دو نقش داشته باشد؛ عضویت نقش اختیاری و چندنقشی است و هیچ API عمومی کارت/نظر/گفتگو آن را پیش‌شرط نکند.
- [ ] invite token تصادفی، قابل ابطال و صرفاً shortcut عمومی باشد؛ در MVP مجوز خصوصی نسازد.
- [ ] template کارت نمونه فقط با `isExample=true` و برچسب ثابت ذخیره شود و هیچ هویت یا رخداد مشارکت ساختگی نسازد.
- [ ] slug فارسی/لاتین امن و collision strategy قطعی پیاده کن.
- [ ] publish حداقل title، purpose، یک participation method و دو نقش اصلی متفاوت بخواهد.
- [ ] adapter موقت قاعده‌محور M2 را پشت `SpaceCreationGate` بساز؛ ruleهای صریح fixture را BLOCK و هر مورد خارج پوشش را HUMAN_REVIEW کند، نه ALLOW حدسی؛ Task 24 provider AI را جایگزین می‌کند.
- [ ] archive را فقط creator/space-admin مجاز و برگشت آن را خارج MVP نگه دار؛ هیچ schema/service/route برای انتقال مالکیت، عضو، کارت، follower یا merge نساز.
- [ ] دسترسی عمومی فقط PUBLISHED را برگرداند.
- [ ] eventهای `space.created`, `space.published`, `space.versioned` در outbox همان transaction ثبت شوند.

**تست پایه:** unit/integration spaces، migration و verify.

**ارزیابی و Review پایان تسک:** ساخت draft آزاد؛ انتشار فقط بعد ALLOW؛ BLOCK/HUMAN_REVIEW نشت عمومی صفر؛ version immutable؛ merge/transfer API صفر؛ archive مجاز؛ دو نقش اصلی معتبر؛ role membership شرط مشارکت نیست؛ Review 10 APPROVED؛ commit `feat: gate and version independent public spaces`.

## Task 11 — جست‌وجو، دنبال‌کردن و مشابهت پایه

**Files:** `space-search.service.ts`, `space-search.route.ts`, `space-similarity.service.ts` و تست، migration index و `packages/contracts/src/pagination.ts`.

**Interfaces:** `GET /v1/spaces?q=&cursor=&limit=20&scope=all|following`؛ follow/unfollow idempotent؛ `GET /v1/spaces/similar?title=&purpose=` حداکثر پنج نتیجه؛ cursor opaque و limit ۱ تا ۵۰.

**Gate پیش از شروع:** Review 10، integration spaces، migration status و verify.

**مراحل:**

- [ ] تست pagination پایدار، ی/ي، ک/ك و follow idempotent بنویس.
- [ ] normalization فارسی و full-text/trigram index PostgreSQL را migration کن.
- [ ] similarity قاعده‌محور را با token overlap عنوان/هدف بساز؛ AI در M5 تکمیل می‌کند.
- [ ] نتیجهٔ مشابه فقط CTA «مشارکت در موجود» و «ادامهٔ ساخت مستقل» بدهد؛ هیچ merge/transfer action یا semantics نساز.
- [ ] ranking بر relevance، تازگی و health باشد؛ popularity تنها عامل نباشد.
- [ ] suspended/removed در نتیجهٔ عمومی نباشد.

**تست پایه:** unit/integration space-search و verify.

**ارزیابی و Review پایان تسک:** query فارسی ثابت؛ cursor بدون تکرار/حذف؛ مشابهت قبل انتشار؛ آرشیوشده/معلق پنهان؛ هیچ merge/transfer؛ Review 11 APPROVED؛ commit `feat: add fair independent space discovery`.

## Task 12 — رابط ساخت، فهرست و صفحهٔ زیربستر

**Files:** `app/spaces/new/page.tsx`، componentهای SpaceComposer/SimilarSpaces، `app/spaces/[slug]/page.tsx`، SpaceHeader/SpaceFeed، تغییر صفحهٔ خانه و تست‌ها.

**Interfaces:** UI فقط قرارداد Task 10/11؛ seed فقط fixture توسعه؛ پیشنهاد مشابهت دو CTA «مشارکت در بستر موجود» و «ادامه ساخت» دارد و تصمیم با کاربر است؛ صفحهٔ زیربستر قرارداد ثابت header/roles/invite/search/pins/feed/composer/tools/rules را دارد.

**Gate پیش از شروع:** Review 11، integration API و verify.

**مراحل:**

- [ ] test-first فرم شرح آزاد، preview و validation فارسی بساز.
- [ ] خانه را از API تغذیه کن؛ loading، empty و retry داشته باشد.
- [ ] جریان ساخت را به draft، preview و publish تفکیک کن.
- [ ] wizard از متن آزاد دو نقش اصلی و نقش‌های تکمیلی را برای ویرایش دستی بگیرد؛ انتخاب نقش برای بازدیدکننده اجباری نباشد.
- [ ] مشابهت را نشان بده ولی publish مستقل را مسدود نکن.
- [ ] حالت‌های precheck را نشان بده: ALLOW ادامه، REVISE پیشنهاد قابل ویرایش، HUMAN_REVIEW توقف قابل فهم و BLOCK دلیل/rule بدون صفحهٔ عمومی.
- [ ] follow/unfollow، creator، پیوند دعوت و جست‌وجوی درون بستر را متصل کن.
- [ ] اینفوگرافیک دو نقش اصلی، جایگاه pinned cards، feed، composer، tools و rules/report را در mobile و desktop بساز؛ بخش‌های بدون داده empty-state واقعی داشته باشند.
- [ ] کارت‌های نمونه همیشه badge «نمونه — محتوای واقعی نیست» داشته باشند و CTA تعامل/رزرو/پسند روی آن‌ها غیرفعال باشد.
- [ ] URL قدیمی `/platforms/:id` را سازگار redirect کن تا prototype نشکند.
- [ ] header، back navigation، bottom-sheet ساخت و بازخورد loading/sent/error را طبق قرارداد تلگرام‌آشنا بساز، بدون کپی دارایی بصری تلگرام.

**تست پایه:** component test، `npx playwright test tests/e2e/spaces.spec.ts` و verify.

**ارزیابی و Review پایان تسک:** ساخت با متن طبیعی؛ چهار نتیجهٔ precheck قابل فهم؛ BLOCK صفحه عمومی ندارد؛ پیشنهاد غیرتحمیلی؛ نقش اختیاری؛ قرارداد کامل صفحه؛ UI تلگرام‌آشنا در ۳۶۰px/desktop؛ Review 12 APPROVED؛ commit `feat: deliver gated public space creation journey`.

## Task 13 — سلامت زیربستر و worker پایه

**Files:** schema snapshot، `services/worker/{package.json,tsconfig.json}`، `services/worker/src/{worker.ts,jobs/space-health.ts}` و تست، route health و `SpaceHealthPanel.tsx`.

**Interfaces:** `SpaceHealthSnapshot` بردار جداگانهٔ cardCount، contributorCount، meaningfulViewCount، firstUseLatency، roleActivity، crossRoleCardRate، appliedRate، reservationClosedRate، reportQuality و lastActivityAt دارد؛ وضعیت `NEW|ACTIVE|FRAGILE|DORMANT`؛ endpoint health فقط creator/admin و بدون score عددی واحد.

**Gate پیش از شروع:** Review 12، E2E spaces و verify.

**مراحل:**

- [ ] تست مرز وضعیت‌ها با clock ثابت بنویس.
- [ ] تست کن example card، reaction و ترافیک bot هیچ counter سلامت/مشارکت را افزایش نمی‌دهد.
- [ ] BullMQ worker و job روزانهٔ idempotent بساز.
- [ ] پیشنهاد اولین کارت واقعی، بهبود معرفی، جذب نقش کم‌فعال و آرشیو/ارجاع بستر مشابه را بدون جابه‌جایی داده نمایش بده.
- [ ] در MVP آرشیو خودکار نکن؛ فقط پیشنهاد و اعلان ثبت کن.
- [ ] dashboard سازنده ابعاد را جدا و بدون ranking عمومی، نمرهٔ اخلاقی یا مجازات خودکار بساز.

**تست پایه:** تست worker health، E2E spaces و verify.

**ارزیابی و Review پایان تسک:** health رفتار اتصال را چندبعدی می‌سنجد؛ sample/bot حذف؛ job دوگانه نیست؛ merge/transfer صفر؛ کم‌فعال خودکار محدود نمی‌شود؛ Review 13 APPROVED؛ commit `feat: guide health with independent archiving`.

### توقف اجباری M2

Deploy Packet شامل fixture چهار نتیجهٔ gate، حساب user، مسیر ساخت، جست‌وجوی کل/داخل، مشابهت، archive، دعوت و health است. مالک بستر مجاز را publish، بستر صریحاً ممنوع را بدون slug رد، مورد مبهم را متوقف و دو بستر مشابه را بدون merge/transfer مشاهده می‌کند. ادامه فقط با `MILESTONE-2 APPROVED`.

---

# M3 — کارت آگاهی، گفت‌وگوی عمومی و اقدام

## Task 14 — مدل کارت چندرسانه‌ای، revision و گونهٔ استنباطی

**Files:** schema/migration cards/attachments، module `services/api/src/modules/cards/` شامل schemas/repository/service/route/state-machine/attachment-service و تست، route آپلود در `services/api/src/modules/storage/`، `packages/contracts/src/card.ts`.

**Interfaces:** `CardKind = AWARENESS|OBSERVATION|REUSABLE_RESOURCE|CONSUMABLE_RESOURCE|REQUEST|SERVICE|PARTICIPATION|EVENT`؛ این kind داخلی و قابل اصلاح است؛ user مجبور به انتخاب نیست. `CardAttachmentKind = IMAGE|AUDIO|VIDEO|FILE|LINK|APPROXIMATE_LOCATION`؛ وضعیت پیوست `PENDING|PROCESSING|READY|REJECTED`؛ endpointهای upload-intent/finalize و create/update/get/list؛ revision immutable.

**Gate پیش از شروع:** Review 13 و تأیید M2، سپس verify، worker test و migration status.

**مراحل:**

- [ ] تست ساخت کارت فقط با `body`، فقط با یک پیوست معنادار، derivation عنوان و مجوز owner بنویس.
- [ ] مدل‌های `Card`, `CardRevision`, `CardSemanticProfile`, `CardAttachment`, `CardEvent` را اضافه کن.
- [ ] upload-intent فقط objectKey تصادفی در prefix کاربر بدهد؛ finalize نوع واقعی، اندازه، checksum، مالکیت و status READY را کنترل کند.
- [ ] allowlist اولیه را تصویر، صوت، ویدئو و فایل سند تعریف کن؛ link و موقعیت تقریبی بدون واکشی server-side URL ذخیره شوند.
- [ ] فایل READYنشده در کارت PUBLISHED نمایش داده نشود؛ فایل rejected هرگز signed read URL نگیرد.
- [ ] کارت با `PUBLISHED/ACTIVE` آغاز شود؛ kind پیش‌فرض AWARENESS است.
- [ ] edit revision و outbox event بسازد؛ حذف فیزیکی انجام نشود.
- [ ] فهرست کارت cursor-based و ترتیب آن ترکیب تازگی/relevance باشد؛ reaction بعداً فقط وزن ضعیف می‌گیرد.
- [ ] suspended space اجازهٔ ساخت کارت عمومی ندهد.

**تست پایه:** unit state machine، integration card CRUD/upload ownership/type/size و verify.

**ارزیابی و Review پایان تسک:** متن تنها یا پیوست معنادار کافی؛ kind اجباری نیست؛ رسانهٔ ناآماده/غیرمجاز نشت نمی‌کند؛ revision و checksum حفظ؛ مجوزها صحیح؛ Review 14 APPROVED؛ commit `feat: add awareness-first multimedia cards`.

## Task 15 — thread عمومی، واکنش، سنجاق و ویرایش امن

**Files:** schema comments/revisions/reactions/pins، `services/api/src/modules/cards/public-comment.{schemas,repository,service,route}.ts`، reaction/pin service/route و تست، `packages/contracts/src/public-comment.ts`، componentهای PublicThread/CommentComposer/CardReactions/PinnedCards.

**Interfaces:** list/create/edit/delete-soft/reply؛ reply فقط به comment همان card؛ متن ۱ تا ۴۰۰۰ نویسه؛ edit history فقط owner/moderator طبق policy؛ reaction toggle idempotent با unique user/card/type؛ pin/unpin فقط creator/space-admin و دارای audit.

**Gate پیش از شروع:** Review 14، integration cards و verify.

**مراحل:**

- [ ] تست comment، reply cross-card، edit owner و delete-soft بنویس.
- [ ] comment و revision را transactionally ذخیره کن.
- [ ] reaction را idempotent و rate-limited بساز؛ example card هیچ reaction نپذیرد.
- [ ] pin را با ترتیب محدود، مجوز بستر و audit بساز؛ suspended/removed/example قابل pin نباشد.
- [ ] ranking را از relevance/تازگی/تنوع/health بسازد و reaction فقط ضریب کوچک سقف‌دار باشد؛ تست کند کارت پرپسند نامرتبط بالاتر از مرتبط قرار نگیرد.
- [ ] public-first CTA را «پرسش یا مشارکت عمومی» قرار بده.
- [ ] متن را plain text render کن و link را با rel امن نمایش بده.
- [ ] system event با comment انسانی type مشترک نداشته باشد.
- [ ] thread را با pagination و optimistic UI متصل کن.

**تست پایه:** تست API comment/reaction/pin/ranking، component thread، E2E public discussion و verify.

**ارزیابی و Review پایان تسک:** reply نادرست رد؛ reaction تکراری شمارش را باد نمی‌کند؛ popularity غالب نیست؛ pin غیرمجاز رد؛ حذف متن را پنهان ولی audit را حفظ؛ XSS نیست؛ CTA عمومی اصلی است؛ Review 15 APPROVED؛ commit `feat: add public card discussions and weak reactions`.

## Task 16 — رزرو عمومی idempotent، direct conversation و بسته‌شدن نهایی

**Files:** schema reservation/operational state/idempotency و مدل حداقلی conversation/member، `card-state-machine.ts`، `reservation.{service,route}.ts`، `services/api/src/modules/messaging/direct-conversation.{port,repository}.ts` و تست concurrency، `packages/contracts/src/reservation.ts`.

**Interfaces:** stateهای قابلیت رزرو `ACTIVE|RESERVED|IN_USE|RESERVATION_CLOSED|TEMPORARILY_SUSPENDED`؛ `POST /cards/:id/reservations -> {reservationId,conversationId}` همان transaction منطقی رزرو و create-or-get direct conversation را کامل می‌کند؛ endpointهای reserve/cancel/release/mark-in-use/close؛ `closeReason=RETURNED|COMPLETED|TIME_ENDED|OWNER_CLOSED`؛ فقط owner مجاز به close terminal؛ header `Idempotency-Key` اجباری.

**Gate پیش از شروع:** Review 15، public discussion E2E و verify.

**مراحل:**

- [ ] جدول transition مجاز را در تست بنویس؛ transition نامعتبر 409.
- [ ] دو رزرو هم‌زمان را با transaction و version column تست کن؛ فقط یکی موفق.
- [ ] `getOrCreateDirectConversation(ownerId,reserverId)` را idempotent بساز و تست کن هر reserve موفق conversationId می‌دهد؛ شکست ساخت گفتگو رزرو نیمه‌کاره باقی نگذارد.
- [ ] مرحلهٔ accept را حذف کن؛ reserve موفق فوراً RESERVED و اعلان‌شونده است.
- [ ] requester پیش از استفاده cancel و owner رزرو نامعتبر را با reason release کند؛ فقط این دو transition به ACTIVE برگردند.
- [ ] owner پس از تحویل `mark-in-use` و پس از بازگشت/اتمام/پایان زمان `close` کند؛ RESERVATION_CLOSED terminal و reopen آن 409 باشد.
- [ ] waitlist، EXPIRED tag و reactivation همان کارت را پیاده نکن.
- [ ] هر transition CardEvent و AwarenessEvent بسازد.
- [ ] AI یا client حق قطعی‌کردن state بدون command مجاز ندارد.

**تست پایه:** unit transition، integration concurrency/idempotency/conversation atomicity/terminal-close و verify.

**ارزیابی و Review پایان تسک:** reserve اکشن عمومی و بدون accept؛ رزرو دوگانه نیست؛ conversationId فوری و یکتا؛ cancel/release بازگشایی می‌کند؛ close فقط owner و terminal؛ reactivation/EXPIRED صفر؛ Review 16 APPROVED؛ commit `feat: open private chat from terminal reservations`.

## Task 17 — رابط ایجاد کارت و سناریوی نردبان

**Files:** بازنویسی `CreateCardSheet.tsx`, `CardTemplate.tsx`, `CardDetailView.tsx` برای API؛ create `CardComposer.tsx`, `CardAttachmentPicker.tsx`, `MediaPreview.tsx`, `ReservationActions.tsx`, `DuplicateCardAction.tsx` و تست E2E `ladder-flow.spec.ts`.

**Interfaces:** کاربر متن طبیعی می‌نویسد؛ سؤال عملیاتی فقط اگر behavior را تغییر دهد؛ state button بر اساس actor/state از API می‌آید، نه منطق مستقل client.

**Gate پیش از شروع:** Review 16، تست concurrency، migration و verify.

**مراحل:**

- [ ] تست component برای کارت آگاهی بدون state و نردبان REUSABLE بنویس.
- [ ] composer را تک‌ورودی و preview-first بساز؛ انتخاب kind اجباری نباشد.
- [ ] متن کلی را نیز قابل ارسال نگه دار؛ در M3 fallback قاعده‌محور preview می‌دهد و Task 25 تولید خلاق AI را کامل می‌کند.
- [ ] picker تصویر/صوت/ویدئو/فایل، پیشرفت upload، cancel/retry، preview و شرح دسترس‌پذیر را متصل کن.
- [ ] نمونه را با badge دائمی و CTAهای reaction/reserve/chat غیرفعال render کن.
- [ ] صفحهٔ card detail را به thread عمومی و actionها متصل کن.
- [ ] اقدام «رزرو» را در کارت عمومی نشان بده و پس از موفقیت فوراً به `/chats/:conversationId` هدایت کن؛ شماره/هویت رسمی عمومی نشود.
- [ ] E2E دو user: ایجاد نردبان، نظر، رزرو، redirect چت، in-use، close با RETURNED و disabled reservation.
- [ ] در feed tag «منقضی» یا badge وضعیت terminal نشان نده؛ در detail دکمه disabled و متن «رزرو این کارت بسته شده است» نمایش بده.
- [ ] برای owner اقدام «ساخت کارت مشابه» بساز که draft تازه با body/media reference مجاز ایجاد کند، نه reopen کارت قبلی.
- [ ] refresh در هر مرحله state server را حفظ کند.

**تست پایه:** component cards/media، E2E upload تصویر و صوت، `npx playwright test tests/e2e/ladder-flow.spec.ts` و verify.

**ارزیابی و Review پایان تسک:** رزرو عمومی به چت می‌رود؛ close دکمه را بی‌badge غیرفعال می‌کند؛ کارت مشابه id تازه دارد؛ reopen قبلی ناممکن؛ کارت متنی/تصویری/صوتی و نمونه شفاف؛ Review 17 APPROVED؛ commit `feat: deliver terminal public reservation journey`.

## Task 18 — رخداد، مشارکت‌های من و dashboard قیف آگاهی

**Files:** schema awareness/participation log، module `services/api/src/modules/awareness/`، worker aggregation/log projection، `app/participations/page.tsx`, `components/participations/ParticipationTimeline.tsx`, `app/admin/metrics/page.tsx`, `components/metrics/AwarenessFunnel.tsx` و تست.

**Interfaces:** eventهای `PRODUCED|MEANINGFUL_VIEW|PUBLIC_CONTRIBUTION|RESERVED|PRIVATE_CHAT_STARTED|APPLIED|RESERVATION_CLOSED`؛ event دارای actor pseudonymous، subject و idempotency key؛ `GET /v1/me/participations?cursor=&limit=20` فقط ترتیب زمانی نزولی و بدون پارامتر category/status/filter/search؛ metric اصلی تعداد کارت‌های به‌کارگرفته‌شده است.

**Gate پیش از شروع:** Review 17، ladder E2E و verify.

**مراحل:**

- [ ] dedup view و bot/internal traffic را در تست تعریف کن.
- [ ] event ingestion را append-only و فاقد متن خصوصی بساز.
- [ ] aggregation روزانه produced/received/applied و public/private ratio بساز.
- [ ] log idempotent از کارت، نظر، رزرو، عرضه، استفاده و اتمام بساز؛ فقط event label، زمان و deep-link نگه دار و category/status مشتق نکن.
- [ ] صفحهٔ مشارکت‌های من timeline خصوصی و pagination زمانی داشته باشد؛ filter chip، tab دسته، search، score، summary یا «اقدام باز» نساز.
- [ ] example card، reaction و bot event را از شمارنده‌های awareness و فهرست زمانی مشارکت حذف کن.
- [ ] dashboard فقط آمار تجمیعی و بدون score انسان نمایش دهد.
- [ ] retention شناسهٔ خام analytics را حداقل کن.

**تست پایه:** unit awareness/participation-log، integration aggregation/privacy، dashboard و participation component و verify.

**ارزیابی و Review پایان تسک:** refresh view را باد نمی‌کند؛ private text ثبت نیست؛ نمونه/واکنش ارزش نمی‌سازند؛ timeline فقط owner، زمانی و فاقد filter/category/status/score است؛ Review 18 APPROVED؛ commit `feat: keep a simple private participation timeline`.

### توقف اجباری M3

Deploy Packet شامل دو حساب، کارت رسانه‌ای و dashboard است. مالک رزرو عمومی نردبان را می‌زند، redirect به direct chat را می‌بیند، کارت را IN_USE و سپس RESERVATION_CLOSED می‌کند، نبود tag انقضا و غیرفعال‌بودن رزرو را می‌بیند، کارت مشابه تازه می‌سازد و timeline بدون فیلتر را بررسی می‌کند. ادامه فقط با `MILESTONE-3 APPROVED`.

---

# M4 — پیام‌رسان خصوصی realtime

## Task 19 — تکمیل API پیام خصوصی روی conversation رزرو

**Files:** تکمیل schema conversation/member موجود از Task 16 با message/revision/receipt، module `services/api/src/modules/messaging/` و تست، `packages/contracts/src/messaging.ts`.

**Interfaces:** `getOrCreateDirectConversation` و یکتایی زوج از Task 16 بدون تغییر مصرف می‌شود؛ نوع `DIRECT|SYSTEM_ASSISTANT`؛ create/list/messages/send/edit-own/delete-own؛ message ۱ تا ۸۰۰۰ نویسه؛ cursor؛ حساب `taavon-helper` قابل جعل/عضوگیری نیست؛ متن DIRECT فقط در messaging storage و مسیر گزارش M6 مصرف می‌شود.

**Gate پیش از شروع:** Review 18 و تأیید M3، سپس verify و awareness integration.

**مراحل:**

- [ ] تست منع خواندن/نوشتن non-member و یکتایی direct conversation بنویس.
- [ ] migration موجود Task 16 را forward-only تکمیل کن؛ create-or-get را تغییر امضا نده و backfill مخرب نساز.
- [ ] conversation همیار را برای هر user به‌صورت idempotent بساز؛ sender سیستمی فقط از service credential داخلی و هر mutation پیشنهادی فقط با confirmation token کاربر مجاز باشد.
- [ ] message persistence، receipt و soft delete را پیاده کن.
- [ ] serialization هرگز phone، identity claim یا member خصوصی را ضمیمه نکند.
- [ ] تست canary بنویس که ارسال/خواندن DIRECT هیچ `AiRequest`، `AwarenessEvent` دارای متن، recommendation event یا advertising signal نسازد.
- [ ] audit فقط metadata لازم داشته باشد، نه متن پیام.

**تست پایه:** unit permission، integration دو/سه کاربر و verify.

**ارزیابی و Review پایان تسک:** reservation conversation بدون migration شکست ادامه می‌یابد؛ non-member 404؛ حساب همیار قابل impersonate نیست؛ private text در AI/analytics/ad/log صفر؛ pagination ثابت؛ Review 19 APPROVED؛ commit `feat: complete isolated private messaging`.

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

## Task 21 — رابط چت، همیار تعاون و هشدار افشای اطلاعات

**Files:** بازنویسی `hooks/useChats.tsx`, `ChatRoom.tsx`, `ChatsList.tsx`, `MessageBubble.tsx`؛ create `ChatComposer.tsx`, `ChatContextMenu.tsx`, `SensitiveDataWarning.tsx` و E2E `private-chat.spec.ts`.

**Interfaces:** شروع چت از profile/card/reservation؛ الگوی تلگرام‌آشنا شامل avatar/name/last message/time/unread، header/back، bubble، composer پایین، reply، long-press menu و sent/read state؛ شماره/نشانی هشدار غیرمسدودکننده؛ هیچ contact خودکار؛ همیار badge سیستمی و mute/hide دارد.

**Gate پیش از شروع:** Review 20، realtime tests و verify.

**مراحل:**

- [ ] component tests برای pending/sent/failed/retry و هشدار شماره بنویس.
- [ ] لیست و room را از seed به API/realtime منتقل کن.
- [ ] layout و interaction قرارداد تلگرام‌آشنا را در RTL/360px/desktop بساز؛ دارایی، لوگو، رنگ‌بندی یا copy تلگرام را کپی نکن.
- [ ] optimistic message را با clientMessageId reconciliation کن.
- [ ] هشدار دادهٔ حساس گزینه‌های «ویرایش» و «با آگاهی ارسال می‌کنم» داشته باشد.
- [ ] E2E را در دو browser context اجرا کن.
- [ ] همیار را با badge «حساب سیستمی»، توضیح حدود اختیار و شناسهٔ بصری مستقل در فهرست/room نشان بده؛ UI نباید آن را مدیر یا انسان معرفی کند.
- [ ] پیشنهاد عملی همیار کارت preview با «ویرایش/تأیید/رد» باشد؛ بدون تأیید هیچ domain command ارسال نشود.
- [ ] mute و hide همیار را per-user ذخیره کن؛ hide حساب یا قابلیت دسترسی دوباره از جست‌وجو/راهنما را حذف نکند.
- [ ] public thread همچنان CTA اصلی card باشد و private chat آزاد بماند.
- [ ] از reservation deep-link وارد همان direct room شو و back کاربر را به کارت مبدأ برگرداند.

**تست پایه:** component chat Telegram-patterns/assistant badge/confirmation، E2E reservation-to-chat، private-chat، assistant-no-autopublish و verify.

**ارزیابی و Review پایان تسک:** مسیرهای list/room/composer/back/reply/status تلگرام‌آشنا؛ رزرو همان room را باز می‌کند؛ پیام زیر دو ثانیه؛ شماره خودکار نیست؛ همیار متمایز/mute و فاقد autopublish؛ Review 21 APPROVED؛ commit `feat: deliver Telegram-familiar isolated chat`.

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

Deploy Packet شامل دو حساب، رزرو→چت، URL همیار، websocket health و گزارش canary خصوصی است. مالک الگوهای list/room/composer/back/reply/status را در دو دستگاه می‌بیند، همیار را mute می‌کند و تأیید می‌کند شماره خودکار و private text در AI/analytics/ad ظاهر نمی‌شود. ادامه فقط با `MILESTONE-4 APPROVED`.

---

# M5 — هوش مصنوعی هدایت‌گر و قابل خاموش‌شدن

## Task 23 — AI Orchestrator، provider adapter و خروجی ساخت‌یافته

**Files:** schema `AiRequest/AiResult/PromptVersion/ProviderUsage`، `services/api/src/modules/ai/{orchestrator,schemas,policy-guard}.ts`، `providers/ai-provider.ts`, `providers/gemini-provider.ts`, `providers/fake-provider.ts`، تست و `packages/contracts/src/ai.ts`.

**Interfaces:** `AiProvider.generate(input): Promise<ProviderResult>`؛ `AiInputSource=PUBLIC_USER_INPUT|PUBLIC_SPACE_DATA|ASSISTANT_CONVERSATION|MODERATION_GRANTED_CONTEXT`؛ source مستقیم `PRIVATE_DIRECT_MESSAGE` تعریف نمی‌شود؛ orchestrator minimization، quota، timeout ده‌ثانیه، budget، schema validation و policy guard دارد؛ نتیجه `suggestion|fallback|unavailable`؛ chain-of-thought ذخیره نمی‌شود.

**Gate پیش از شروع:** Review 22 و تأیید M4، سپس verify، E2E chat و queue health.

**مراحل:**

- [ ] تست timeout، JSON نامعتبر، provider failure، quota و circuit breaker بنویس.
- [ ] prompt/version و model metadata را بدون متن خصوصی غیرضروری ذخیره کن.
- [ ] provenance هر ورودی را اجباری و allowlist capability/source بساز؛ هر تلاش برای فرستادن Message از DIRECT conversation به capability محتوا/recommendation با `AI_PRIVATE_INPUT_FORBIDDEN` رد شود.
- [ ] adapter فعلی Gemini را از route مستقیم خارج و پشت interface قرار بده.
- [ ] Zod schema را پیش و پس از provider enforce کن.
- [ ] fallback قاعده‌محور بدون network برای هر قابلیت تعریف کن.
- [ ] AI result فقط پیشنهاد است و برای domain mutation نیازمند preview/confirm کاربر.

**تست پایه:** unit orchestrator با fake provider، failure injection، integration quota و verify.

**ارزیابی و Review پایان تسک:** خاموشی provider مسیر کارت دستی را نمی‌بندد؛ JSON خراب وارد domain نمی‌شود؛ DIRECT private input در AI صفر؛ secret/private text در log نیست؛ budget enforce؛ Review 23 APPROVED؛ commit `feat: isolate guarded AI orchestration`.

## Task 24 — هدایت ساخت زیربستر بر پایه معیارهای تعاون‌آفرینی

**Files:** schema baseline `PolicyDefinition/PolicyVersion`، `services/api/src/modules/ai/capabilities/space-guidance.ts` و prompt/rule نسخه‌دار، `space-guidance.test.ts`، `components/spaces/CooperationGuidance.tsx` و fixture فارسی.

**Interfaces:** خروجی دقیق `{ title, purpose, assumptions:string[], strengths:string[], risks:string[], questions:string[], suggestedRevisions:{field,value,reason}[], participationRoles:{title,description,isPrimary}[], valueChainNodes:string[], exampleCardTemplates:{title,body,isExample:true}[], suggestedToolKeys:string[], creationDecision:'ALLOW'|'REVISE'|'HUMAN_REVIEW'|'BLOCK', matchedPolicyRules:string[], safetyLevel:'NORMAL'|'REVIEW'|'SEVERE' }`؛ `SpaceCreationGate` Task 10 با این provider جایگزین می‌شود؛ هیچ piety/person score.

**Gate پیش از شروع:** Review 23، failure injection، verify و بررسی نبود chain-of-thought.

**مراحل:**

- [ ] fixtureهای بستر مفید بدتوصیف، تبعیض‌آمیز، فریبنده، اختلاف مشروع و افشاگر اطلاعات بساز.
- [ ] fixtureهای درخواست غیرتعاونی ولی سالم را اضافه کن و تست کن AI زنجیرهٔ ارزش/نقش‌ها را پیشنهاد می‌کند، اما مقصود کاربر را silently mutate نمی‌کند.
- [ ] fixture متن‌های «یه کار خوب برای محله»، «کمک کنیم» و یک جملهٔ کلی دیگر بساز؛ AI باید title/purpose/roles/cards خلاق و assumptions آشکار تولید کند، نه درخواست فرم طولانی.
- [ ] تست کن خروجی اختلاف مشروع را تخلف شرعی اعلام نکند.
- [ ] ruleهای صریح قانونی/سیاست شرعی را با id/version/source/example ثبت کن؛ BLOCK فقط با matched rule مجاز، ابهام/اختلاف/طنز/نقل علمی HUMAN_REVIEW.
- [ ] baseline policy را immutable و فقط از migration/seed بازبینی‌شده بساز؛ UI مدیریت و تغییر policy در Task 30 اضافه می‌شود.
- [ ] معیارهای نفع روشن، امکان تعاون، عدم تعدی، عدالت دسترسی، تبیّن، امانت، کرامت، مشورت، پاسخ‌گویی و پایداری را در prompt ثبت کن.
- [ ] UI strength/risk/revision را قابل ویرایش نشان دهد؛ پذیرش پیشنهاد اختیاری باشد.
- [ ] نقش‌ها، nodeهای زنجیره، کارت‌های نمونه و tool keyها جداگانه preview شوند و پذیرش/رد هر بخش مستقل باشد.
- [ ] template نمونه همواره `isExample=true` بماند، actor/engagement نسازد و عبارت «نمونه — محتوای واقعی نیست» را از schema خروجی بگیرد.
- [ ] BLOCK هیچ Space/slug عمومی نسازد؛ REVISE قابل ویرایش؛ HUMAN_REVIEW منتشر نشود؛ outage/timeout در gate به HUMAN_REVIEW fail-closed تبدیل شود.
- [ ] منبع policyVersion در نتیجه و audit ثبت شود.

**تست پایه:** eval خلاقیت و policy gate، component چهار تصمیم، E2E ALLOW/REVISE/HUMAN_REVIEW/BLOCK/outage و verify.

**ارزیابی و Review پایان تسک:** متن کلی به طرح خلاق قابل ویرایش تبدیل؛ BLOCK فقط rule صریح و فاقد public resource؛ ابهام human review؛ outage دورزننده نیست؛ person/piety score صفر؛ Review 24 APPROVED؛ commit `feat: creatively gate cooperative space creation`.

## Task 25 — تولید خلاق کارت و استنباط رفتار بدون فرم

**Files:** `services/api/src/modules/ai/capabilities/card-inference.ts` و تست/fixtures، تغییر CardComposer و قرارداد card inference.

**Interfaces:** خروجی `{kind, confidence, suggestedTitle, suggestedBody, assumptions:string[], creativityApplied:boolean, operationalPattern:{reservable,terminalCloseAfterUse}, clarifyingQuestions[]}`؛ سؤال فقط با `behaviorAffected`؛ متن کلی می‌تواند با پروتکل کارت همان زیربستر خلاقانه کامل شود؛ preview/confirm اجباری.

**Gate پیش از شروع:** Review 24، eval guidance و verify.

**مراحل:**

- [ ] fixture نردبان، خبر محله، کالای مصرفی، خدمت، درخواست کمک و رویداد بنویس.
- [ ] تست کن «یک نردبان دارم...» REUSABLE، reservable و `terminalCloseAfterUse=true` پیشنهاد می‌دهد و هیچ return-to-active ندارد.
- [ ] fixture «یه چیزی برای کمک دارم» و متن‌های کلی را با cardHints/roles مختلف بساز؛ خروجی باید خلاق اما در حدود space protocol و assumptions آشکار باشد.
- [ ] سؤال فقط درباره بازگشت‌پذیری، ظرفیت، زمان/مکان یا رزرو باشد و قابل ردکردن بماند.
- [ ] پاسخ AI را preview کن؛ user بتواند kind/pattern را اصلاح یا نادیده بگیرد.
- [ ] در قطع AI fallback عنوان از خط اول و kind AWARENESS بسازد.
- [ ] نتیجهٔ تأییدشده را به CardSemanticProfile وصل کن.

**تست پایه:** fixture eval، component composer، E2E AI-off و verify.

**ارزیابی و Review پایان تسک:** متن کلی پیشنهاد خلاق قابل رد دارد؛ فرم نوع اجباری نیست؛ نردبان terminal-close؛ AI-off انتشار دستی دارد؛ سؤال غیرحیاتی مانع نیست؛ Review 25 APPROVED؛ commit `feat: create cards creatively without form friction`.

## Task 26 — دستیار بودجه‌دار، ابزارهای زیربستر و ارزیابی فارسی

**Files:** schema `SpaceAiAssistant/AssistantConfigVersion/AiCreditAccount/AiCreditEntry/AiUsageLedger/SpaceToolInstance/AiToolRun/DraftCard/PublicThreadSummary`، registry `services/api/src/modules/ai/tools/`، capability `public-thread-summary.ts`، serviceهای assistant-config/credit/usage، routeهای owner/admin/tool-run، componentهای `AssistantSettings/SpaceTools/DraftCardPreview/PublicThreadSummary`، `tests/ai/fa/*.json` و تست.

**Interfaces:** assistant state `NONE|CONFIGURED|ACTIVE|PAUSED_BUDGET|SUSPENDED`؛ config به‌طور خودکار از SpaceDefinition ساخته و سؤال طراحی نمی‌پرسد؛ owner برای ACTIVE باید `tariffVersion` و `periodBudget` را تأیید کند؛ اپراتور فقط credit بیرونی/حمایتی ثبت می‌کند؛ هر call ابتدا credit reservation و سپس usage entry دارد؛ مانده منفی ممنوع؛ registry ابزار allowlist و هر run فقط DraftCard؛ summary فقط thread عمومی با source link.

**Gate پیش از شروع:** Review 25، AI-off E2E و verify.

**مراحل:**

- [ ] تست کن هیچ Message از DIRECT conversation در assistant config، tool input، public summary، eval، usage metadata یا پیشنهاد وارد نشود؛ private summary model/service/route/component نساز.
- [ ] با انتشار Space، اگر policy قابلیت دستیار را مجاز کرد CONFIGURED را از definition/roles/tools بدون پرسش‌نامه بساز؛ اگر مجاز نیست state NONE بماند.
- [ ] فعال‌سازی بدون پذیرش تعرفه/سقف یا بدون credit را رد کن؛ grant/adjust اعتبار فقط OPS/SUPERADMIN با reason/audit و بدون payment endpoint.
- [ ] credit reservation و usage finalize/release را برای retry/concurrency/timeout بساز؛ در مانده ناکافی PAUSED_BUDGET و مسیر دستی برقرار باشد.
- [ ] تست allowlist، schema ورودی/خروجی، مجوز space، quota و رد tool key ناشناخته بنویس؛ هیچ کد یا prompt آزاد از definition زیربستر اجرا نشود.
- [ ] هر ابزار فقط Draft Card متعلق به درخواست‌کننده بسازد؛ preview قابل ویرایش باشد و انتشار بدون confirm صریح در integration test صفر بماند.
- [ ] `AUDIO_TO_CARD` رسانه را از objectKey مجاز همان کاربر بخواند و transcript/خلاصه را پیشنهاد کند؛ فایل یا چت خصوصی دیگری وارد context نشود.
- [ ] redaction شماره، نشانی و شناسهٔ حساس را پیش از preview اعمال کن.
- [ ] مجموعهٔ فارسی حداقل ۱۰۰ نمونه در ده دسته سند معماری بساز.
- [ ] runner schema-validity، creative usefulness، false block، harmful miss، private-input leak، latency، cost و fallback را گزارش کند.
- [ ] baseline: schema-validity صددرصد، private input to AI صفر، tool autopublish صفر، مانده منفی صفر و harmful miss شدید صفر.

**تست پایه:** unit assistant config/credit/usage/tool/redaction، concurrency budget، `npm run ai:eval`، E2E activate/pause و tool-to-draft-to-confirm و verify.

**ارزیابی و Review پایان تسک:** config بدون پرسش‌نامه؛ بعضی Spaceها NONE و بعضی CONFIGURED/ACTIVE؛ هزینه قبل پذیرش صفر؛ overspend/negative balance صفر؛ tool autopublish صفر؛ private AI input صفر؛ فقط summary عمومی؛ Review 26 APPROVED؛ commit `feat: fund isolated space assistants and draft tools`.

### توقف اجباری M5

Deploy Packet شامل چهار تصمیم gate، متن کلی، config خودکار دو بستر NONE/CONFIGURED، تعرفه، grant بیرونی آزمایشی، سقف/مانده، ابزار audio-to-Draft-Card، گزارش private-input canary و eval است. مالک فعال‌سازی/پایان بودجه را می‌بیند و تأیید می‌کند بدون پرسش‌نامه config ساخته، بدون بودجه call اجرا نشده و چت خصوصی وارد AI نشده است. ادامه فقط با `MILESTONE-5 APPROVED`.

---

# M6 — گزارش، رسیدگی و حکمرانی

## Task 27 — intake گزارش، privacy گزارش‌دهنده و dedup

**Files:** schema report/subject/cluster/case/`ModerationAiTriage`، module `services/api/src/modules/moderation/report.{schemas,repository,service,route}.ts`، capability `report-risk.ts`، worker `report-clustering.ts` و تست، UI `ReportDialog.tsx`.

**Interfaces:** subject typeهای `SPACE|CARD|PUBLIC_COMMENT|PRIVATE_MESSAGE|PROFILE|RESERVATION|ADMIN_ACTION`؛ `POST /v1/reports -> 202 {receiptId}`؛ خروجی همیار `{violationRiskPercent:0..100|null,abuseRiskPercent:0..100,severity,uncertaintyRange,matchedPolicyRules[],recommendedQueue,explanation,modelVersion,promptVersion}`؛ برای PRIVATE_MESSAGE پیش از ContextGrant مقدار violation برابر null و status `WAITING_FOR_CONTEXT_GRANT` است؛ reporter فقط moderator پرونده و senior admin با reason می‌بینند.

**Gate پیش از شروع:** Review 26 و تأیید M5، سپس AI eval، verify و migration status.

**مراحل:**

- [ ] تست گزارش هر subject، منع self-leak و پاسخ 202 ثابت بنویس.
- [ ] fingerprint از subject/reason/time bucket بساز و payload خام را در hash نگذار.
- [ ] تکرار یک user ادغام و rate-limit شود؛ report اصلی حذف نشود.
- [ ] signalهای موج زمانی، device/account correlation و متن کپی برای cluster ثبت شوند.
- [ ] همیار پس از dedup دو درصد جدا بسازد؛ violation دربارهٔ subject و abuse دربارهٔ الگوی گزارش است؛ هر دو با policy/model/prompt version و uncertainty ذخیره شوند.
- [ ] برای PRIVATE_MESSAGE بدون grant متن را نخوان، violation percent را null بگذار و فقط abuseRisk را از metadata مجاز محاسبه کن.
- [ ] تست calibration bucket و مرز ۰/۱۰۰ بنویس؛ درصد هرگز person/piety/guilt score نام نگیرد و به subject عمومی نشود.
- [ ] AI فقط triage/priority پیشنهاد دهد؛ نه subject را محکوم و نه reporter را مجازات خودکار کند.
- [ ] ReportDialog دلیل، توضیح اختیاری و هشدار سوءاستفاده داشته باشد.

**تست پایه:** unit/integration report-risk schema/calibration/privacy، coordinated fixture، component dialog و verify.

**ارزیابی و Review پایان تسک:** دو درصد معتبر/نسخه‌دار/جدا؛ subject درصد و reporter را نمی‌بیند؛ duplicate صف را باد نمی‌کند؛ درصد حکم یا score انسان نیست؛ Review 27 APPROVED؛ commit `feat: triage reports with calibrated helper risk`.

## Task 28 — پرونده مدیریت، تعلیق موقت و ساعت ۴۸ساعته

**Files:** schema actions/timers، `moderation-case.{service,route}.ts`, `suspension-policy.ts` و تست؛ worker `moderation-expiry.ts`؛ componentهای AdminCaseQueue/CaseDetail.

**Interfaces:** case status `OPEN|AI_TRIAGED|TEMPORARILY_SUSPENDED|EXPLANATION_REQUESTED|USER_RESPONDED|RECONSIDERING|RESTORED|LIMITED|REMOVED|NO_ACTION|CLOSED`؛ threshold policy نسخه‌دار: ۰–۳۹ صف عادی، ۴۰–۷۹ اولویت/اطلاعات بیشتر بدون تعلیق خودکار، ۸۰–۱۰۰ فقط با matched suspendable rule امکان تعلیق حداکثر ۴۸ساعته؛ severe صریح quarantine؛ تصمیم نهایی manager.

**Gate پیش از شروع:** Review 27، coordinated report tests و verify.

**مراحل:**

- [ ] clock-controlled tests برای auto-release دقیق ۴۸ ساعت، تصمیم قبل expiry و retry job بنویس.
- [ ] AI suspension فقط برای violationRisk>=80، matched suspendable rule و action برگشت‌پذیر ایجاد کند؛ abuseRisk به‌تنهایی subject را معلق نکند.
- [ ] manager بتواند پیشنهاد AI را قبول یا رد کند و دلیل override append-only ثبت شود.
- [ ] subject تعلیق‌شده reason ساده، receipt و زمان پایان ببیند.
- [ ] normal بدون تصمیم خودکار RESTORED شود؛ severe فقط با reason ثبت‌شده ادامه یابد.
- [ ] queue عادی و incident cluster جدا و bulk view بدون bulk punishment بساز.
- [ ] هر action append-only audit و outbox event داشته باشد.

**تست پایه:** unit policy/clock، worker expiry با fake clock، E2E suspension banner و verify.

**ارزیابی و Review پایان تسک:** زیر ۸۰ تعلیق خودکار صفر؛ abuseRisk subject را مجازات نمی‌کند؛ override مدیر audit؛ ۲۴ ساعت در کد نیست؛ normal در ۴۸ ساعت آزاد؛ حذف دائمی AI صفر؛ Review 28 APPROVED؛ commit `feat: enforce risk-aware reversible moderation`.

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

**Files:** schema context grant/approval/council decision و تکمیل policy baseline Task 24، moduleهای `private-context.service.ts`, `policy.service.ts`, `dual-approval.service.ts` و تست؛ صفحات admin policy/audit.

**Interfaces:** private context فقط برای case پیام خصوصی، message گزارش‌شده و حداکثر ۲۰ پیام زمینه، grant یک‌ساعته؛ actor/reason/messages viewed audit؛ actionهای `PERMANENT_REMOVE`, `ROLE_REVOKE_SUPERADMIN`, `ROTATE_MASTER_KEY`, `BULK_REMOVE` نیازمند دو مدیر متمایز؛ `GovernanceStatus` زمان عرضه عمومی، activeUsers، activeSpaces و councilRequiredAt را نگه می‌دارد.

**Gate پیش از شروع:** Review 29، reconsideration E2E، permission matrix و verify.

**مراحل:**

- [ ] تست کن manager بدون case/grant پیام خصوصی نمی‌بیند و OPS هرگز نمی‌بیند.
- [ ] grant را scope/expiry دار و پس از هر view audit کن.
- [ ] grant معتبر PRIVATE_MESSAGE بتواند یک re-triage با source `MODERATION_GRANTED_CONTEXT` فقط روی messageIds مجاز اجرا کند؛ درصد violation سپس پر شود و هیچ summary/recommendation artifact نسازد.
- [ ] policy definition/version immutable و دارای source/reason/effectiveAt بساز.
- [ ] تا تشکیل شورا فقط SUPERADMIN policy موقت می‌سازد؛ metadata دورهٔ گذار ثبت شود.
- [ ] trigger تشکیل شورا را با اولین رخداد «شش ماه از عرضه عمومی»، «۵٬۰۰۰ کاربر فعال» یا «۱۰۰ زیربستر فعال» محاسبه کن؛ پس از trigger هشدار دائمی admin و audit ساخته شود.
- [ ] `CouncilDecision` مصوبه، رأی‌ها، policyVersion و مسئول اجرا را نگه دارد؛ مسئول اجرای مصوبات مدیر کل است.
- [ ] dual approval دو actor متمایز و MFA تازه زیر پنج دقیقه بخواهد.
- [ ] actor آغازگر نتواند approval دوم خود را ثبت کند یا audit را حذف کند.

**تست پایه:** security integration private-context، dual-approval race test، policy version test و verify.

**ارزیابی و Review پایان تسک:** قبل grant درصد violation پیام خصوصی null؛ re-triage فقط context محدود؛ خروجی عمومی/خلاصه صفر؛ دسترسی دائمی نیست؛ grant منقضی؛ dual approval غیرقابل دورزدن؛ Review 30 APPROVED؛ commit `feat: enforce scoped moderation governance`.

## Task 31 — داشبورد صف، SLA و سناریوی حمله گزارش هماهنگ

**Files:** `app/admin/cases/page.tsx`, componentهای QueueMetrics/IncidentCluster، route metrics، `tests/load/report-storm.js`, `tests/e2e/moderation-flow.spec.ts` و runbook.

**Interfaces:** metrics شامل queueDepth، oldestAge، dueWithin، breached، clusteredCount، falseSuspensionRate و calibrationError؛ dashboard فیلتر priority/status/cluster و ستون‌های دو درصد/uncertainty/rules/model دارد؛ متن و reporter در metric عمومی نیست.

**Gate پیش از شروع:** Review 30، private-context security tests، dual approval و verify.

**مراحل:**

- [ ] تست aggregation صف و timezone را بنویس.
- [ ] UI صف را با نشانگر کمتر از ۴۸ ساعت و incident lane بساز.
- [ ] دو درصد را با عنوان «ریسک پیشنهادی همیار — تصمیم نهایی با مدیر» نمایش بده؛ رنگ به‌تنهایی حامل معنا نباشد و uncertainty/rule قابل بازشدن باشد.
- [ ] k6 scenario برای ۲٬۵۰۰ گزارش هماهنگ روی ۲۰۰ subject بساز.
- [ ] dedup، rate limit، queue depth و API p95 را اندازه بگیر.
- [ ] runbook تصمیم گروهی را فقط برای triage/cluster بنویس؛ نتیجهٔ هر subject جدا ثبت شود.
- [ ] E2E کامل report → suspension → explanation → response → reconsideration اجرا کن.
- [ ] E2E تصمیم مدیر هم‌جهت و خلاف درصد همیار را اجرا و audit override را بررسی کن.

**تست پایه:** API metrics، `k6 run tests/load/report-storm.js`، E2E moderation-flow و verify.

**ارزیابی و Review پایان تسک:** سیستم storm بدون crash؛ duplicate دست‌کم ۶۰٪ کم؛ دو درصد/uncertainty/rule روشن؛ مدیر اختیار نهایی؛ bulk punishment نیست؛ SLA و calibration قابل مشاهده؛ Review 31 APPROVED؛ commit `feat: operationalize explainable moderation risk`.

### توقف اجباری M6

Deploy Packet شامل fixture گزارش صحیح/اشتباه/هماهنگ، دو درصد و uncertainty، policy rule، صف، ساعت ۴۸ساعته و audit override است. مالک یک تصمیم موافق و یک تصمیم خلاف همیار می‌گیرد و تأیید می‌کند subject درصد/reporter را نمی‌بیند و AI حکم نهایی صادر نمی‌کند. ادامه فقط با `MILESTONE-6 APPROVED`.

---

# M7 — سخت‌سازی و Release Candidate

## Task 32 — سخت‌سازی رسانه/avatar، rate limit و مرزها

**Files:** تکمیل `services/api/src/modules/storage/` و pipeline پردازش media، route upload avatar، workerهای scan/transcode/metadata-strip، `services/api/src/plugins/{rate-limit,security-headers}.ts`، تغییر profile UI و تست امنیت.

**Interfaces:** avatar فقط JPEG/PNG/WebP تا پنج مگابایت؛ پیوست طبق allowlist/سقف نسخه‌دار هر media kind؛ magic-byte معتبر؛ malware scan، decode/re-encode تصویر، حذف metadata، transcode/preview امن در صورت نیاز؛ object key تصادفی؛ signed URL خواندن؛ rate bucketهای جدا برای OTP، auth، message، upload، card، AI و report.

**Gate پیش از شروع:** Review 31 و تأیید M6، سپس moderation E2E، report-storm و verify.

**مراحل:**

- [ ] تست extension جعلی، polyglot، فایل بزرگ، object traversal و دسترسی user دیگر بنویس.
- [ ] قرارداد adapter ساخته‌شده در Task 03 را بدون شکستن مصرف‌کنندگان سخت‌سازی و failure/retry provider را تست کن.
- [ ] upload تصویر را decode/re-encode، رسانه را scan و metadata حساس را حذف کند؛ فایل خام مستقیم public نشود.
- [ ] quarantine تا READYشدن، thumbnail/waveform یا preview ایمن و پاک‌سازی orphan upload را با job idempotent بساز.
- [ ] signed URL کوتاه‌عمر و حذف avatar قبلی با job idempotent بساز.
- [ ] rate limitهای route-specific با پاسخ 429 و Retry-After اعمال کن.
- [ ] CSP، HSTS production، frame-ancestors، nosniff و referrer policy را فعال کن.
- [ ] CSRF، SSRF در avatar URL قدیمی و host/origin WebSocket را تست کن.

**تست پایه:** storage/media security suite، malware fixture امن، rate-limit integration، E2E avatar و card media، OWASP ZAP baseline روی staging و verify.

**ارزیابی و Review پایان تسک:** upload مخرب رد؛ EXIF/metadata پاک؛ object و اصل رسانه private؛ orphan پاک؛ failure worker قابل بازیابی؛ rate limit بدون قفل‌کردن عمومی service؛ headerها حاضر؛ Review 32 APPROVED؛ commit `feat: harden media storage and request boundaries`.

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
- [ ] E2E پذیرش را برای legal acceptance+OTP، profile، space creative gate/roles/archive/no-merge، multimedia card، reservation→chat→terminal close→new card، timeline بدون فیلتر، Telegram-like chat، private-AI canary، assistant budget، report percentages/override و reconsideration اجرا کن.
- [ ] migration را روی clone staging و rollback application را بدون rollback مخرب DB تمرین کن.
- [ ] SBOM، dependency audit، secret scan، image scan و license report بساز.
- [ ] `release-check.mjs` فقط وقتی tag RC می‌سازد که Reviewهای 01 تا 34 و تأیید Milestoneهای 0 تا 6 موجود باشند.
- [ ] artifactها را با SHA و image digest ثبت کن؛ Deploy production را خودکار اجرا نکن.

**تست پایه:**

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

عامل Deploy Packet نهایی را تولید می‌کند و متوقف می‌شود. مالک image digest را Deploy و این مسیرها را می‌بیند: پذیرش مقررات/ورود، ساخت خلاق و gate بستر، کارت نردبان، رزرو→چت→بستن، timeline ساده، چت تلگرام‌آشنا، دستیار/بودجه، گزارش/درصد/تصمیم مدیر و metrics. domain اختصاصی، ads و payment endpoint باید غایب باشند. عرضه فقط با `MILESTONE-7 APPROVED`.

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
| Integration | PostgreSQL/Redis/S3-compatible واقعی | هنگام تغییر domain | بله | بله |
| Component | Testing Library | هنگام تغییر UI | بله | بله |
| E2E | Playwright | مسیر تغییرکرده | همه مسیرهای milestone | کل MVP |
| Realtime | Socket client integration | هنگام تغییر پیام | بله | بله |
| AI eval | fixture فارسی + fake/real provider | قابلیت AI | بله | بله |
| Media | magic-byte/مالکیت/scan/metadata/preview | کارت یا avatar | M3 و M7 | بله |
| Ranking | relevance/popularity abuse/role balance | کشف و reaction | M2/M3 | بله |
| Participation timeline | فقط زمان/cursor/عدم دسترسی دیگری/نبود filter | رخداد آگاهی | M3 | بله |
| AI isolation | private canary/Draft/confirm/no-autopublish/impersonation | چت، همیار یا tool | M4/M5 | بله |
| AI billing | tariff consent/credit reservation/concurrency/zero balance | دستیار زیربستر | M5 | بله |
| Moderation risk | schema/calibration/uncertainty/manager override | گزارش | M6 | بله |
| Security | authorization/redaction/scan | تسک حساس | بله | بله |
| Load | k6 | تسک صف/بار | M6 | کامل |
| Recovery | backup/restore drill | عملیات | M7 | بله |

قواعد تست:

- زمان و UUID در تست‌ها injectable/fake هستند؛
- تست‌ها به ترتیب اجرا وابسته نیستند؛
- provider خارجی در unit/integration فراخوانی نمی‌شود؛
- E2E دادهٔ خود را می‌سازد و پاک می‌کند؛
- test fixture کارت نمونه در هیچ شمارنده، ranking، reaction، reservation یا projection مشارکت وارد نمی‌شود؛
- تست roleless user باید ساخت کارت، نظر، reaction، رزرو و گفت‌وگو را پوشش دهد؛
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
- صفر ورودی DIRECT private message به AI/analytics/recommendation/advertising بدون ContextGrant پرونده؛
- صفر نمایش object رسانهٔ خام/غیرREADY بدون signed URL و مجوز؛
- صفر اجرای پیشنهاد همیار یا ابزار AI بدون confirmation کاربر؛
- صفر هزینهٔ AI پیش از پذیرش تعرفه/سقف و صفر ماندهٔ منفی؛
- صفر endpoint عمومی برای تاریخچهٔ کامل مشارکت فرد؛
- صفر endpoint مربوط به domain/ads/payment یا merge/transfer زیربستر در MVP؛
- صفر پرداخت/کیف پول در MVP؛
- زبان UI فارسی و layout راست‌به‌چپ؛
- حداقل WCAG 2.2 AA برای مسیرهای ورود، ساخت کارت، چت و گزارش.

---

## ۹. Definition of Done نهایی محصول

- [ ] Reviewهای 01 تا 34 همگی APPROVED و به commit موجود اشاره دارند.
- [ ] تأییدهای مالک M0 تا M7 ثبت شده‌اند.
- [ ] کاربر جدید فقط با موبایل وارد و profile می‌سازد.
- [ ] متن پذیرش قوانین پیش از OTP دیده و TermsAcceptance نسخهٔ جاری شرط ساخت session است.
- [ ] شماره تا انتخاب صریح private است.
- [ ] مدیر کل bootstrap، MFA و انتصاب مدیر را انجام می‌دهد.
- [ ] هر user از متن حتی کلی، پیشنهاد خلاق زیربستر می‌گیرد و فقط پیش‌نمایش تأییدشده منتشر می‌شود.
- [ ] BLOCK فقط با rule صریح است، هیچ Space/slug عمومی نمی‌سازد و مورد مبهم HUMAN_REVIEW می‌شود.
- [ ] merge/transfer زیربستر، مالکیت، کارت، عضو یا follower وجود ندارد؛ archive مستقل کار می‌کند.
- [ ] هر زیربستر حداقل دو نقش اصلی نمایشی دارد و user بدون انتخاب نقش می‌تواند همهٔ مشارکت‌های عمومی را انجام دهد.
- [ ] صفحهٔ زیربستر هدف، نقش‌ها، دعوت، جست‌وجوی داخلی، pin، feed، composer، tools و rules/report را دارد.
- [ ] کارت نمونه badge دائمی دارد، هویت جعلی نمی‌سازد و در آمار، reaction یا رزرو وارد نمی‌شود.
- [ ] کارت بدون انتخاب type ساخته می‌شود.
- [ ] کارت متنی، تصویری، صوتی، ویدئویی و فایلی با storage خصوصی و pipeline امن کار می‌کند.
- [ ] reaction فقط سیگنال ضعیف کشف است و کارت نامرتبط را صرفاً با پسند بالا غالب نمی‌کند.
- [ ] رزرو عمومی نردبان فوراً direct chat را باز می‌کند؛ close مالک terminal است و همان کارت دوباره رزروپذیر نمی‌شود.
- [ ] feed tag «منقضی» ندارد؛ detail رزرو disabled و owner برای عرضهٔ بعد کارت تازه می‌سازد.
- [ ] «مشارکت‌های من» فقط timeline خصوصی با cursor است و filter/category/status/search/score ندارد.
- [ ] public thread CTA اصلی و private chat آزاد است.
- [ ] list/room/composer/back/reply/status در UI قرارداد تلگرام‌آشنا و RTL/accessible دارند.
- [ ] چت خصوصی user-to-user وارد AI، summary، recommendation، analytics یا ad signal نمی‌شود.
- [ ] همیار تعاون badge سیستمی، mute/hide و preview/confirm دارد و قابل impersonate نیست.
- [ ] ابزارهای allowlist زیربستر فقط Draft Card می‌سازند و بدون confirm منتشر نمی‌کنند.
- [ ] assistant برخی بسترها NONE و برخی CONFIGURED/ACTIVE است؛ config بدون پرسش‌نامه از SpaceDefinition ساخته می‌شود.
- [ ] فعال‌سازی assistant تعرفه/سقف/اعتبار می‌خواهد؛ اعتبار بیرونی ثبت می‌شود و پایان مانده فقط assistant را pause می‌کند.
- [ ] تحلیل نقش/زنجیره و بازقاب‌بندی AI قابل رد و فاقد تغییر خاموش داده است.
- [ ] AI-off تمام مسیرهای اصلی را باز می‌گذارد.
- [ ] گزارش هماهنگ dedup و محدود می‌شود.
- [ ] همیار violationRisk و abuseRisk را جدا با uncertainty/rule/version می‌دهد؛ درصد حکم نیست و مدیر می‌تواند با دلیل override کند.
- [ ] normal suspension در نبود تصمیم پس از ۴۸ ساعت آزاد می‌شود.
- [ ] user توضیح می‌دهد و همان مدیر دوباره بررسی می‌کند.
- [ ] reporter identity به subject نشت نمی‌کند.
- [ ] مدیر فقط در پرونده و با audit متن خصوصی محدود را می‌بیند.
- [ ] پرداخت، دامنهٔ اختصاصی، تبلیغ، بستر خصوصی، E2EE و Site-Manager در build فعال نیستند.
- [ ] بار هدف، security scan و restore drill موفق‌اند.
- [ ] Deploy و rollback توسط مالک قابل اجرا و مستند است.

---

## ۱۰. دستور شروع برای Sonnet 5

این متن را همراه همین فایل و سند معماری به عامل بدهید:

```text
شما فقط عامل اجرایی این برنامه هستید. ابتدا سند معماری نسخه ۳.۲ و سپس این برنامه را کامل بخوانید. فقط Task 01 را اجرا کنید. حق حذف، ادغام، جابه‌جایی یا بازطراحی تسک‌ها را ندارید. قبل از هر Task، Gate همان Task را اجرا و نتیجه را گزارش کنید. توسعه test-first است. در پایان Task همه تست‌های تعیین‌شده را تازه اجرا کنید، فایل Review واقعی بسازید و فقط در صورت PASS بودن همه معیارها commit کنید. در پایان هر Milestone، Deploy Packet بسازید و بدون شروع Milestone بعد متوقف شوید. اگر تصمیمی خارج سند لازم شد، با BLOCKED و گزینه‌های دقیق متوقف شوید؛ خودتان تصمیم محصولی تازه نگیرید.
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
| LegalDocumentVersion | type, version, contentHash, publicUrl, effectiveAt | unique type/version؛ immutable |
| TermsAcceptance | userId, documentType, documentVersion, acceptedAt, otpChallengeId | unique user/type/version؛ append-only |
| Session | userId, tokenFamilyId, refreshHash, expiresAt, revokedAt, deviceId | unique refreshHash؛ index userId/expiresAt |
| RoleAssignment | userId, role, scopeType, scopeId, assignedBy | unique user/role/scope |
| SystemPrincipal | key, kind, displayName, badge, status | unique key؛ فقط service داخلی قابل ارسال |
| Space | creatorId, slug, status, currentVersion, publishedAt, archivedAt | unique slug؛ creatorId در MVP تغییرناپذیر |
| SpaceDefinitionVersion | spaceId, version, title, purpose, audience, participationMethods JSONB, cardHints JSONB, policyVersion | unique spaceId/version |
| SpaceCreationEvaluation | spaceId, definitionVersion, decision, matchedPolicyRules JSONB, safetyLevel, modelVersion, promptVersion, evaluatedAt | index spaceId/definitionVersion؛ append-only؛ BLOCK فاقد public slug |
| SpaceFollower | spaceId, userId | unique spaceId/userId |
| SpaceParticipationRole | spaceId, version, title, description, isPrimary, displayOrder | دست‌کم دو isPrimary در نسخهٔ منتشرشده؛ unique space/version/order |
| SpaceRoleMembership | spaceId, roleId, userId, declaredAt | unique roleId/userId؛ اختیاری و غیرمجوزی |
| SpaceInvite | spaceId, tokenHash, createdBy, expiresAt, revokedAt | unique tokenHash؛ مجوز خصوصی ایجاد نمی‌کند |
| SpaceToolInstance | spaceId, toolKey, config JSONB, policyVersion, enabled | unique spaceId/toolKey؛ toolKey فقط allowlist |
| SpaceAiAssistant | spaceId, state, activeConfigVersion, acceptedTariffVersion, periodBudget | unique spaceId؛ state NONE/CONFIGURED/ACTIVE/PAUSED_BUDGET/SUSPENDED |
| AssistantConfigVersion | assistantId, version, sourceSpaceDefinitionVersion, config JSONB, policyVersion | unique assistant/version؛ immutable |
| SpacePinnedCard | spaceId, cardId, pinnedBy, displayOrder, expiresAt | unique spaceId/cardId؛ card متعلق به همان space |
| SpaceHealthSnapshot | spaceId, day, state, counters JSONB | unique spaceId/day |
| Card | spaceId, authorId, status, kind, currentRevision, operationalVersion | index spaceId/status/createdAt |
| CardRevision | cardId, revision, title, body, editedBy | unique cardId/revision |
| CardSemanticProfile | cardId, inferredKind, confidence, operationalPattern JSONB, confirmedByUser | unique cardId |
| CardAttachment | cardId, ownerId, kind, objectKey, mime, size, checksum, processingStatus, altText | unique objectKey؛ فقط READY قابل نمایش |
| CardReaction | cardId, userId, type | unique cardId/userId/type؛ example card ممنوع |
| CardReservation | cardId, requesterId, conversationId, status, version, reservedAt, inUseAt, closedAt, closeReason | partial unique active per card؛ RESERVATION_CLOSED terminal |
| CardEvent | cardId, actorId, type, fromState, toState, metadata JSONB, idempotencyKey | unique actorId/idempotencyKey |
| PublicComment | cardId, authorId, parentId, body, status | index cardId/createdAt؛ parent همان card |
| PublicThreadSummary | cardId, requestedBy, sourceCommentIds UUID[], payload JSONB, status, promptVersion | فقط comment عمومی؛ source link اجباری؛ محتوای DIRECT ممنوع |
| Conversation | type, directPairKey, systemPrincipalId | unique directPairKey برای DIRECT؛ SYSTEM_ASSISTANT فقط principal معتبر |
| ConversationMember | conversationId, userId, joinedAt, lastReadMessageId | unique conversationId/userId |
| Message | conversationId, senderId, clientMessageId, bodyCiphertext, status | unique senderId/clientMessageId؛ index conversationId/createdAt |
| AwarenessEvent | type, actorPseudonym, spaceId, cardId, dedupKey, metadata JSONB | unique dedupKey؛ متن خصوصی ممنوع |
| UserParticipationEntry | userId, sourceEventId, spaceId, cardId, eventLabel, occurredAt | unique userId/sourceEventId؛ فقط timeline زمانی owner |
| AiRequest | userId, spaceId, capability, inputSource, status, promptVersion, providerUsageId | inputSource allowlist؛ PRIVATE_DIRECT_MESSAGE ممنوع |
| AiToolRun | userId, spaceId, toolKey, inputRef, status, policyVersion | index userId/createdAt؛ ورودی خصوصی حداقلی |
| DraftCard | userId, spaceId, aiToolRunId, payload JSONB, confirmationHash, expiresAt, publishedCardId | یک‌بارمصرف و متعلق به user |
| AiCreditAccount | spaceId, balanceMinor, currencyOrUnit, version | unique spaceId؛ balance >= 0 |
| AiCreditEntry | accountId, type, amountMinor, reason, externalReference, actorId | append-only؛ adjustment جبرانی |
| AiUsageLedger | accountId, aiRequestId, reservedMinor, chargedMinor, releasedMinor, tariffVersion | unique aiRequestId؛ charged <= reserved |
| Report | reporterId, receiptId, reasonCode, detailsCiphertext, fingerprint | unique receiptId؛ index fingerprint/createdAt |
| ReportSubject | reportId, subjectType, subjectId | index subjectType/subjectId |
| ReportCluster | fingerprint, state, signalSummary JSONB | index state/createdAt |
| ModerationAiTriage | reportId, violationRiskPercent, abuseRiskPercent, uncertainty JSONB, matchedPolicyRules JSONB, modelVersion, promptVersion, status | PRIVATE_MESSAGE پیش از grant: violation null |
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

تمام مسیرها prefix `/v1` دارند و جز health، legal current و درخواست/تأیید OTP نیازمند session هستند.

| دامنه | Method و path | مجوز |
|---|---|---|
| Health | GET `/health/live`, `/health/ready` | عمومی |
| Legal | GET `/legal/current`, GET `/legal/:type/:version` | عمومی |
| Auth | POST `/auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout` | عمومی/session |
| MFA | POST `/auth/mfa/enroll`, `/confirm`, `/challenge` | user/admin |
| Profile | GET/PATCH `/me`, GET `/users/:username` | user/public profile |
| Roles | POST/DELETE `/admin/role-assignments` | SUPERADMIN+MFA |
| Spaces | POST `/spaces`, PATCH `/spaces/:id`, POST `/spaces/:id/precheck`, POST `/spaces/:id/publish`, POST `/spaces/:id/archive` | user/owner؛ publish فقط ALLOW |
| Spaces | GET `/spaces`, GET `/spaces/:slug`, GET `/spaces/similar` | user |
| Spaces | GET/PUT `/spaces/:id/roles`, POST/DELETE `/spaces/:id/role-memberships/:roleId` | user/owner؛ membership اختیاری |
| Spaces | POST/DELETE `/spaces/:id/follow`, POST `/spaces/:id/invites`, GET `/space-invites/:token`, GET `/spaces/:id/health` | user/owner |
| Cards | POST `/spaces/:id/cards`, GET `/spaces/:id/cards?q=&cursor=`, GET/PATCH `/cards/:id` | user/owner |
| Media | POST `/uploads/intents`, POST `/uploads/:id/finalize`, GET `/attachments/:id/read-url` | owner/authorized viewer |
| Cards | PUT/DELETE `/cards/:id/reactions/:type`, PUT/DELETE `/spaces/:id/pins/:cardId` | user/space owner |
| Public | GET/POST `/cards/:id/comments`, PATCH/DELETE `/comments/:id` | user/owner |
| Reservation | POST `/cards/:id/reservations`, POST `/reservations/:id/{cancel,release,in-use,close}` | reserve user؛ close فقط card owner |
| Messaging | POST `/conversations/direct`, GET `/conversations`, GET/POST `/conversations/:id/messages` | member |
| Notifications | GET `/notifications`, POST `/notifications/read-all` | user |
| Participation | GET `/me/participations` | فقط صاحب session |
| AI | POST `/ai/space-guidance`, `/ai/card-inference`, `/ai/public-thread-summary` | user + quota؛ مسیر آخر فقط comment عمومی |
| AI Tools | POST `/spaces/:id/ai-tools/:toolKey/runs`, PATCH `/draft-cards/:id`, POST `/draft-cards/:id/confirm` | owner draft + quota |
| AI Assistant | GET `/spaces/:id/assistant`, POST `/spaces/:id/assistant/{activate,pause}`, PUT `/spaces/:id/assistant/budget` | space owner |
| AI Credit | POST `/admin/spaces/:id/ai-credit-entries`, GET `/spaces/:id/ai-usage` | OPS/SUPERADMIN؛ owner read |
| Reports | POST `/reports`, GET `/me/reports/:receiptId` | user/گزارش‌دهنده یا subject |
| Moderation | GET `/admin/cases`, GET `/admin/cases/:id`, POST actionها | MODERATOR+MFA |
| Explanation | POST `/admin/cases/:id/request-explanation`, POST `/cases/:id/respond`, POST `/admin/cases/:id/reconsider` | manager/subject/manager |
| Context | POST `/admin/cases/:id/context-grants`, GET `/admin/context-grants/:id/messages` | moderator مجاز+MFA |
| Policy | GET/POST `/admin/policies`, POST `/admin/dual-approvals` | SUPERADMIN+MFA |
| Metrics | GET `/admin/metrics/awareness`, `/admin/metrics/moderation` | admin |

هیچ route عمومی برای phone، identity claim، reporter، private message، audit خام یا AI prompt خصوصی وجود ندارد. هیچ route برای merge/transfer زیربستر، پرداخت، دامنهٔ اختصاصی یا تبلیغ در MVP تعریف نمی‌شود.

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
