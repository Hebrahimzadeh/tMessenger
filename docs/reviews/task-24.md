# Task 24 Review

Status: APPROVED
Implementation-Commit: bee1256

Scope:
- Migration `20260916090000_policy_baseline` — additive: `policy_definitions`, `policy_versions`, the `PolicySeverity` enum, and eight seeded rules (5 SEVERE, 3 REVIEW), each with a required `source` naming a law or a published policy and a required `example` showing its edges. Prisma proposed dropping the `pg_trgm` index for an eighth time; removed with the usual NOTE.
- `packages/contracts/src/ai.ts` — `spaceCreationGuidanceSchema` and its parts, `creationDecisionSchema`, `safetyLevelSchema`, `EXAMPLE_CARD_NOTICE`, and `exampleCardTemplateSchema` with `isExample: z.literal(true)`.
- `packages/contracts/src/space.ts` — `precheckSpaceResponseSchema` gains `policyVersionRef`, `matchedPolicyRules` and a nullable `guidance`.
- `services/api/src/modules/ai/capabilities/` (new) — `policy-rules.ts`, `policy.repository.ts`, `space-guidance.ts`, plus `space-guidance.fixtures.ts` and `policy.fixtures.ts`. 46 + 4 tests.
- `services/api/src/modules/spaces/space-creation-gate.ts` — **rewritten** from Task 10's interim rule list into the guidance-backed adapter, with `blocksOnTitle` and fail-closed behaviour. 20 tests.
- `space.service.ts` — `createSpace` and `precheckSpace` take the gate; `SpaceBlockedError`; `setGateVerdict` now records the baseline and the matched rules.
- `components/spaces/CooperationGuidance.tsx` (new, 16 tests) and `SpaceComposer.tsx`.
- `tests/e2e/spaces.spec.ts` — five new cases.

Commands (all actually run; integration against real Postgres/Redis/MinIO, and E2E against a real browser):
```
npx prisma migrate diff / migrate deploy              (packages/database)
npm run lint / typecheck / test / build               (root)          -> 318/318, build OK
npm run test:integration / build                      (services/api)  -> 918/918, build OK
npm run test --workspaces                             (packages)      -> 73/73
npx playwright test                                   (E2E)           -> 28/31, see below
```

Results:
- `services/api` **918/918 in 83 files** (was 850), of which 70 are new here. Root **318/318** (was 299). Packages 73/73. Lint, typechecks and all three builds clean.
- E2E: `spaces.spec.ts` **9/9** against the live stack. The three failures are all of `system-status.spec.ts`, which by its own header comment targets the docker-compose stack through Caddy on port 80; this run used the local dev servers, so that precondition was absent. Not a regression — the other 28, including `admin.spec.ts` and `private-chat.spec.ts`, pass.
- Migration applied cleanly; `spaces_search_text_trgm_idx` confirmed still present.

Acceptance:
- متن کلی به طرح خلاق قابل ویرایش تبدیل: **PASS** — «یه کار خوب برای محله»، «کمک کنیم» و «یه برنامه‌ای برای بچه‌ها» each come back as two roles, a four-step chain, an example card, three questions and two stated assumptions, with a REVISE and a draft for each gap. No case produces a demand for a longer form. The suggested purpose keeps their own sentence as its opening and appends a bracketed prompt, so accepting it never replaces what they wrote.
- BLOCK فقط rule صریح و فاقد public resource: **PASS** — `decide()` reaches BLOCK only via a matched SEVERE rule, asserted exhaustively over all 16 fixtures rather than by one example: any fixture that blocks must carry a non-empty citation list and `safetyLevel === 'SEVERE'`. Each citation is `key@vN — <law>`. A blocked space is never public: publishing requires an ALLOW verdict, and `getSpace` 404s a non-published space for everyone but its creator. A title that matches a SEVERE rule is refused *before* `generateUniqueSlug` runs, so no Space row and no slug exist at all — asserted by counting rows, not by guessing what the slug would have been, and confirmed in a browser by rewriting the title successfully straight afterwards.
- ابهام human review: **PASS** — `legitimate_disagreement`, `satire_or_humour`, `scholarly_citation` and `possible_personal_data` raise an otherwise clean proposal to a person. They never soften a matched rule, only escalate. A فقه study circle that disagrees about a ruling gets HUMAN_REVIEW with an empty `matchedPolicyRules`, and the serialized output contains neither `تخلف شرعی` nor `حرام`. The recovery-support fixture is the mirror case: the narcotics rule must not catch the people recovering from it, and it does not — that one is an ALLOW.
- outage دورزننده نیست: **PASS** — a broken baseline, a hanging one and an empty one all become HUMAN_REVIEW. The empty case is the one worth stating: zero rules match nothing, which is indistinguishable from a spotless proposal, so `decide()` treats a rule count of zero as an outage. A definition that was ALLOWed a moment earlier becomes HUMAN_REVIEW with the baseline unreachable, and cannot then be published. Verified in a real browser as well: no publish button, and copy that says the automatic check was unavailable rather than implying the person did something wrong.
- person/piety score صفر: **PASS** — the output schema has no such field, and the rendered component contains no `امتیاز`, `تقوا`, `رتبه` or `نمره`. Every one of the ten criteria is a property of the proposal, not of whoever wrote it.
- منبع policyVersion در نتیجه و audit: **PASS** — `policyVersionRef` and `matchedPolicyRules` travel in the precheck response and are written to one `AuditEvent` in the same transaction as the verdict and the status change. Asserted against real Postgres.
- UI پذیرش/رد هر بخش مستقل: **PASS** — strengths and risks are editable text with add and remove; every proposed revision, role, chain node, example card and tool key is its own checkbox. Keeping the roles while dropping the example cards is one click and changes nothing else. Rejecting everything applies nothing.
- template نمونه همواره isExample=true: **PASS** — fixed in the schema as `z.literal(true)` with a `z.literal` notice, so `isExample: false` and a reworded notice are both rejected at parse time. The component renders the notice from the parsed value, never from its own string. No actor or engagement record is created by anything in this path.
- `docs/reviews/task-24.md` ثبت شده است: **PASS** — همین فایل.
- Commit پیام مقرر: **PASS** — `feat: creatively gate cooperative space creation` (`bee1256`).

