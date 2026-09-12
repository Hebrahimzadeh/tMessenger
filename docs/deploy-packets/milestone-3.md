# Milestone 3 Deploy Packet

Git SHA: `7386942dbe2bc04c2d16e87d9f718ac090d33b38` (`feat(auth): show the OTP code on deployments with no SMS gateway`)

Milestone 3 ("کارت آگاهی، گفت‌وگوی عمومی و اقدام") is Tasks 14-18, all five reviewed and APPROVED:

| Task | Commit | Review |
|---|---|---|
| 14 — کارت چندرسانه‌ای، revision، گونهٔ استنباطی | `f6be9af` | `docs/reviews/task-14.md` |
| 15 — thread عمومی، واکنش، سنجاق، ویرایش امن | `e497c2b` | `docs/reviews/task-15.md` |
| 16 — رزرو عمومی idempotent، direct conversation، بسته‌شدن نهایی | `3e2c05e` | `docs/reviews/task-16.md` |
| 17 — رابط ایجاد کارت و سناریوی نردبان | `f994777` | `docs/reviews/task-17.md` |
| 18 — رخداد، مشارکت‌های من، dashboard قیف آگاهی | `d21ce5b` | `docs/reviews/task-18.md` |

`npm run review:gate -- --task 18` passes at this SHA.

Two commits sit on top of Task 18's approval, neither belonging to a numbered task. Both are described under Changes since Task 18 below.

Images: not rebuilt for this packet. `Dockerfile.api` and `Dockerfile.web` have uncommitted local edits (see Known limitations), so any image built right now would not correspond to this SHA. The M0 packet's build commands are unchanged.

## Database migrations

Twelve migrations total; Milestone 3 added four. All are additive and forward-only.

- `20260910080049_cards` (Task 14) — cards, revisions, attachments, inferred kind.
- `20260910082630_card_discussions` (Task 15) — public comments, comment revisions, weak reactions.
- `20260910174017_reservations_and_conversations` (Task 16) — reservations, reservation lifecycle, direct conversations and members.
- `20260910183815_awareness_daily_aggregates` (Task 18) — `AwarenessDailyAggregate`, keyed `@@unique(date)`.

Verified at this SHA against a real Postgres: `prisma migrate deploy` reports `12 migrations found` / `No pending migrations to apply`, so the applied schema and the repository agree exactly.

## Environment changes since Milestone 0

Names only, no values. See `.env.example` for the full list.

- `SHADOW_DATABASE_URL` — needed only by `prisma migrate dev`, never by `migrate deploy`.
- `BOOTSTRAP_SUPERADMIN_PHONE` — E.164, read only by `scripts/bootstrap-superadmin.mjs`, never by the server. Required before you can appoint the first superadmin.
- `SMS_PROVIDER_WEBHOOK_URL`, `SMS_PROVIDER_API_KEY` — required in production only. The server refuses to start in production without both; outside production the dev sink is used regardless.
- `POSTGRES_PORT`, `REDIS_PORT`, `S3_PORT`, `S3_CONSOLE_PORT` — optional host port overrides, all defaulting to the conventional ports.

## Deploy commands

```bash
cp .env.example .env   # fill in every value; SESSION_HMAC_KEY and PHONE_ENCRYPTION_KEY have no default
docker compose build
docker compose up -d
docker compose ps      # postgres/redis/object-storage/api healthy; object-storage-init Exited (0)
npm run db:migrate --workspace packages/database
BOOTSTRAP_SUPERADMIN_PHONE=+98... npm run bootstrap:superadmin
```

## Two accounts

The M3 scenario needs two distinct people, because a card's owner cannot reserve their own card.

1. **Superadmin** — the number in `BOOTSTRAP_SUPERADMIN_PHONE`, created by `npm run bootstrap:superadmin` (idempotent). Needed for the awareness dashboard, which is superadmin-plus-MFA only. MFA enrolment happens at `/settings/security`; `/admin` stays closed until it is complete.
2. **An ordinary member** — any other phone number, created simply by logging in. This is the account that reserves the card.

