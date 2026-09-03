# Task 04 Review

Status: APPROVED
Implementation-Commit: 023be48e9046bd8f5780482d55b901e8ca6983b3

Scope:
- Created: `Dockerfile.web`, `Dockerfile.api`, `.dockerignore`
- Created: `.github/workflows/ci.yml`, `deploy/Caddyfile`, `deploy/README.md`
- Created: `tests/e2e/system-status.spec.ts`
- Modified: `docker-compose.yml` (added `api`, `web`, `proxy`, `object-storage-init` services)
- Modified: `README.md` (rewritten from the original AI Studio prototype text)
- Modified (necessary for the Docker build; not on the literal file list): `next.config.ts` (`output: 'standalone'`), `tsconfig.json` (excluded `services/`/`packages/` - see Reviewer note), `services/api/package.json` (`tsx`/`dotenv` moved from devDependencies to dependencies)

Commands (all actually run, via WSL2 Docker - see Security):
```
docker compose build
docker compose up -d   (with POSTGRES_PORT/REDIS_PORT/S3_PORT/S3_CONSOLE_PORT/HTTP_PORT
                         overrides for this machine, plus SESSION_HMAC_KEY/
                         PHONE_ENCRYPTION_KEY - see Security)
docker compose ps
docker exec tmessenger-api-1 whoami / id
docker exec tmessenger-web-1 whoami / id
docker compose logs api --since 5m
npx playwright test tests/e2e/system-status.spec.ts   (SYSTEM_STATUS_BASE_URL=http://localhost:<HTTP_PORT>)
npm run verify
npm run test --workspace services/api
npm run typecheck --workspace services/api
npm run typecheck --workspace packages/database
npm run build --workspaces --if-present
npm audit
git diff --check
```

Results:
- `docker compose build`: both `tmessenger-web` and `tmessenger-api` built successfully (after two real build-time bugs found and fixed - see Reviewer note).
- `docker compose up -d`: all six services came up; `object-storage-init` ran once and exited 0 (correct one-shot behavior); `api` reached Docker's own `HEALTHCHECK` status `healthy` against `/v1/health/live`; `postgres`/`redis`/`object-storage` all `healthy`.
- **Through the proxy** (`curl` from inside WSL, avoiding the Windows↔WSL2 forwarding flakiness documented in `docs/reviews/task-03.md`):
  - `GET /` → 200
  - `GET /system-status` → 200
  - `GET /api/v1/health/live` → `{"status":"ok","version":"0.1.0"}`
  - `GET /api/v1/health/ready` → `{"status":"ok","checks":{"database":"ok","redis":"ok","storage":"ok"}}` - **all three dependencies simultaneously "ok" through the real, fully deployed stack** - this is the exact live snapshot Task 03's review flagged as blocked by WSL2 networking; captured here instead, through the compose stack rather than a bare `tsx` process.
- `npx playwright test tests/e2e/system-status.spec.ts` (from Windows, forwarding happened to be up): **3/3 passed** - home page, system-status page, and the `/api/*` proxy path all verified from a real browser/HTTP client against the live stack.
- `docker exec ... whoami`: `apiuser` (api container), `nextjs` (web container); `id` confirms both run as uid 1001, not root.
- `docker compose logs api --since 5m`: structured JSON lines only - method, url, host, status code, response time, request id. No secret, no env value, no request body.
- `npm run verify`: exit 0. `npm run test --workspace services/api`: 39/39 (WSL2 forwarding was up at the time, so this includes the real S3 contract, not just the fake one). Both workspaces' `typecheck`: exit 0. `npm run build --workspaces --if-present`: exit 0.
- `npm audit`: 0 critical, 7 high - unchanged from Task 03 (no new dependency introduced any new finding).
- `git diff --check`: exit 0.

