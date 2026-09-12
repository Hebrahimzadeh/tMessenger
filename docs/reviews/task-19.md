# Task 19 Review

Status: APPROVED
Implementation-Commit: f7f38b9

Scope:
- Migration `20260912195048_private_messaging` — additive only. `SYSTEM_ASSISTANT` added to `ConversationKind`; new `MessageStatus` and `MessageSenderKind` enums; new `messages`, `message_revisions`, `message_receipts` tables. Task 16's `conversations`/`conversation_members` are untouched. Prisma's diff again proposed dropping Task 11's hand-added `pg_trgm` index — removed, with the same NOTE the last three migrations carry; index confirmed still present after `migrate deploy`.
- `packages/contracts/src/messaging.ts` (new, exported from the index) — body bounds 1..8000, conversation/message/receipt views, and the request bodies.
- `services/api/src/modules/messaging/messaging.service.ts` (new) — access rules, view projection, cursors, and the system-sender gate.
- `services/api/src/modules/messaging/messaging.repository.ts` (new) — Prisma-backed, reusing Task 16's `DirectConversationPort` unchanged.
- `services/api/src/modules/messaging/messaging.route.ts` (new) — `GET/POST /v1/conversations`, `GET /v1/conversations/assistant`, `GET/POST /v1/conversations/:id/messages`, `POST /v1/conversations/:id/read`, `PATCH/DELETE /v1/messages/:id`.
- Three new test files; `app.ts` and `server.ts` register the module.

Commands (all actually run; integration against real Postgres/Redis/MinIO via WSL2 Docker, plus a live API and browser run):
```
npx prisma validate / generate                       (packages/database)
npx prisma migrate dev --create-only / migrate deploy (packages/database)
npm run lint / typecheck / test                       (root)          -> 230/230
npm run typecheck / test:integration / build          (services/api)  -> 724/724, build OK
PORT=4302 npx tsx services/api/src/server.ts          (real API)
npx playwright test tests/e2e/{ladder-flow,awareness}.spec.ts --workers=1
```

Results:
- **`npm run test:integration --workspace services/api`**: 73 files, **724/724 passed, 0 skipped**, against real Postgres, Redis and MinIO. 55 of those are new here (31 service, 12 route, 12 repository/canary).
- Root `lint` / `typecheck` / `test` (230/230) / `services/api` `typecheck` / `build`: all exit 0.
- `migrate deploy`: 13 migrations found, `20260912195048_private_messaging` applied cleanly. `spaces_search_text_trgm_idx` confirmed present afterwards by direct `pg_indexes` query; `messages`, `message_revisions`, `message_receipts` confirmed created.
- **Live**: `GET /v1/health/ready` returned all three dependencies `ok`, and `ladder-flow` plus `awareness` E2E passed against the running stack — so the reservation → direct-chat journey Task 16 built still works with the new schema underneath it.

Acceptance:
- reservation conversation بدون migration شکست ادامه می‌یابد: **PASS** — the migration only adds; `conversations` and `conversation_members` are unchanged; `getOrCreateDirectConversation` keeps its signature and its single caller in `reservation.repository.ts`. Proven live, not just by inspection: the ladder-flow E2E takes two people through reserve → chat redirect → in-use → close against the migrated database.
- non-member 404: **PASS** — every read and write goes through one `requireMembership` gate that raises `ConversationNotFoundError`, which the route renders as 404. Asserted at both levels, and asserted as *indistinguishable*: a non-member asking after a real conversation and one asking after a random UUID get the same status, the same error code and the same message. A 403 would have confirmed that two particular people are talking.
- حساب همیار قابل impersonate نیست: **PASS** — four independent structural reasons, each tested. There is no `User` row for the assistant, so nothing can authenticate as it. It is not a member of its own thread, so nobody can be added to one. `sendSystemMessage` requires a module-private symbol; the test tries strings, numbers, null, an object and even a *different* symbol with the same description, and all are refused. The HTTP send endpoint has no sender parameter — a test posts `senderId`, `senderKind` and a `credential` field in the payload and every message still comes back attributed to the caller.
- private text در AI/analytics/ad/log صفر: **PASS** — see the canary below.
- pagination ثابت: **PASS** — keyset on `(createdAt, id)` with a matching index, one extra row fetched to decide "is there more" without a second count query, cursors that round-trip to the keyset they encode, and a rejected cursor rather than a silent restart on a value we did not issue. Against real Postgres, two pages over five messages return every message exactly once with nothing repeated and nothing missed.
- `docs/reviews/task-19.md` ثبت شده است: **PASS** — همین فایل.
- Commit پیام مقرر: **PASS** — `feat: complete isolated private messaging` (`f7f38b9`).