Both log in at `/login` by entering a phone number. On a deployment with no SMS gateway the code is shown on screen (see Changes since Task 18), so no SMS is involved.

## Smoke URLs

Through the reverse proxy, the only published port:

- `/` — space discovery feed
- `/system-status` — dependency health
- `/spaces/new` — space creation wizard
- `/cards/<cardId>` — card detail, public thread, reservation button
- `/participations` — the private "مشارکت‌های من" timeline
- `/admin/metrics` — the awareness funnel dashboard (superadmin + MFA)
- `/api/v1/health/ready` — machine-readable dependency check

## Automated evidence, captured at this SHA

Against real Postgres, Redis and MinIO running under Docker:

| Suite | Result |
|---|---|
| Root (`lint`, `typecheck`, `test`, `build`) | all clean, 230/230 tests in 44 files |
| `services/api` | 669/669 in 70 files, 0 skipped |
| `services/worker` | 7/7 |
| `packages/space-health` | 24/24 |
| `packages/awareness` | 10/10 |
| `packages/database` | 4/4 |
| Playwright E2E | 18 passed, 4 failed — every failure environmental, see below |

`GET /v1/health/ready` returned `{"status":"ok","checks":{"database":"ok","redis":"ok","storage":"ok"}}` against the live server. This is the first time all three dependencies were captured reporting `ok` in one live snapshot; `docs/reviews/task-03.md` recorded that as the one thing it could not capture simultaneously.

The ladder-flow E2E — "two users take a REUSABLE_RESOURCE card through the full ladder: create, public comment, reserve, chat redirect, in-use, close(RETURNED), disabled reservation" — passes against the live stack. That spec is the automated form of the manual scenario below.

### The four E2E failures

None is a defect in the product. Both causes are specific to how this run was staged.

- **Three in `system-status.spec.ts`** — they target `http://localhost/`, the fully deployed Docker stack behind Caddy on port 80. Only the three infrastructure containers were running, so the requests got `ERR_EMPTY_RESPONSE`. These pass when the stack is actually deployed, which is what the owner is about to do.
- **One in `admin.spec.ts`** — the second superadmin login hit the OTP rate limit, three requests per ten minutes per number, because the suite had already been run minutes earlier against that same bootstrap number. The page showed the rate-limit message. Waiting out the window, or using a fresh number, clears it.

## Manual scenario for the owner

This is the M3 stop condition from the plan. Run it end to end on the deployed stack.

1. Log in as the ordinary member. Create a space, then create a multimedia card in it with the type that can be reserved (`REUSABLE_RESOURCE`).
2. As the **other** account, open the card at `/cards/<cardId>`. Leave a public comment and confirm it appears in the thread.
3. Press the public reservation button. Confirm you are redirected into a direct chat with the card's owner.
4. Back on the card, move it to **IN_USE**, then close it as **RESERVATION_CLOSED**.
5. Confirm two things about the closed card: there is **no expiry tag** anywhere on it, and the reservation control is **disabled** rather than hidden or re-pressable.
6. Create a fresh, similar card. Confirm nothing about the closed one blocks or pre-fills it.
7. Open `/participations`. Confirm the timeline is reverse-chronological and has **no** filter chips, category tabs, search box, score, summary, or "open action" anywhere.
8. As the superadmin, enrol MFA at `/settings/security`, then open `/admin/metrics`. Confirm the funnel shows only aggregate counts and no per-person score.

## Changes since Task 18

Two commits sit on top of Task 18's approval. Neither belongs to a numbered task, and both are test or developer-experience work rather than product scope.

