# Task 06 Review

Status: APPROVED
Implementation-Commit: d4ceadb26e8ee61c66486baa05ae223aa3454d1e

Scope:
- Created: `packages/contracts/src/auth.ts` (wire schemas + error codes)
- Created: `services/api/src/modules/auth/{otp-crypto,otp-challenge.repository,fake-otp-challenge-repository,rate-limiter,sms-provider,sms-route-allowlist,session-tokens,session.repository,fake-session-repository,user-identity.repository,auth-audit,auth.service,auth.route}.ts` and every corresponding `.test.ts`
- Created: `services/api/src/app.test.ts`
- Modified: `services/api/src/app.ts` (registers `@fastify/cookie` and `authRoutes`; tightens CORS from `origin: true` to an explicit `appOrigin` allow-list + `credentials: true`; adds a shared `ZodError` → 400 error handler)
- Modified: `services/api/src/server.ts` (builds the real `SmsProvider` at boot; wires `SESSION_HMAC_KEY`/`PHONE_ENCRYPTION_KEY`/`appOrigin` into `authRoutes`)
- Modified: `services/api/src/config/env.ts`/`.test.ts` (`SMS_PROVIDER_WEBHOOK_URL`/`SMS_PROVIDER_API_KEY`, both optional - production requirement is enforced by `createSmsProvider`, not `env.ts`)
- Modified: `.env.example` (SMS provider placeholders), `services/api/package.json`/`package-lock.json` (`@fastify/cookie`)
- Modified: `packages/contracts/src/index.ts` (exports `./auth`)

Commands (all actually run, against real Redis/Postgres via WSL2 Docker):
```
npm run lint
npm run typecheck                              (root, services/api, packages/database)
npm run test                                   (root, services/api, packages/database)
npm run build                                  (root, services/api)
npx tsx <throwaway script>                      real Redis + real Postgres, full otp
                                                 request->verify->refresh->reuse->
                                                 second-login->cleanup cycle through the
                                                 actual production wiring (deleted after)
npx tsx <throwaway script>                      production boot check: createSmsProvider
                                                 without/with SMS_PROVIDER_* (deleted after)
git grep for the bootstrap phone number and any OTP-code-shaped literal in application source
```

