# Task 08 Review

Status: APPROVED
Implementation-Commit: 77ddb1bb2a69e61718c60f99774b1358abe14786

Scope:
- Created: `packages/contracts/src/profile.ts`; modified `packages/contracts/src/index.ts`
- Created: `services/api/src/modules/auth/session-guard.ts` + test (a minimal session-verification gate for `/v1/me`, ahead of Task 09's `requireRole`/`authorize.ts`)
- Created: `services/api/src/modules/profile/profile.{service,repository,route}.ts` and every corresponding `.test.ts`
- Modified: `services/api/src/app.ts` (registers `profileRoutes`; **real CORS bug fix**, see Reviewer note), `services/api/src/app.test.ts`, `services/api/src/server.ts`
- Created: `lib/avatar.ts`, `lib/persian-digits.ts` (extracted from Task 07's `OtpForm`, now shared) + tests
- Created: `components/profile/{Avatar,ProfileForm,ProfileEditor,PublicProfileView}.tsx` and their `.test.tsx`
- Created: `app/profile/page.tsx`, `app/u/[username]/page.tsx`
- Modified: `proxy.ts` + test (public-path allow-list now includes `/u/`), `components/auth/OtpForm.tsx` (uses the extracted `toPersianDigits`)
- Created: `tests/e2e/profile.spec.ts`

Commands (all actually run; E2E against a real Postgres/Redis/API/browser stack via WSL2 Docker):
```
npm run lint
npm run typecheck                              (root, services/api, packages/database)
npm run test                                   (root, services/api, packages/database)
npm run build                                  (root, services/api)
curl -i -X OPTIONS .../v1/me/profile ...       (direct preflight check - see Reviewer note)
PORT=4301 npx tsx services/api/src/server.ts   (real API, real Postgres/Redis)
NEXT_PUBLIC_API_BASE_URL=http://localhost:4301/v1 npx playwright test tests/e2e/
```

Results:
- `npm run lint`: exit 0, `--max-warnings=0` (including catching a real `react-hooks/error-boundaries` violation in the first draft of `app/u/[username]/page.tsx` - constructing JSX inside a `try` block - fixed by moving the JSX return outside the `try`).
- Root `typecheck`/`test`/`build`: all exit 0. **94/94** (up from 65).
- `services/api` `typecheck`/`test`/`build`: all exit 0. **234/234** (up from 193), including a real-Postgres contract test for the profile repositories.
- `packages/database`: unaffected, 4/4.
- **Playwright E2E, run against the real stack** (API on port 4301 - the same port-4000 collision noted in every prior task's review):
  - `tests/e2e/profile.spec.ts` (4 new specs, all pass): full profile setup → public view defaults to private (no phone shown) → the two-step confirmation actually flips the *public* page's content (phone now visible) → reverting needs no confirmation; a reserved username (`admin`) is rejected with the specific Persian error text; an unknown username 404s; the public page is reachable from a completely separate, anonymous browser context.
  - `tests/e2e/auth.spec.ts` (5, pre-existing) and `tests/e2e/baseline.spec.ts` (1, pre-existing): all still pass unmodified.
- `git grep` for the bootstrap phone number across all tracked, non-doc files: only pre-existing Task 05 test fixtures - nothing new from this task.

Acceptance:
- شماره پیش‌فرض خصوصی و تغییرش قابل بازگشت: **PASS** - `phoneVisibility` defaults to `PRIVATE` (both the DB column default from Task 05 and `getMyProfile`'s own fallback for a not-yet-created profile); `ProfileForm.test.tsx` and the E2E spec both confirm reverting `PUBLIC → PRIVATE` needs no confirmation step, and the E2E spec confirms the public page's content actually changes both directions.
- XSS نیست: **PASS** - `profile.service.test.ts` confirms an XSS-shaped bio/displayName is stored verbatim (escaping is the renderer's job, not storage's); `ProfileForm.test.tsx` and `PublicProfileView.test.tsx` both confirm React's default text-content escaping renders such a value as literal text in both the edit form and the public view, with no `dangerouslySetInnerHTML` anywhere in this task's components.
- claim رسمی/phoneHash نشت نمی‌کند: **PASS** - `getPublicProfile`'s response is a hand-built object literal (`username`, `displayName`, `bio`, `phoneE164` - nothing else), never a spread of the repository record; a dedicated test (`profile.service.test.ts`) asserts the exact key set. `OfficialIdentityClaim` (Task 09) isn't touched by this task at all, so there is nothing from it to leak yet - this acceptance line is satisfied by the response shape's own discipline, which the same explicit-allow-list pattern will need to hold under in Task 09 too.
- Review 08 APPROVED: this file.
- Commit `feat: add privacy-first public profiles`: **PASS** (`77ddb1b`).

Security:
- **Real bug found and fixed, not hypothetical**: `@fastify/cors`'s own default `methods` list is `GET,HEAD,POST` - a cross-origin `PATCH` (or `PUT`/`DELETE`) preflight fails outright without an explicit `methods` config. Confirmed directly with `curl -i -X OPTIONS .../v1/me/profile -H "Access-Control-Request-Method: PATCH" ...` before the fix (`access-control-allow-methods: GET,HEAD,POST`, no PATCH) and after (full verb set present), then reproduced end-to-end via a real Playwright run against the real dev stack, which failed with a client-side "خطای غیرمنتظره‌ای...`" network error before the fix and passed after. This went unnoticed through Tasks 06-07 because every prior route was GET or POST; `PATCH /v1/me/profile` is the first real cross-origin PATCH in this codebase. `PUT`/`DELETE` were added to the same `methods` list pre-emptively, since the plan's own endpoint table already calls for both in later tasks (e.g. `PUT/DELETE /cards/:id/reactions/:type`) - not exercised yet, but there is no reason to rediscover the exact same bug a third time.
- `PATCH /v1/me/profile`'s body schema (`updateMyProfileBodySchema`) is a Zod object with exactly four keys and no `.passthrough()` - unknown fields (`avatarObjectKey`, `userId`, anything else) are silently stripped before the handler ever sees them, verified directly in `profile.route.test.ts` by sending exactly such a payload and confirming only the allow-listed fields took effect.
- `GET /v1/me` / `PATCH /me/profile` require a valid, HMAC-verified `access_token` cookie via the new `requireSession` (reusing Task 06's `verifyAccessToken` - no new crypto, no new secret); `GET /v1/users/:username` is deliberately public, matching the MVP endpoint table's own authorization column, not an oversight.
- Username uniqueness has two independent layers: the service checks `isUsernameTaken` before writing (fast, friendly 409), and the database's own functional `lower(username)` unique index (Task 05) is the actual backstop - `profile.repository.test.ts` proves the DB layer rejects a real case-variant collision (`clash_name` vs `CLASH_NAME`) even when application logic is bypassed entirely (a raw `prisma.userProfile.create` call).
- Reserved usernames (`admin`, `superadmin`, `support`, `system`, etc. - see `RESERVED_USERNAMES`) can never be claimed by a regular signup, preventing impersonation of platform staff via username alone.
- `npm audit`: unchanged in kind from Task 07 (0 critical, high findings all pre-existing in `next`/`prisma`'s own dependency trees); no new dependency this task introduced any new finding.

Regressions:
Full `lint`/`typecheck`/`test`/`build` matrix passes across root, `services/api`, and `packages/database`. No existing unit or E2E test was skipped or weakened - the CORS `methods` fix is additive (widens what's explicitly allowed; nothing that worked before stopped working), confirmed by the full pre-existing E2E suite (`auth.spec.ts`, `baseline.spec.ts`) still passing unmodified.

Reviewer note:
- **The CORS bug (see Security) was found by actually running the feature end-to-end**, not by re-reading the spec - the unit-level route tests (`profile.route.test.ts`) never exercise real CORS at all (Fastify's `.inject()` doesn't go through an actual browser or preflight), so this class of bug is specifically the kind that only a real Playwright run against a real running server can catch. Worth keeping in mind for Task 09 and beyond: any new HTTP method introduced there should get the same live-server, live-browser check before being declared done, not just a green unit-test suite.
- **`GET /v1/me` is fetched client-side, not server-rendered**, even though `app/profile/page.tsx` is a Server Component. A Server Component's own `fetch()` has no access to the incoming request's cookies (Next.js never forwards them automatically), so a server-side call to `GET /v1/me` would always see no session and 401 - regardless of whether the *browser* is actually logged in. `requireUser()` still runs server-side in the page (the real redirect gate), but the profile data itself loads via `ProfileEditor`, a client component using the same `apiFetch` (browser cookies flow normally) that `PhoneForm`/`OtpForm` already established in Task 07. This is a real architectural constraint of the current design (no shared package yet forwards cookies from a Server Component to `services/api`), not an oversight - worth remembering before assuming any future `/me`-shaped server-rendered page "just works" without the same consideration.
- Avatar is 100% client-computed (initials + a seed-derived stable color, `lib/avatar.ts`) - no backend field, no storage, matching "تا Task 32 ... URL دلخواه کاربر پذیرفته نشود" literally. `UserProfile.avatarObjectKey` (Task 05) stays unused until Task 32 adds real uploads.
- `GET /v1/me`'s response deliberately does not include the user's own decrypted phone number - only `phoneVisibility`. Nothing in Task 08's interfaces or acceptance criteria required exposing it, and omitting it keeps the response's attack surface smaller; if a future task needs the user to see their own number (e.g., to confirm before making it public), that is a deliberate new addition, not something silently missing from this one.
