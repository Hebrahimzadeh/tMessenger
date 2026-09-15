# Milestone 4 Deploy Packet

Git SHA: `2e267342ff4720e21d82d2eff1e12891d782518b` (`fix(deploy): copy the notifications package into both images`)

Milestone 4 ("پیام‌رسان خصوصی realtime") is Tasks 19-22, all four reviewed and APPROVED:

| Task | Commit | Review |
|---|---|---|
| 19 — تکمیل API پیام خصوصی روی conversation رزرو | `f7f38b9` | `docs/reviews/task-19.md` |
| 20 — Socket.IO gateway با authorization | `b4cfa14` | `docs/reviews/task-20.md` |
| 21 — رابط چت، همیار تعاون و هشدار افشای اطلاعات | `80d14fd` | `docs/reviews/task-21.md` |
| 22 — اعلان درون‌برنامه‌ای و وضعیت خواندن | `fa373f1` | `docs/reviews/task-22.md` |

`npm run review:gate -- --task 22` passes at this SHA. One commit sits on top of Task 22's approval, `2e26734`, and it matters for this packet specifically: Task 22 added `packages/notifications`, but both Dockerfiles list the workspace packages they copy one by one and the new one was not among them. The API image therefore built cleanly and crash-looped at boot with `ERR_MODULE_NOT_FOUND`. No test could have caught it — every suite runs against the workspace on disk, where the package resolves. Building the image for this packet is what found it, which is what the packet is for.

Images: `tmessenger-api` rebuilt and verified at this SHA. `tmessenger-web` has **not** been rebuilt since Task 21 changed the chat interface — rebuild it before deploying, or the web container will serve the old prototype.

## Database migrations

Sixteen in total; Milestone 4 added four. All additive and forward-only.

- `20260912195048_private_messaging` (Task 19) — messages, revisions, read receipts, the `SYSTEM_ASSISTANT` conversation kind.
- `20260912210000_realtime_message_dedup` (Task 20) — `clientMessageId` with a unique index per conversation.
- `20260913020000_chat_preferences_and_proposals` (Task 21) — per-member mute/hide, and assistant proposals with their state.
- `20260915090000_notifications` (Task 22) — notifications with a unique `dedupKey`, deliveries, and per-person preferences.

Verified at this SHA: `prisma migrate deploy` reports `16 migrations found` / `No pending migrations to apply`, and the hand-added `pg_trgm` index is still present.

## Environment changes since Milestone 3

No new variables. `SMS_PROVIDER_WEBHOOK_URL` and `SMS_PROVIDER_API_KEY` are now passed through to the api service by `docker-compose.yml` — see the M3 packet's own note about why that was missing.

## Deploy commands

```bash
docker compose build          # both images; web has not been rebuilt since Task 21
docker compose up -d
docker compose ps             # postgres/redis/object-storage/api healthy; object-storage-init Exited (0)
npm run db:migrate --workspace packages/database
```

## Two accounts

Same as M3: one superadmin from `BOOTSTRAP_SUPERADMIN_PHONE` via `npm run bootstrap:superadmin`, and any second phone number, created by logging in. Both log in at `/login` by entering a number; on a deployment with no SMS gateway the code is shown on screen.

The second account matters more here than it did in M3 — every scenario below needs two people, and the private ones need them in two separate browsers or devices.

## Smoke URLs

- `/chats` — the conversations list
- `/chats/<conversationId>` — one conversation
- `/notifications` — the notification centre, with the private-preview switch
- `/api/v1/conversations/assistant` — **the assistant thread's URL.** It is created on first request, so opening this returns the id to visit at `/chats/<id>`. There is no route to anyone else's.
- `/api/v1/health/ready` — dependency health
- `/socket.io/?EIO=4&transport=polling` — the realtime gateway's own handshake

## Websocket health

Verified live at this SHA, through the Caddy container on the published port:

- `GET /api/v1/health/ready` → `{"status":"ok","checks":{"database":"ok","redis":"ok","storage":"ok"}}`
- `GET /socket.io/?EIO=4&transport=polling` → `200`, returning a session id and `upgrades:["websocket"]`

Task 20's review records the fuller live run on the websocket transport itself: two real sessions connected through the proxy, joined a conversation and exchanged a message, while an anonymous socket was refused `SESSION_INVALID` and one from a foreign origin `ORIGIN_NOT_ALLOWED`.

## The private canary report

This is the part of M4 worth reading closely, because the milestone's premise is that private conversation stays private.

**The canary is a full-database scan, not a list of forbidden tables.** It sends a message containing a value that exists nowhere else, then searches every `text`, `varchar`, `json` and `jsonb` column of every table in the schema for it. It must appear only in `messages` and `message_revisions`. Written that way deliberately: M5 adds AI tables and M6 adds report tables, and a check naming today's tables would silently stop covering the ones that matter most. This one starts failing the moment any future write path copies private text somewhere new, with nobody having to remember it exists.

Result at this SHA: **passes.** The sentinel appears in `messages` and `message_revisions` and nowhere else.

Alongside it, asserted against real Postgres:

