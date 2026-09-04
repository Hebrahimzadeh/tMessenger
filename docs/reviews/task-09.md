# Task 09 Review

Status: APPROVED
Implementation-Commit: 5ba637d858fa2497ca05b1dfad19ec683f1f979a

Scope:
- Schema: `packages/database/prisma/schema.prisma` + migration `20260904000000_mfa` - `MfaStatus` enum, `MfaEnrollment` (secret ciphertext, PENDING/ACTIVE), `MfaRecoveryCode` (hash-only, one-time use); `packages/database/src/client.ts` re-exports `Prisma` (needed for `Prisma.InputJsonValue` in admin audit).
- TOTP/base32 from scratch: `services/api/src/modules/auth/totp.ts` + test (15 tests, includes all 5 RFC 6238 Appendix B vectors).
- Generic symmetric crypto extracted for reuse: `services/api/src/lib/symmetric-crypto.ts` + test.
- MFA domain: `mfa-crypto.ts` (recovery codes + hashing), `mfa-token.ts` (separate `mfa_token` cookie, 24h), `mfa.service.ts`, `mfa.repository.ts` (real-Postgres tests), `mfa.route.ts` (`POST /v1/auth/mfa/{enroll,confirm,challenge}`) + all corresponding `.test.ts`.
- RBAC: `services/api/src/plugins/authorize.ts` (`requireRole(...roles)`, deny-by-default, session + role + fresh mfa_token) + test.
- Identity claims: `packages/contracts/src/identity-claim.ts`, `services/api/src/modules/identity-claim/*` (submit/list/detail) + tests.
- Admin: `packages/contracts/src/{role,admin}.ts`, `services/api/src/modules/admin/{admin.route,role-assignment.service}.ts` (`GET /v1/admin/identity-claims[/:userId]`, `POST /v1/admin/identity-claims/:userId/verify`, `POST /v1/admin/role-assignments`) + tests.
- Wiring: `services/api/src/app.ts`/`server.ts` register the three new route groups.
- Frontend: `components/mfa/{MfaSetup,MfaChallengeForm}.tsx`, `components/admin/AdminDashboard.tsx`, `app/settings/security/page.tsx`, `app/admin/page.tsx` + all `.test.tsx`.
- E2E: `tests/e2e/admin.spec.ts` (bootstrap superadmin, `test.describe.serial`).
- **Real bug fix (found via this task's own E2E run, not hypothetical)**: `lib/api/client.ts` - `apiFetch` unconditionally sent `Content-Type: application/json` even on a body-less POST (e.g. `MfaSetup.tsx`'s `handleEnroll`, which has nothing to send). Fastify's strict JSON body parser rejects an empty body sent with that content-type (`FST_ERR_CTP_EMPTY_JSON_BODY`, HTTP 400) *before* the route handler runs, and that rejection uses Fastify's own `{statusCode,code,error,message}` shape, not this app's `{error:{code,message,correlationId,details}}` envelope - so `isApiErrorEnvelope` returned false and every body-less POST surfaced as a generic, unhelpful `UNKNOWN_ERROR` client-side, indistinguishable from a real network failure. Fixed by only setting `Content-Type` when `init.body !== undefined`; `lib/api/client.test.ts` gained two tests (omits Content-Type with no body, still sends it with a body) plus a fix comment explaining why.

Commands (all actually run; E2E against a real Postgres/Redis/API/browser stack via WSL2 Docker):
```
npm run lint                                    (root)
npm run typecheck                               (root, services/api, packages/database)
npm run test                                    (root, services/api, packages/database)
npm run build                                   (root, services/api)
curl -i -X POST .../v1/auth/mfa/enroll ...       (direct, isolated repro - see Reviewer note)
PORT=4301 npx tsx services/api/src/server.ts    (real API, real Postgres/Redis)
NEXT_PUBLIC_API_BASE_URL=http://localhost:4301/v1 npx playwright test tests/e2e/
```