The canary:
Rather than asserting against a list of forbidden tables, the test sends a message containing a sentinel that exists nowhere else, then reads every `text`, `character varying`, `json` and `jsonb` column of every table in the `public` schema and looks for it. It must appear only in `messages` and `message_revisions`. This is deliberate: M5 adds `AiRequest` and recommendation tables and M6 adds report tables, and a check naming today's tables would silently stop covering the ones that matter most. This one begins failing the moment any future write path copies private text somewhere new, with nobody having to remember it exists. Alongside it: sending and reading produce zero awareness events and zero outbox rows, a deletion's audit row carries `{conversationId}` and nothing else, and the assistant path — the only writer with no human sender — is checked the same way.

Security:
- **A real defect was found and fixed in Task 16's code while testing concurrency.** `direct-conversation.repository.ts` recovers from a lost unique-constraint race by re-reading the winning row, but it does so with the *same* transaction client that just raised the violation. Postgres refuses every further statement in a transaction after an error, so that recovery could never have succeeded — two genuinely concurrent first reservations between the same pair would have surfaced an error instead of resolving to the one conversation. Task 19 must not change that port's signature, so the retry now happens in the calling repository, where a fresh transaction makes it work. Verified with two concurrent `getOrCreateDirect` calls against real Postgres: one conversation, one `pairKey` row. **The reservation path still carries the original, unreachable recovery** — it calls the port directly inside its own transaction, so the same race there would still fail. That is Task 16 territory and is left for the owner to decide on rather than changed silently here.
- A soft delete clears `body` on the row so the text leaves every reader's view immediately, while `message_revisions` keeps the original. That is intentional and is the only place the text survives — the M6 report path is the one consumer the plan allows.
- `senderId` is nullable only because an assistant message has no human sender. `senderKind` records which case it is explicitly, so a reader never has to infer meaning from a null.
- Message length is bounded 1..8000 at the contract, with whitespace trimmed first, so a whitespace-only body is rejected rather than stored.
- No rate limiting on sending yet. That is Task 32's scope per the plan, and is noted here rather than quietly assumed.
- `npm audit` unchanged from earlier tasks: 0 critical, 7 high, all previously triaged in `docs/reviews/task-03.md`.

Regressions:
None. All 669 pre-existing `services/api` tests still pass alongside the 55 new ones, root stays at 230/230, and the ladder-flow and awareness E2E specs pass against a live stack on the migrated database.

Reviewer note:
Two decisions worth recording.

1. **The assistant's uniqueness reuses `pairKey` rather than adding a mechanism.** One helper thread per person is enforced by the same unique column that already makes a direct conversation idempotent, with the key `assistant:<userId>`. A second mechanism — a flag, a separate table, a check-then-create — could drift out of step with the first; this cannot, and it means two concurrent first requests still produce one thread.

2. **"هر mutation پیشنهادی فقط با confirmation token" has nothing to attach to yet, and no speculative surface was built for it.** The assistant proposes nothing in M4: there is no endpoint that executes an assistant-suggested action, because assistant-suggested actions arrive with the AI orchestrator in M5 (Tasks 23-26). The constraint is satisfied structurally today — there is no path from an assistant message to any mutation — and inventing a token mechanism with no caller would have meant shipping untested, unused code and guessing at M5's shape. When Task 26 adds the assistant's tools, the confirmation token belongs with them. Flagged here so it is picked up deliberately rather than forgotten.
