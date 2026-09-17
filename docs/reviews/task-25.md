# Task 25 Review

Status: APPROVED
Implementation-Commit: 8c59b65

Scope:
- `packages/contracts/src/card-inference.ts` (new) — `cardInferenceSchema`, `operationalPatternSchema`, `clarifyingQuestionSchema` with its closed four-topic enum, `inferCardBodySchema`, and `PATTERN_BY_KIND`.
- `packages/contracts/src/card.ts` — `confirmedInferenceSchema`, and `confirmedInference` on the create body.
- `services/api/src/modules/ai/capabilities/card-inference.ts` (new) — `classify`, `inferFromRules`, `inferCard`, plus `card-inference.fixtures.ts` (12 fixtures) and `card-inference.test.ts` (48 tests).
- `card.service.ts` — `CardInferencePort`, `inferCardDraft`, and `createCard` honouring a confirmed inference; `card.repository.ts` — `getSpaceProtocol`; `card.route.ts` — `POST /v1/spaces/:spaceId/cards/infer`.
- `components/spaces/CardInferencePreview.tsx` (new, 16 tests) and `CardComposer.tsx` (7 new tests).
- `tests/e2e/ladder-flow.spec.ts` — four new cases; `tests/e2e/helpers/reset-superadmin-mfa.mjs` (new).
- No migration. `CardSemanticProfile` already had `inferredKind` and `confidence`; this task changes what is written into them, not their shape.

Commands (all actually run; integration against real Postgres/Redis/MinIO, and E2E against a real browser):
```
npm run lint / typecheck / test / build               (root)          -> 341/341, build OK
npm run test:integration / build                      (services/api)  -> 973/973, build OK
npm run test --workspaces                             (packages)      -> 73/73
npx playwright test                                   (E2E)           -> 32/35, see below
npx playwright test tests/e2e/admin.spec.ts  x3       (idempotence)   -> 3/3 each
```

Results:
- `services/api` **973/973 in 84 files** (was 918), of which 55 are new here. Root **341/341** (was 318). Packages 73/73. Lint, typechecks and all three builds clean.
- E2E: `ladder-flow.spec.ts` **5/5**, including the pre-existing full reservation flow. Overall 32 passed; the three failures are all of `system-status.spec.ts`, which by its own header comment targets the docker-compose stack through Caddy — this run used the local dev servers, so that precondition was absent. Those three tests touch `/`, `/system-status` and `/api/v1/health/live`, none of which this task changes.

Acceptance:
- متن کلی پیشنهاد خلاق قابل رد دارد: **PASS** — «یه چیزی برای کمک دارم» comes back as a publishable AWARENESS card with a title, a body, a stated assumption and a confidence below 0.5 saying it was a default rather than a reading. Every part of the suggestion is rejectable: three separate checkboxes, and a dismiss button that applies nothing at all. Asserted in the component test and end to end in a browser.
- فرم نوع اجباری نیست: **PASS** — the composer still has no kind selector until the person asks for a suggestion, which the existing test (`queryByRole('combobox')` absent on render) keeps honest. Submitting without ever asking sends no `kind` and no `confirmedInference`, verified by inspecting the request body, and the E2E case posts a generic sentence with `getByLabel('نوع کارت')` asserted to have zero matches.
- نردبان terminal-close: **PASS** — «یک نردبان دارم که می‌توانم قرض بدهم» is REUSABLE_RESOURCE with `{reservable: true, terminalCloseAfterUse: true}`, and says so before publishing rather than after: the assumption «پس از بسته‌شدن، این کارت دوباره فعال نمی‌شود» is in the output and on screen. There is no return-to-active anywhere — asserted by key, by serialized substring, and by a regex over the Persian text.
- AI-off انتشار دستی دارد: **PASS** — five degradations (no provider, timeout, refusal, prose instead of JSON, JSON of the wrong shape) all produce the same kind, the same pattern, the same questions and the person's own body back, with `creativityApplied: false`. The E2E case aborts the infer endpoint outright: the composer says so quietly and the card is still one click away, with a title from the first line.
- سؤال غیرحیاتی مانع نیست: **PASS** — questions are limited to four topics by an enum, every one must name what answering it would change (`behaviorAffected`, `min(1)` in the schema), never more than three are asked, and the kinds where nothing would change ask nothing at all. There is no input to answer them in and no gate that checks, so publishing with all of them unanswered is a normal outcome. A question with an empty `behaviorAffected` and a topic outside the four are both rejected by the schema.
- نتیجهٔ تأییدشده به CardSemanticProfile وصل است: **PASS** — a body that reads as AWARENESS, with the person confirming SERVICE, stores SERVICE in the profile. Correcting the kind records confidence 1, because a person saying so is a better signal than a classifier's own score. Without a confirmation the server falls back to its offline classifier, asserted at the route.
- `docs/reviews/task-25.md` ثبت شده است: **PASS** — همین فایل.
- Commit پیام مقرر: **PASS** — `feat: create cards creatively without form friction` (`8c59b65`).