Results:
- `npm run lint`: exit 0, `--max-warnings=0`.
- Root `typecheck`/`test`/`build`: all exit 0. **107/107**.
- `services/api` `typecheck`/`test`/`build`: all exit 0. **342/342** (up from 234), including real-Postgres contract tests for `mfa.repository.ts` and `identity-claim.repository.ts`.
- `packages/database`: unaffected, **4/4**.
- **Playwright E2E, full combined run against the real stack** (`--workers=1`, API on port 4301): `baseline.spec.ts` (1), `auth.spec.ts` (5), `profile.spec.ts` (4), `admin.spec.ts` (3, new) - **13/13 pass**.
  - `admin.spec.ts`'s three specs: (1) bootstrap superadmin logged in but MFA-incomplete cannot reach `/admin` content, sees the challenge form plus an enroll link; (2) full flow - enroll MFA with a real, computed TOTP code (cross-package import of this task's own `totp.ts`), confirm (recovery codes shown once), a separate anonymous user sets up a profile and submits an identity claim, superadmin (now MFA-verified) verifies the claim and appoints that user MODERATOR; (3) an ordinary user with no elevated role is denied `/admin` outright.
- `git grep` for the bootstrap phone number and other phone-shaped patterns across every new/modified file: only the pre-existing, already-committed `BOOTSTRAP_SUPERADMIN_PHONE` test fixture constant (used since Task 05, in `admin.spec.ts` the same as `auth.spec.ts`/`phone-crypto.test.ts`/etc.) - nothing new leaked.