- Sending and reading a private message write **zero** awareness events and **zero** outbox rows for that conversation.
- The assistant path — the only writer with no human sender — writes none either.
- A deletion's audit row carries the conversation id and nothing else: no body, no excerpt, no length.
- Task 22's notifications hold **no** message text. A notification row carries a subject id; the preview is read from the message at request time, trimmed to eighty characters, for a reader whose conversation membership is re-checked at that moment. The canary re-asserts the outbox stays empty even though every private message now also creates a notification.

**No AI, analytics or advertising path exists to leak into yet** — M5 has not started, and there is no ad code anywhere in the repository. What this milestone establishes is the invariant and the test that will catch its violation, not a claim that a system which does not exist has been audited.

## Automated evidence, captured at this SHA

Against real Postgres, Redis and MinIO:

| Suite | Result |
|---|---|
| Root (`lint`, `typecheck`, `test`, `build`) | clean, 299/299 in 50 files |
| `services/api` | 794/794 in 77 files |
| `packages/notifications` | 35/35 |
| `packages/space-health` | 24/24 |
| `packages/awareness` | 10/10 |
| `services/worker` | 7/7 |
| `packages/database` | 4/4 |

Playwright, in two independent browser contexts: the three `private-chat` specs, the full reservation ladder, and the baseline no-console-errors check all pass.

## Manual scenarios for the owner

This is the M4 stop condition. It needs **two devices, or two browsers**, logged in as the two accounts.

1. On both devices, open `/chats`. Confirm the familiar shape: avatar, time, unread count in the list; header with back, bubbles, composer pinned to the bottom in a room.
2. From one device, open the other person's public profile at `/u/<username>` and press **گفت‌وگوی خصوصی**. Confirm it opens a conversation, and that the other device sees the same conversation in its list.
3. Send a message. Confirm it appears on the other device **within about two seconds**, and that your own copy moves from a clock to a tick.
4. Long-press a message. Confirm reply, copy, and delete-your-own. Send a reply and confirm the quoted preview appears.
5. Type a phone number and press send. Confirm the warning appears, that the other device has **not** received it, and that "با آگاهی ارسال می‌کنم" then sends it. This is "شماره خودکار نیست": nothing anywhere offers to fill your number in for you.
6. Open the assistant thread (see Smoke URLs). Confirm the **حساب سیستمی** badge, and the line stating it is neither a manager nor a human, has no access to your private conversations, and acts only on your confirmation. **Mute it**, reload, and confirm the mute survived. Hide it, confirm it leaves the list, and confirm you can still reach it.
7. Open `/notifications`. Confirm the private message appears with a preview of at most eighty characters. **Switch the preview off.** Confirm the excerpt disappears immediately while the notification itself stays — you still learn someone wrote to you.
8. Press **خواندن همه** and confirm the badge clears on both the page and the header.

## Known limitations

- **`tmessenger-web` has not been rebuilt since Task 21.** Build it before deploying or the web container serves the pre-Task-21 chat prototype. The API image at this SHA is current and verified.
- **Three of the five notification types have no producer yet.** `RESERVATION_CHANGED`, `MODERATION_UPDATE` and `SPACE_GUIDANCE` are fully derived and tested but expect outbox events nobody writes today; moderation arrives in M6. Only public replies and private messages actually produce notifications now.
- **A reply's source message is not resolved from history.** The quoted preview comes from the composer, because the server has no reply edge yet.
- **No rate limit on REST message sending.** The socket path is limited per user and per socket; the REST endpoint is not, and Task 32 is where general route-level limiting lands.
- **`tests/e2e/admin.spec.ts` is not idempotent against a persistent database**, and has cost time on two tasks — the OTP rate limit on the single bootstrap number, and leftover MFA enrolment. Not a product defect; it wants the treatment `space-search.repository.test.ts` got in Task 19.
- **`OtpForm.test.tsx`'s resend case is flaky under full-suite load.** It passes in isolation and on re-runs.
- **This verification machine still has no native Docker** and its WSL2 VM suspends aggressively, so live-infra runs have to be staged with the VM held awake. A real Linux target has no such layer.
- **Port 80 and port 4000 are both occupied on this machine**, so the stack was verified on 18080 and the API on 4302. A deployment behind the proxy is unaffected.
- **No TLS in the committed compose file.** `deploy/compose.production.yml` fronts it with the server's existing nginx TLS edge.
- **`npm audit` unchanged**: 0 critical, 7 high, all previously triaged in `docs/reviews/task-03.md`.

## Rollback

Roll back to `5400be1` to drop only the Dockerfile fix, to `e403403` for the end of Task 21, or to any task commit in the table above. Rebuild and `docker compose up -d`. The four M4 migrations are additive and forward-only: rolling back application code does not and must not roll them back.

Owner decision: MILESTONE-4 APPROVED

Approved by the owner on 2026-09-15. Milestone 5 ("هوش مصنوعی هدایت‌گر و قابل
خاموش‌شدن") may begin: Task 23's gate — "Review 22 و تأیید M4" — is now
satisfied.
