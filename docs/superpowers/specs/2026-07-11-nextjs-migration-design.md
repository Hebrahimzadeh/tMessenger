# Migrate "تعاون" (Ta'avon) prototype to Next.js

## Overview & Goals

`index.html` is a working prototype of "تعاون" (Ta'avon), a Farsi/RTL community
mutual-aid app that combines a Telegram-style messenger with community
"platform" boards (bulletin-board-style mutual-aid listings) and four
AI-assisted "mini-apps" (tool lending, media project requests, traditional
medicine consultation, poetry). It currently runs entirely client-side: React
18 (UMD build) + in-browser Babel JSX transform + Tailwind via CDN script, all
in one 2,500-line `<script type="text/babel">` block, served by a bare Vite
dev server that isn't actually bundling or transpiling the app code.

Goal: **faithfully port** this prototype into a properly structured Next.js
project — same screens, same look, same seed data and Farsi copy — while
fixing the two real problems in the current setup:

1. **No real build/type safety.** Everything lives in one file with no
   TypeScript, no component boundaries, and no npm-installed React/Tailwind.
2. **Five live Gemini API keys are hardcoded client-side** (string-reversed,
   trivially recoverable) in `index.html`. These must move server-side.

This is a straight rebuild of an existing, fully-specified UI — there is no
new product behavior to design, so this spec focuses on target architecture
and the porting plan, not on requirements discovery.

## Tech stack & tooling

- **Next.js 14 (App Router)**
- **TypeScript**
- **Tailwind CSS**, installed properly via PostCSS (not the CDN script)
- **ESLint**, Next.js default config
- npm as package manager (matches the existing `package-lock.json`)
- No test runner added in this pass — this is a UI port with no business
  logic yet worth unit-testing. Revisit once the AI/data hooks exist if
  logic grows non-trivial.
- Icons: keep the existing ~50 hand-rolled inline-SVG icon components
  (mimicking Lucide) as-is, just relocated out of the monolith — no new
  `lucide-react` dependency.
- State persistence: **in-memory only**, matching current behavior. A page
  reload resets to seed data. No localStorage, no backend, no auth.

## Project structure

```
app/
  layout.tsx                       # <html lang="fa" dir="rtl">, phone-frame chrome, global providers
  page.tsx                         # platforms tab (default view)
  chats/
    page.tsx                       # chats tab
    [chatId]/page.tsx              # individual chat room (incl. the 'bot' chat)
  comments/
    page.tsx                       # global comments tab
  platforms/
    [platformId]/page.tsx          # platform internal view
  api/
    gemini/route.ts                # server-side Gemini proxy (POST)
components/
  layout/                          # PhoneFrame, Header, Drawer, TabBar
  chat/                            # ChatsList, ChatRoom, MessageBubble
  platforms/                       # PlatformsList, PlatformInternal, CardTemplate,
                                    # CardDetailView, CreateCardSheet, BioModal
  comments/                        # GlobalComments
  miniapps/                        # LendingMiniApp, MediaMiniApp, TebMiniApp,
                                    # PoetryMiniApp, DefaultMiniApp
  modals/                          # AiModal, RulesModal, PublishToast
  icons/                           # hand-rolled SVG icon components
hooks/
  useChats.ts
  usePlatforms.ts
  useAiCopilot.ts                  # drives the AI platform-creation chat flow
  useGemini.ts                     # thin client wrapper around /api/gemini
lib/
  types.ts                         # User, Chat, Message, Platform, Card, Comment, MiniappConfig, ...
  data/seed.ts                     # CURRENT_USER, INITIAL_CHATS, INITIAL_PLATFORMS, INITIAL_GLOBAL_COMMENTS
```

## Routing model

The current prototype has no URLs — every screen transition is a React state
change (`activeChatId`, `activePlatformId`, `activeTab`). The port introduces
real Next.js routes so screens are deep-linkable and back/forward works:

- `/` — platforms tab (default)
- `/chats` — chats tab
- `/chats/[chatId]` — chat room, including the `bot` chat
- `/comments` — global comments tab
- `/platforms/[platformId]` — platform board. Its internal tabs
  (explore / my cards / etc.), card detail view, and the mini-app sheet stay
  as local state *within* this page rather than becoming their own routes —
  they're transient overlays on top of a platform, not distinct destinations.

Modals and sheets that can appear over any screen — AI co-pilot modal, rules
modal, bio modal, create-card sheet, publish toast — remain client-side
overlay state, not routes.

## State management

React Context providers, set up once in `app/layout.tsx`, back the custom
hooks:

- `ChatsProvider` → `useChats()` — chats list + messages, read/append
- `PlatformsProvider` → `usePlatforms()` — platforms, cards, joined
  platforms, drafts
- `UIProvider` — cross-cutting overlay state not owned by one page: drawer
  open/closed, AI modal, rules modal, publish toast

Because state lives in Context at the root layout, it survives client-side
navigation between routes (no full reload), matching the current prototype's
behavior of chats/platforms staying populated as you move around the app.

## Gemini AI integration

Replaces the current 5-key client-side fallback list with a single
server-side key:

- **`app/api/gemini/route.ts`** — POST handler. Reads `GEMINI_API_KEY` from
  `process.env` (server-only, never shipped to the browser). Forwards
  `{ prompt, systemInstruction }` to
  `generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
  and returns the generated text, or a typed error if the call fails.
- **`hooks/useGemini.ts`** — client hook exposing `generate(prompt,
  systemInstruction)`, calling `/api/gemini` via `fetch`. Used by the AI
  co-pilot flow (`useAiCopilot`) and the four AI mini-apps.
- `.env.example` documents `GEMINI_API_KEY`; `.env.local` (gitignored) holds
  the real value.

**Action required from the repo owner, outside this codebase change:**
revoke/rotate the 5 keys currently exposed in `index.html` and issue one
fresh key for `.env.local`. The port will not have a working key checked in.

## Data layer

`lib/types.ts` defines TypeScript interfaces mirroring the current object
shapes (`User`, `Chat`, `Message`, `Platform`, `Card`, `Comment`,
`MiniappConfig`). `lib/data/seed.ts` holds `CURRENT_USER`, `INITIAL_CHATS`,
`INITIAL_PLATFORMS`, `INITIAL_GLOBAL_COMMENTS` typed against those
interfaces, with the same Farsi seed content as today — no content changes.

## Component breakdown

Each current `renderX()` helper inside the monolithic `App()` becomes its own
component file under the `components/` tree shown above. Behavior and markup
carry over; the split is structural only (real props/boundaries instead of
closures over one giant component's state).

## Styling

Tailwind is installed properly (`tailwind.config.ts`, `postcss.config.js`,
`globals.css` with `@tailwind` directives) instead of the CDN script.
Arbitrary hex colors already used throughout (`bg-[#527DA3]`,
`bg-[#1e1e1e]`, `bg-[#f4f4f5]`, `text-[#B0CBE1]`, etc.) carry over unchanged
as Tailwind arbitrary-value classes — no new theme palette is invented. The
`.hide-scrollbar` utility class and the global
`* { margin:0; padding:0; box-sizing:border-box }` reset move into
`globals.css`. The outer rounded-border "phone frame" chrome (with notch,
visible on `sm:` breakpoints and up) is preserved as a layout wrapper
component in the root layout, matching the current visual.

## Cleanup of old files

Remove the root-level Vite preview files: `index.html`, `package.json`,
`package-lock.json`, `vite.config.ts` — replaced by the Next.js project at
the repo root. `Standalone_Mobile/` is left untouched (already gitignored).
`.gitignore` is updated for `node_modules`, `.next`, `.env*.local`.

## Explicitly out of scope

- No backend/database — seed data stays in-memory, resets on reload
- No authentication
- No automated test suite in this pass
- No change to Farsi copy, seed data content, or visual design
- No new icon library — existing hand-rolled SVG icons are kept
