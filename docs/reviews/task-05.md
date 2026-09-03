# Task 05 Review

Status: APPROVED
Implementation-Commit: b5a3ad2aad7fb274e95f7fcdc7fe261192877dab

Scope:
- Modified: `packages/database/prisma/schema.prisma` (11 new models: `User`, `PhoneIdentity`, `UserProfile`, `LegalDocumentVersion`, `TermsAcceptance`, `Session`, `Device`, `Role`, `RoleAssignment`, `OfficialIdentityClaim`, `AuditEvent`; 6 new enums), `packages/database/prisma.config.ts` (`shadowDatabaseUrl`)
- Created: `packages/database/prisma/migrations/20260905000000_identity/migration.sql` (identity/legal/session/role/audit tables + a hand-added functional unique index on `lower(username)` Prisma's schema DSL can't express), `.../20260905000100_seed_roles/migration.sql` (the 6 fixed roles), `.../20260905000200_seed_legal_documents/migration.sql` (initial placeholder TERMS/PRIVACY v1)
- Created: `services/api/src/modules/auth/{phone,phone-crypto,bootstrap}.ts` and their `.test.ts` files
- Created: `services/api/src/modules/legal/legal-document.{repository,service,route}.ts` and `.service.test.ts`/`.route.test.ts`
- Created: `scripts/bootstrap-superadmin.mjs`
- Modified: `services/api/src/app.ts` (registers `legalRoutes`), `services/api/src/server.ts` (passes `APP_ORIGIN` through), `services/api/src/config/env.ts`/`.test.ts` (`BOOTSTRAP_SUPERADMIN_PHONE`, optional), `services/api/package.json` (`libphonenumber-js`)
- Modified (infra plumbing `SHADOW_DATABASE_URL` needed everywhere `DATABASE_URL` already was, for `prisma migrate diff`): `.env.example`, `Dockerfile.api`, `.github/workflows/ci.yml`
- Modified: `packages/contracts/src/index.ts`, new `packages/contracts/src/legal.ts`
- Modified: `package.json`/`package-lock.json` (`tsx` promoted to a root devDependency so `scripts/bootstrap-superadmin.mjs` can import `services/api`'s TypeScript sources directly; `bootstrap:superadmin` script added)

Commands (all actually run, against real Postgres/Redis via WSL2 Docker):
```
npm install
npm run lint
npm run typecheck                              (root)
npm run typecheck --workspace services/api
npm run typecheck --workspace packages/database
npm run test                                   (root)
npm run test --workspace services/api
npm run test --workspace packages/database
npm run build
npm run build --workspaces --if-present
npm run db:migrate --workspace packages/database   (x2, idempotency)
npx tsx services/api/src/server.ts                 (real server, PORT=4301)
npm run bootstrap:superadmin                       (x2, idempotency)
git grep for the bootstrap phone number across tracked files and the API log
```

Results:
- `npm run lint`: exit 0, `--max-warnings=0`.
- Root `typecheck`/`test`/`build`: all exit 0 (Next.js build unaffected - this task touches no frontend code).
- `services/api` `typecheck`: exit 0. `test`: **79/79 passed**, including the real-Postgres `bootstrapSuperadmin` suite (gated live via `describe.skipIf` on an actual `$queryRaw` probe, same pattern `storage.test.ts` established in Task 03 - runs for real here because WSL2 Docker's Postgres was up).
- `packages/database` `typecheck`: exit 0. `test`: 4/4 passed (unchanged from Task 03).
- `services/api` `build` (`tsc -p tsconfig.json`): exit 0.
- **Migrations, applied against the real dev database, in order:**
  1. `20260905000000_identity` - all 11 tables created; verified `\dt` shows 14 tables total and `\d user_profiles` shows the functional `lower(username)` index.
  2. `20260905000100_seed_roles` - verified all 6 roles present with correct Persian `displayName`s.
  3. `20260905000200_seed_legal_documents` - verified via `psql`: exactly one effective `TERMS` row (version 1, `publicUrl` `/legal/terms/v1`) and one `PRIVACY` row (version 1, `/legal/privacy/v1`).
  - Re-running `npm run db:migrate` a second time after all three: `No pending migrations to apply.` - confirmed idempotent.
- **Live server** (`npx tsx services/api/src/server.ts`, `PORT=4301` - port 4000 is occupied by an unrelated service on this machine, a known collision from earlier tasks):
  - `GET /v1/health/ready` → `{"status":"ok","checks":{"database":"ok","redis":"ok","storage":"ok"}}`.
  - `GET /v1/legal/current` → `{"termsVersion":1,"privacyVersion":1,"termsUrl":"http://localhost:4300/legal/terms/v1","privacyUrl":"http://localhost:4300/legal/privacy/v1"}` - real data from the seeded rows, resolved to absolute URLs against `APP_ORIGIN`, with **no `Authorization` requirement** (confirmed unauthenticated, per the MVP public-endpoint list).
- **`npm run bootstrap:superadmin`, run twice against the real database:**
  - Run 1: `Created superadmin user <uuid>.` / `SUPERADMIN role assigned.`
  - Run 2 (same `.env`, same `BOOTSTRAP_SUPERADMIN_PHONE`): `Superadmin user <uuid> already existed.` / `SUPERADMIN role was already assigned.` - **same user id both times.**
  - Direct `psql` verification after both runs: `SELECT count(*) FROM users` → **1**; `SELECT count(*) FROM role_assignments` → **1**; `phone_identities.phoneCiphertext` is base64 ciphertext, not the plaintext number; `audit_events` has **exactly one row** (`action = 'auth.bootstrap_superadmin'`, `metadata = {"created": true, "roleAssigned": true}` - written only by the first, state-changing run, not duplicated by the idempotent second run).
- `git grep` for the bootstrap phone number across all tracked files (excluding `.env`, which is gitignored) found it only in three plan/architecture docs (its published source) and in `env.test.ts` (asserting the env schema accepts a value of that shape) - never in `phone.ts`, `bootstrap.ts`, or any other production source file. `grep` across the live server's log output found no occurrence of the phone number at all.

Acceptance:
- دقیقاً یک user و role assignment: **PASS** - verified directly against the real database after two bootstrap runs (see Results).
- نسخهٔ حقوقی immutable: **PASS** - `legal_document_versions` has a unique `(type, version)` constraint and no application code ever updates an existing row; `terms_acceptances` has a foreign key to `(documentType, documentVersion)`, so a version referenced by an acceptance can never be deleted out from under it either. Publishing new text means inserting version 2, not editing version 1 (documented directly in the seed migration's own comment).
- نبود plaintext شماره در DB/log/bundle: **PASS** - `phone_identities.phoneCiphertext` verified as ciphertext against a live row; the live server's log output has zero occurrences of the number; the number appears in source only inside plan docs (the number's original, intentional publication) and one env-schema test asserting shape, never in any file that runs against a real phone number in production. See Reviewer note for one caveat found and deliberately not treated as a violation.
- audit موجود: **PASS** - one `audit_events` row exists after bootstrap, verified directly.
- Review 05 APPROVED: this file.
- Commit `feat: add versioned legal identity foundation`: **PASS** (`b5a3ad2`).

Security:
- `bootstrapSuperadmin` never reads `BOOTSTRAP_SUPERADMIN_PHONE` (or any env var) itself - it takes `phoneE164` and `phoneEncryptionKey` as plain parameters, so the only place the environment is consulted is `scripts/bootstrap-superadmin.mjs`, and `BOOTSTRAP_SUPERADMIN_PHONE` is optional in `env.ts` specifically so the API server's own boot never depends on it.
- Phone numbers are stored two ways, both irreversible-by-design where lookup doesn't need reversal: `phoneHash` (HMAC-SHA256, deterministic - used for the unique-lookup path bootstrap and future login rely on) and `phoneCiphertext` (AES-256-GCM, authenticated - the only path back to the real number, gated behind having `PHONE_ENCRYPTION_KEY`). No column stores the plaintext number.
- `RoleAssignment.assignedBy` is a required, non-nullable FK to `User` - bootstrap's first-ever SUPERADMIN is necessarily self-assigned (`assignedBy === userId`), documented inline in `bootstrap.ts` as the one legitimate case, not a bug. Every future role assignment task must ensure this is the *only* place that pattern occurs.
- `GET /v1/legal/current` is deliberately unauthenticated (matches the MVP endpoint table's own list of public routes) and read-only - no write path, no rate-limit-relevant amplification risk like Task 03's `/ready` finding.
- `.env` (gitignored, never committed) now holds the real `BOOTSTRAP_SUPERADMIN_PHONE` value the plan itself publishes (`+989191953219` appears in `docs/2026-09-02-taavonafarin-mvp-sonnet5.md`, `docs/new-plan.md`, and `docs/taavonafarin-master-platform-architecture-v3.md`); `.env.example` ships only an empty placeholder.
- `npm audit`: unchanged from Task 04 (0 critical, 7 high, all pre-existing in `next`/`prisma`'s own dependency trees - no new dependency this task introduced any new finding; `libphonenumber-js` and `tsx` added zero).

Regressions:
`npm run verify`-equivalent (root lint+typecheck+test+build) passes; both workspaces' own `typecheck`/`test`/`build` pass; no existing test was skipped, weakened, or deleted. `legal-document.route.test.ts` and `bootstrap.test.ts` both add coverage rather than replace anything.

Reviewer note (one real bug found and fixed before this review, not a hypothetical):
`legal-document.route.ts` originally resolved `app.db` **at plugin-registration time** (`const repository = opts.repository ?? createPrismaLegalDocumentRepository(app.db)`, executed once when `legalRoutes` was registered). `server.ts` registers `databasePlugin` *after* calling `buildApp()` (which registers `legalRoutes`), and Fastify boots plugins in registration order - so `app.db` was still `undefined` at the moment `legalRoutes` ran, and every real request to `/v1/legal/current` against the actual server 500'd with `Cannot read properties of undefined (reading 'legalDocumentVersion')`. Caught by actually starting the real server and curling it (not just the unit test suite, which always injected an explicit fake repository and so never exercised the `app.db` fallback path at all). Fixed by moving the `app.db` read inside the route handler, so it resolves per-request instead - after full boot, order no longer matters. Added a regression test (`legal-document.route.test.ts`: "resolves app.db lazily...") that decorates `db` *after* registering `legalRoutes`, mirroring `server.ts`'s real order, so this can't silently regress again. Worth carrying forward: any future route that falls back to `app.db` (or another plugin-provided decoration) as a default must resolve it inside the handler, never at registration time, unless that route's plugin is registered strictly after the decorating plugin.

One caveat on the "no plaintext number in the bundle" check: `services/api`'s `tsconfig.json` (`include: ["src/**/*.ts"]`, pre-existing since Task 01/03, not changed by this task) has no test-file exclusion, so a local `tsc -p tsconfig.json` build emits compiled `.test.js` files into `services/api/dist/` alongside real source - including `env.test.js`, which contains the plan's own example phone number as a literal test fixture. This `dist/` output is gitignored, is not what `Dockerfile.api` actually ships (it runs `tsx src/server.ts` directly against raw source, never `dist/`), and was deleted after this verification run rather than left behind. Not treated as a Task 05 regression (the `tsconfig.json` scope is unchanged from earlier tasks), but flagged here as pre-existing scope worth tightening whenever `services/api`'s build step is next touched, since it does mean *some* local tsc output could contain test-fixture strings, even if nothing this task added is a real secret.
