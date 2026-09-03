# Task 02 Review

Status: APPROVED
Implementation-Commit: 964d178c87504404c2d2e9a7d23214157af0d42b

Scope:
- Modified: `package.json`, `package-lock.json`, `next-env.d.ts` (Next auto-managed), `eslint.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`
- Created: `packages/contracts/{package.json,tsconfig.json,src/health.ts,src/index.ts}`
- Created: `services/api/{package.json,tsconfig.json,vitest.config.ts,src/app.ts,src/server.ts,src/modules/health/health.route.ts,src/modules/health/health.test.ts}`
- Created: `lib/api/client.ts`, `app/system-status/page.tsx`, `components/system-status/{SystemStatus.tsx,SystemStatus.test.tsx}`
- Not modified (deliberately): `.gitignore` — existing unanchored `dist`/`node_modules` patterns already cover `services/api/dist` and every workspace's `node_modules` at any depth.
- Not modified (deliberately): `next.config.ts` — Turbopack resolved `@taavon/contracts`'s TypeScript source natively; `transpilePackages` was not needed.

Commands:
```
npm install
npm run test --workspace services/api -- health.test.ts
npm run verify
npm run build --workspaces --if-present
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
npm audit
```
Manual, against a real running stack (not part of the automated suite, done for extra confidence given this task wires two new services together for the first time):
```
services/api: npm run dev         # tsx watch, port 4000
curl http://localhost:4000/v1/health/live
curl -i http://localhost:4000/v1/health/ready
root: npm run dev -- --port 4300  # matches playwright.config.ts's port
manual Playwright script hitting http://localhost:4300/system-status
```