- **`9fe5bc7` — `fix(test): make space search suite idempotent against a persistent database`.** The space-search suite created spaces under fixed slugs and cleaned up only by the ids it held in memory. A run interrupted before teardown left rows behind, and every later run against that database then failed on the `spaces_slug_key` unique constraint — leaking another batch each time, so it never recovered without someone deleting rows by hand. Found live here: five orphaned rows failed the keyset-pagination test on three consecutive runs. `beforeAll` now purges the suite's own slug namespace first. This mattered for the milestone because it would fail CI against any persistent database, not only this machine.
- **`7386942` — `feat(auth): show the OTP code on deployments with no SMS gateway`.** Logging in on a test deployment required knowing a code that was never sent anywhere. The OTP screen now reads the code from the dev sink the API already runs outside production, displays it, and fills the input. Two existing properties keep this out of production rather than a new flag: `createSmsProvider` never returns the sink when `NODE_ENV` is production, and the route is registered only when the configured provider *is* the sink, so in production the request 404s and nothing renders. Verified live: requesting a code for `09121234567` with no gateway configured, reading it back and verifying, returned HTTP 200 with a userId and set the session cookies; a wrong code on a fresh challenge was still rejected with 422.

## Known limitations

- **Resolved before approval:** the deploy work that was uncommitted when this packet was written is now committed as `19d213c`, so the tree is clean and images built from it match. That commit carries `deploy/compose.production.yml`, the two Caddyfiles, the nginx virtual hosts, the pinned storage image, `activate-production.sh`, `deploy/PRODUCTION.md`, and the `UI_PREVIEW_MODE` switch.
- **`UI_PREVIEW_MODE` is largely redundant for its original purpose.** It was added to get past login without SMS; `7386942` addresses that directly, through the real login flow, with no route bypass. Kept for showing the interface before an SMS gateway exists. The paths it opens (`/`, `/chats`, `/comments`, `/chats/:id`, `/platforms/:id`) render only local seed data and make no API calls, so no real user data is exposed — checked, not assumed. `activate-production.sh` refuses to activate production while it is on.
- **`deploy/PRODUCTION.md` records the server IP, SSH port and login user.** That is operational convenience, not a credential, but it is worth deciding deliberately whether this repository should carry it.
- **No TLS.** Caddy serves plain HTTP on `:80`. Automatic HTTPS is a small change once a real domain exists.
- **This verification machine has no native Docker.** Everything above ran through WSL2 Docker. The WSL VM suspends aggressively here, taking the containers down mid-run; several test runs had to be re-staged with the VM held awake to get a clean measurement. A real Linux deployment target has no such layer. This is the same condition documented in the Task 03 and Task 04 reviews.
- **Host ports are shifted on this machine.** Postgres, Redis and MinIO publish on 15432, 16379 and 19000/19001, because the conventional ports are already taken locally. The committed `docker-compose.yml` still defaults to the conventional ports, which is correct everywhere else.
- **Port 4000 is occupied on this machine** by an unrelated container, so the API was verified on 4302 with `NEXT_PUBLIC_API_BASE_URL` pointed at it. A deployment behind the proxy is unaffected.
- **CI has still not run on GitHub.** The workflow is authored and its logic verified locally.
- **Every credential used here is an obviously-labelled dev value.** Generating real secrets is the owner's step before any non-local deploy.
- **`npm audit`: unchanged from earlier milestones** — 0 critical, 7 high, all previously triaged and disclosed in `docs/reviews/task-03.md`.

## Rollback

Roll back to `5c61ac4` (`docs(review): approve task 18`) to drop both post-Task-18 commits, or to any task commit in the table above. Rebuild and `docker compose up -d` per `deploy/README.md`. Migrations are forward-only and additive: rolling back application code does not and must not roll back any of the four M3 migrations.

Owner decision: MILESTONE-3 APPROVED

Approved by the owner on 2026-09-12. Milestone 4 ("پیام‌رسان خصوصی realtime") may
begin: Task 19's gate — "Review 18 و تأیید M3" — is now satisfied.