Security:
- **The model cannot change how a card behaves, and not because it is asked not to.** `CARD_DRAFT`'s output schema carries a title and a body and nothing else, so there is no field that could carry a kind, a reservable flag or a fifth question topic. A test feeds a model answering «رویداد بزرگ محله» with `kind: EVENT, reservable: false` in its body text against the ladder; the result is still REUSABLE_RESOURCE and still reservable.
- **The classification is identical with and without a provider**, asserted across all 12 fixtures. The only fields a model is permitted to move are the title and the body, asserted field by field.
- **The infer endpoint writes nothing and checks the space itself.** It requires a session and re-reads the space's status rather than trusting the caller, so a suspended or draft space cannot be probed through it — a 422, same as the create path.
- **A space's own examples shape the draft, never the reading.** The protocol is passed to the model as context, but a vague sentence in a lending-focused space classifies exactly as it would anywhere else, asserted by comparing with and without a protocol.
- **`cardHints` is read defensively.** It is descriptive JSON on the definition, so the repository drops anything that is not shaped like a hint instead of letting `undefined` reach a prompt.
- `npm audit` unchanged: 0 critical, 7 high, all previously triaged in `docs/reviews/task-03.md`. No new dependency was added.

Regressions:
None. All 918 pre-existing `services/api` tests pass alongside the 55 new ones, the root suite grew from 318 to 341 with nothing lost, and the pre-existing full ladder flow — create, comment, reserve, chat redirect, in-use, close(RETURNED), disabled reservation — still passes end to end.

One long-standing open item is closed rather than re-recorded. `tests/e2e/admin.spec.ts` has cost time on three tasks, and it had two separate causes: an interrupted run left a PENDING TOTP enrollment behind, which then broke *every* later run permanently with «برای بازنشانی احراز دومرحله‌ای، ابتدا آن را تأیید کنید»; and logging in twice as the one bootstrap number exhausted the OTP budget of three per ten minutes, so a second consecutive run failed at the login screen with no code field. Both are now reset in `beforeAll` by a narrow helper that resolves exactly the one user `BOOTSTRAP_SUPERADMIN_PHONE` names. Verified with three back-to-back green runs, which was never possible before.

Reviewer note:
Four things worth recording.

1. **The plan's AI-off bullet and the rules-decide architecture disagree on their face, and the disagreement is worth stating rather than smoothing over.** The bullet asks that an AI outage yield a title from the first line and kind AWARENESS. But the classifier is offline rules, not a model, so an outage does not stop it reading the ladder as a lending. The reading taken here: rules are not AI, and the bullet is about the domain still working when there is no inference at all. That case is exactly what the create path already does — `deriveTitle` from the first line, `kind ?? 'AWARENESS'` — and it is now covered by a route test and an E2E case that never call the infer endpoint. The provider-outage case is covered separately, five ways. Both readings are satisfied; only the second is satisfied by the classifier being skipped.
2. **`terminalCloseAfterUse` is true for exactly the reservable kinds, and a test asserts the coincidence.** That is not redundancy to be tidied away: `CardReservation` has no transition out of `RESERVATION_CLOSED`, so anything reservable closes for good. The day somebody adds a reactivation path, that test is the thing that should fail and force the table to be reconsidered.
3. **The interim classifier read «قرض می‌دهم، روز جمعه» as an EVENT.** Its rules put EVENT first and matched on «روز جمعه». A lending with a day attached is still a lending, so the order here is explicit, documented and has its own fixture — it is the kind of bug that is invisible until somebody's ladder stops being reservable.
4. **The contract modules nearly formed a cycle.** `card-inference.ts` needs `cardKindSchema` from `card.ts`, and `confirmedInferenceSchema` naturally belongs beside the rest of the inference contract — but putting it there made `card.ts` import back, and a cycle between two Zod modules leaves one of them holding `undefined` when its schemas are constructed. It lives in `card.ts` instead, with a comment saying why, because the next person to tidy it will be tempted to move it.

Two gaps flagged rather than papered over:
- **`PATTERN_BY_KIND` describes behaviour that nothing enforces yet.** Reservation today is available on any card — `reservation.service.ts` has no kind check — so `reservable: false` on an AWARENESS card is currently a true statement about intent and not a constraint. Telling the person what to expect is still worth doing, and this is the right place for the fact to live, but making the domain honour it is a separate change with its own review.
- **`card-kind-inference.ts` is still in the tree** and is still what `updateCard` uses, since an edit has no preview step to confirm anything through. Routing edits through the same preview is a real piece of work and belongs wherever card editing is next touched.
