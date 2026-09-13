# Task 20 Review

Status: APPROVED
Implementation-Commit: b4cfa14

Scope:
- `services/api/src/modules/messaging/realtime-auth.ts` (new, + 9 tests) — handshake authentication: origin policy, session cookie, and a session-liveness port for the life of the connection.
- `services/api/src/modules/messaging/realtime.gateway.ts` (new, + 21 tests) — the Socket.IO gateway: `conversation:join`, `message:send`, `message:created`, `receipt:read`, `typing:start`/`typing:stop`, `realtime:error`.
- `lib/realtime/client.ts` (new) — the browser client, including reconnect catch-up over REST.
- Migration `20260912210000_realtime_message_dedup` — additive: `messages.clientMessageId` plus `@@unique([conversationId, clientMessageId])`. Prisma's diff proposed dropping the `pg_trgm` index for the fourth time; removed with the usual NOTE, index confirmed present afterwards.
- `packages/contracts/src/messaging.ts` — socket payload schemas and one `REALTIME_EVENTS` map, so server and client cannot drift on event names.
- `messaging.service.ts` / `messaging.repository.ts` — `clientMessageId` threaded through; deduplication in the repository.
- `docker-compose.yml` — the api service now passes the SMS variables (see Security).
- `services/api/src/server.ts` — attaches the gateway after listen.
- Dependencies: `socket.io` (api), `socket.io-client` (root and api dev).

Commands (all actually run; integration against real Postgres/Redis/MinIO, plus the full Docker stack behind Caddy):
```
npx prisma migrate diff / migrate deploy              (packages/database)
npm run lint / typecheck / test                       (root)          -> 230/230
npm run typecheck / test:integration / build          (services/api)  -> 754/754, build OK
docker compose build api && docker compose up -d      (full stack via WSL2 Docker)
npx tsx <temporary harness>                           (two real sockets through the proxy)
```

Results:
- **`npm run test:integration --workspace services/api`**: 75 files, **754/754 passed, 0 skipped**. 30 are new here (9 handshake, 21 gateway).
- Root `lint` / `typecheck` / `test` (230/230), `services/api` `typecheck` / `build`: all exit 0.
- `migrate deploy`: 14 migrations, the new one applied cleanly; `spaces_search_text_trgm_idx` confirmed still present.
- **Live, through the deployed Caddy proxy on the published port**, against the real API container:
  - `GET /socket.io/?EIO=4&transport=polling` → `200` with a session id and `upgrades:["websocket"]`.
  - An anonymous socket → refused `SESSION_INVALID`. A socket from `https://evil.example` with a perfectly valid cookie → refused `ORIGIN_NOT_ALLOWED`. Both refusals come from the gateway, which is itself the proof that the upgrade traversed the proxy.
  - Two real sessions connected on the **websocket** transport (confirmed by reading the negotiated transport, not assumed), joined the same conversation, and a message sent by one was delivered to the other.
  - A resend of the same `clientMessageId` left exactly one row in `messages`.

Acceptance:
- join غیرمجاز ممکن نیست: **PASS** — Socket.IO rooms are only strings, so a client may ask to join any name it likes; the single thing preventing it is a membership read from the database on *every* join, never a list cached at connect time. Tested three ways: a non-member's join is refused, their send into that conversation is refused even without joining, and — the one that actually matters — a non-member who tried to join receives nothing when a real member then sends a message into it. A non-member is told the conversation is not found, the same disclosure rule the REST layer uses.
- پیام گم/دوتایی نمی‌شود: **PASS** — persistence happens before emission, so a message a peer sees is already stored (asserted by checking the store at the moment of delivery), and a failed write means nobody saw a message that does not exist. Duplication is prevented by a unique index on `(conversationId, clientMessageId)` rather than by application logic, so two retries arriving together still produce one row. Tested with a repeat send, and with a genuine disconnect-and-reconnect where the second socket resends the same id.
- revoke اتصال را می‌بندد: **PASS** — a revoked session is refused at the handshake, and an already-open connection is closed by a sweep that re-checks liveness. Tested both: a socket whose session is revoked mid-connection receives `SESSION_REVOKED` and is disconnected, and a second person's socket on the same gateway stays connected throughout.
- proxy WebSocket کار می‌کند: **PASS** — verified live through the real Caddy container, on the websocket transport, not inferred from configuration (see Results).
- `docs/reviews/task-20.md` ثبت شده است: **PASS** — همین فایل.
- Commit پیام مقرر: **PASS** — `feat: add authorized realtime messaging` (`b4cfa14`).