Acceptance:
- `/` و `/system-status` از طریق reverse proxy باز می‌شوند: **PASS** — both verified via curl (inside WSL) and via Playwright (from Windows) against the live compose stack.
- API/DB/Redis روی status سبز هستند: **PASS** — `/api/v1/health/ready` reported `{database: ok, redis: ok, storage: ok}` through the real deployed stack (storage included, per Task 03's schema extension).
- log هیچ secret یا مقدار env حساس ندارد: **PASS** — see Results.
- image با user غیر root اجرا می‌شود: **PASS** — both images verified (`apiuser`/`nextjs`, uid 1001).
- `docs/reviews/task-04.md` ثبت شده است: **PASS** — همین فایل.
- Commit پیام مقرر: **PASS** — `chore: ship deployable engineering baseline` (`023be48e9046bd8f5780482d55b901e8ca6983b3`).

Security:
- **No secret is baked into either image or passed as a build argument.** The only build arg either Dockerfile accepts is `NEXT_PUBLIC_API_BASE_URL` (a public path, `/api/v1`, not a credential). `SESSION_HMAC_KEY`/`PHONE_ENCRYPTION_KEY`/S3 credentials/`POSTGRES_PASSWORD` are all runtime environment variables injected by `docker-compose.yml`'s `environment:` block, sourced from a real `.env` the operator provides (never committed - see `deploy/README.md`).
- `docker-compose.yml` uses Compose's `${VAR:?message}` syntax for `SESSION_HMAC_KEY`/`PHONE_ENCRYPTION_KEY` specifically (no default) - `docker compose up` itself refuses to start without them, ahead of `services/api/src/config/env.ts`'s own fail-fast once the process actually runs.
- **This machine has no native Docker**; verification used WSL2 Docker, per the owner's explicit instruction to this session. The same host↔WSL2 port-forwarding unreliability documented in Task 03's review was present here too - worked around identically: `docker exec`/`curl`-from-inside-WSL for anything that needed to be reliable, and captured the Windows-side Playwright run during a working window rather than depending on it. Unlike Task 03, this task's key acceptance evidence (all-three-ok through the real proxy) was captured via the WSL-internal path specifically because it needed to be unambiguous, not opportunistic.
- CI (`.github/workflows/ci.yml`) never echoes or logs any of the CI-only credential values it defines (`SESSION_HMAC_KEY`, etc.) - they're consumed directly by the app's own env validation, not printed.
- `npm audit`: 0 critical, 7 high, unchanged from Task 03 (see that review for the full breakdown - 3 tied to the `next@16.2.11` pin, 4 inside `prisma`'s own devDependency tree).
- The zip files noted in Task 03's review (`T messenger v0.2.zip`, `T messenger v0.3.zip`) remain untouched and out of every commit.

Regressions:
`npm run verify` passes with exit 0; both workspaces' own `test`/`typecheck` pass; `npm run build --workspaces --if-present` passes. No existing route, test, or contract was weakened - the `tsconfig.json` fix (see Reviewer note) is strictly a scoping correction that makes local and CI/Docker builds agree, not a behavior change to any of the three workspaces' own code.

Reviewer note:
Building the images surfaced two real, previously-latent bugs - neither hypothetical:

1. **`Dockerfile.api`'s runner stage never copied the root `package.json`.** `npm run db:generate --workspace packages/database` needs it to resolve the workspace command at all. Fixed by adding `COPY package.json ./` before the workspace-scoped source copies.

2. **`prisma generate` needs `DATABASE_URL` to be *present* at config-load time** (not connectable - `prisma.config.ts`'s `env('DATABASE_URL')` call just validates the variable exists), and there is no real database URL available at image build time by design (an image shouldn't be tied to one environment's connection string). Fixed with an explicit, obviously-fake placeholder (`postgresql://build:build@localhost:5432/build`) scoped to just that one `RUN` instruction - never connected to, and distinct from the real value the container runs with at deploy time.

3. **Root `tsconfig.json`'s `include: ["**/*.ts", "**/*.tsx"]` was unscoped across the entire monorepo**, so `next build`'s typecheck step was also independently re-checking `packages/database`'s own source - which happened to work on every machine that had already run `prisma generate` locally (true of this session's own dev environment since Task 03), masking the bug until a genuinely fresh build (the Docker image, nothing generated yet) hit `Cannot find module './generated/prisma/client'`. Fixed by excluding `services/` and `packages/` from the root project: each already has its own `typecheck` script and is verified independently; excluding them from root's *file discovery* doesn't affect root's ability to correctly resolve an actual import like `@taavon/contracts` (confirmed: `SystemStatus.tsx`'s import still typechecks and builds correctly) - it only stops root from treating their internal files as additional root-level inputs needing their own full diagnostics. Verified by temporarily deleting the local `packages/database/src/generated` output and re-running `npm run typecheck`/`npm run build` before touching the Docker build again, to reproduce the fresh-build condition exactly rather than guessing.

On the "one live snapshot with all three dependencies simultaneously healthy" item Task 03's review flagged as not captured: it's captured here, through the real deployed stack, specifically by staying entirely within WSL for that one check (`curl` executed inside the WSL environment itself, not from Windows) - which sidesteps the host↔WSL2 forwarding question altogether rather than depending on it holding steady. Worth carrying forward into later Docker-dependent tasks: prefer WSL-internal verification for anything that needs to be unambiguous, and treat a Windows-side check succeeding as a bonus, not a requirement.