Results:
- `npm run test --workspace services/api -- health.test.ts`: 1 file, 6/6 passed.
- `npm run verify` (root: lint → typecheck → test → build): exit 0. Root Vitest: 2 files (AppShell, SystemStatus), 8/8 passed. `next build` (Turbopack): all 8 routes compiled including `/system-status`.
- `npm run build --workspaces --if-present`: `@taavon/api` → `tsc -p tsconfig.json` exit 0; `@taavon/contracts` has no build script, correctly skipped.
- `git diff --check`: exit 0 (no whitespace errors).
- `npm audit`: 0 critical, 3 high — unchanged from Task 01 (`next`, `postcss`, `sharp`, all requiring `next@16.3.4`, which conflicts with the plan's `16.2.11` pin; see Security).
- Manual smoke test: `GET /v1/health/live` → `200 {"status":"ok","version":"0.1.0"}`. `GET /v1/health/ready` → `200 {"status":"ok","checks":{"database":"ok","redis":"ok"}}`. Browser check of `/system-status` (cross-origin, port 4300 → port 4000) rendered "وضعیت کلی: سالم" / "پایگاه‌داده: سالم" / "صف/کش (Redis): سالم" with zero console errors — proves CORS and the full client→schema-validation→render path work against the real service, not just mocks.

Acceptance:
- `live` در قطع DB نیز 200 می‌دهد؛ `ready` در قطع dependency مقدار `degraded` می‌دهد: **PASS** — `health.test.ts` تست می‌کند که `live` حتی وقتی `checkDatabase`/`checkRedis` تزریق‌شده fail باشند 200 برمی‌گرداند، و `ready` با یک dependency down مقدار `{status:'degraded', checks:{database:'down', redis:'ok'}}` و کد 503 می‌دهد (انتخاب 503 برای `ready` صریحاً در پلن ذکر نشده بود؛ چون این مقدار «value» را پلن می‌خواست نه لزوماً status code خاص، 503 به‌عنوان قرارداد استاندارد readiness-probe انتخاب شد — در Reviewer note توضیح داده شده).
- API با import شدن شروع به listen نمی‌کند: **PASS** — تست اختصاصی `app.server.listening === false` بلافاصله پس از `buildApp()` بدون فراخوانی `.listen()` را assert می‌کند؛ فقط `server.ts` این متد را صدا می‌زند.
- صفحهٔ وضعیت، loading/error/success دارد: **PASS** — `SystemStatus.tsx` سه حالت را جدا رندر می‌کند؛ ۵ تست (`loading`، موفق-سالم، موفق-degraded، خطای شبکه، خطای schema) و علاوه بر آن یک بررسی دستی در مرورگر واقعی.
- پاسخ API با schema مشترک validate می‌شود: **PASS** — سرور هر دو پاسخ را پیش از ارسال با `healthLiveResponseSchema`/`healthReadyResponseSchema` (از `@taavon/contracts`) با `.parse()` می‌سازد؛ کلاینت (`SystemStatus.tsx`) همان schema مشترک را دوباره روی پاسخ دریافتی اجرا می‌کند، پس هرگونه انحراف قرارداد client/server به‌جای رندر خاموش نادرست، به خطای قابل‌مشاهده تبدیل می‌شود.
- `docs/reviews/task-02.md` ثبت شده است: **PASS** — همین فایل.
- Commit پیام مقرر: **PASS** — `feat: add modular API health foundation` (`964d178c87504404c2d2e9a7d23214157af0d42b`).

Security:
- این تسک هیچ داده کاربر واقعی، شماره تلفن، OTP یا secret را لمس نمی‌کند؛ فقط health-check زیرساختی است.
- `npm audit`: 0 critical؛ 3 high (`next`, `postcss`, `sharp`) — همگی از Task 01 باقی‌مانده و همگی فقط با `next@16.3.4` (خارج از پین صریح `16.2.11`) رفع می‌شوند؛ هیچ dependency جدید این تسک (`fastify`, `zod`, `@fastify/cors`, `tsx`) آسیب‌پذیری تازه‌ای اضافه نکرد.
- CORS فعلاً `origin: true` (بازتاب هر origin) است — تصمیمی آگاهانه و موقت: هنوز session/cookie/CSRF وجود ندارد که این سیاست را ناامن کند؛ Task 06 (OTP session) باید این را به allow-list صریح محدود کند. این محدودیت شناخته‌شده در همین بخش ثبت می‌شود تا بعداً فراموش نشود.
- هیچ endpoint این تسک نیازمند احراز هویت نیست (health عمومی است)، مطابق فهرست endpointهای پلن (بخش ۱۳: `Health | GET /health/live, /health/ready | عمومی`).
- بستهٔ untracked غیرمرتبط `T messenger v0.2.zip` که در working directory ظاهر شد در هیچ commit این تسک قرار نگرفت و دست‌نخورده باقی ماند.

Regressions:
`npm run verify` کامل (`lint` → `typecheck` → `test` → `build`) با exit code صفر اجرا شد. `npm run test --workspace services/api` و `npm run build --workspaces --if-present` نیز جداگانه تأیید شدند. رگرسیونی در مسیرهای موجود (صفحهٔ اصلی، چت، کامنت‌ها) مشاهده نشد.

Reviewer note:
دو باگ زیرساختی واقعی حین این تسک کشف و رفع شد، نه فرضی: (۱) `vitest.setup.ts` هرگز `afterEach(cleanup)` را برای Testing Library ثبت نکرده بود — چون این پروژه `test.globals` را خاموش نگه می‌دارد، تشخیص خودکار RTL هرگز فعال نمی‌شد؛ تست تک-assertion Task 01 این را آشکار نکرد، اما تست چندحالتهٔ `SystemStatus` بلافاصله با تجمع DOM بین تست‌ها fail شد. (۲) پیکربندی ریشهٔ Vitest/ESLint بدون `exclude` صریح برای `services/**`/`packages/**` باعث می‌شد Vitest ریشه، تنظیمات jsdom خودش را روی تست‌های Node-محور `services/api` اعمال کند (کرش با «URL must be of scheme file») و ESLint، ۱۱۲ قاعدهٔ مخصوص React را بی‌صدا روی کد بک‌اند اجرا کند. هر دو مورد به‌عنوان بخشی از همین تسک رفع شدند چون بدون آن‌ها، تست‌های همین تسک قابل‌اعتماد نبودند.

انتخاب معماری قابل‌توجه: `services/api` به‌جای اجرای `node dist/server.js`، هم در dev و هم در «start» از `tsx` استفاده می‌کند؛ `tsc build` صرفاً یک artifact/compile-check است. این انتخاب مشکل resolution بین `moduleResolution: NodeNext` (که برای اجرای مستقیم Node لازم بود) و `bundler` (که Turbopack و `packages/contracts` بدون build-step به آن نیاز دارند) را دور می‌زند: هر سه پروژه (root، `packages/contracts`، `services/api`) اکنون یکدست از `moduleResolution: "bundler"` با importهای بدون پسوند استفاده می‌کنند. اگر Task 04 (Docker) بخواهد `services/api` را با `node` خام (بدون tsx) در image نهایی اجرا کند، باید یا دوباره NodeNext+build واقعی برای `packages/contracts` هم اضافه شود، یا `tsx` به‌عنوان runtime dependency در image نهایی بماند — این تصمیم عمداً به Task 04 واگذار شده و اینجا صرفاً مستند شده است.
