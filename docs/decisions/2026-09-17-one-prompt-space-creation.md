# One prompt, a whole space — 2026-09-17

**Status:** decided by the owner, implemented.
**Supersedes:** architecture §6.3's build flow, §6.7's "انتشار فقط پس از ویرایش یا تأیید سازنده", and §15.3's "پیشنهاد جهت‌دهی را بدون تأیید کاربر روی زیربستر اعمال نکند" — for space creation only.
**Implementation:** `services/api/src/modules/ai/capabilities/space-builder.{md,ts}`, `space-builder-rules.ts`, `POST /v1/spaces/build`, `components/spaces/SpaceComposer.tsx`, `SpaceEditForm.tsx`.

## What changed

Making a space takes **one prompt and no fields**. The person writes what
they want; the API appends that to the space-builder document and asks the
model for the whole space — title, description, audience, participation
methods, two primary roles, sample cards. The policy baseline decides whether
it may exist. Unless a person needs to look first, it is published
immediately and the person lands on it as its manager.

**Editing happens after publication**, which is where fields now live.

## Why

The previous flow asked for a title, a purpose, participation methods and two
roles across three screens, then showed a review panel before publishing. The
owner called it "a big mistake": it is exactly the long form the product
forbids ("اصل اصطکاک حداقلی", §4.1; "فرم نوع اجباری نیست"). A real person got
stuck on the review screen and could not work out how to finish — see
`docs/reviews/task-24.md` and the fix that followed it.

## What this gives up, and why that was acceptable

§6.3 and §6.7 make creator approval a precondition for publishing, and §15.3
forbids applying AI guidance to a space without it. That protection is real:
it means nothing a model wrote appears under a person's name until they have
seen it. It is given up here because:

- the person is the space's manager from the first moment and can edit every
  part of it, so nothing is locked in;
- a space is not a claim about anybody — it is an invitation to cooperate,
  and the description is about the space rather than about its creator;
- the safety half is unchanged and does not depend on approval: a SEVERE
  policy match builds nothing at all, and anything ambiguous is created
  unpublished for a person to look at.

## What is unchanged

- **The model still decides nothing.** The versioned policy baseline decides,
  and is checked twice — on the prompt before anything is sent, and on what
  came back. The model's only lever is `reviewNote`, which can hold a space
  back for a person and can never publish or block one.
- **A BLOCK creates no Space and no slug** (§6.1's free creation still holds
  for everything else).
- **Rule-based fallback.** With no model reachable the rules build a
  complete, publishable space themselves, and the interface says plainly that
  no model wrote it.
- **Sample cards** stay labelled and create no actor or engagement (§6.8).
- **No score for a person** anywhere (§9.2).

## Open

- A space held for human review has no queue for a moderator to work through;
  that is Task 30. Until then such a space stays visible only to its creator,
  and editing it is not offered, because the draft edit path would move it out
  of review with no way to publish it again.
- `POST /v1/spaces`, `/precheck` and `/publish` still exist and still work.
  Nothing in the interface uses them; they are the pre-publish path a future
  draft flow would need.
