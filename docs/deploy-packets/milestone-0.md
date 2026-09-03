# Milestone 0 Deploy Packet

Git SHA: `21f857fed44a9ddd3e1e01136a9b9bbeb4c827c1` (`docs(review): approve task 04`)

Images: built locally via `docker compose build` (not yet pushed to a registry - no registry is configured at this stage; Task 32/34 territory).
- `tmessenger-web` — `sha256:448c60c7a46d881a5f2633725169c3bbfb77ff6ead963347d39bd9b5a00d7263`
- `tmessenger-api` — `sha256:87c4f29d48dfdb9b5dea4b77120a4d72c67613e790c7b1026475f8fcd0c6a990`

Database migrations:
- `20260903000000_init` — creates `system_settings` and `outbox_events` only (Task 03's explicit scope; every future domain table is its own task's own migration). Applied and verified idempotent in `docs/reviews/task-03.md`.

Environment changes (names only, see `.env.example` for the full list — no values here):
- `DATABASE_URL`, `REDIS_URL`
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- `SESSION_HMAC_KEY`, `PHONE_ENCRYPTION_KEY` — **no default; `docker compose up` refuses to start without both** (Compose `${VAR:?...}` syntax)
- `APP_ORIGIN`
- `NEXT_PUBLIC_API_BASE_URL` (build-time only, baked into the web image; defaults to `/api/v1`)
- `GEMINI_API_KEY` (pre-existing, unrelated to this milestone's own work)
- Optional local-only port overrides: `POSTGRES_PORT`, `REDIS_PORT`, `S3_PORT`, `S3_CONSOLE_PORT`, `HTTP_PORT` (all default to the conventional ports; only needed if something else on the host already holds one of them)

Deploy commands (exact, this environment — WSL2 Docker; see Known limitations):
```bash
cp .env.example .env   # then fill in every value, especially the two with no default
docker compose build
docker compose up -d
docker compose ps      # expect postgres/redis/object-storage/api all "healthy"; object-storage-init "Exited (0)"
```

Smoke URLs (through the reverse proxy — the only published port; replace `<HTTP_PORT>` with 80 unless overridden):
- `http://<host>:<HTTP_PORT>/`
- `http://<host>:<HTTP_PORT>/system-status`

Demo identities: N/A — no user accounts, auth, or OTP exist yet (that's Milestone 1). Nothing in M0 requires or exposes a phone number.

Automated evidence:
- `docs/reviews/task-01.md` through `docs/reviews/task-04.md` — each task's own commands, results, and acceptance-by-acceptance PASS record.
- `docs/reviews/task-03.md` and `task-04.md`'s Reviewer notes specifically document the WSL2 host↔container networking behavior encountered and how each acceptance item was still captured with certainty.
- Live evidence for this exact packet (captured during Task 04): `GET /api/v1/health/ready` through the deployed proxy returned `{"status":"ok","checks":{"database":"ok","redis":"ok","storage":"ok"}}`; `npx playwright test tests/e2e/system-status.spec.ts` — 3/3 passed against the live stack; `docker compose logs api` inspected for secrets — clean.

Manual scenarios (for the owner to confirm):
1. Open `/` — the existing tMessenger prototype UI loads with no console errors, seven seed spaces visible (unchanged since Task 01).
2. Open `/system-status` — "وضعیت کلی: سالم" with all three dependency rows (پایگاه‌داده / صف و کش / ذخیره‌سازی فایل) showing "سالم".
3. Stop one dependency (e.g. `docker compose stop redis`) and reload `/system-status` — it should show "ناقص (Degraded)" with only that row "قطع", not a crash or a blank page; `/` should still load normally (it doesn't depend on the API at all yet). Restart the dependency (`docker compose start redis`) and confirm `/system-status` recovers within a few seconds (the 3s `readyCacheMs` plus the dependency's own reconnect).
4. `docker compose restart postgres`, then check `docker exec <postgres-container> psql -U taavon -d taavon -c '\dt'` — the same three tables (`system_settings`, `outbox_events`, `_prisma_migrations`) should still be there; the named volume means a restart never loses data.

Known limitations (real, in-scope-for-M0 items, not deferred silently):
- **No TLS.** The Caddyfile serves plain HTTP on `:80`. Caddy supports automatic HTTPS trivially once there's a real domain to issue a certificate for; out of scope while this only runs on a bare IP/localhost.
- **This development/verification environment has no native Docker** — everything above was verified through WSL2 Docker specifically, per the owner's own instruction mid-Task-03. Host↔WSL2 port forwarding was intermittently unreliable during testing (recovered by `wsl --shutdown`); this does not affect a real Linux/cloud deployment target, which has no such translation layer, but is worth knowing if the owner reproduces this locally on the same machine.
- **CI has not actually run on GitHub** — `.github/workflows/ci.yml` was authored and its logic verified locally (equivalent commands run manually; the workflow itself needs a push/PR against a GitHub-hosted repo to execute for real).
- **No registry / image versioning yet** — images exist only as local Docker images on the build machine (see Images above, local IDs not registry digests). Pushing to a registry and pinning by digest is natural Task 34 (Release Candidate) territory, not required for M0's own stop condition.
- **Every credential in `.env` for this milestone's testing is an obviously-labelled dev/test value** (`local-dev-only-...`, `taavon_dev_...`) - none is a real secret suitable for an actual public deployment; generating real values is the owner's task before any non-local deploy.

Rollback: no previous image exists yet (this is M0's first deployable artifact) - `git checkout <previous-good-sha>` (there is none before this Milestone) would apply going forward, per `deploy/README.md`'s rollback runbook: rebuild from the last-known-good commit and `docker compose build && docker compose up -d` again. Migrations are forward-only and additive-only so far (see `docs/new-plan.md`'s Global Constraints); rolling back application code does not and should not roll back `20260903000000_init`.

Owner decision: WAITING_FOR_OWNER
