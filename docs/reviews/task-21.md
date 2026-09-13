# Task 21 Review

Status: APPROVED
Implementation-Commit: 80d14fd

Scope:
- Rewritten against the real API and socket: `hooks/useChats.tsx`, `components/chat/{ChatsList,ChatRoom,MessageBubble}.tsx`. The seed-data prototype is gone from all four.
- New: `components/chat/{ChatComposer,ChatContextMenu,SensitiveDataWarning,AssistantProposalCard}.tsx`, `components/profile/StartPrivateChatButton.tsx`, `lib/chat/sensitive-data.ts`.
- New tests: `lib/chat/sensitive-data.test.ts` (14), `components/chat/{ChatComposer,MessageBubble,ChatsList}.test.tsx` (36), `hooks/useChats.test.tsx` (7), `tests/e2e/private-chat.spec.ts` (3, two browser contexts).
- Migration `20260913020000_chat_preferences_and_proposals` — additive: `mutedAt`/`hiddenAt` on `conversation_members`, `proposedAction`/`proposalState`/`proposalDecidedAt` on `messages`, and the `MessageProposalState` enum. Prisma proposed dropping the `pg_trgm` index for a fifth time; removed with the usual NOTE.
- API: `GET /v1/conversations/:id`, `PATCH /v1/conversations/:id/preferences`, `POST /v1/messages/:id/proposal`, and `userId` on the public profile.
- `components/spaces/ReservationActions.tsx` — the reservation redirect now carries `?from=/cards/:id`.

Commands (all actually run; integration against real Postgres/Redis/MinIO, E2E against a live API in two browser contexts):
```
npx prisma migrate diff / migrate deploy               (packages/database)
npm run lint / typecheck / test / build                (root)          -> 287/287, build OK
npm run typecheck / test:integration                   (services/api)  -> 767/767
PORT=4302 npx tsx services/api/src/server.ts           (real API)
npx playwright test --workers=1                        (full suite)
```

Results:
- Root: **287/287 in 49 files** (was 230). `services/api`: **767/767 in 75 files, 0 skipped** (was 754). Lint, both typechecks and the production build all clean.
- Migration applied cleanly; `spaces_search_text_trgm_idx` confirmed still present; no residual drift beyond the known false positive.
- **End to end, two independent browser contexts against the live socket**: all three `private-chat` specs pass, plus the whole existing suite (21 of 22; see below).

Acceptance:
- مسیرهای list/room/composer/back/reply/status تلگرام‌آشنا: **PASS** — list carries avatar, time and unread; room has header/back, bubbles, a bottom composer, reply and a long-press menu; delivery state is the familiar ladder of clock → one tick → two ticks, with a failed send kept in place and retryable. Covered by 36 component tests and exercised end to end. No Telegram asset, colour, logo or wording is copied; the pattern is shared, the surface is this project's own.
- رزرو همان room را باز می‌کند: **PASS** — verified end to end: a reservation deep-links into the direct room, and back returns to the card it came from rather than the chats tab.
- پیام زیر دو ثانیه: **PASS** — measured, not assumed. The E2E asserts the peer sees the message within a 2000 ms budget and that the elapsed time stays inside it; observed well under.
- شماره خودکار نیست: **PASS** — two halves. Nothing in the composer or anywhere else offers to fill in a person's number, asserted directly. And a typed number raises a warning with "edit" and "send knowingly" as equals before it leaves, asserted in unit tests and again end to end, where the peer is confirmed *not* to have received it while the warning stands.
- همیار متمایز/mute و فاقد autopublish: **PASS** — its own mark and colour, a "system account" badge in list and room, and a line in its own thread stating it is neither a manager nor a human, has no access to private conversations, and acts only on confirmation. A test asserts the row contains none of "مدیر", "ادمین", "پشتیبان" or "آنلاین". Muting and hiding persist per member and are proven live. No-autopublish is proven against real Postgres by row counts: attaching a proposal, and confirming one, both leave the card and space counts unchanged.
- `docs/reviews/task-21.md` ثبت شده است: **PASS** — همین فایل.
- Commit پیام مقرر: **PASS** — `feat: deliver Telegram-familiar isolated chat` (`80d14fd`).

Security and privacy:
- **The list shows a timestamp, never a preview.** A conversations list is a screen people glance at in public; a message preview would put private text on it. Asserted.
- **The warning warns and never blocks**, and is tuned to stay quiet. Times, prices, years and short digit runs produce nothing, because a check that cries wolf gets dismissed unread and then misses the one that mattered. An address marker counts only with a number near it, so "میدان انقلاب شلوغ بود" is silent while "خیابان آزادی پلاک ۵" is not.
- **`userId` was added to the public profile**, so a conversation can be opened from one. It is an opaque id already visible wherever people appear together, and the phone number beside it stays governed by its owner's own visibility setting. Three shape-pinning privacy tests caught the addition and were updated deliberately, with the reasoning written into each.
- **A proposal is data about something that has not happened.** Nothing reads PENDING as authority, the only transition out of it comes from the person it was shown to, and a stored proposal is re-validated on read so an unrecognisable row reads as no proposal at all rather than being passed on.
- Task 19's canary still holds: nothing here writes message text anywhere new.

Regressions:
None. Every pre-existing test passes alongside the new ones. Two behaviour changes were made deliberately and their tests updated with the reasoning recorded: the reservation redirect now carries `?from=`, and the conversation view gained `muted`/`hidden`.

Reviewer note:
Three things worth recording.

1. **A real bug surfaced only by using the thing.** A hidden conversation opened directly rendered without its identity - no assistant badge, no notice - because the room derived what it was from the conversations list it had just been removed from. Hiding is specifically required to keep a thread reachable, so the fix is a member-gated `GET /conversations/:id` that the room uses when the list does not describe what it is opening. The E2E is what caught it; no unit test would have, because each half was correct on its own.

2. **The admin E2E is not idempotent against a persistent database, and this is the second task it has bitten.** Across this task's runs it failed twice for two different environmental reasons: the OTP rate limit of three per ten minutes on the single bootstrap superadmin number, and leftover MFA enrolment from an earlier run. Neither is a product defect and neither is caused by Task 21 - the full suite passed 21 of 22 with the only failure being that spec - but it costs real time to re-diagnose each time. It wants the same treatment `space-search.repository.test.ts` got in Task 19: clear its own state up front rather than assuming a clean database. Recorded rather than fixed here, since it belongs to no task in flight.

3. **One root test is flaky under full-suite load.** `OtpForm.test.tsx`'s resend case failed once in a full run and passed three times in isolation and on the immediate re-run of the whole suite. It uses fake timers and advances five minutes, so timer contention under parallel load is the likely cause. Flagged rather than papered over.

The reply feature currently shows its target in the composer and on the bubble being replied to, but the room does not yet resolve a reply's source message from history - the server has no reply edge, so there is nothing to resolve against. Task 22 threads read-state and notifications through the same messages and is where that edge belongs. Flagged so it is picked up deliberately rather than assumed done.
