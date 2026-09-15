# Task 22 Review

Status: APPROVED
Implementation-Commit: fa373f1

Scope:
- Migration `20260915090000_notifications` — additive: `notifications` (unique `dedupKey`), `notification_deliveries`, `notification_preferences`, and the `NotificationType`/`NotificationChannel` enums. Prisma proposed dropping the `pg_trgm` index for a sixth time; removed with the usual NOTE.
- `packages/notifications` (new) — `derive.ts` (pure: outbox event → notification intents, plus the preview trimmer), `job.ts` (`runNotificationJob`), `repository.ts` (Prisma-backed, including the audience lookups). 35 tests.
- `services/api/src/modules/notifications/` (new) — service, repository, route: `GET /v1/me/notifications`, `POST /v1/me/notifications/read`, `GET`/`PATCH /v1/me/notification-preferences`. 27 tests.
- `services/worker` — a third queue, `notification-dispatch`, draining the outbox every 10 seconds.
- `components/notifications/{NotificationCenter,NotificationBell}.tsx` + `app/notifications/page.tsx`, with the bell in the header. 12 tests.
- `messaging.repository.ts` — a private message now also creates its recipient's notification, in the same transaction.

Commands (all actually run; integration and the consumer against real Postgres/Redis/MinIO):
```
npx prisma migrate diff / migrate deploy              (packages/database)
npm run lint / typecheck / test / build               (root)           -> 299/299, build OK
npm run test:integration                              (services/api)   -> 794/794
npm run test                                          (packages/notifications) -> 35/35
npm run test / build                                  (services/worker) -> 7/7
npx playwright test baseline + ladder-flow + private-chat --workers=1
```

Results:
- Root **299/299 in 50 files** (was 287). `services/api` **794/794 in 77 files** (was 767). `packages/notifications` **35/35**. worker 7/7, space-health 24/24, awareness 10/10, database 4/4. Lint, all typechecks and all three builds clean.
- Migration applied cleanly; the `pg_trgm` index confirmed still present; no residual drift beyond the known false positive.
- End to end with the badge now on every page: the baseline no-console-errors check, the full reservation ladder and all three private-chat specs pass.

Acceptance:
- dedup درست: **PASS** — `dedupKey` is unique in the database, and the consumer treats a collision as the intended outcome rather than an error. Proven three ways: the key is stable across a replay and different across genuinely different events (unit); a second `createIfNew` with the same key returns false and leaves one row (real Postgres); and a full replay of an already-drained outbox row creates nothing extra (real Postgres).
- مجوز صحیح: **PASS** — every read and write is scoped to the session's own user inside the query, so there is no input shape that widens it. The endpoint takes no recipient at all. Asserted at both levels: naming someone else's notification id marks nothing and returns `updated: 0`, and their rows never appear in a list.
- private preview قابل خاموش‌شدن: **PASS** — and it disappears rather than merely being hidden. With the preference off the server never looks the message up, the response contains no excerpt at all, and the notification still arrives so the person still learns someone wrote. Asserted at the route, against real Postgres, and in the component where switching it off clears previews already on screen.
- queue retry تست شده: **PASS** — a failing event is counted, backed off exponentially and left unprocessed rather than dropped or spun on; the next run skips it until its time comes; and one bad event does not stop the ones behind it. Tested in isolation and against a real outbox.
- `docs/reviews/task-22.md` ثبت شده است: **PASS** — همین فایل.
- Commit پیام مقرر: **PASS** — `feat: add in-app activity notifications` (`fa373f1`).

Security and privacy:
- **No preview is ever stored.** The row carries a subject id; the text is read from the message at request time and trimmed there. Three properties follow from that single decision rather than from three separate safeguards: Task 19's canary keeps passing, a deleted message stops having a preview the instant it is deleted, and someone with previews off never triggers the lookup.
- **A notification is a pointer, and a pointer never authorises a read.** Resolving a preview re-checks conversation membership at that moment; a notification pointing at a message in a conversation the recipient has left yields nothing. Asserted directly.
- **Private messages still write no outbox row.** Their notification is created in the same transaction as the message, so a timestamped record of private correspondence never lands in the general-purpose log other consumers read. The canary's outbox assertion is re-asserted in this task's own tests, not just inherited.
- **Nobody is notified about their own action.** Every audience lookup excludes the actor - noise is what makes people stop reading notifications at all, which would defeat the feature more thoroughly than a bug.
- **One channel, deliberately.** `IN_APP` is the only value, and the review of any future channel is a migration rather than a config change.
- The header badge polls rather than riding the socket. The socket carries private messages; a count covering public replies, reservations and moderation has no business on that connection.

Regressions:
None. Two things changed under existing tests and were handled deliberately: the messaging suite's teardown now clears notifications, because notifications restrict user deletion and every private message creates one; and the notification schema's UUID validation rejected some of this task's own first-draft fixtures, which were corrected rather than the schema loosened.

Reviewer note:
Three things worth recording.

1. **The private-message preview forced a real design decision, and it is the most consequential thing in this task.** The obvious implementation stores an 80-character excerpt on the notification row. That would have put private message text in a second table, breaking Task 19's canary and quietly undoing the isolation the whole milestone rests on. Resolving the preview at request time costs one extra query and buys back the invariant intact - plus deletion and the preference toggle working correctly for free, rather than each needing its own cleanup path.
2. **Private messages route around the outbox on purpose.** Everything else flows through it, which is why the consumer exists; messages do not, because the canary asserts they leave no trace there. That asymmetry is deliberate and is the reason `deriveNotifications` has no branch for them.
3. **The consumer's real-Postgres test narrows only its claim query.** A shared development database carries a backlog of unprocessed outbox rows from earlier tasks, and they filled the batch and decided what the test saw - it failed for that reason before being scoped. Everything actually under test still runs against Postgres: the unique index, the transaction ordering and the backoff. Only the input was made deterministic, and the reason is written into the test.

The five notification types are all defined and derived, but only `NEW_PUBLIC_REPLY` and `NEW_PRIVATE_MESSAGE` have producers today. `RESERVATION_CHANGED` expects `card.reservation_*` outbox events, `MODERATION_UPDATE` expects `moderation.*`, and `SPACE_GUIDANCE` expects `space.guidance_ready`; none of those writers exists yet, and M6 is where moderation arrives. The derivation and its tests are in place so those writers only have to emit the event. Flagged so the gap is picked up deliberately rather than mistaken for working coverage.