Security:
- **The origin check is the load-bearing one, and it is not redundant with CORS.** A browser performs no preflight on a WebSocket handshake and will happily attach this site's cookies to a cross-origin one. Without an explicit `Origin` check, any page on the internet could open a socket as a logged-in visitor and stream their private conversations — cross-site WebSocket hijacking. A missing `Origin` is refused too, since the only clients holding the cookie are browsers, and browsers always send it. The check runs *before* the cookie is examined, so a hostile origin cannot learn whether the cookie it sent was valid.
- **Revocation latency was an accepted trade for REST and is not acceptable for sockets.** The access token is stateless and stays valid for fifteen minutes after logout; on a request that costs one extra response, on a connection it could cost hours of streamed messages. Liveness is therefore keyed on the user having *any* unrevoked, unexpired session, re-checked every thirty seconds. Logout and Task 06's reuse-detection family revoke both close the socket. A database error during the sweep disconnects nobody; the next sweep retries.
- **Typing is never persisted.** It lives in Redis under a five-second TTL, which also means a client that closes a laptop mid-sentence stops "typing" without needing a stop event. Storing it would turn private behaviour into history.
- **Task 19's canary still holds.** Nothing in this task writes message text anywhere new; the full-database scan continues to find the sentinel only in `messages` and `message_revisions`.
- **A defect that made the documented deploy impossible.** Task 06 made a real SMS gateway mandatory in production, and `docker-compose.yml`'s api service runs as production — but that file never passed `SMS_PROVIDER_*`, so the container threw `SmsProviderNotConfiguredError` at boot and restarted forever. It had gone unnoticed because the image on this machine was built in 2026-09-03, before Task 06 existed; the stack looked healthy because it was running stale code. `docker compose up` is exactly what both the M0 and M3 deploy packets instruct the owner to run, so this would have met them at the first real attempt. The variables are now named with no default, so Compose refuses up front rather than leaving a crash loop to diagnose. `deploy/compose.production.yml` was already correct and is unaffected.
- **Rate limiting** is per user *and* per socket: one tab cannot spend another's budget, and opening many tabs does not multiply one person's. Thirty sends a minute. Task 32's general route-level limiter still lands later and is unaffected.
- `npm audit` unchanged: 0 critical, 7 high, all previously triaged in `docs/reviews/task-03.md`. `socket.io` and `socket.io-client` add no new advisories.

Regressions:
None. All 724 pre-existing `services/api` tests pass alongside the 30 new ones, root stays at 230/230. Task 19's REST endpoints are untouched; `clientMessageId` is nullable and null for everything REST creates.

Reviewer note:
Two things are worth recording.

1. **Running the real stack found two bugs the tests could not.** The gateway's 21 tests all passed while the server it is wired into could not start at all: `createRealtimeGateway` needs the HTTP server Fastify creates at listen, but Fastify refuses `addHook` once listening, so the close hook threw. The tests construct the gateway directly and never exercise `server.ts`. The compose misconfiguration was invisible for the same reason plus a stale image. Both are fixed; the lesson is that neither would have surfaced without actually bringing the stack up behind the proxy, which is why that was done rather than reasoning from the Caddyfile.

2. **The reconnect catch-up is deliberately REST, not a socket replay buffer.** `lib/realtime/client.ts` rejoins its rooms and then asks the existing paginated endpoint for everything newer than the last message it saw. A server-side buffer would need to know what each client had already received, which is state the gateway should not hold and cannot hold correctly across a restart. The plan asks for exactly this ("reconnect با cursor پیام‌های ازدست‌رفته را REST می‌گیرد"), and it composes with the deduplication: the client resends unacknowledged messages with their original ids, so the catch-up and the resend cannot between them produce a duplicate.

The browser client itself has no automated coverage yet — it is exercised for real when Task 21 rewrites the chat interface on top of it, which is where its E2E (`private-chat.spec.ts`) belongs. Flagged so it is picked up there rather than assumed done.