Results:
- `npm run lint`: exit 0, `--max-warnings=0`.
- `services/api` `typecheck`: exit 0. `test`: **178/178 passed** (up from 79 before this task), including real-Redis contract tests for `OtpChallengeRepository` and `RateLimiter`, and a real-Postgres contract test for `SessionRepository` (all three gated live via `describe.skipIf` probes, same pattern Task 03/05 established - they ran for real here since WSL2 Docker's Postgres/Redis were up).
- `services/api` `build` (`tsc -p tsconfig.json`): exit 0.
- Root `lint`/`typecheck`/`test`/`build` and `packages/database` `typecheck`/`test`: all exit 0, unaffected by this task.
- **Real end-to-end smoke test** (a throwaway script, deleted before this commit, wiring the exact production `createAuthService` dependencies - real Redis-backed challenge repo, real Prisma-backed session repo, real legal-document repo - bypassing only the SMS transport itself since the dev sink is in-process by design):
  1. `requestOtp` → 202-shaped result; the code was observed via the dev sink instance the script itself constructed (there is no HTTP endpoint that exposes it - see Security).
  2. `verifyOtp` succeeded: real DB afterward showed exactly 1 `User`, exactly 1 `Session`, `TermsAcceptance` rows for both `TERMS` v1 and `PRIVACY` v1, and exactly 1 `AuditEvent` (`auth.otp_verify_success`).
  3. `refreshSession` rotated: new refresh token differed from the original.
  4. Presenting the **original** (now-rotated-away) refresh token again → `SessionReuseDetectedError`, as required.
  5. Presenting the **rotated** (otherwise still-valid) token afterward **also** failed - confirming the whole family was revoked, not just the reused token.
  6. A second, fully separate `requestOtp`/`verifyOtp` cycle for the same phone number resolved to the **same** `userId`.
  7. All rows cleaned up afterward; the throwaway script itself was deleted.
- **Production boot check** (a second throwaway script, deleted): `createSmsProvider(env)` with `NODE_ENV=production` and no `SMS_PROVIDER_*` set → threw `SmsProviderNotConfiguredError` before any server code runs; with both set → returned a real `HttpSmsProvider` without error.
- `git grep` for the bootstrap phone number across all tracked, non-doc files: only pre-existing Task 05 test fixtures (`phone.test.ts`, `phone-crypto.test.ts`, `env.test.ts`) - nothing new from this task. `grep` across `services/api/src/modules/auth/*.ts` (excluding `*.test.ts`) for any logging call (`console.*`, `.log(`) found **zero matches** - the phone number and OTP code are structurally never passed to a logger anywhere in this module.

Acceptance:
- enumeration نیست: **PASS** - `auth.service.test.ts` asserts an identical response shape (same keys, same `expiresInSeconds`/`termsVersion`/`privacyVersion`) for a valid+routable phone, a syntactically-invalid phone, and a phone in a country with no active SMS route. See Reviewer note for how "همیشه 202" was interpreted for the route-unavailable case specifically.
- OTP مصرف‌شده/منقضی رد: **PASS** - `OtpAlreadyUsedError` (replay of an already-consumed challenge) and `OtpExpiredError` (TTL elapsed, or an id that never existed - deliberately indistinguishable) are both directly tested.
- session بدون receipt نسخهٔ جاری صفر: **PASS by construction** - `verifyOtp` re-checks the current legal version immediately before creating any session, and `recordAcceptanceAndAudit` (the idempotent `TermsAcceptance` write) runs synchronously in the same success path that creates the `Session` row - there is no code path that creates a session without also writing a matching-version acceptance receipt in the same call.
- تغییر نسخه کنترل‌شده: **PASS** - `LegalVersionChangedError` carries the full current `{termsVersion, privacyVersion, termsUrl, privacyUrl}` so the client can re-render the updated terms without a second round-trip; tested for both "the current version moved" and "the client submitted a version that doesn't match the challenge"; confirmed no session is created and the 5-attempt counter is untouched by either case.
- reuse sessionها revoke: **PASS** - unit-tested and, additionally, verified against a real Postgres database in the smoke test above (the family-wide revocation on reuse, including a token that was otherwise still valid).
- log پاک: **PASS** - see Results' `git grep`/logging-call search.
- Review 06 APPROVED: this file.
- Commit `feat: bind OTP sessions to legal acceptance`: **PASS** (`d4ceadb`).

Security:
- OTP codes: CSPRNG (`node:crypto`'s `randomInt`), only an HMAC-SHA256 (keyed by `SESSION_HMAC_KEY`) is ever persisted - the raw code exists only in memory for the duration of `requestOtp`/the SMS provider call, and briefly as the caller-supplied value inside `verifyOtp`.
- Refresh tokens: CSPRNG 256-bit, only a plain SHA-256 lookup hash is persisted (no secret needed - the token itself carries the entropy).
- Access tokens: stateless, HMAC-signed with `SESSION_HMAC_KEY`, 15-minute lifetime. **Accepted tradeoff, stated explicitly**: because verification never touches the database, revoking the underlying session (logout, reuse detection) does not invalidate an already-issued access token until it naturally expires - the 15-minute TTL is the sole bound on that window. This is a standard access/refresh split tradeoff, not an oversight.
- Cookies: `access_token` is `HttpOnly`, `SameSite=Lax`, `path=/`; `refresh_token` is the same plus `path=/v1/auth` specifically, so it is never sent on ordinary requests - only to the four auth endpoints that need it. Both are `Secure` in production, not in development (verified in both directions in `auth.route.test.ts` and `session-tokens.test.ts`).
- CORS: tightened from Task 03's `origin: true` (reflects any request origin) to an explicit `appOrigin` string with `credentials: true` - a static-string `origin` config makes `@fastify/cors` answer with that fixed value on every request (this is standard library behavior, not a bug - the browser's own same-origin enforcement is what then protects a credentialed response from being read by a script on a different origin); `app.test.ts` pins down that an attacker-controlled `Origin` header is never reflected back and the header is never `*`.
- Rate limiting: fixed-window, keyed by `phoneHash` when the number normalizes, or by the raw `(country, input)` pair when it doesn't - either way every `otp/request` call is bounded, never unlimited.
- `createSmsProvider` refuses to return anything in production without `SMS_PROVIDER_WEBHOOK_URL` + `SMS_PROVIDER_API_KEY` both set - verified directly (see Results).
- Audit events never carry the phone number or OTP code - `recordAcceptanceAndAudit`'s and `auditReuseDetected`'s function signatures structurally cannot receive either (they only take ids, versions, and booleans), so this isn't a "remember not to log it" convention but a type-level guarantee.
- `npm audit`: unchanged in kind from Task 05 (0 critical, high findings all pre-existing in `next`/`prisma`'s own dependency trees); `@fastify/cookie` added zero new findings.

Regressions:
Full `lint`/`typecheck`/`test`/`build` matrix passes across root, `services/api`, and `packages/database`. No existing test was skipped, weakened, or deleted - `services/api` went from 79 to 178 passing tests. The CORS and error-handler changes to `app.ts` are additive/tightening, not loosening: every existing health/legal route test still passes unmodified.

Reviewer note:
- **"همیشه 202" interpreted literally, including for the route-unavailable case.** Rather than reading step 6 ("if the country has no active route, give a controlled response before creating a challenge") as a carve-out that returns a different status, this task treats "controlled response" as *also* meaning 202 + a real `challengeId` - just for a challenge that is `deliverable: false` internally (no code ever generated or sent) and therefore can never be completed at `verify`. This keeps the anti-enumeration property absolute: a made-up phone number, an unsupported route, and a real existing user's number are genuinely indistinguishable from the HTTP response alone, which is what the first acceptance bullet ("enumeration نیست") demands outright rather than "mostly." Worth flagging explicitly since it is a real interpretive choice, not the only defensible one.
- **A second, independently-versioned country allow-list** (`sms-route-allowlist.ts`'s `ACTIVE_SMS_ROUTE_ALLOWLIST`) was introduced deliberately separate from `phone.ts`'s `SUPPORTED_PHONE_COUNTRIES` (Task 05, already reviewed/untouched here) - a country can be phone-format-supported before a real vendor route for it exists, and the task's own wording calls for a distinct, versioned list for exactly that gate. Both currently list the same 8 countries; they are expected to diverge over time as real SMS routes are added/removed independently of phone-format support.
- **No real SMS vendor is named anywhere in the plan documents.** `HttpSmsProvider` is a generic, vendor-agnostic HTTP webhook adapter (`POST {phoneE164, code}` with a bearer key) rather than a specific gateway's SDK - whichever vendor is actually contracted can sit behind this same interface, or the adapter can be swapped later, without touching `auth.service.ts`.
- `services/api`'s `tsconfig.json` build-emits-tests-into-dist caveat noted in Task 05's review remains unchanged and equally applies here (pre-existing scope, not touched by this task, `dist/` is gitignored and was deleted after every local verification build).
