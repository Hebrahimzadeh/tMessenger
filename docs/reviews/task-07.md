# Task 07 Review

Status: APPROVED
Implementation-Commit: 4372c3e2bd685d5324ce73d124b65968ad72f04e

Scope:
- Created: `app/login/page.tsx`, `app/legal/{terms,privacy}/page.tsx`
- Created: `components/auth/{PhoneForm,OtpForm,LoginFlow}.tsx` and their `.test.tsx`
- Created: `components/legal/LegalDocumentPage.tsx` + test
- Created: `lib/auth/{session,require-user,redirect-allowlist}.ts` and their `.test.ts`
- Created: `proxy.ts` (not `middleware.ts` - see Reviewer note) + `proxy.test.ts`
- Created: `tests/e2e/auth.spec.ts`, `tests/e2e/helpers/dev-login.ts`
- Modified: `tests/e2e/baseline.spec.ts` (logs in first now - see Reviewer note)
- Modified: `lib/api/client.ts` (`credentials: 'include'`, CSRF header, shared error-envelope type) + new `lib/api/client.test.ts`
- Created: `packages/contracts/src/errors.ts` (the standard error envelope); modified `packages/contracts/src/{auth,index}.ts`
- Modified (necessary correction - see Reviewer note): `services/api/src/app.ts`, `services/api/src/modules/auth/auth.route.ts` + `.test.ts`
- Created: `services/api/src/lib/api-error.ts` + test, `services/api/src/modules/auth/csrf.ts` + test
- Modified: `.env.example` (documents `SESSION_HMAC_KEY`'s dual use), `package.json`/`package-lock.json` (`@testing-library/user-event`)

Commands (all actually run; E2E against a real Postgres/Redis/API/browser stack via WSL2 Docker):
```
npm run lint
npm run typecheck                              (root, services/api, packages/database)
npm run test                                   (root, services/api, packages/database)
npm run build                                  (root, services/api)
PORT=4301 npx tsx services/api/src/server.ts   (real API, dev SMS sink, real Postgres/Redis)
NEXT_PUBLIC_API_BASE_URL=http://localhost:4301/v1 npx playwright test tests/e2e/
```

Results:
- `npm run lint`: exit 0, `--max-warnings=0` (including catching a real `react-hooks/exhaustive-deps` issue in the first draft of `OtpForm`'s countdown effect - fixed by keying the interval on `challenge.challengeId` instead of a derived boolean).
- Root `typecheck`/`test`/`build`: all exit 0. Root test count: **65/65** (up from 8 before this task).
- `services/api` `typecheck`/`test`/`build`: all exit 0. **193/193** (up from 178).
- `packages/database`: unaffected, 4/4.
- **Playwright E2E, run against the real stack** (API on port 4301 - port 4000 is occupied by an unrelated service on this machine, a known collision from earlier tasks; real Postgres/Redis via WSL2 Docker; the Next.js dev server Playwright's own `webServer` config starts):
  - `tests/e2e/auth.spec.ts` (5 new specs): route protection redirects an anonymous visit to `/login?next=...` and never redirects a public route; the acceptance text's links resolve to real `/legal/terms`/`/legal/privacy` pages; a full dev-OTP login → cookie inspection (access/refresh `HttpOnly: true`, csrf `HttpOnly: false`) → localStorage check (no token, no 6-digit code anywhere) → persistence across navigation → `POST /v1/auth/refresh` (with the CSRF header) actually rotates the refresh cookie → `POST /v1/auth/logout` actually revokes the session (protected route redirects again) - **all pass**; an incorrect code shows the accessible, code-specific error.
  - `tests/e2e/baseline.spec.ts` (pre-existing, updated): now logs in via the real dev OTP flow first, since `/` is no longer public - **passes**.
  - `tests/e2e/system-status.spec.ts` (pre-existing, unmodified): 3/3 fail with connection errors - this spec explicitly targets the full `docker compose up` stack (Caddy reverse proxy on port 80), which was not started this session (only the lighter Postgres/Redis/object-storage containers were, per its own header comment: "run `docker compose up -d` first"). Unrelated to this task; not a regression.
- `git grep` for the bootstrap phone number across all tracked, non-doc files: only pre-existing Task 05 test fixtures - nothing new from this task.

Acceptance:
- متن پذیرش پیش از CTA و linkها قابل مشاهده: **PASS** - `PhoneForm.test.tsx` and `auth.spec.ts` both confirm the acceptance text (with working links to `/legal/terms`/`/legal/privacy`) renders above the "دریافت کد" button, with no separate checkbox anywhere.
- receipt جاری شرط session: **PASS by construction** (carried over from Task 06: `verifyOtp` never creates a session without the current-version acceptance receipt being written in the same call) - Task 07 adds no new session-creation path that could bypass this.
- ورود و ماندگاری موفق: **PASS** - the E2E spec logs in, navigates to a previously-protected route, and confirms no redirect back to `/login` (real cookie-based persistence, not mocked).
- route محافظت‌شده بسته: **PASS** - `proxy.test.ts` (unit) and `auth.spec.ts` (E2E, real browser) both confirm an anonymous visit to a protected route redirects to `/login` with the original path preserved as `next`.
- open redirect/token storage نیست: **PASS** - `redirect-allowlist.test.ts` covers absolute URLs, protocol-relative URLs, embedded schemes, backslash tricks, and bouncing into `/login` itself (10 cases); `OtpForm.test.tsx` and the E2E spec both confirm nothing auth-related is ever written to `localStorage` (`Storage.prototype.setItem` spy in the former, a full `localStorage` dump check in the latter).
- Review 07 APPROVED: this file.
- Commit `feat: add terms-aware Persian OTP login`: **PASS** (`4372c3e`).

Security:
- **Real bug found and fixed, not hypothetical**: the API's error responses (`{error: 'STRING_CODE'}`) did not conform to docs/*-mvp-sonnet5.md section 7's mandatory envelope (`{error:{code,message,correlationId,details}}`), which the pre-existing `lib/api/client.ts` already expected and type-checks against. Without this fix, every single OTP/auth error - including `LEGAL_VERSION_CHANGED`, which the frontend must specifically detect to show updated terms - would have been silently swallowed into a generic `UNKNOWN_ERROR` by the client's own `isApiErrorEnvelope` check. Found by actually wiring `PhoneForm`/`OtpForm` to the real contract types, not by re-reading the spec in isolation. Fixed in `app.ts`'s error handler and every `auth.route.ts` error response; `correlationId` reuses Fastify's own per-request id rather than inventing a second identifier scheme.
- **CSRF**: a double-submit `csrf_token` cookie (non-`HttpOnly`, so client JS can read and echo it) is issued alongside the session cookies and required on `/v1/auth/refresh`. `/v1/auth/logout` is deliberately exempt - see the commit message's reasoning (a forged logout gains an attacker nothing, and enforcing CSRF there risks a confusing split-brain state). Task 32 will build the general route-level rate-limit/security-headers hardening and its own CSRF test suite; this is the plumbing Task 07's own step calls for ("API client را به cookie session و CSRF header متصل کن"), not a claim that CSRF hardening is complete for all future authenticated mutations.
- **`proxy.ts` is deliberately not the authoritative check** - it only tests for the *presence* of an `access_token` cookie (no signature/expiry verification, which would need `node:crypto`, unavailable in the Edge runtime this file traditionally runs in). `lib/auth/require-user.ts`'s `requireUser()` is the real gate, called by every protected Server Component, doing full HMAC verification via `getCurrentUser()`. This split is intentional and matches the task's own wording ("Proxy... فقط redirect اولیه انجام دهد؛ authorization در API بماند"), not a shortcut.
- **`GET /v1/auth/otp/_dev-sink` cannot exist in production**: it is registered only when `opts.smsProvider instanceof DevSmsSinkProvider`, and `createSmsProvider()` (Task 06) never returns that type when `NODE_ENV === 'production'` - there is no separate flag guarding this route that could drift out of sync with the production check. Verified directly: registering `authRoutes` with a non-dev `SmsProvider` and `isProduction: true` makes the route 404.
- `sanitizeNextPath` is the sole gate on the post-login redirect target - never a raw, user-controlled value passed to `router.push`. Both `proxy.ts` (constructing `next` from `request.nextUrl.pathname + search`, never from user input) and `app/login/page.tsx` (running every incoming `next` query value through `sanitizeNextPath` before it ever reaches the client) enforce this.
- `SESSION_HMAC_KEY` is now read by both `services/api` and the web app - same value, already the same shared `.env`/`.env.example` file both consumed before this task; no new secret-distribution surface was introduced.
- `npm audit`: unchanged in kind from Task 06 (0 critical, high findings all pre-existing in `next`/`prisma`'s own dependency trees); `@fastify/cookie` (Task 06) and `@testing-library/user-event` (dev-only) added zero new findings.

Regressions:
Full `lint`/`typecheck`/`test`/`build` matrix passes across root, `services/api`, and `packages/database`. No existing unit test was skipped or weakened. `tests/e2e/baseline.spec.ts` needed a real behavior update (log in first) because Task 07 *intentionally* changes the app's behavior - `/` is no longer public per the plan's own explicit route list - this is not a weakened test, it is the same original assertions (seed platforms visible, zero console errors) now exercised under the new, correct precondition.

Reviewer note:
- **File naming: `proxy.ts`, not `middleware.ts`.** The plan's own file list already said `proxy.ts`; initially this looked like a probable terminology slip (Next.js's file-based convention for this has always been `middleware.ts`), but `next build` printed "The 'middleware' file convention is deprecated. Please use 'proxy' instead" - Next.js 16.2.11 has genuinely renamed this convention (confirmed in `next/dist/server/web/types.d.ts`'s `ProxyConfig`, and `next/dist/build/templates/middleware.js`'s own `isProxy` branching, which requires the exported function be named `proxy`, not `middleware`, for a file named `proxy.ts`). The plan's file list was ahead of my own assumption, not behind it - built and named accordingly.
- **`lib/api/client.ts`, not in Task 07's literal file list, needed real changes.** Its pre-existing `ApiErrorPayload`/`isApiErrorEnvelope` shape already matched the *intended* contract exactly; the gap was entirely on the server side (see Security). `credentials: 'include'` and the CSRF header attachment are the literal implementation of this task's own explicit step ("API client را به cookie session و CSRF header متصل کن") - there was no other file this could naturally land in.
- Scope note on E2E "logout": Task 07's file list has no logout button/menu (that naturally belongs with Task 08's profile/account UI), so `tests/e2e/auth.spec.ts` exercises `POST /v1/auth/logout` directly via `page.request.post` rather than a UI trigger, confirming the server-side revocation and subsequent redirect - the same outcome, without inventing UI this task doesn't otherwise need.
- Scope note on "refresh": no automatic/silent token refresh was built (Next.js Server Components cannot set cookies, so a Server-Component-driven silent refresh isn't architecturally possible without a dedicated Route Handler, which nothing in this task yet needs); the E2E spec verifies the `/v1/auth/refresh` endpoint itself works and correctly rotates cookies when called, matching the task's "refresh" E2E requirement literally.
