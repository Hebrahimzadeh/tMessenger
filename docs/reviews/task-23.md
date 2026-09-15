# Task 23 Review

Status: APPROVED
Implementation-Commit: 1468f70

Scope:
- Migration `20260915120000_ai_orchestration` — additive: `ai_requests`, `ai_results`, `prompt_versions`, `provider_usage`, and the `AiInputSource`/`AiCapability`/`AiOutcome` enums. Prisma proposed dropping the `pg_trgm` index for a seventh time; removed with the usual NOTE.
- `packages/contracts/src/ai.ts` (new) — sources, capabilities, provenance, the four capability output schemas, and the error-code table.
- `services/api/src/modules/ai/` (new) — `policy-guard.ts`, `orchestrator.ts`, `schemas.ts`, `fallbacks.ts`, `ai.repository.ts`, `ai.route.ts`, and `providers/{ai-provider,gemini-provider,fake-provider}.ts`. 56 tests.
- `app/api/gemini/route.ts` — **deleted**. `hooks/useGemini.ts` now calls the orchestrator.
- `POST /v1/ai/suggest`, plus `GEMINI_API_KEY` and `AI_DAILY_BUDGET_MICROS` in the env schema and `.env.example`.

Commands (all actually run; integration against real Postgres/Redis/MinIO):
```
npx prisma migrate diff / migrate deploy              (packages/database)
npm run lint / typecheck / test / build               (root)          -> 299/299, build OK
npm run test:integration / build                      (services/api)  -> 850/850, build OK
```

Results:
- `services/api` **850/850 in 81 files** (was 794), of which 56 are new here. Root **299/299**. Lint, typechecks and both builds clean.
- Migration applied cleanly; `spaces_search_text_trgm_idx` confirmed still present; no residual drift beyond the known false positive.

Acceptance:
- خاموشی provider مسیر کارت دستی را نمی‌بندد: **PASS** — with no provider at all, the route returns 200 with a `FALLBACK` outcome and a usable draft, so no domain path depends on the model being reachable. Asserted at the orchestrator, at the route, and against a real database. The same holds for a timeout, a refusal, an exhausted budget, a spent quota and an open circuit.
- JSON خراب وارد domain نمی‌شود: **PASS** — and the case that matters is covered. Prose fails at the parse; valid JSON of the wrong shape does not, which is what a bare `JSON.parse` in a try/catch lets straight through and what a model actually produces most often. The capability's own schema rejects it and the caller gets a fallback instead. A model that volunteers a `reasoning` field has it stripped, so no chain-of-thought is stored or returned.
- DIRECT private input در AI صفر: **PASS** — three layers, each independently tested. The source enum has no private-message value, so the request fails validation before any of this module's logic runs. The guard checks a claimed `ASSISTANT_CONVERSATION` against the database and refuses a `DIRECT` one with `AI_PRIVATE_INPUT_FORBIDDEN`. And the content capabilities are not granted that source at all, so they are refused before the conversation is even looked at. Proven against real Postgres with a genuine direct conversation: nothing was sent to the provider and no request row was written.
- secret/private text در log نیست: **PASS** — request rows hold a SHA-256 hash and a character count, never the text. The provider's failure messages deliberately omit the response body, which can echo the prompt. A refused request is rejected before anything is stored, so not even the input's shape is recorded. Verified by a database-wide scan: the text appeared in `ai_results` only, because the card fallback returns the person's own words as the draft, and nowhere else.
- budget enforce: **PASS** — a daily ceiling in micros across everyone, checked before the provider is called, falling back when spent. Usage is recorded even when the output turns out to be unusable, because the call was made and the money was spent; a budget counting only successes would undercount exactly when things go worst. Verified against a real database.
- `docs/reviews/task-23.md` ثبت شده است: **PASS** — همین فایل.
- Commit پیام مقرر: **PASS** — `feat: isolate guarded AI orchestration` (`1468f70`).

Security:
- **The strongest guarantee here is an absence.** `AiInputSource` has no `PRIVATE_DIRECT_MESSAGE` member. A value that does not exist cannot be passed by a caller, stored in a column, or added later without a migration and a contract change someone has to review. Everything else in the guard is defence behind that.
- **A label is never trusted.** A caller can claim `ASSISTANT_CONVERSATION` about any conversation id; only the database knows whether that id is the assistant's thread or two people talking, so it is looked up every time. That single lookup is what stands between the model and private correspondence.
- **Unknown is refused, not allowed.** A conversation that does not exist, or a kind added later that nobody has decided about, is rejected rather than assumed harmless.
- **The direct Gemini route is gone.** It accepted an arbitrary prompt *and an arbitrary system instruction* from the browser and forwarded both. The system instruction is the strongest lever there is over what a model does, and nothing checked either. The prototype mini-apps now go through the orchestrator, where a supplied instruction is folded into the input and subject to the same guard, quota, budget, timeout and schema as anything else.
- **A policy refusal throws; everything else degrades.** That asymmetry is deliberate. A timeout is an operational condition to absorb. Private correspondence arriving at the model is a bug in the caller, and softening it into a fallback would hide exactly the thing most worth knowing about.
- **Low temperature and a JSON response type** on the provider, because every capability produces structured output a schema must accept, and creativity there is only a higher rejection rate.
- `npm audit` unchanged: 0 critical, 7 high, all previously triaged in `docs/reviews/task-03.md`. No new dependency was added.

Regressions:
None. All 794 pre-existing `services/api` tests pass alongside the 56 new ones, and root stays at 299/299. The mini-apps keep working through the new path.

Reviewer note:
Three things worth recording.

1. **A test of mine claimed something false, and the database said so.** The first version of the storage check asserted the input text appeared in no table at all. It fails, correctly: the card fallback hands back the person's own words as the draft, and a result payload is stored. That is the answer they asked for, not a hidden copy, and the input in question is public-bound text they typed into a card composer. The assertion now states the accurate invariant - `ai_results` only, never `ai_requests` - which is a weaker claim and a true one. A test that has to be quietly loosened later teaches nobody anything.
2. **The circuit breaker deliberately ignores schema rejections.** A vendor that answers with the wrong shape is not an outage; it is a prompt that needs fixing. Counting those against the breaker would trip it on a bad template and present the result as a provider failure, sending whoever investigates to the wrong place entirely.
3. **`MODERATION_ASSIST`'s fallback returns no concerns at all**, and that is the point. An automated "concern" that nothing actually examined is worse than none, because it invites a moderator to weigh a finding that does not exist. It says the summary is unavailable and the case needs manual review.

Two things this task sets up but does not use. `PromptVersion` is read and recorded but no template is seeded yet - the capabilities send the input alone, which keeps the system usable before any prompt exists, and Tasks 24-26 are where the real prompts land. And `MODERATION_ASSIST` has a schema, a fallback and an allowlist entry but no caller until M6. Both are flagged so the gap is picked up deliberately rather than mistaken for working coverage.
