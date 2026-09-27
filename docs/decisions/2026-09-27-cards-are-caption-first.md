# سه کارت واقعی، و کارتی که عنوان ندارد — 2026-09-27

**Status:** decided by the owner, implemented.
**Supersedes:** architecture §6.8 (کارت نمونه و هنجارسازی شفاف) in full, §4.1's
rule 32 in part (the "نمونه/الگو با برچسب دائمی" allowance), and §14/§17's lines
about excluding sample cards from counters — there are no sample cards left to
exclude. It does **not** touch rule 32's actual prohibition: fake identities
remain forbidden, and nothing here creates one.
**Implementation:** `packages/contracts/src/{card,ai,space,public-comment}.ts`,
`services/api/src/modules/ai/capabilities/space-builder.{md,ts}`,
`space-builder-rules.ts`, `services/api/src/modules/spaces/space.{service,repository}.ts`,
`services/api/src/modules/cards/*`, `components/spaces/{CardTemplate,CardActionBar,SpaceFeed,CardDetailView,CardComposer}.tsx`,
migrations `20260927090000_card_like_reaction` and `20260927090100_cards_are_caption_first`.

## What changed

Two things, which are one decision.

**۱. هر بستر با سه کارت واقعی باز می‌شود.** Building a space now creates three
real cards, each with one comment underneath, in the same transaction as the
space itself. They are authored by the person who made the space, are
classified by the same rule-based classifier as any other card, and write the
same revision/semantic-profile/event/awareness rows. They are theirs to edit
or delete like anything else they wrote.

The labelled sample card is gone entirely: no `cardHints` on a space's
definition, no `isExample`, no «نمونه — محتوای واقعی نیست» badge, and no
inert feed row that looks like a card but is not one. The column is dropped,
not left nullable.

**۲. کارت نام و عنوان ندارد.** A card is an image, a caption, and four
actions: پسند، گفت‌وگو، هم‌رسانی، نشان. `CardRevision.title` is dropped, the
composer has no title field (not even a collapsed optional one), the
inference suggests no title, and a card's page opens with the caption rather
than a heading. Either half may be missing and it is still a whole card — an
image with nothing written under it, or a caption with no image, because
"گاهی کاربر تصویر هم اضافه نمی‌کند".

The four actions come with it: `LIKE` joins `CardReactionType` as the one a
card actually shows, `CardBookmark` arrives as a private "keep this", and
sharing is the reader handing the card's own address to their own device.

## Why

The owner's reason for the first half is the important one: **«ننویسیم محتوای
نمونه غیر واقعی، چون هنجارسازی بستر را دچار اخلال می‌کند.»** A card that
announces itself as not-real teaches everyone who reads it that this is a
place for not-real cards. §6.8 was written to protect against a space looking
falsely busy; what it produced instead was a space whose only visible content
disclaimed itself, at exactly the moment the norm is set. An empty space with
three genuine cards from its founder invites a fourth. A space with three
badged mock-ups invites nothing.

The second half is the same argument about shape. A title asks the person to
name their contribution before they have made it, and the platform filled the
gap by deriving one from their first line — so "کارت بدون عنوان" was a real
string a real person could see on their own card. Cards here are messages in
a conversation (see the 2026-09-19 Telegram-front-end decision), and messages
do not have titles.

## What this gives up, and why that was acceptable

§6.8's protections were real. Each is either kept by other means or
deliberately let go:

- **"به حساب کاربر خیالی نسبت داده نشوند"** — kept, and it is the line that
  does not move. Every opening card and every opening comment is authored by
  the space's creator, a real account. No fake user is created, and nothing
  claims a collaboration already happened.
- **"وارد شمارنده‌ها نشوند"** — given up on purpose, because these are real
  cards. They count in the space's health, its card count and its feed, the
  way the creator's fourth card would. A space whose founder wrote three
  cards *is* a space with three cards.
- **"رزرو، چت، واکنش و وضعیت عملیاتی واقعی نداشته باشند"** — given up. They
  are reservable, likeable and commentable, because a card nobody can act on
  is the thing this decision removes.
- **"برچسب دائمی"** — given up, and that is the whole point.

The words are still written by the platform, under the person's name, before
they have seen them. That is the same trade the 2026-09-17 one-prompt decision
already made for a space's own description, and it is acceptable for the same
reasons: the person is the manager from the first moment and can edit or
delete any of the three, and the safety half does not depend on approval —
the three captions and three comments are part of `publicTextOf`, so the
policy baseline reads them before the space exists, and a SEVERE match still
creates nothing at all.

The rule-based builder, which runs whenever no model answers, is held to a
stricter version of the same standard: its three cards are an invitation and
two questions, never a claim about what the creator owns, did, or promised,
because rules cannot know any of that.

## What is unchanged

- **A BLOCK creates nothing** — no space, no slug, and now no cards either.
- **The model decides nothing.** `openingCards` is content; the kind of each
  card is still decided by `inferCardKind`, and the verdict by the versioned
  policy baseline.
- **No score for a person** (§9.2). A bookmark is private, has no public
  count, and feeds no ranking; likes remain the same small capped coefficient
  in `rankCards` that every reaction always was.
- **Attachments** are untouched: an image is an ordinary `IMAGE` attachment
  with a signed, time-limited read URL, and a card may still carry audio,
  video, files, links or an approximate location.

## Open

- The old four reaction types (`SUPPORT`, `USEFUL`, `INTERESTED`,
  `CELEBRATE`) are still valid API values with no button of their own. They
  are left in place rather than migrated away; whether a card should offer
  more than پسند is a product question, not a schema one.
- `GET /me/bookmarks` and `/bookmarks` are the whole of نشان‌شده‌ها: a flat
  list, newest saved first, with no folders and no search.
- `computeSuggestions`'s `CREATE_FIRST_CARD` no longer fires for a new space,
  because every space has three cards from the moment it exists. The
  suggestion is not wrong, it is simply answered; a space with nothing but its
  opening cards is still visible as `FRAGILE`/`DORMANT` through
  `contributorCount` and `lastActivityAt`. Whether the creator should be
  nudged specifically about *other people's* first card is a separate
  question, deliberately not answered here.
- The UI-preview mock platforms (`UI_PREVIEW_MODE`, `lib/data/seed.ts`) still
  carry invented authors and titles. They are a labelled design preview of a
  different screen, not content in any space, and were left alone.