Acceptance (plan's own bullets):
- تست matrix مجوز و عدم اتکا به role ارسالی client: **PASS** - `authorize.test.ts` explicitly proves a client-supplied/tampered role claim has no effect (the route only trusts the DB-backed role lookup), and that role separation is real (an OPS-role session is rejected by a MODERATOR-only check, not just "any elevated role passes").
- secret TOTP رمز‌شده و recovery codeها hash شوند: **PASS** - `MfaEnrollment.secretCiphertext` is AES-256-GCM output (`symmetric-crypto.ts`, keyed by a server-only secret, never the raw base32 secret at rest); recovery codes are stored as `codeHash` (SHA-256, case-normalized) only - the plaintext code is returned to the user exactly once, at confirm time, and never persisted.
- مدیر بدون challenge دوم به `/admin` نرسد: **PASS** - `authorize.test.ts` (unit) and `admin.spec.ts` test 1 (E2E, real browser) both confirm a session with no completed MFA challenge gets `MFA_REQUIRED`/the challenge UI instead of dashboard content, even immediately after a fresh, valid login.
- مدیر کل moderator و senior admin تعیین کند و تغییرها audit شوند: **PASS** - `POST /v1/admin/role-assignments` (SUPERADMIN + MFA only) accepts any `RoleKeyContract` including `MODERATOR`/`SENIOR_ADMIN`; every verify/assign action calls an injectable `audit(...)` (`admin.route.test.ts` asserts the call with the correct event shape); `admin.spec.ts` test 2 exercises the real appointment end-to-end.
- پذیرش مسئولیت مدیریتی برای افراد غیر bootstrap به ثبت و تأیید claim رسمی خصوصی وابسته باشد؛ مدرک یا نتیجهٔ آن در پروفایل عمومی نمایش داده نشود: **PASS** - `role-assignment.service.ts` throws `IdentityClaimNotVerifiedError` for any non-`USER` role unless the target's identity claim status is `VERIFIED` (`role-assignment.service.test.ts`); the claim's evidence/verdict lives only in `services/api/src/modules/identity-claim/*` and `admin.route.ts`'s SUPERADMIN-only, MFA-gated responses - Task 08's `getPublicProfile` (unmodified this task) is a hand-built allow-list literal that was never touched to add these fields, so there is no code path from claim data to the public profile.
- OPS به متن چت و پروندهٔ محتوا دسترسی نداشته باشد: **PASS (structurally, vacuously today)** - no chat/content route exists yet in this codebase (later milestones); `requireRole` is deny-by-default, so no future chat/content route can grant OPS access by omission - it would require an explicit, reviewable `requireRole(..., 'OPS')` to do so. `OPS` appears today only in the role contract and in `authorize.test.ts`'s/`role-assignment.service.test.ts`'s own tests proving it is a distinct, separately-authorized role from `MODERATOR`/`SUPERADMIN`.
- E2E bootstrap، MFA و انتصاب moderator اجرا شود: **PASS** - see Results above, run cleanly together with the full existing E2E suite.
- Review 09 APPROVED: this file.
- Commit `feat: secure superadmin with MFA and RBAC`: **PASS** (`5ba637d`).

Security:
- **Real bug found and fixed via an actual end-to-end run, not a hypothetical**: see Scope - the `apiFetch` Content-Type/empty-body issue. Like Task 08's CORS `PATCH` bug, this was invisible to unit-level route tests (Fastify's `.inject()` never goes through the strict content-type parser the same way a real HTTP client does) and only surfaced running the real browser against the real server.
- Re-enrolling MFA over an already-`ACTIVE` setup requires a fresh, verified `mfa_token` for that exact user (`mfa.route.ts`) - otherwise a hijacked `access_token` alone (no second factor) could silently replace the real owner's TOTP secret and lock them out. Verified directly: attempting to re-enroll with only a session (no fresh MFA token) after a prior confirm correctly returns `MFA_REQUIRED`, not a fresh secret.
- `challengeMfa`/`hasActiveMfa` never allow a `PENDING` (unconfirmed) enrollment's secret to pass a challenge - `mfa.service.test.ts` proves `MfaNotActiveError` is thrown until `confirmMfa` has run once with a valid code.
- `mfa_token` and `access_token` are independent, separately-scoped HMAC-signed cookies (different purpose, different TTL - 24h vs 15m) - compromising one alone is insufficient to pass `requireRole`'s combined check.
- `npm audit`: unchanged in kind from Task 08 (0 critical; pre-existing high findings live only in `next`/`prisma`'s own dependency trees) - no new dependency this task introduced any new finding.

Regressions:
Full `lint`/`typecheck`/`test`/`build` matrix passes across root, `services/api`, and `packages/database`. Every pre-existing E2E spec (`baseline`, `auth`, `profile`) still passes unmodified alongside the new `admin.spec.ts`, run together in one `--workers=1` pass to rule out cross-spec interference. No existing test was skipped or weakened.

Reviewer note:
- **WSL2 idle-timeout, more precisely characterized this task than before**: this machine's Docker Desktop (WSL2 backend) idles the VM itself when nothing has touched it recently - *every* container (including ones from unrelated projects) reports `Up 1 second` when queried cold, and the API server's own Postgres connection fails with a real `ECONNREFUSED` at that moment (confirmed directly via `prisma.legalDocumentVersion.findFirst()` throwing mid-request). Mitigation: hold the VM open with a background `wsl -d Debian -- sleep <N> &` before any Windows-side verification that touches the dev stack; containers report `healthy` again within ~10s. This is now a known, load-bearing precondition for this project's manual verification on this machine, not an occasional fluke - worth a `docs/` note or a `predev` script in a later task rather than rediscovering it every session.
- **The original symptom ("`خطای غیرمنتظره‌ای در ارتباط با سرور رخ داد.`" on MFA enroll) had two independent, compounding causes**, diagnosed by isolating the endpoint with direct `curl` calls (bypassing Playwright/the browser entirely) rather than continuing to guess from browser-side symptoms alone: (1) the real `apiFetch` Content-Type bug above, which is what a legitimate user would actually hit every time; and (2) this session's own repeated manual/E2E verification runs exhausting the OTP request rate limit (`OTP_REQUEST_RATE_LIMIT=3`/600s) and, separately, leaving the bootstrap superadmin's MFA enrollment `ACTIVE` from a prior successful run (making a *second* run of the same "full flow" test correctly hit the re-enroll `MFA_REQUIRED` guard, not a bug) - both self-inflicted by iterating against one fixed, shared dev account, both resolved by clearing the Redis rate-limit key and deleting the stale `MfaEnrollment`/`MfaRecoveryCode` rows directly. Only cause (1) is a defect; (2) is an artifact of manual verification cadence against a shared fixture and needs no code change, only a clean DB before the next real run.
- A never-enrolled user hitting `MFA_REQUIRED` at `/admin` previously had no path forward - `AdminDashboard.tsx`'s `mfa_required` branch now also links to `/settings/security` to start enrollment, discovered by reasoning through the E2E flow end-to-end before writing it, not left as a dead end.
- `AdminDashboard.tsx`'s claim-list fetch uses the "cancelled flag" effect pattern (matching Task 08's `ProfileEditor.tsx`) to satisfy `react-hooks/set-state-in-effect` under React 19 - not a new pattern, reused deliberately rather than re-invented.