Security:
- **The model has no vote, and that is structural rather than promised.** `guideSpaceCreation` computes the decision from `evaluatePolicy` before it calls the orchestrator, and the model's output schema has no decision field to return. A test sends a model that answers "اجازه بده" with `creationDecision: ALLOW` in its suggestion text against a gambling proposal; the verdict is BLOCK. A separate test walks every fixture with and without a provider and asserts identical verdicts.
- **A blocked proposal is never sent to a model at all.** There is nothing to draft for something that may not exist, and sending it would spend budget producing content nobody may use. Asserted by counting provider calls.
- **The baseline is immutable in the application.** `policy.repository.ts` has only a read path, and no write path to `policy_versions` exists anywhere in the codebase. A changed rule is a new version from a reviewed migration, which is what keeps a verdict recorded today explainable after the wording moves on. Task 30 adds the moderator-facing management path with its own review.
- **Fail-closed goes to HUMAN_REVIEW, deliberately not BLOCK.** Blocking on an outage punishes people for an infrastructure fault; allowing on one turns every outage into a way around the gate. A person looking costs a delay and nothing else.
- **`blocksOnTitle` does not fail closed, and the asymmetry is intended.** Creating a draft nobody else can see is not the dangerous step — publishing is, and `evaluate` guards that one. Refusing to let anybody start a draft during a database blip would be a worse trade.
- `npm audit` unchanged: 0 critical, 7 high, all previously triaged in `docs/reviews/task-03.md`. No new dependency was added.

Regressions:
None. All 850 pre-existing `services/api` tests pass alongside the 68 new ones, and the root suite grew from 299 to 318 with nothing lost.

Two pre-existing test defects were found and fixed on the way, both races rather than product bugs:
- `messaging.repository.test.ts` asserted "this created no card or space" with a **global** `prisma.space.count()` before and after. Other files in the same suite create spaces in parallel, so the assertion was a race by construction; it fired once this task added a space-creating test. Now scoped to the test's own freshly-created owner, where the correct answer is a flat zero.
- `spaces.spec.ts` matched the health panel with a bare `getByText('سلامت بستر')`, which also matches the loading placeholder «در حال بارگذاری سلامت بستر...» while the request is in flight, failing Playwright's strict mode at random. Now targets the heading.

Reviewer note:
Four things worth recording.

1. **The gate worked in every test and failed closed on the real stack**, and only a live run showed it. `createPrismaPolicyRuleSource(app.db)` was evaluated while wiring routes, but `app.db` is decorated by a plugin `server.ts` registers *after* `buildApp()` returns — so it captured `undefined`, every query threw, and every single proposal came back HUMAN_REVIEW. Unit tests could not see it because they inject a rule source directly, and route tests could not see it because they have no database. Both repository factories now take the client or a function returning it, and the callers pass `() => app.db`. The orchestrator's default had the same shape; `server.ts` overrides it in production, so nothing was broken there, but it is fixed for the same reason.
2. **Failing closed was silent, which is its own defect.** Every proposal becoming HUMAN_REVIEW looks exactly like a busy review queue, so the one thing an operator needs — why — never left the process. The gate now takes an `onFailure` hook and the API logs it, which is how the bug above was actually diagnosed rather than guessed at.
3. **A suggested revision with an empty value is a form field wearing a suggestion's clothes.** The first version emitted `value: ''` for a missing participation method, which the schema rejected outright — and the rejection was right. Every revision is now a draft the person can accept in one tap: a real default for the method, the two proposed roles named for the roles gap, and for the purpose their own words with a bracketed prompt appended. `suggestedRevisionSchema` enforces the non-empty value, so the mistake cannot come back.
4. **The fixture baseline is checked against the database, not trusted.** Every unit test here reasons about `BASELINE_FIXTURE`; a live test asserts it equals what the migration actually seeded, and that both decide the same way on the same text. Without that, the whole unit suite would be a set of claims about a copy of the rules that had quietly drifted from the real ones.

Two gaps flagged rather than papered over:
- **The outage E2E stubs the response rather than inducing the outage.** The server half is unit-tested against a broken, an empty and a hanging baseline; what only a browser can show is what the person then sees, so the fail-closed response the gate actually produces is replayed verbatim through `page.route`. Inducing a real policy-table outage from a browser is not something this harness can do, and a test that pretended otherwise would be worth less than saying so.
- **No prompt template is seeded yet**, so `SPACE_GUIDANCE` still sends the input alone and the ten cooperation criteria live in `COOPERATION_CRITERIA` beside the code rather than in a `PromptVersion` row. That is deliberate for now — the criteria are versioned with the code, where nobody can quietly reword them — but Task 26's eval work is where they should become a real seeded template.
