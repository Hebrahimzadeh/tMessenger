# Next.js Migration of Ta'avon Prototype — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the single-file `index.html` prototype (React 18 UMD + in-browser Babel + Tailwind CDN) into a structured Next.js 14 App Router + TypeScript + Tailwind project, with real routing, split components/hooks, and Gemini calls moved server-side.

**Architecture:** React Context + custom hooks (`ChatsProvider`/`useChats`, `PlatformsProvider`/`usePlatforms`, `UIProvider`/`useUI`, `AiCopilotProvider`/`useAiCopilot`) hold all app state in the root layout, so state survives client-side navigation. Three route groups replace the current state-driven tabs: `/` (platforms), `/chats` + `/chats/[chatId]`, `/comments`, plus `/platforms/[platformId]`. A single Next.js API route (`/api/gemini`) proxies all Gemini calls server-side.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS (PostCSS), React 18, no test runner, npm.

## Global Constraints

- Faithful port: same Farsi copy, seed data, visuals, and behavior as `index.html` — no content or design changes.
- State is in-memory only (React state via Context). No localStorage, no backend, no auth.
- Icons: keep the existing ~50 hand-rolled inline-SVG components verbatim, just relocated — no `lucide-react` dependency.
- `index.html` is the copy source for every mechanical-port task below and must NOT be deleted until the final cleanup task (Task 17).
- Routing contract (state → route mapping used throughout):
  - `activeTab === 'platforms'` → `/`
  - `activeTab === 'chats'` → `/chats`
  - `activeTab === 'comments'` → `/comments`
  - `setActiveChatId(id)` → `router.push('/chats/' + id)`
  - `setActiveChatId(null)` (closing a chat) → `router.back()`
  - `setActivePlatformId(id)` → `router.push('/platforms/' + id)`
  - `setActivePlatformId(null)` (closing a platform) → `router.back()`
  - Everything else (`platformInnerTab`, `showXModal`, `showXSheet`, form inputs, `activeCardId`, etc.) stays as local component state exactly as in the original — it is NOT part of the routing contract.
- Gemini calls: every call site currently using the global `callGeminiAPI(prompt, systemInstruction)` is replaced with `const { generate } = useGemini(); await generate(prompt, systemInstruction)` from Task 5.
- No secrets committed: the real key lives only in `.env.local` (gitignored); `.env.example` documents the variable name.

---

### Task 1: Scaffold the Next.js project

**Files:**
- Delete: `package.json`, `package-lock.json`, `vite.config.ts`
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `next-env.d.ts`, `tailwind.config.ts`, `postcss.config.js`, `.eslintrc.json`, `.env.example`
- Modify: `.gitignore`
- Create (placeholders, replaced by later tasks): `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

**Interfaces:**
- Produces: a working `npm run dev` on `http://localhost:3000` serving a placeholder page. All later tasks build on this.

- [ ] **Step 1: Remove the old Vite preview files**

```bash
rm package.json package-lock.json vite.config.ts
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "taavon",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.12.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

- [ ] **Step 5: Create `next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 6: Create `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 7: Create `postcss.config.js`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 8: Create `.eslintrc.json`**

```json
{
  "extends": "next/core-web-vitals"
}
```

- [ ] **Step 9: Create `.env.example`**

```
GEMINI_API_KEY=
```

- [ ] **Step 10: Update `.gitignore`**

```
node_modules
.next
.env*.local
.idea
dist
Standalone_Mobile
```

- [ ] **Step 11: Create placeholder `app/globals.css`**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
```

- [ ] **Step 12: Create placeholder `app/layout.tsx`**

```tsx
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 13: Create placeholder `app/page.tsx`**

```tsx
export default function Page() {
  return <div>تعاون — در حال ساخت</div>;
}
```

- [ ] **Step 14: Install dependencies and verify dev server boots**

```bash
npm install
npm run dev
```

Expected: server starts on `http://localhost:3000`, and the page shows "تعاون — در حال ساخت" with no console errors.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 14 + TypeScript + Tailwind project"
```

---

### Task 2: Icon components

**Files:**
- Create: `components/icons/index.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: every icon component used throughout the app, exported by the exact same names as in `index.html` (`Menu`, `Search`, `MessageCircle`, `Layers`, `MessageSquare`, `Plus`, `Pen`, `ArrowRight`, `Heart`, `Share2`, `Paperclip`, `Send`, `CheckCheck`, `User`, `Bell`, `Shield`, `Info`, `LogOut`, `X`, `Sparkles`, `Users`, `Link2`, `Copy`, `Lock`, `FileText`, `Bookmark`, `PlayCircle`, `AlertTriangle`, `ChevronDown`, `ChatIcon`, `Pin`, `ImageIcon`, `CheckCircle2`, `Settings`, `Reply`, `History`, `Check`, `HeartHandshake`, `Truck`, `Wrench`), so every later task can `import { X, Y } from '@/components/icons'` without renaming anything.

- [ ] **Step 1: Copy the icon block verbatim from `index.html`**

Open `index.html` and copy lines 33–193 (from `const Menu = ({ size = 24, ...` through the end of `const Wrench = ...`) — every hand-rolled SVG icon component. Paste them into a new file `components/icons/index.tsx`, then apply this transformation:

1. Add `'use client';` is NOT required (icons are pure presentational functions with no hooks/state) — leave the file as a plain module.
2. Prepend each icon's props with an explicit type instead of the untyped destructure. Apply this pattern to every icon (shown here for `Menu`; repeat identically for all ~40 icons copied from lines 33–193):

```tsx
interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  title?: string;
}

export const Menu = ({ size = 24, strokeWidth = 2, ...props }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
);
```

Every other icon keeps its exact SVG body from `index.html` — only the signature `({ size = 24, strokeWidth = 2, ...props }) =>` becomes `({ size = 24, strokeWidth = 2, ...props }: IconProps) =>`, and `export const` is added before each `const IconName =`. `ChatIcon` (line 149, `const ChatIcon = MessageCircle;`) stays as a plain re-export: `export const ChatIcon = MessageCircle;` (declare it after `MessageCircle` is defined).

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors referencing `components/icons/index.tsx`.

- [ ] **Step 3: Smoke-test one icon renders**

Temporarily edit `app/page.tsx`:

```tsx
import { Sparkles } from '@/components/icons';

export default function Page() {
  return <Sparkles size={40} className="text-blue-500" />;
}
```

Run `npm run dev`, open `http://localhost:3000`, confirm a blue sparkles icon renders. Revert `app/page.tsx` back to the Task 1 placeholder afterward.

- [ ] **Step 4: Commit**

```bash
git add components/icons
git commit -m "feat: port icon components to components/icons"
```

---

### Task 3: Types and seed data

**Files:**
- Create: `lib/types.ts`
- Create: `lib/data/seed.ts`

**Interfaces:**
- Consumes: icon components from `@/components/icons` (Task 2)
- Produces: `User`, `Message`, `Chat`, `Comment`, `Card`, `FormLabels`, `MiniappConfig`, `Platform`, `GlobalCommentSeed`, `Draft`, `IconComponent` types from `lib/types.ts`; `CURRENT_USER`, `INITIAL_CHATS`, `INITIAL_PLATFORMS`, `INITIAL_GLOBAL_COMMENTS` values from `lib/data/seed.ts`, typed against those interfaces. Every later task that needs seed data or types imports from these two files.

- [ ] **Step 1: Create `lib/types.ts`**

```ts
import type { ComponentType } from 'react';

export type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export interface User {
  name: string;
  username: string;
  phone: string;
  bio: string;
}

export interface InlineButton {
  id: number;
  label: string;
  action: string;
}

export interface Message {
  id: number;
  text: string;
  sender: 'me' | 'them';
  time: string;
  inlineButtons?: InlineButton[];
}

export interface Chat {
  id: string | number;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  online: boolean;
  sharedPlatforms: string[];
  unread: number;
  isBot?: boolean;
  messages: Message[];
}

export interface ReplyTo {
  sender: string;
  text: string;
}

export interface Comment {
  id: number;
  text: string;
  sender?: string;
  time?: string;
  isSystem?: boolean;
  isAction?: boolean;
  status?: string;
  replyTo?: ReplyTo | null;
}

export interface Card {
  id: number;
  title: string;
  author: string;
  avatar: string;
  time: string;
  desc: string;
  hasImage: boolean;
  isCurated: boolean;
  comments: Comment[];
  status?: 'pending' | 'closed' | null;
  requester?: string | null;
}

export interface FormLabels {
  title: string;
  desc: string;
  image: string;
  descPlaceholder?: string;
  commentPlaceholder?: string;
}

export interface MiniappConfig {
  title: string;
  placeholder: string;
  systemInstruction: string;
}

export interface Platform {
  id: number;
  name: string;
  creator: string;
  members: number;
  icon: IconComponent;
  description: string;
  heroText: string;
  leftSide: string;
  rightSide: string;
  formLabels: FormLabels;
  actionLabel?: string;
  unreadCount: number;
  miniappConfig?: MiniappConfig | null;
  cards: Card[];
  isDraft?: boolean;
  curatedCards?: Card[];
}

export interface GlobalCommentSeed {
  id: number;
  platformName: string;
  cardTitle: string;
  text: string;
  senderAvatar: string;
  time: string;
  unread: number;
}

export interface Draft {
  id: number;
  platformId: number;
  title: string;
  desc: string;
  hasImage: boolean;
  timestamp: number;
}

export interface AiSuggestion {
  id: number;
  title: string;
  connects: string;
  desc: string;
  heroText?: string;
  leftSide?: string;
  rightSide?: string;
  formLabels?: FormLabels;
  miniappConfig?: MiniappConfig;
}
```

- [ ] **Step 2: Create `lib/data/seed.ts`**

Start the file with:

```ts
import type { User, Chat, Platform, GlobalCommentSeed } from '@/lib/types';
import { Wrench, Search, HeartHandshake, Truck, Bell, FileText, Shield } from '@/components/icons';
```

Then copy verbatim from `index.html`:
- Lines 194–199 (`const CURRENT_USER = {...}`) — paste as-is, then change `const CURRENT_USER =` to `export const CURRENT_USER: User =`.
- Lines 201–255 (`const INITIAL_CHATS = [...]`) — paste as-is, then change `const INITIAL_CHATS =` to `export const INITIAL_CHATS: Chat[] =`.
- Lines 257–261 (`const INITIAL_GLOBAL_COMMENTS = [...]`) — paste as-is, then change `const INITIAL_GLOBAL_COMMENTS =` to `export const INITIAL_GLOBAL_COMMENTS: GlobalCommentSeed[] =`.
- Lines 263–508 (`const INITIAL_PLATFORMS = [...]`) — paste as-is. Platform 1 uses `icon: Wrench`, platform 2 uses `icon: Search`, platform 3 uses `icon: HeartHandshake`, platform 4 uses `icon: Truck`, platform 5 uses `icon: Bell`, platform 6 uses `icon: FileText`, platform 7 uses `icon: Shield` — all seven resolve against the import added above since the identifiers are unchanged. If any icon identifier in the pasted array doesn't match this list (double-check against the actual file, since seed content can drift), add it to the import instead of renaming anything in the pasted data. Then change `const INITIAL_PLATFORMS =` to `export const INITIAL_PLATFORMS: Platform[] =`.

Do not alter any Farsi text, numbers, or object keys — this is a verbatim content copy with only the four `const` → `export const <name>: <Type>` declaration changes above.

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `lib/types.ts` or `lib/data/seed.ts`. If TypeScript complains about a field present in the seed data but missing from a type (e.g. a card with an extra field), add that field to the relevant interface in `lib/types.ts` rather than deleting it from the seed data.

- [ ] **Step 4: Commit**

```bash
git add lib
git commit -m "feat: add typed seed data and shared types"
```

---

### Task 4: Gemini API route and client hook

**Files:**
- Create: `app/api/gemini/route.ts`
- Create: `hooks/useGemini.ts`

**Interfaces:**
- Consumes: `GEMINI_API_KEY` from `process.env` (server-only)
- Produces: `POST /api/gemini` accepting `{ prompt: string; systemInstruction?: string }`, returning `{ text: string }` on success or `{ error: string }` (non-200) on failure. `useGemini()` hook exposing `generate(prompt: string, systemInstruction?: string): Promise<string>` — the replacement for every `callGeminiAPI(...)` call site in later tasks.

- [ ] **Step 1: Create the API route**

```ts
// app/api/gemini/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { prompt, systemInstruction } = (await request.json()) as {
    prompt: string;
    systemInstruction?: string;
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 500 });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
        }),
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: `Gemini request failed with status ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return NextResponse.json({ error: 'Gemini returned no text.' }, { status: 502 });
    }

    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: 'متأسفانه ارتباط با هوش مصنوعی با خطا مواجه شد. لطفاً دوباره تلاش کنید.' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Create the client hook**

```ts
// hooks/useGemini.ts
'use client';

export function useGemini() {
  const generate = async (prompt: string, systemInstruction?: string): Promise<string> => {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, systemInstruction }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'متأسفانه ارتباط با هوش مصنوعی با خطا مواجه شد. لطفاً دوباره تلاش کنید.');
    }
    return data.text as string;
  };

  return { generate };
}
```

- [ ] **Step 3: Add a real key to `.env.local` and verify the route**

Create `.env.local` (gitignored) with a freshly issued key:

```
GEMINI_API_KEY=your-real-key-here
```

Run `npm run dev`, then in a second terminal:

```bash
curl -X POST http://localhost:3000/api/gemini -H "Content-Type: application/json" -d "{\"prompt\":\"سلام\"}"
```

Expected: HTTP 200 with a JSON body `{"text": "..."}` containing a Gemini-generated Farsi response.

- [ ] **Step 4: Commit**

```bash
git add app/api hooks/useGemini.ts
git commit -m "feat: proxy Gemini calls through a server-side API route"
```

---

### Task 5: `getTime` helper and Chats state (`ChatsProvider` / `useChats`)

**Files:**
- Create: `lib/utils.ts`
- Create: `hooks/useChats.tsx`

**Interfaces:**
- Consumes: `Chat`, `Message`, `InlineButton` from `@/lib/types` (Task 3), `INITIAL_CHATS` from `@/lib/data/seed` (Task 3)
- Produces: `getTime(): string` from `lib/utils.ts`. `<ChatsProvider>` component and `useChats()` hook returning `{ chats: Chat[]; getChat: (id: string | number) => Chat | undefined; sendMessage: (chatId: string | number, text: string) => void; appendMessages: (chatId: string | number, messages: Message[]) => void }`. Every later task that reads or mutates chats (ChatsList, ChatRoom, layout providers) depends on this exact shape.

- [ ] **Step 1: Create `lib/utils.ts`**

Copy lines 511–514 from `index.html` (`const getTime = ...`) and export it:

```ts
// lib/utils.ts
export const getTime = (): string => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};
```

- [ ] **Step 2: Create `hooks/useChats.tsx`**

```tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Chat, Message } from '@/lib/types';
import { INITIAL_CHATS } from '@/lib/data/seed';
import { getTime } from '@/lib/utils';

interface ChatsContextValue {
  chats: Chat[];
  getChat: (id: string | number) => Chat | undefined;
  sendMessage: (chatId: string | number, text: string) => void;
  appendMessages: (chatId: string | number, messages: Message[]) => void;
}

const ChatsContext = createContext<ChatsContextValue | null>(null);

export function ChatsProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<Chat[]>(INITIAL_CHATS);

  const getChat = (id: string | number) => chats.find((c) => String(c.id) === String(id));

  const sendMessage = (chatId: string | number, text: string) => {
    if (!text.trim()) return;
    const newMessage: Message = { id: Date.now(), text, sender: 'me', time: getTime() };
    setChats((prev) =>
      prev.map((c) => (String(c.id) === String(chatId) ? { ...c, messages: [...c.messages, newMessage], unread: 0 } : c))
    );
  };

  const appendMessages = (chatId: string | number, messages: Message[]) => {
    setChats((prev) =>
      prev.map((c) => (String(c.id) === String(chatId) ? { ...c, messages: [...c.messages, ...messages], unread: 0 } : c))
    );
  };

  return (
    <ChatsContext.Provider value={{ chats, getChat, sendMessage, appendMessages }}>{children}</ChatsContext.Provider>
  );
}

export function useChats() {
  const ctx = useContext(ChatsContext);
  if (!ctx) throw new Error('useChats must be used within a ChatsProvider');
  return ctx;
}
```

This covers the original `sendMessage()` (`index.html:702-707`) exactly (same `Date.now()` id, same reset-unread-to-0 behavior). `appendMessages` is the generalization of the two-message bot exchanges built inline in `handleBotManagePlatforms` (`index.html:871-877`) and `handleBotInlineClick` (`index.html:879-886`), which Task 11 will call with `[newMsgMe, newMsgBot]`.

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `lib/utils.ts` or `hooks/useChats.tsx`.

- [ ] **Step 4: Commit**

```bash
git add lib/utils.ts hooks/useChats.tsx
git commit -m "feat: add ChatsProvider/useChats for chat state"
```

---

### Task 6: Platforms state (`PlatformsProvider` / `usePlatforms`)

**Files:**
- Create: `hooks/usePlatforms.tsx`

**Interfaces:**
- Consumes: `Platform`, `Card`, `Draft`, `MiniappConfig` from `@/lib/types` (Task 3), `INITIAL_PLATFORMS` from `@/lib/data/seed` (Task 3), `getTime` from `@/lib/utils` (Task 5)
- Produces: `<PlatformsProvider>` and `usePlatforms()` returning `{ platforms, getPlatform, joinedPlatforms, joinPlatform, drafts, getDraft, saveDraft, clearDraft, submitCard, publishPlatform, sendComment, requestCard, approveCard, cancelRequest, addPlatform, setMiniappConfig }`. Task 12 (create-card sheet), Task 13 (card detail + rules modal), and Task 9 (AI copilot) depend on this exact shape.

- [ ] **Step 1: Create `hooks/usePlatforms.tsx`**

```tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Card, Draft, MiniappConfig, Platform } from '@/lib/types';
import { INITIAL_PLATFORMS } from '@/lib/data/seed';
import { getTime } from '@/lib/utils';

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

interface PlatformsContextValue {
  platforms: Platform[];
  getPlatform: (id: number) => Platform | undefined;
  joinedPlatforms: number[];
  joinPlatform: (id: number) => void;
  drafts: Draft[];
  getDraft: (platformId: number) => Draft | undefined;
  saveDraft: (platformId: number, form: NewCardForm) => void;
  clearDraft: (platformId: number) => void;
  submitCard: (platformId: number, form: NewCardForm, authorName: string) => void;
  publishPlatform: (platformId: number) => void;
  sendComment: (
    platformId: number,
    cardId: number,
    text: string,
    sender: string,
    replyTo: { sender: string; text: string } | null
  ) => void;
  requestCard: (platformId: number, cardId: number, requesterName: string, actionLabel: string) => void;
  approveCard: (platformId: number, cardId: number, approverName: string) => void;
  cancelRequest: (platformId: number, cardId: number, requesterName: string) => void;
  addPlatform: (platform: Platform) => void;
  setMiniappConfig: (platformId: number, config: MiniappConfig) => void;
}

const PlatformsContext = createContext<PlatformsContextValue | null>(null);

export function PlatformsProvider({ children }: { children: ReactNode }) {
  const [platforms, setPlatforms] = useState<Platform[]>(INITIAL_PLATFORMS);
  const [joinedPlatforms, setJoinedPlatforms] = useState<number[]>([1, 4, 6]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const getPlatform = (id: number) => platforms.find((p) => p.id === id);
  const getDraft = (platformId: number) => drafts.find((d) => d.platformId === platformId);

  const joinPlatform = (id: number) => setJoinedPlatforms((prev) => [...prev, id]);

  const saveDraft = (platformId: number, form: NewCardForm) => {
    setDrafts((prev) => {
      const existing = prev.find((d) => d.platformId === platformId);
      if (existing) {
        return prev.map((d) => (d.platformId === platformId ? { ...d, ...form, timestamp: Date.now() } : d));
      }
      return [{ id: Date.now(), platformId, ...form, timestamp: Date.now() }, ...prev];
    });
  };

  const clearDraft = (platformId: number) => setDrafts((prev) => prev.filter((d) => d.platformId !== platformId));

  const submitCard = (platformId: number, form: NewCardForm, authorName: string) => {
    if (!form.desc.trim()) return;
    const platform = getPlatform(platformId);
    if (!platform) return;
    const derivedTitle = form.desc.split('\n')[0].trim().slice(0, 40) || 'کارت جدید';
    const newCard: Card = {
      id: Date.now(),
      title: derivedTitle,
      desc: form.desc,
      author: authorName,
      avatar: authorName.charAt(0),
      time: 'همین الان',
      hasImage: platform.formLabels.image ? form.hasImage : false,
      isCurated: false,
      comments: [],
    };
    setPlatforms((prev) => prev.map((p) => (p.id === platformId ? { ...p, cards: [newCard, ...p.cards] } : p)));
    clearDraft(platformId);
  };

  const publishPlatform = (platformId: number) => {
    setPlatforms((prev) => prev.map((p) => (p.id === platformId ? { ...p, isDraft: false } : p)));
  };

  const sendComment: PlatformsContextValue['sendComment'] = (platformId, cardId, text, sender, replyTo) => {
    if (!text.trim()) return;
    const newComment = { id: Date.now(), text, sender, time: getTime(), replyTo };
    setPlatforms((prev) =>
      prev.map((p) =>
        p.id !== platformId
          ? p
          : { ...p, cards: p.cards.map((c) => (c.id === cardId ? { ...c, comments: [...c.comments, newComment] } : c)) }
      )
    );
  };

  const requestCard = (platformId: number, cardId: number, requesterName: string, actionLabel: string) => {
    const newComment = { id: Date.now(), text: `${requesterName} درخواست ${actionLabel} ثبت کرد.`, isSystem: true };
    setPlatforms((prev) =>
      prev.map((p) =>
        p.id !== platformId
          ? p
          : {
              ...p,
              cards: p.cards.map((c) =>
                c.id === cardId ? { ...c, status: 'pending', requester: requesterName, comments: [...c.comments, newComment] } : c
              ),
            }
      )
    );
  };

  const approveCard = (platformId: number, cardId: number, approverName: string) => {
    const newComment = { id: Date.now(), text: `درخواست توسط ${approverName} تایید شد.`, isSystem: true };
    setPlatforms((prev) =>
      prev.map((p) =>
        p.id !== platformId
          ? p
          : { ...p, cards: p.cards.map((c) => (c.id === cardId ? { ...c, status: 'closed', comments: [...c.comments, newComment] } : c)) }
      )
    );
  };

  const cancelRequest = (platformId: number, cardId: number, requesterName: string) => {
    const newComment = { id: Date.now(), text: `${requesterName} درخواست خود را لغو کرد.`, isSystem: true };
    setPlatforms((prev) =>
      prev.map((p) =>
        p.id !== platformId
          ? p
          : {
              ...p,
              cards: p.cards.map((c) =>
                c.id === cardId ? { ...c, status: null, requester: null, comments: [...c.comments, newComment] } : c
              ),
            }
      )
    );
  };

  const addPlatform = (platform: Platform) => setPlatforms((prev) => [platform, ...prev]);

  const setMiniappConfig = (platformId: number, config: MiniappConfig) =>
    setPlatforms((prev) => prev.map((p) => (p.id === platformId ? { ...p, miniappConfig: config } : p)));

  return (
    <PlatformsContext.Provider
      value={{
        platforms,
        getPlatform,
        joinedPlatforms,
        joinPlatform,
        drafts,
        getDraft,
        saveDraft,
        clearDraft,
        submitCard,
        publishPlatform,
        sendComment,
        requestCard,
        approveCard,
        cancelRequest,
        addPlatform,
        setMiniappConfig,
      }}
    >
      {children}
    </PlatformsContext.Provider>
  );
}

export function usePlatforms() {
  const ctx = useContext(PlatformsContext);
  if (!ctx) throw new Error('usePlatforms must be used within a PlatformsProvider');
  return ctx;
}
```

This ports, function-for-function: `submitNewCard` (`index.html:709-728`) → `submitCard`, the draft half of `closeNewCardSheet` (`index.html:730-744`) → `saveDraft`/`clearDraft`, `openNewCardSheet`'s draft lookup (`index.html:746-754`) → `getDraft`, `publishPlatform` (`index.html:756-760`, toast side-effect moves to Task 7's `useUI`), `sendComment` (`index.html:762-774`), the rules-modal request action (`index.html:2462-2469`) → `requestCard`, the approve button (`index.html:1891-1902`) → `approveCard`, the cancel button (`index.html:1980-1989`) → `cancelRequest`, and the join button (`index.html:2308`) → `joinPlatform`. `addPlatform`/`setMiniappConfig` back the AI co-pilot flow built in Task 9.

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors in `hooks/usePlatforms.tsx`.

- [ ] **Step 3: Commit**

```bash
git add hooks/usePlatforms.tsx
git commit -m "feat: add PlatformsProvider/usePlatforms for platform, card, and draft state"
```

---

### Task 7: Cross-cutting UI state (`UIProvider` / `useUI`)

**Files:**
- Create: `hooks/useUI.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `<UIProvider>` and `useUI()` returning `{ isDrawerOpen, openDrawer, closeDrawer, showAiModal, openAiModal, closeAiModal, showPublishToast, triggerPublishToast }`. Task 10 (layout) mounts the provider and renders `Drawer`/`PublishToast` from it; Task 9 (AI co-pilot) and Task 14 (AI modal) use `showAiModal`/`openAiModal`/`closeAiModal`.

Note: `showRulesModal`, `rulesAccepted`, and `showPlatformBio` are NOT part of this hook — in the original they're only ever read/written from within one platform's card-detail/bio screens, so they stay as local `useState` inside the components built in Task 13, exactly like `platformInnerTab`, `meSubTab`, etc.

- [ ] **Step 1: Create `hooks/useUI.tsx`**

```tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface UIContextValue {
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  showAiModal: boolean;
  openAiModal: () => void;
  closeAiModal: () => void;
  showPublishToast: boolean;
  triggerPublishToast: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showPublishToast, setShowPublishToast] = useState(false);

  const triggerPublishToast = () => {
    setShowPublishToast(true);
    setTimeout(() => setShowPublishToast(false), 4000);
  };

  return (
    <UIContext.Provider
      value={{
        isDrawerOpen,
        openDrawer: () => setIsDrawerOpen(true),
        closeDrawer: () => setIsDrawerOpen(false),
        showAiModal,
        openAiModal: () => setShowAiModal(true),
        closeAiModal: () => setShowAiModal(false),
        showPublishToast,
        triggerPublishToast,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within a UIProvider');
  return ctx;
}
```

This ports `isDrawerOpen` (`index.html:569`), `showAiModal` (`index.html:570`), and the `showPublishToast`/4-second-timeout pair from `publishPlatform` (`index.html:756-760`) as reusable, hook-driven equivalents.

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add hooks/useUI.tsx
git commit -m "feat: add UIProvider/useUI for drawer, AI modal, and publish toast"
```

---

### Task 8: AI co-pilot flow (`AiCopilotProvider` / `useAiCopilot`)

**Files:**
- Create: `hooks/useAiCopilot.tsx`

**Interfaces:**
- Consumes: `useGemini` (Task 4), `usePlatforms` (Task 6, must be nested inside `PlatformsProvider`), `useUI` (Task 7, must be nested inside `UIProvider`), `CURRENT_USER` from `@/lib/data/seed`, `Layers` icon from `@/components/icons`, `useRouter` from `next/navigation`, `AiSuggestion` type from `@/lib/types`
- Produces: `<AiCopilotProvider>` and `useAiCopilot()` returning `{ aiFlowState, aiInputText, processingMessageIdx, selectedSuggestion, generatedSuggestions, startFlow, chooseSuggestion, createPlatform, activateMiniapp, closeModal }`. Task 11 (ChatRoom's textarea) calls `startFlow`; Task 14 (AiModal) renders off `aiFlowState`/`generatedSuggestions`/`selectedSuggestion` and calls the other functions.

Note: this hook does NOT cover the "مدیریت بسترهای من" inline-button feature inside the bot chat (`handleBotManagePlatforms`/`handleBotInlineClick`, `index.html:871-886`) — that's a simpler, chat-local feature and is ported directly inside `ChatRoom` in Task 11 using `useChats`/`usePlatforms` directly.

- [ ] **Step 1: Create `hooks/useAiCopilot.tsx`**

```tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { AiSuggestion, Platform } from '@/lib/types';
import { CURRENT_USER } from '@/lib/data/seed';
import { Layers } from '@/components/icons';
import { useGemini } from '@/hooks/useGemini';
import { usePlatforms } from '@/hooks/usePlatforms';
import { useUI } from '@/hooks/useUI';

type AiFlowState = 'initial' | 'processing' | 'suggestions' | 'confirmation' | 'upgrade_offer' | 'upgrade_success';

const processingMessages = [
  'دارم به دغدغه‌ات فکر می‌کنم...',
  'مسیر حل این مسئله رو تو ذهنم کشیدم...',
  'دارم می‌گردم ببینم کجاها می‌تونیم آدم‌ها رو به هم وصل کنیم تا کار دربیاد...',
];

const mockSuggestions: AiSuggestion[] = [
  {
    id: 1,
    title: 'جمعِ تامین وسایل و بانیان',
    connects: 'خیرین ↔️ خادمین اجرایی',
    desc: 'تو این بستر، کسانی که وسیله دارن رو وصل می‌کنیم به شما که وسط میدان هستید.',
    heroText: 'دست در دست هم برای حل مشکلات',
    leftSide: 'خیرین',
    rightSide: 'جهادگران',
    formLabels: {
      title: 'عنوان',
      desc: 'توضیحات و نیازمندی‌ها',
      image: 'تصویر',
      descPlaceholder: 'جزئیات کاری که نیاز دارید را اینجا بنویسید...',
      commentPlaceholder: 'پاسخ یا پیشنهاد کمک خود را بنویسید...',
    },
    miniappConfig: {
      title: 'دستیار تامین',
      placeholder: 'مثلاً بگویید به ۳ عدد چادر نیاز داریم...',
      systemInstruction: 'یک متن مناسب برای درخواست کالا یا نیروی جهادی تنظیم کن.',
    },
  },
];

const AI_PLATFORM_SYSTEM_PROMPT = `شما دستیار هوشمند و موتور طراح ساختارهای اجتماعی (بسترها) هستید. بر اساس دغدغه یا نیازمندی کاربر، باید یک ساختار بستر (پلتفرم کوچک) طراحی کنید.
خروجی شما باید منحصراً یک آرایه JSON شامل یک پیشنهاد (شیء) باشد، بدون هیچ متن اضافی. ساختار هر شیء:
[
  {
    "id": 1,
    "title": "نام بستر (کوتاه و جذاب)",
    "connects": "طرفین بستر (مثلاً: نیازمندان ↔ متخصصین)",
    "desc": "توضیح کامل بستر و هدف آن",
    "heroText": "یک جمله حماسی و الهام‌بخش برای بالای بستر",
    "leftSide": "نام گروه اول (سمت عرضه)",
    "rightSide": "نام گروه دوم (سمت تقاضا)",
    "formLabels": {
      "title": "عنوان لیبل فیلد اصلی",
      "desc": "عنوان لیبل فیلد توضیحات",
      "image": "عنوان لیبل فایل پیوست",
      "descPlaceholder": "متن کمکی بسیار مرتبط برای فیلد توضیحات فرم. حتما روان و مرتبط باشد. (از عبارات نامفهوم مانند «عنوان عمومی» استفاده نکنید.)",
      "commentPlaceholder": "متن کمکی بسیار مرتبط برای نظرات در این بستر (مثلاً: پیشنهاد کمک خود را بنویسید... یا پاسخ خود را بنویسید...)"
    },
    "miniappConfig": {
      "title": "عنوان دستیار هوشمند بستر",
      "placeholder": "متن کمکی برای مینی‌اپ که کاربر را راهنمایی می‌کند چه بنویسد",
      "systemInstruction": "پرامپت برای هوش مصنوعی مینی‌اپ تا ورودی را به متنی شکیل برای انتشار تبدیل کند."
    }
  }
]`;

interface AiCopilotContextValue {
  aiFlowState: AiFlowState;
  aiInputText: string;
  processingMessageIdx: number;
  selectedSuggestion: AiSuggestion | null;
  generatedSuggestions: AiSuggestion[];
  setAiInputText: (text: string) => void;
  startFlow: (inputText: string) => void;
  beginProcessing: () => void;
  chooseSuggestion: (sug: AiSuggestion) => void;
  createPlatform: () => void;
  activateMiniapp: () => void;
  closeModal: () => void;
}

const AiCopilotContext = createContext<AiCopilotContextValue | null>(null);

export function AiCopilotProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { generate } = useGemini();
  const { addPlatform, setMiniappConfig, getPlatform } = usePlatforms();
  const { openAiModal, closeAiModal } = useUI();

  const [aiFlowState, setAiFlowState] = useState<AiFlowState>('initial');
  const [aiInputText, setAiInputText] = useState('');
  const [processingMessageIdx, setProcessingMessageIdx] = useState(0);
  const [selectedSuggestion, setSelectedSuggestion] = useState<AiSuggestion | null>(null);
  const [generatedSuggestions, setGeneratedSuggestions] = useState<AiSuggestion[]>([]);
  const [createdPlatformId, setCreatedPlatformId] = useState<number | null>(null);

  useEffect(() => {
    if (aiFlowState !== 'processing') return;

    const interval = setInterval(() => {
      setProcessingMessageIdx((prev) => (prev >= processingMessages.length - 1 ? prev : prev + 1));
    }, 1800);

    const generatePlatform = async () => {
      try {
        const rawText = await generate(aiInputText, AI_PLATFORM_SYSTEM_PROMPT);
        const jsonMatch = rawText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          setGeneratedSuggestions(JSON.parse(jsonMatch[0]));
        } else {
          const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          setGeneratedSuggestions(JSON.parse(cleanText));
        }
      } catch (err) {
        console.error('AI Generation failed:', err);
        setGeneratedSuggestions(mockSuggestions);
      } finally {
        setAiFlowState('suggestions');
      }
    };

    generatePlatform();
    return () => clearInterval(interval);
  }, [aiFlowState, aiInputText, generate]);

  const startFlow = (inputText: string) => {
    setAiInputText(inputText);
    setAiFlowState('processing');
    setProcessingMessageIdx(0);
    openAiModal();
  };

  const beginProcessing = () => {
    setAiFlowState('processing');
    setProcessingMessageIdx(0);
  };

  const chooseSuggestion = (sug: AiSuggestion) => {
    setSelectedSuggestion(sug);
    setAiFlowState('confirmation');
  };

  const createPlatform = () => {
    if (!selectedSuggestion) return;
    const newPlatformId = Date.now();
    const newPlatform: Platform = {
      id: newPlatformId,
      name: selectedSuggestion.title,
      creator: CURRENT_USER.username,
      members: 1,
      icon: Layers,
      description: selectedSuggestion.desc,
      heroText: selectedSuggestion.heroText || 'به جمع جدید خوش آمدید!',
      leftSide: selectedSuggestion.leftSide || 'سمت عرضه',
      rightSide: selectedSuggestion.rightSide || 'سمت تقاضا',
      formLabels: selectedSuggestion.formLabels || {
        title: 'عنوان',
        desc: 'توضیحات',
        image: 'تصویر',
        descPlaceholder: 'جزئیات بیشتری که باید بدانند...',
        commentPlaceholder: 'پاسخ یا پیشنهاد خود را بنویسید...',
      },
      miniappConfig: selectedSuggestion.miniappConfig || null,
      unreadCount: 0,
      curatedCards: [],
      isDraft: true,
      cards: [
        {
          id: Date.now() + 1,
          title: 'روشن کردن چراغ اول',
          author: CURRENT_USER.name,
          avatar: CURRENT_USER.name.charAt(0),
          time: 'همین الان',
          desc: aiInputText,
          hasImage: false,
          isCurated: false,
          comments: [],
        },
      ],
    };
    addPlatform(newPlatform);
    setCreatedPlatformId(newPlatformId);
    setAiFlowState('upgrade_offer');
    router.push('/platforms/' + newPlatformId);
  };

  const activateMiniapp = () => {
    if (createdPlatformId === null) return;
    const platform = getPlatform(createdPlatformId);
    if (!platform) return;
    const config = selectedSuggestion?.miniappConfig || {
      title: `دستیار هوشمند ${platform.name}`,
      placeholder: `ایده یا خواسته خود برای ثبت در ${platform.name} را بنویسید...`,
      systemInstruction: `تو دستیار هوشمند ثبت کارت در بستر ${platform.name} هستی. بر اساس ورودی کاربر، یک متن نهایی، شکیل و منظم متناسب با نیازها و ارزش‌های این بستر به زبان فارسی بنویس. خروجی باید فقط شامل متن نهایی برای ثبت در کارت باشد و هیچ بخش یا حاشیه دیگری نداشته باشد.`,
    };
    setMiniappConfig(createdPlatformId, config);
    setAiFlowState('upgrade_success');
  };

  const closeModal = () => {
    closeAiModal();
    setTimeout(() => setAiFlowState('initial'), 300);
  };

  return (
    <AiCopilotContext.Provider
      value={{
        aiFlowState,
        aiInputText,
        processingMessageIdx,
        selectedSuggestion,
        generatedSuggestions,
        setAiInputText,
        startFlow,
        beginProcessing,
        chooseSuggestion,
        createPlatform,
        activateMiniapp,
        closeModal,
      }}
    >
      {children}
    </AiCopilotContext.Provider>
  );
}

export function useAiCopilot() {
  const ctx = useContext(AiCopilotContext);
  if (!ctx) throw new Error('useAiCopilot must be used within an AiCopilotProvider');
  return ctx;
}
```

This ports the AI-flow `useEffect` (`index.html:790-848`), `handleCreatePlatform` (`index.html:850-869`), and the `upgrade_offer` accept button's inline handler (`index.html:2379-2393`) verbatim in behavior, swapping direct `setPlatforms`/`setActivePlatformId` calls for the Task 6 hook functions and a route push.

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add hooks/useAiCopilot.tsx
git commit -m "feat: add AiCopilotProvider/useAiCopilot for the platform-creation AI flow"
```

---

### Task 9: Global overlay components (`PublishToast`, `AiModal`)

**Files:**
- Create: `components/modals/PublishToast.tsx`
- Create: `components/modals/AiModal.tsx`

**Interfaces:**
- Consumes: `useUI` (Task 7), `useAiCopilot` (Task 8), icons from `@/components/icons` (Task 2)
- Produces: `<PublishToast/>` and `<AiModal/>`, rendered from anywhere in the app (Task 10 mounts both in the root layout, so they work whether the AI flow was triggered from `/chats/bot` or a platform is published from `/platforms/[id]`).

- [ ] **Step 1: Create `components/modals/PublishToast.tsx`**

Port `renderPublishToast` (`index.html:888-895`) verbatim, swapping `showPublishToast` for the hook:

```tsx
'use client';

import { useUI } from '@/hooks/useUI';

export function PublishToast() {
  const { showPublishToast } = useUI();
  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2.5 rounded-xl shadow-2xl z-50 transition-all duration-300 flex items-center gap-2 text-[13px] ${
        showPublishToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
      }`}
    >
      🚀 بستر با موفقیت منتشر شد!
    </div>
  );
}
```

Check `index.html:888-895` for the exact toast body content and copy it verbatim in place of the placeholder text above if it differs.

- [ ] **Step 2: Create `components/modals/AiModal.tsx`**

Port `renderAiModal` (`index.html:2317-2435`) into a component, replacing every direct state reference with the `useUI`/`useAiCopilot` equivalents per this mapping:

| Original | Replacement |
|---|---|
| `showAiModal` | `useUI().showAiModal` |
| `setShowAiModal(false); setTimeout(() => setAiFlowState('initial'), 300)` | `useAiCopilot().closeModal()` |
| `aiInputText` / `setAiInputText` | `useAiCopilot().aiInputText` / `useAiCopilot().setAiInputText` |
| `setAiFlowState('processing'); setProcessingMessageIdx(0)` (initial screen's button) | `useAiCopilot().beginProcessing()` |
| `aiFlowState`, `processingMessageIdx`, `processingMessages[...]` | `useAiCopilot().aiFlowState`, `useAiCopilot().processingMessageIdx`, local `processingMessages` array (copy the same 3 strings from `index.html:785` into this file, since they're only needed for display indexing here) |
| `generatedSuggestions.length > 0 ? generatedSuggestions : mockSuggestions` | `useAiCopilot().generatedSuggestions` (the hook already falls back to `mockSuggestions` internally on generation failure, so this component only ever needs `generatedSuggestions`) |
| `setSelectedSuggestion(sug); setAiFlowState('confirmation')` | `useAiCopilot().chooseSuggestion(sug)` |
| `selectedSuggestion` | `useAiCopilot().selectedSuggestion` |
| `handleCreatePlatform` | `useAiCopilot().createPlatform` |
| the `upgrade_offer` "بله" button's `setPlatforms(...)` + `setAiFlowState('upgrade_success')` | `useAiCopilot().activateMiniapp()` |
| the `upgrade_offer` "خیر" button and the `upgrade_success` button (`setShowAiModal(false); setTimeout(...)`) | `useAiCopilot().closeModal()` |

Everything else — every class name, every piece of Farsi copy, every layout div — carries over unchanged. Start the file with:

```tsx
'use client';

import { Sparkles, X, ArrowRight, CheckCheck } from '@/components/icons';
import { useUI } from '@/hooks/useUI';
import { useAiCopilot } from '@/hooks/useAiCopilot';

const processingMessages = [
  'دارم به دغدغه‌ات فکر می‌کنم...',
  'مسیر حل این مسئله رو تو ذهنم کشیدم...',
  'دارم می‌گردم ببینم کجاها می‌تونیم آدم‌ها رو به هم وصل کنیم تا کار دربیاد...',
];

export function AiModal() {
  const { showAiModal } = useUI();
  const {
    aiFlowState,
    aiInputText,
    setAiInputText,
    processingMessageIdx,
    selectedSuggestion,
    generatedSuggestions,
    beginProcessing,
    chooseSuggestion,
    createPlatform,
    activateMiniapp,
    closeModal,
  } = useAiCopilot();

  if (!showAiModal) return null;

  return (
    // paste the JSX body from index.html:2320-2434 here, applying the substitution table above
  );
}
```

Then paste the JSX body from `index.html:2320-2434` in place of the comment, applying every substitution from the table.

- [ ] **Step 3: Verify it compiles and renders**

```bash
npx tsc --noEmit
```

A full manual check happens in Task 10 once the modal is mounted in the layout — for now just confirm there are no type errors.

- [ ] **Step 4: Commit**

```bash
git add components/modals
git commit -m "feat: port PublishToast and AiModal components"
```

---

### Task 10: Root layout, phone-frame chrome, and provider wiring

**Files:**
- Modify: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
- Create: `components/layout/PhoneFrame.tsx`

**Interfaces:**
- Consumes: `ChatsProvider` (Task 5), `PlatformsProvider` (Task 6), `UIProvider` (Task 7), `AiCopilotProvider` (Task 8), `AiModal`/`PublishToast` (Task 9)
- Produces: the app shell every route renders inside — `<PhoneFrame>{children}</PhoneFrame>` plus the two global overlays. All remaining tasks assume this shell exists and that their pages are rendered as `{children}` inside it.

- [ ] **Step 1: Replace `app/globals.css`**

Port the reset and `.hide-scrollbar` utility from `index.html:11-24`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

- [ ] **Step 2: Create `components/layout/PhoneFrame.tsx`**

Port the outer wrapper from `index.html:2484-2510` (the phone-mockup chrome, minus the ternary content which becomes `children`):

```tsx
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center sm:p-6 selection:bg-blue-200">
      <div
        dir="rtl"
        className="w-full h-[100dvh] sm:w-[390px] sm:h-[844px] bg-white sm:rounded-[3rem] sm:border-[12px] sm:border-black relative overflow-hidden flex flex-col font-sans text-right antialiased shadow-[0_0_50px_rgba(0,0,0,0.5)]"
        style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
      >
        {children}
        <div className="hidden sm:block absolute top-0 left-1/2 -translate-x-1/2 w-[120px] h-[25px] bg-black rounded-b-3xl z-50 pointer-events-none" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { ChatsProvider } from '@/hooks/useChats';
import { PlatformsProvider } from '@/hooks/usePlatforms';
import { UIProvider } from '@/hooks/useUI';
import { AiCopilotProvider } from '@/hooks/useAiCopilot';
import { PhoneFrame } from '@/components/layout/PhoneFrame';
import { AiModal } from '@/components/modals/AiModal';
import { PublishToast } from '@/components/modals/PublishToast';

export const metadata: Metadata = {
  title: 'تعاون',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <ChatsProvider>
          <PlatformsProvider>
            <UIProvider>
              <AiCopilotProvider>
                <PhoneFrame>
                  {children}
                  <AiModal />
                  <PublishToast />
                </PhoneFrame>
              </AiCopilotProvider>
            </UIProvider>
          </PlatformsProvider>
        </ChatsProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Simplify `app/page.tsx` back to a placeholder**

```tsx
export default function Page() {
  return <div className="p-4">تعاون — در حال ساخت</div>;
}
```

(Task 13 replaces this with the real platforms-list page.)

- [ ] **Step 5: Verify in the browser**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected: the phone-frame mockup (rounded border, notch on `sm:` widths and up) renders around the placeholder text, no console errors, no hydration warnings.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx app/page.tsx components/layout/PhoneFrame.tsx
git commit -m "feat: wire root layout with providers and phone-frame chrome"
```

---

### Task 11: Header, Drawer, and the tabs route group

**Files:**
- Create: `components/layout/Header.tsx`, `components/layout/Drawer.tsx`, `app/(tabs)/layout.tsx`

**Interfaces:**
- Consumes: `useUI` (Task 7), `useChats` (Task 5), `usePlatforms` (Task 6), `CURRENT_USER`/`INITIAL_GLOBAL_COMMENTS` from `@/lib/data/seed` (Task 3), icons (Task 2)
- Produces: the shared chrome for the three tab screens. `/`, `/chats`, and `/comments` render inside `app/(tabs)/layout.tsx` and get `Header` + `Drawer` + the new-message FAB automatically. `/chats/[chatId]` and `/platforms/[platformId]` live OUTSIDE the `(tabs)` route group (siblings of it under `app/`), so they render full-screen without this chrome — matching the original, where `renderHeader()`/`renderDrawer()` only appear when neither `activeChatId` nor `activePlatformId` is set (`index.html:2491-2507`). A Next.js *route group* (a folder named `(tabs)`) does not add a path segment, so `app/(tabs)/page.tsx` is still served at `/`.

- [ ] **Step 1: Create `components/layout/Header.tsx`**

Port `renderHeader` (`index.html:896-933`), replacing `activeTab`/`setActiveTab` with route-based equivalents:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search, MessageCircle, Layers, MessageSquare } from '@/components/icons';
import { useUI } from '@/hooks/useUI';
import { useChats } from '@/hooks/useChats';
import { usePlatforms } from '@/hooks/usePlatforms';
import { INITIAL_GLOBAL_COMMENTS } from '@/lib/data/seed';

export function Header() {
  const pathname = usePathname();
  const { openDrawer } = useUI();
  const { chats } = useChats();
  const { platforms } = usePlatforms();

  const activeTab =
    pathname === '/' ? 'platforms' : pathname.startsWith('/chats') ? 'chats' : pathname.startsWith('/comments') ? 'comments' : null;

  const tabs = [
    { id: 'chats', href: '/chats', label: 'گفتگوها', icon: MessageCircle, count: chats.reduce((a, c) => a + c.unread, 0) },
    { id: 'platforms', href: '/', label: 'بسترها', icon: Layers, count: platforms.reduce((a, c) => a + c.unreadCount, 0) },
    {
      id: 'comments',
      href: '/comments',
      label: 'مشارکت‌ها',
      icon: MessageSquare,
      count: INITIAL_GLOBAL_COMMENTS.reduce((a, c) => a + c.unread, 0),
    },
  ];

  return (
    <div className="bg-[#527DA3] text-white shadow-sm z-10 flex flex-col shrink-0">
      <div className="flex items-center justify-between p-3 h-[52px]">
        <div className="flex items-center gap-4">
          <button onClick={openDrawer} className="p-1 hover:bg-white/10 rounded-full transition">
            <Menu size={22} />
          </button>
          <h1 className="text-[17px] font-medium tracking-wide">تعاون</h1>
        </div>
        <button className="p-1 hover:bg-white/10 rounded-full transition">
          <Search size={20} />
        </button>
      </div>
      <div className="flex text-[13px] font-medium px-2 overflow-x-auto hide-scrollbar [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={`relative flex items-center gap-1.5 px-4 py-2.5 whitespace-nowrap transition-colors ${
              activeTab === tab.id ? 'text-white' : 'text-[#B0CBE1] hover:text-white'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-white text-[#527DA3]' : 'bg-[#B0CBE1] text-[#527DA3]'
                }`}
              >
                {tab.count}
              </span>
            )}
            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white rounded-t-md" />}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/layout/Drawer.tsx`**

Port `renderDrawer` (`index.html:935-954`) verbatim, swapping `isDrawerOpen`/`setIsDrawerOpen(false)` for the hook:

```tsx
'use client';

import { User, Bookmark, Info } from '@/components/icons';
import { useUI } from '@/hooks/useUI';
import { CURRENT_USER } from '@/lib/data/seed';

export function Drawer() {
  const { isDrawerOpen, closeDrawer } = useUI();
  return (
    <>
      <div
        className={`absolute inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          isDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeDrawer}
      />
      <div
        className={`absolute top-0 right-0 h-full w-[280px] bg-white z-50 transform transition-transform duration-300 ease-out shadow-2xl flex flex-col ${
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="bg-[#527DA3] text-white p-5 pb-4 shrink-0">
          <div className="w-14 h-14 bg-[#6490B1] rounded-full flex items-center justify-center text-xl font-medium mb-3 shadow-sm border border-white/20">
            {CURRENT_USER.name.charAt(0)}
          </div>
          <h2 className="text-base font-medium leading-tight">{CURRENT_USER.name}</h2>
          <p className="text-[#B0CBE1] text-[13px] mt-0.5" dir="ltr">
            {CURRENT_USER.phone}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-2 text-[#333] font-medium text-[14px]">
          <button className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
            <User size={20} className="text-gray-500" />
            <span>پروفایل من</span>
          </button>
          <button className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
            <Bookmark size={20} className="text-gray-500" />
            <span>نشان‌شده‌ها</span>
          </button>
          <div className="h-px bg-gray-200 my-1 mx-5" />
          <button className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
            <Info size={20} className="text-gray-500" />
            <span>درباره سیستم تعاون</span>
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Create `app/(tabs)/layout.tsx`**

Ports the tab-screen wrapper and FAB from `index.html:2496-2506` (the `else` branch of the `activeChatId ? ... : activePlatformId ? ... : (...)` ternary):

```tsx
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Drawer } from '@/components/layout/Drawer';
import { Pen } from '@/components/icons';

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full absolute inset-0 bg-[#f4f4f5]">
      <Drawer />
      <Header />
      <main className="flex-1 overflow-y-auto relative">{children}</main>
      <div className="absolute bottom-5 left-4 z-20">
        <Link
          href="/chats/bot"
          className="w-[56px] h-[56px] bg-[#527DA3] hover:bg-[#466a8a] text-white rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-95"
        >
          <Pen size={24} strokeWidth={2.5} />
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create placeholder pages so the route group resolves**

```bash
mkdir -p "app/(tabs)/chats" "app/(tabs)/comments"
```

Move the current `app/page.tsx` placeholder into the group and add the other two placeholders:

```bash
mv app/page.tsx "app/(tabs)/page.tsx"
```

```tsx
// app/(tabs)/chats/page.tsx
export default function ChatsPage() {
  return <div className="p-4">لیست گفتگوها — در حال ساخت</div>;
}
```

```tsx
// app/(tabs)/comments/page.tsx
export default function CommentsPage() {
  return <div className="p-4">مشارکت‌ها — در حال ساخت</div>;
}
```

- [ ] **Step 5: Verify in the browser**

```bash
npm run dev
```

Visit `/`, `/chats`, `/comments`. Expected: header with the three tabs and correct unread badge counts on all three, the active tab underlined in white, clicking a tab navigates and updates the underline, the hamburger button opens the drawer showing `CURRENT_USER`'s name/phone, and the floating pencil button links to `/chats/bot` (a 404 for now — Task 12 adds that route).

- [ ] **Step 6: Commit**

```bash
git add "app/(tabs)" components/layout
git commit -m "feat: add Header, Drawer, and the tabs route group layout"
```

---

### Task 12: Chats list and chat room

**Files:**
- Create: `components/chat/MessageBubble.tsx`, `components/chat/ChatsList.tsx`, `components/chat/ChatRoom.tsx`
- Modify: `app/(tabs)/chats/page.tsx`
- Create: `app/chats/[chatId]/page.tsx`

**Interfaces:**
- Consumes: `useChats` (Task 5), `usePlatforms` (Task 6), `useAiCopilot` (Task 8), `Chat`/`Message`/`InlineButton` types (Task 3)
- Produces: `<MessageBubble message={Message} onInlineButtonClick={(btn: InlineButton) => void} />`, `<ChatsList/>`, `<ChatRoom chat={Chat} />`. `app/chats/[chatId]/page.tsx` resolves the route param through `useChats().getChat()` and 404s via `notFound()` if missing.

- [ ] **Step 1: Create `components/chat/MessageBubble.tsx`**

Port the message-rendering body from inside `renderChatRoom` (`index.html:1177-1199`) as its own component:

```tsx
'use client';

import { CheckCheck } from '@/components/icons';
import type { InlineButton, Message } from '@/lib/types';

export function MessageBubble({
  message,
  onInlineButtonClick,
}: {
  message: Message;
  onInlineButtonClick: (btn: InlineButton) => void;
}) {
  const isMe = message.sender === 'me';
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] relative p-2.5 px-3.5 rounded-2xl text-[14px] shadow-sm ${
          isMe ? 'bg-[#EEFFDE] rounded-br-sm text-black' : 'bg-white rounded-bl-sm text-black'
        }`}
      >
        <p className="leading-relaxed whitespace-pre-wrap">{message.text}</p>
        <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end text-green-600' : 'justify-start text-gray-400'}`}>
          <span className="text-[10px]">{message.time}</span>
          {isMe && <CheckCheck size={14} />}
        </div>
        {message.inlineButtons && (
          <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
            {message.inlineButtons.map((btn) => (
              <button
                key={btn.id}
                onClick={() => onInlineButtonClick(btn)}
                className="w-full bg-blue-50/50 hover:bg-blue-50 text-[#527DA3] font-medium py-1.5 px-3 rounded-lg text-[12px] border border-blue-100 transition truncate block text-center"
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/chat/ChatsList.tsx`**

Port `renderChatsList` (`index.html:956-982`), replacing `setActiveChatId(chat.id)` with a route push:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { CheckCheck } from '@/components/icons';
import { useChats } from '@/hooks/useChats';

export function ChatsList() {
  const router = useRouter();
  const { chats } = useChats();

  return (
    <div className="divide-y divide-gray-100 bg-white min-h-full">
      {chats.map((chat) => {
        const lastMsg = chat.messages[chat.messages.length - 1];
        return (
          <div
            key={chat.id}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer transition active:bg-gray-100"
            onClick={() => router.push('/chats/' + chat.id)}
          >
            <div className="relative shrink-0">
              <div className="w-12 h-12 bg-gradient-to-t from-[#527DA3] to-blue-400 rounded-full flex items-center justify-center text-white text-lg font-medium">
                {chat.avatar}
              </div>
              {chat.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#4CAF50] border-2 border-white rounded-full" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-0.5">
                <h3 className="font-medium text-[15px] text-gray-900 truncate">{chat.name}</h3>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{lastMsg?.time}</span>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-[13px] text-gray-500 truncate pr-1">{lastMsg?.text}</p>
                {chat.unread > 0 ? (
                  <span className="bg-[#4CAF50] text-white text-[11px] font-bold px-1.5 min-w-[18px] h-4.5 flex items-center justify-center rounded-full">
                    {chat.unread}
                  </span>
                ) : (
                  lastMsg?.sender === 'me' && <CheckCheck size={14} className="text-[#527DA3]" />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create `components/chat/ChatRoom.tsx`**

Port `renderChatRoom` (`index.html:1162-1266`) plus `handleBotManagePlatforms`/`handleBotInlineClick` (`index.html:871-886`) and the bot-textarea's inline handlers (`index.html:1215`, `1221`):

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChatIcon, Layers, Paperclip, Send, X } from '@/components/icons';
import { useChats } from '@/hooks/useChats';
import { usePlatforms } from '@/hooks/usePlatforms';
import { useAiCopilot } from '@/hooks/useAiCopilot';
import { CURRENT_USER } from '@/lib/data/seed';
import { getTime } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import type { Chat, InlineButton } from '@/lib/types';

export function ChatRoom({ chat }: { chat: Chat }) {
  const router = useRouter();
  const { sendMessage, appendMessages } = useChats();
  const { platforms } = usePlatforms();
  const { startFlow } = useAiCopilot();

  const [messageInput, setMessageInput] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chat.messages]);

  const handleBotManagePlatforms = () => {
    const userPlatforms = platforms.filter((p) => p.creator === CURRENT_USER.username);
    const newMsgMe = { id: Date.now(), text: 'مدیریت بسترهای من', sender: 'me' as const, time: getTime() };
    const inlineButtons: InlineButton[] = userPlatforms.map((p) => ({ id: p.id, label: p.name, action: 'select_platform' }));
    const newMsgBot = {
      id: Date.now() + 1,
      text: 'کدام بستر را می‌خواهید آپدیت کنید؟',
      sender: 'them' as const,
      time: getTime(),
      inlineButtons,
    };
    appendMessages(chat.id, [newMsgMe, newMsgBot]);
  };

  const handleBotInlineClick = (btn: InlineButton) => {
    if (btn.action !== 'select_platform') return;
    const p = platforms.find((x) => x.id === btn.id);
    if (!p) return;
    const newMsgMe = { id: Date.now(), text: p.name, sender: 'me' as const, time: getTime() };
    const newMsgBot = {
      id: Date.now() + 1,
      text: `بسیار خب. حالا به من بگویید دقیقاً چه تغییری در بستر «${p.name}» می‌خواهید انجام دهم؟ (مثلاً: فیلد شماره تماس رو اضافه کن)`,
      sender: 'them' as const,
      time: getTime(),
    };
    appendMessages(chat.id, [newMsgMe, newMsgBot]);
  };

  const handleSend = () => {
    sendMessage(chat.id, messageInput);
    setMessageInput('');
  };

  const handleBotSend = () => {
    if (!messageInput.trim()) return;
    startFlow(messageInput);
    setMessageInput('');
  };

  return (
    <div className="absolute inset-0 bg-[#E4DDD6] z-40 flex flex-col animate-in slide-in-from-right-full duration-200">
      <div className="bg-[#527DA3] text-white px-2 py-2 flex items-center gap-3 shadow-sm shrink-0">
        <button onClick={() => router.back()} className="p-2 hover:bg-white/10 rounded-full">
          <ArrowRight size={22} />
        </button>
        <div className="flex-1 flex items-center gap-3 cursor-pointer" onClick={() => setShowProfile(true)}>
          <div className="w-10 h-10 bg-[#6490B1] border border-white/20 rounded-full flex items-center justify-center font-medium">
            {chat.avatar}
          </div>
          <div>
            <h2 className="font-medium leading-tight">{chat.name}</h2>
            <p className="text-xs text-blue-200">{chat.online ? 'آنلاین' : 'آخرین بازدید اخیراً'}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={chatScrollRef}>
        <div className="flex justify-center mb-4">
          <span className="bg-[#748EA5]/40 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">امروز</span>
        </div>
        {chat.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onInlineButtonClick={handleBotInlineClick} />
        ))}
      </div>

      <div className="bg-white shrink-0 flex flex-col shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        {chat.isBot ? (
          <>
            <div className="border-b border-gray-100 p-2">
              <button
                onClick={handleBotManagePlatforms}
                className="w-full bg-blue-50 hover:bg-blue-100 text-[#527DA3] font-medium py-2.5 rounded-lg text-[13px] transition border border-blue-100 shadow-sm flex items-center justify-center gap-2"
              >
                <Layers size={16} /> مدیریت بسترهای من
              </button>
            </div>
            <div className="p-2.5">
              <div className="relative">
                <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && messageInput.trim()) {
                      e.preventDefault();
                      handleBotSend();
                    }
                  }}
                  placeholder="مثلاً بنویس: بچه‌های محل برای برپایی موکب فاطمیه نیاز به داربست و پارچه مشکی دارن..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 pr-4 pl-12 text-[14px] min-h-[90px] resize-none focus:outline-none focus:border-[#527DA3] focus:ring-2 focus:ring-[#527DA3]/10 transition leading-relaxed text-gray-800"
                  rows={3}
                />
                <button
                  onClick={handleBotSend}
                  className={`absolute left-3 bottom-3 w-8 h-8 flex items-center justify-center rounded-xl transition-all ${
                    messageInput.trim() ? 'bg-[#527DA3] text-white shadow-md active:scale-95' : 'bg-gray-200 text-gray-400 pointer-events-none'
                  }`}
                >
                  <ArrowRight size={16} className="rotate-180" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 px-2 py-2 border-t border-gray-200">
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition">
              <Paperclip size={24} strokeWidth={1.5} />
            </button>
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="پیام..."
              className="flex-1 bg-transparent py-2 px-1 focus:outline-none text-[15px]"
            />
            {messageInput.trim() ? (
              <button onClick={handleSend} className="p-2 text-[#527DA3] hover:bg-blue-50 rounded-full transition">
                <Send size={24} className="rtl:-scale-x-100" />
              </button>
            ) : (
              <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition">
                <ChatIcon size={24} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}
      </div>

      {showProfile && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-bottom-full duration-200">
          <div className="bg-white px-2 py-3 flex items-center gap-4 shadow-sm border-b">
            <button onClick={() => setShowProfile(false)} className="p-2 hover:bg-gray-100 rounded-full">
              <X size={24} className="text-gray-600" />
            </button>
            <h2 className="text-lg font-medium text-gray-800">اطلاعات کاربر</h2>
          </div>
          <div className="flex flex-col items-center py-6 bg-gray-50 border-b border-gray-200">
            <div className="w-24 h-24 bg-[#527DA3] rounded-full flex items-center justify-center text-4xl font-medium text-white shadow-md mb-3">
              {chat.avatar}
            </div>
            <h2 className="text-xl font-medium text-gray-900">{chat.name}</h2>
            <p className="text-[#527DA3] mt-1" dir="ltr">
              {chat.username}
            </p>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-sm text-[#527DA3] font-medium mb-1">بیوگرافی / تخصص</p>
              <p className="text-[14px] text-gray-800 leading-relaxed bg-white p-3 border border-gray-100 rounded-xl">{chat.bio}</p>
            </div>
            <div className="h-px bg-gray-200 w-full" />
            <div>
              <p className="text-sm text-[#527DA3] font-medium mb-3">بسترهای مشترک</p>
              <div className="space-y-2">
                {chat.sharedPlatforms.map((plat, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl">
                    <Layers size={20} className="text-[#527DA3]" />
                    <span className="font-medium text-[13px] text-gray-800">{plat}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Replace `app/(tabs)/chats/page.tsx`**

```tsx
import { ChatsList } from '@/components/chat/ChatsList';

export default function ChatsPage() {
  return <ChatsList />;
}
```

- [ ] **Step 5: Create `app/chats/[chatId]/page.tsx`**

```tsx
'use client';

import { notFound } from 'next/navigation';
import { useChats } from '@/hooks/useChats';
import { ChatRoom } from '@/components/chat/ChatRoom';

export default function ChatRoomPage({ params }: { params: { chatId: string } }) {
  const { getChat } = useChats();
  const chat = getChat(params.chatId);
  if (!chat) return notFound();
  return <ChatRoom chat={chat} />;
}
```

- [ ] **Step 6: Verify in the browser**

```bash
npm run dev
```

Visit `/chats`. Expected: 6 chats listed (including "همیار تعاون"), unread badges match the header counts from Task 11. Click a regular chat: room opens full-screen (no header/tab bar), send a message, it appears on the right in green with a checkmark. Click the back arrow: returns to `/chats`. Click "همیار تعاون": bot chat opens; click "مدیریت بسترهای من": two new messages appear with platform buttons; typing in the bot's textarea and pressing Enter opens the `AiModal` from Task 9 in its "processing" state (it will fail to reach "suggestions" until a real `GEMINI_API_KEY` is set, which is expected at this point).

- [ ] **Step 7: Commit**

```bash
git add components/chat "app/(tabs)/chats" "app/chats"
git commit -m "feat: port chats list and chat room, including the bot chat flows"
```

---

### Task 13: Platforms list and card template

**Files:**
- Create: `components/platforms/PlatformsList.tsx`, `components/platforms/CardTemplate.tsx`
- Modify: `app/(tabs)/page.tsx`

**Interfaces:**
- Consumes: `usePlatforms` (Task 6), `CURRENT_USER` (Task 3)
- Produces: `<PlatformsList/>`. `<CardTemplate card={Card} onOpen={(cardId: number) => void} />` — note `onOpen` must, in whichever parent renders it, both select the card AND reset the collapse state (`setActiveCardId(id); setIsCardCollapsed(false)` in the original, `index.html:1298`, `1325`) — `CardTemplate` itself does not own that state. Task 16 (`PlatformInternal`) is the consumer.

- [ ] **Step 1: Create `components/platforms/CardTemplate.tsx`**

Port `renderCardTemplate` (`index.html:1297-1331`), replacing the two `setActiveCardId(card.id); setIsCardCollapsed(false)` call sites with the `onOpen` prop:

```tsx
'use client';

import { ChatIcon, Heart, ImageIcon, Pin, Share2 } from '@/components/icons';
import type { Card } from '@/lib/types';

export function CardTemplate({ card, onOpen }: { card: Card; onOpen: (cardId: number) => void }) {
  return (
    <div
      onClick={() => onOpen(card.id)}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md cursor-pointer transition active:scale-[0.98] w-full text-right mb-3"
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-[#527DA3] to-blue-400 text-white rounded-full flex items-center justify-center text-[13px] font-bold shrink-0">
            {card.avatar}
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-gray-800 leading-tight">{card.author}</span>
            <span className="text-[10px] text-gray-400">{card.time}</span>
          </div>
          <div className="mr-auto flex items-center gap-2">
            {card.isCurated && <Pin size={14} className="text-amber-400" />}
            {card.status && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                  card.status === 'pending' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-500 border border-gray-200'
                }`}
              >
                {card.status === 'pending' ? 'درخواست جدید' : 'واگذار شده'}
              </span>
            )}
          </div>
        </div>
        <p className="text-[13px] text-gray-700 line-clamp-3 leading-relaxed">{card.desc}</p>
      </div>
      {card.hasImage && (
        <div className="w-full h-36 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          <ImageIcon size={36} className="text-gray-300" />
        </div>
      )}
      <div className="flex items-center border-t border-gray-100 divide-x divide-x-reverse divide-gray-100">
        <button
          onClick={(e) => e.stopPropagation()}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition"
        >
          <Heart size={17} strokeWidth={1.8} />
        </button>
        <button
          onClick={(e) => e.stopPropagation()}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition"
        >
          <Share2 size={17} strokeWidth={1.8} />
        </button>
        <button onClick={() => onOpen(card.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-400 hover:text-[#527DA3] hover:bg-blue-50 transition">
          <ChatIcon size={17} strokeWidth={1.8} />
          {card.comments.length > 0 && <span className="text-[11px] font-bold text-gray-500">{card.comments.length}</span>}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/platforms/PlatformsList.tsx`**

Port `renderPlatformsList` (`index.html:984-1009`), replacing `handleOpenPlatform(platform.id)` with a route push (the original also set `platformInnerTab` to `'explore'`, which is now simply the default local state in Task 16's platform page, so no equivalent call is needed here):

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Layers, Settings } from '@/components/icons';
import { usePlatforms } from '@/hooks/usePlatforms';
import { CURRENT_USER } from '@/lib/data/seed';

export function PlatformsList() {
  const router = useRouter();
  const { platforms } = usePlatforms();

  return (
    <div className="bg-white min-h-full divide-y divide-gray-100">
      {platforms.map((platform) => {
        const amIOwner = platform.creator === CURRENT_USER.username;
        return (
          <div
            key={platform.id}
            className="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer transition"
            onClick={() => router.push('/platforms/' + platform.id)}
          >
            <div className="w-14 h-14 bg-blue-50 text-[#527DA3] rounded-2xl flex items-center justify-center shrink-0">
              <Layers size={28} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-0.5">
                <h3 className="font-medium text-[15px] text-gray-900 truncate flex items-center">
                  {platform.name}
                  {amIOwner && <Settings size={18} strokeWidth={1.5} className="text-[#527DA3] mr-2 shrink-0" title="مدیریت بستر" />}
                </h3>
                {platform.unreadCount > 0 && (
                  <span className="bg-[#527DA3] text-white text-[10px] px-1.5 py-0.5 rounded-md shadow-sm whitespace-nowrap">
                    {platform.unreadCount}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-gray-500 truncate">{platform.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Replace `app/(tabs)/page.tsx`**

```tsx
import { PlatformsList } from '@/components/platforms/PlatformsList';

export default function PlatformsPage() {
  return <PlatformsList />;
}
```

- [ ] **Step 4: Verify in the browser**

```bash
npm run dev
```

Visit `/`. Expected: 7 platforms listed, the settings icon appears next to platforms you created (creator `@ali_alavi`), unread badges match. Clicking a row navigates to `/platforms/<id>` (404 for now — Task 16 adds that route).

- [ ] **Step 5: Commit**

```bash
git add components/platforms "app/(tabs)"
git commit -m "feat: port platforms list and card template"
```

---

### Task 14: Create-card sheet and bio modal

**Files:**
- Create: `components/platforms/CreateCardSheet.tsx`, `components/platforms/BioModal.tsx`

**Interfaces:**
- Consumes: `usePlatforms` (Task 6), `CURRENT_USER` (Task 3), `Platform` type (Task 3)
- Produces: `<CreateCardSheet isOpen={boolean} platform={Platform} onClose={() => void} />` and `<BioModal isOpen={boolean} onClose={() => void} platform={Platform} isCreator={boolean} bioTab={'info'|'dev'} onBioTabChange={(tab) => void} />`. Task 16 (`PlatformInternal`) owns `showNewCardSheet`/`showPlatformBio`/`bioTab` as local state and renders both.

- [ ] **Step 1: Create `components/platforms/CreateCardSheet.tsx`**

Port `renderCreateCardSheet` (`index.html:1269-1294`) plus `submitNewCard`/`closeNewCardSheet`/`openNewCardSheet`'s draft-load effect (`index.html:709-754`), using the Task 6 hook functions instead of direct `setPlatforms`/`setDrafts`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ImageIcon, X } from '@/components/icons';
import { usePlatforms } from '@/hooks/usePlatforms';
import { CURRENT_USER } from '@/lib/data/seed';
import type { Platform } from '@/lib/types';

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

const EMPTY_FORM: NewCardForm = { title: '', desc: '', hasImage: false };

export function CreateCardSheet({ isOpen, platform, onClose }: { isOpen: boolean; platform: Platform; onClose: () => void }) {
  const { getDraft, saveDraft, clearDraft, submitCard } = usePlatforms();
  const [form, setForm] = useState<NewCardForm>(EMPTY_FORM);

  useEffect(() => {
    if (!isOpen) return;
    const draft = getDraft(platform.id);
    setForm(draft ? { title: draft.title, desc: draft.desc, hasImage: draft.hasImage } : EMPTY_FORM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, platform.id]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (form.desc.trim()) {
      saveDraft(platform.id, form);
    } else {
      clearDraft(platform.id);
    }
    onClose();
  };

  const handleSubmit = () => {
    submitCard(platform.id, form, CURRENT_USER.name);
    onClose();
  };

  return (
    <>
      <div className="absolute inset-0 bg-black/60 z-40 animate-in fade-in duration-200" onClick={handleClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-full duration-300">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h3 className="font-medium text-[16px] text-gray-900">ثبت کارت جدید</h3>
          <button onClick={handleClose} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-[12px] font-medium text-[#527DA3] mb-1.5">{platform.formLabels.desc}</label>
            <textarea
              value={form.desc}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              placeholder={platform.formLabels?.descPlaceholder || 'جزئیات بیشتری که باید بدانند...'}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] min-h-[100px] resize-none focus:outline-none focus:border-[#527DA3] transition"
            />
          </div>
          {platform.formLabels.image && (
            <div>
              <label className="block text-[12px] font-medium text-[#527DA3] mb-1.5">{platform.formLabels.image}</label>
              <button
                onClick={() => setForm({ ...form, hasImage: !form.hasImage })}
                className={`w-full border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition ${
                  form.hasImage ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                {form.hasImage ? (
                  <>
                    <CheckCircle2 size={24} className="text-green-500" />
                    <span className="text-[12px] text-green-600 font-medium">تصویر پیوست شد</span>
                  </>
                ) : (
                  <>
                    <ImageIcon size={24} className="text-gray-400" />
                    <span className="text-[12px] text-gray-500 font-medium">برای انتخاب فایل ضربه بزنید (اختیاری)</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
        <div className="p-4 pt-2 border-t border-gray-100 bg-white">
          <button
            onClick={handleSubmit}
            disabled={!form.desc.trim()}
            className={`w-full py-3 rounded-xl font-medium text-[15px] transition-all transform active:scale-[0.98] ${
              form.desc.trim() ? 'bg-[#527DA3] text-white shadow-md' : 'bg-gray-100 text-gray-400 pointer-events-none'
            }`}
          >
            یاعلی، ثبت و ارسال
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create `components/platforms/BioModal.tsx`**

Port `renderBioModal` (`index.html:2013-2148`) plus `handleCopyCard` (`index.html:689-700`), replacing `isPlatformCreator`/`bioTab`/`setBioTab` with props and keeping `openAccordion`/`copiedCard` as local state exactly as in the original:

```tsx
'use client';

import { useState } from 'react';
import { ArrowRight, Check, ChevronDown, Copy, Link2, LogOut, PlayCircle, Sparkles, User, X } from '@/components/icons';
import type { Platform } from '@/lib/types';

export function BioModal({
  isOpen,
  onClose,
  platform,
  isCreator,
  bioTab,
  onBioTabChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  platform: Platform;
  isCreator: boolean;
  bioTab: 'info' | 'dev';
  onBioTabChange: (tab: 'info' | 'dev') => void;
}) {
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const [copiedCard, setCopiedCard] = useState(false);

  if (!isOpen) return null;

  const PlatformIcon = platform.icon;

  const handleCopyCard = () => {
    try {
      const el = document.createElement('textarea');
      el.value = '6037998143218765';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    } catch {
      // clipboard copy is best-effort
    }
    setCopiedCard(true);
    setTimeout(() => setCopiedCard(false), 2000);
  };

  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex flex-col items-center justify-end sm:justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-white w-full h-[90vh] sm:h-[80vh] sm:rounded-2xl rounded-t-2xl overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-full">
        <div className="bg-[#527DA3] p-4 flex items-center justify-between shrink-0 text-white">
          <h2 className="font-medium text-[16px]">بیوگرافی بستر</h2>
          <button onClick={onClose} className="hover:bg-white/10 rounded-full p-1.5 transition">
            <X size={20} />
          </button>
        </div>

        {isCreator && (
          <div className="flex bg-white border-b border-gray-200 shrink-0">
            <button
              onClick={() => onBioTabChange('info')}
              className={`flex-1 py-3 text-[13px] font-medium transition-colors ${
                bioTab === 'info' ? 'text-[#527DA3] border-b-2 border-[#527DA3]' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              اطلاعات
            </button>
            <button
              onClick={() => onBioTabChange('dev')}
              className={`flex-1 py-3 text-[13px] font-medium transition-colors flex justify-center items-center gap-1.5 ${
                bioTab === 'dev' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Sparkles size={14} /> توسعه بستر
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-gray-50">
          {(!isCreator || bioTab === 'info') && (
            <div className="p-5">
              <div className="flex flex-col items-center mb-6">
                <div className="w-20 h-20 bg-blue-50 text-[#527DA3] rounded-3xl flex items-center justify-center shadow-sm mb-3 border border-blue-100">
                  <PlatformIcon size={40} strokeWidth={1.5} />
                </div>
                <h2 className="text-xl font-bold text-gray-900">{platform.name}</h2>
                <p className="text-[13px] text-gray-500 mt-1">تاسیس توسط: {platform.creator}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[12px] font-medium text-[#527DA3] mb-1.5">درباره این تعاون</p>
                  <p className="text-[13px] text-gray-800 leading-relaxed bg-white p-3 rounded-xl border border-gray-200 shadow-sm">{platform.description}</p>
                </div>
                <div className="space-y-2 pt-2">
                  <button className="w-full flex items-center gap-3 p-3 bg-white border border-gray-200 shadow-sm rounded-xl transition hover:bg-gray-50 text-[13px] text-gray-800">
                    <Link2 size={18} className="text-[#527DA3]" />
                    <span className="flex-1 text-right">لینک دعوت بستر</span>
                    <Copy size={16} className="text-gray-400" />
                  </button>
                  <button className="w-full flex items-center gap-3 p-3 bg-white border border-gray-200 shadow-sm rounded-xl transition hover:bg-gray-50 text-[13px] text-red-500">
                    <LogOut size={18} />
                    <span className="flex-1 text-right">خروج از بستر</span>
                  </button>
                </div>

                <div className="pt-5 space-y-5 border-t border-gray-200 mt-5">
                  <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-50">
                    <p className="text-[14px] text-gray-800 leading-relaxed mb-4 text-justify font-bold">{platform.heroText}</p>
                    <div className="flex items-center justify-center gap-2 text-[12px] font-bold text-[#527DA3] bg-white py-3 px-4 rounded-xl border border-gray-200 shadow-sm">
                      <span>{platform.leftSide}</span>
                      <span className="opacity-40 mx-2 text-lg">⟷</span>
                      <span>{platform.rightSide}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[13px] font-bold text-gray-600 mb-2.5 flex items-center gap-1.5">
                      <Sparkles size={16} /> تسهیل‌گرهای بستر
                    </h3>
                    <div className="space-y-2.5">
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition">
                        <button
                          onClick={() => setOpenAccordion(openAccordion === 'card' ? null : 'card')}
                          className="w-full p-3 flex items-center justify-between text-[13px] font-bold text-gray-800"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg">
                              <Copy size={16} />
                            </div>{' '}
                            شماره کارت صندوق تعاون
                          </div>
                          <ChevronDown size={18} className={`transform transition text-gray-400 ${openAccordion === 'card' ? 'rotate-180' : ''}`} />
                        </button>
                        {openAccordion === 'card' && (
                          <div className="p-3 bg-gray-50 border-t border-gray-200 flex flex-col gap-2.5 text-[12px] animate-in fade-in slide-in-from-top-2">
                            <div className="flex justify-between items-center bg-white border border-gray-200 p-2.5 rounded-xl shadow-sm">
                              <span className="font-mono text-[15px] text-gray-800 tracking-widest font-bold pl-2" dir="ltr">
                                ۶۰۳۷-۹۹۸۱-۴۳۲۱-۸۷۶۵
                              </span>
                              <button
                                onClick={handleCopyCard}
                                className={`p-2 rounded-lg transition flex items-center gap-1.5 ${
                                  copiedCard ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-[#527DA3] hover:bg-blue-100'
                                }`}
                              >
                                {copiedCard ? <Check size={16} /> : <Copy size={16} />}
                                {copiedCard && <span className="text-[10px] font-bold">کپی شد</span>}
                              </button>
                            </div>
                            <div className="text-gray-600 px-1 font-medium flex items-center gap-1.5">
                              <User size={14} className="text-gray-400" /> صاحب حساب: {platform.creator.replace('@', '')} (خادم بستر)
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition">
                        <button
                          onClick={() => setOpenAccordion(openAccordion === 'tut' ? null : 'tut')}
                          className="w-full p-3 flex items-center justify-between text-[13px] font-bold text-gray-800"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="bg-green-100 text-green-600 p-1.5 rounded-lg">
                              <PlayCircle size={16} />
                            </div>{' '}
                            راهنمای مشارکت امن
                          </div>
                          <ChevronDown size={18} className={`transform transition text-gray-400 ${openAccordion === 'tut' ? 'rotate-180' : ''}`} />
                        </button>
                        {openAccordion === 'tut' && (
                          <div className="p-3 bg-gray-50 border-t border-gray-200 text-[12px] text-gray-700 leading-relaxed font-medium animate-in fade-in slide-in-from-top-2">
                            برای امانت دادن یا تحویل وسایل، حتماً شماره تماس دریافت کنید و قرار را در محل‌های عمومی مثل مسجد محله بگذارید.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#1f2937] text-gray-300 p-5 rounded-2xl border-t-[4px] border-[#527DA3] shadow-md mt-2">
                    <h4 className="text-[14px] font-bold text-white mb-3">میثاق‌نامه بستر</h4>
                    <ul className="text-[12px] leading-loose opacity-90 space-y-1.5 list-disc list-inside">
                      <li>حفظ آبروی مومن خط قرمز ماست.</li>
                      <li>پیام‌های تبلیغاتی و نامرتبط ارسال نشود.</li>
                      <li>مبنای کار اخوت و برادری است.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isCreator && bioTab === 'dev' && (
            <div className="p-4 space-y-5 animate-in fade-in flex flex-col h-full pb-[100px]">
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 shrink-0">
                <h4 className="text-[14px] font-bold text-[#527DA3] mb-3 flex items-center gap-1.5">
                  <Sparkles size={16} /> موتور تعاون (بروزرسانی بستر)
                </h4>
                <div className="relative shadow-sm">
                  <input
                    type="text"
                    placeholder="به هوش مصنوعی بگویید چه چیزی را تغییر دهد..."
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl py-3 pr-4 pl-12 text-[13px] focus:outline-none focus:border-[#527DA3] focus:bg-white transition"
                  />
                  <button className="absolute left-2 top-1/2 -translate-y-1/2 bg-[#527DA3] hover:bg-blue-700 text-white p-2 rounded-lg transition">
                    <ArrowRight size={16} className="rotate-180" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <h4 className="text-[13px] font-bold text-gray-500 mb-3 px-1">تایم‌لاین نسخه‌ها</h4>
                <div className="space-y-4 relative before:absolute before:right-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-200">
                  <div className="relative pr-8">
                    <div className="absolute right-1.5 top-1.5 w-3.5 h-3.5 bg-green-500 rounded-full border-[3px] border-gray-50 shadow-sm z-10" />
                    <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[13px] font-bold text-gray-800">نسخه {platform.isDraft ? 'پیشنویس' : '۱.۱'} (فعلی)</span>
                        <span className="text-[10px] text-gray-400">همین الان</span>
                      </div>
                      <p className="text-[12px] text-gray-600 mb-2">شکل‌گیری ساختار اولیه بستر</p>
                    </div>
                  </div>
                  {!platform.isDraft && (
                    <div className="relative pr-8">
                      <div className="absolute right-1.5 top-1.5 w-3.5 h-3.5 bg-gray-300 rounded-full border-[3px] border-gray-50 z-10" />
                      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm opacity-80">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[13px] font-bold text-gray-800">نسخه ۱.۰ (پیشنویس اولیه)</span>
                          <span className="text-[10px] text-gray-400">دیروز</span>
                        </div>
                        <p className="text-[12px] text-gray-600 mb-3">ساخت توسط موتور تعاون</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

A full manual check happens in Task 16 once these are mounted inside the platform page.

- [ ] **Step 4: Commit**

```bash
git add components/platforms/CreateCardSheet.tsx components/platforms/BioModal.tsx
git commit -m "feat: port create-card sheet and platform bio modal"
```

---

### Task 15: Mini-apps and the mini-app sheet

**Files:**
- Create: `components/miniapps/LendingMiniApp.tsx`, `components/miniapps/MediaMiniApp.tsx`, `components/miniapps/TebMiniApp.tsx`, `components/miniapps/PoetryMiniApp.tsx`, `components/miniapps/DefaultMiniApp.tsx`, `components/platforms/MiniAppSheet.tsx`

**Interfaces:**
- Consumes: `useGemini` (Task 4, only in `PoetryMiniApp`/`DefaultMiniApp`), icons (Task 2), `Platform` type (Task 3)
- Produces: each mini-app takes `onTransfer: (form: { title: string; desc: string; hasImage: boolean }) => void` (`DefaultMiniApp` additionally takes `platform: Platform`). `<MiniAppSheet isOpen platform onClose onTransfer />` picks the right one by `platform.id` (1/2/6/7 get bespoke mini-apps, everything else gets `DefaultMiniApp`) — the exact routing from `index.html:2268-2272`. Task 16 (`PlatformInternal`) owns `showMiniAppSheet` and implements `onTransfer` by seeding a draft and opening `CreateCardSheet`.

Design note: in the original, every mini-app's local state (selected tool, poem draft, scan progress, etc.) is reset by a shared `useEffect` keyed on `showMiniAppSheet` (`index.html:648-677`). Here, each mini-app owns that state as its own local `useState`, and `MiniAppSheet` conditionally renders (`if (!isOpen) return null`) instead of hiding with CSS — unmounting on close and remounting fresh on reopen produces the identical reset behavior without a shared effect.

- [ ] **Step 1: Create `components/miniapps/LendingMiniApp.tsx`**

Port `renderLendingMiniApp` (`index.html:1336-1402`):

```tsx
'use client';

import { useState } from 'react';
import { Layers, Sparkles, Wrench } from '@/components/icons';

const TOOLS = [
  { id: 'drill', name: 'دریل شارژی رونیکس', icon: Wrench, category: 'ابزار برقی' },
  { id: 'ladder', name: 'نردبان دوطرفه ۴ متری', icon: Layers, category: 'تجهیزات عمومی' },
  { id: 'welder', name: 'دستگاه جوش اینورتر', icon: Sparkles, category: 'ابزار برقی' },
  { id: 'saw', name: 'اره برقی درخت‌بری', icon: Wrench, category: 'ابزار باغبان' },
  { id: 'mower', name: 'چمن‌زن دستی حیاط', icon: Sparkles, category: 'ابزار باغبان' },
];

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

export function LendingMiniApp({ onTransfer }: { onTransfer: (form: NewCardForm) => void }) {
  const [selectedTool, setSelectedTool] = useState<(typeof TOOLS)[number] | null>(null);
  const [days, setDays] = useState(2);
  const [agreed, setAgreed] = useState(false);

  const transferToolToForm = () => {
    if (!selectedTool || !agreed) return;
    const text = `🔧 درخواست امانت ابزار: ${selectedTool.name} (${selectedTool.category})\n📅 مدت زمان نیاز: ${days} روز\n🤝 تعهدنامه امانتداری امضا شد: متعهد می‌شوم ابزار را سالم، تمیز و راس موعد بازگردانم.`;
    onTransfer({ title: `امانت ${selectedTool.name}`, desc: text, hasImage: false });
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-2xl text-[13px] leading-relaxed text-gray-700">
        دستگاه یا ابزار مورد نیاز خود را انتخاب کنید، مدت زمان و تعهدنامه را پر کنید تا کارت رزرو شما آماده شود.
      </div>
      <div>
        <label className="text-[12px] font-bold text-[#527DA3] block mb-2 mr-1">ابزارهای قابل رزرو محله:</label>
        <div className="grid grid-cols-2 gap-2.5">
          {TOOLS.map((t) => {
            const ToolIcon = t.icon;
            return (
              <div
                key={t.id}
                onClick={() => setSelectedTool(t)}
                className={`p-3 rounded-2xl border text-right cursor-pointer transition-all ${
                  selectedTool?.id === t.id ? 'border-[#527DA3] bg-blue-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                }`}
              >
                <div className="w-9 h-9 bg-white shadow-sm rounded-xl flex items-center justify-center text-[#527DA3] mb-2">
                  <ToolIcon size={18} />
                </div>
                <div className="text-[12px] font-bold text-gray-800">{t.name}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{t.category}</div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedTool && (
        <div className="space-y-3 animate-in fade-in">
          <div className="bg-gray-50 border border-gray-150 p-3.5 rounded-2xl flex items-center justify-between">
            <span className="text-[12px] font-bold text-gray-700">مدت زمان امانت (روز):</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDays((d) => Math.max(1, d - 1))}
                className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 font-bold hover:bg-gray-100"
              >
                -
              </button>
              <span className="text-[14px] font-bold text-gray-800">{days} روز</span>
              <button
                onClick={() => setDays((d) => d + 1)}
                className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 font-bold hover:bg-gray-100"
              >
                +
              </button>
            </div>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50/60 border border-amber-100/50 cursor-pointer select-none">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
            <span className="text-[11px] text-amber-800 leading-normal font-bold">
              تعهدنامه اخلاقی: متعهد می‌شوم ابزار را تمیز، بدون آسیب و در موعد مقرر به انبار امانات عودت دهم.
            </span>
          </label>

          <button
            onClick={transferToolToForm}
            disabled={!agreed}
            className={`w-full py-3.5 rounded-xl font-bold text-[15px] shadow-sm transition active:scale-[0.98] mt-3 ${
              agreed ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 pointer-events-none'
            }`}
          >
            انتقال به فرم ثبت کارت
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/miniapps/MediaMiniApp.tsx`**

Port `renderMediaMiniApp` (`index.html:1405-1479`):

```tsx
'use client';

import { useState } from 'react';

const PROJ_TYPES = ['تدوین ویدیو کوتاه', 'طراحی کاور و گرافیک', 'نویسندگی و سناریو', 'تولید پادکست تربیتی'];

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

export function MediaMiniApp({ onTransfer }: { onTransfer: (form: NewCardForm) => void }) {
  const [projType, setProjType] = useState(PROJ_TYPES[0]);
  const [projDesc, setProjDesc] = useState('');
  const [projDeadline, setProjDeadline] = useState('۳ روز آینده');
  const [projReward, setProjReward] = useState('دعای خیر و کار داوطلبانه متقابل');

  const transferMediaToForm = () => {
    if (!projDesc.trim()) return;
    const text = `🎬 بریف پروژه رسانه‌ای مادران:\n🔹 نوع کار: ${projType}\n🎯 شرح کار و اهداف: ${projDesc}\n⏳ مهلت تحویل پروژه: ${projDeadline}\n🎁 نحوه جبران زحمات همیاران: ${projReward}`;
    onTransfer({ title: `پروژه ${projType}`, desc: text, hasImage: false });
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-2xl text-[13px] leading-relaxed text-gray-700">
        با وارد کردن مشخصات زیر، بریف پروژه خود را جهت جذب تدوین‌گر یا طراح رسانه‌ای در بستر منتشر کنید.
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[12px] font-bold text-[#527DA3] block mb-1.5 mr-1">نوع تخصص مورد نیاز:</label>
          <div className="grid grid-cols-2 gap-2">
            {PROJ_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setProjType(t)}
                className={`py-2 px-3 text-[12px] font-bold rounded-xl border transition ${
                  projType === t ? 'border-[#527DA3] bg-blue-50 text-[#527DA3]' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[12px] font-bold text-[#527DA3] mr-1">شرح کار، موضوع و سناریو:</label>
          <textarea
            value={projDesc}
            onChange={(e) => setProjDesc(e.target.value)}
            placeholder="مثلاً: راش‌های ویدیویی کلاس استاد را در ۵ دقیقه تدوین و زیرنویس کنید..."
            className="w-full bg-gray-50 border border-gray-205 rounded-xl px-3 py-2 text-[13px] min-h-[80px] focus:outline-none focus:border-[#527DA3] focus:bg-white transition leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-bold text-[#527DA3] mr-1">مهلت تحویل پروژه:</label>
            <input
              type="text"
              value={projDeadline}
              onChange={(e) => setProjDeadline(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#527DA3] focus:bg-white transition"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-bold text-[#527DA3] mr-1">نحوه جبران زحمات:</label>
            <input
              type="text"
              value={projReward}
              onChange={(e) => setProjReward(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#527DA3] focus:bg-white transition"
            />
          </div>
        </div>

        <button
          onClick={transferMediaToForm}
          disabled={!projDesc.trim()}
          className={`w-full py-3.5 rounded-xl font-bold text-[15px] shadow-md transition active:scale-[0.98] mt-3 ${
            projDesc.trim() ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 pointer-events-none'
          }`}
        >
          ایجاد بریف پروژه و انتقال
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/miniapps/TebMiniApp.tsx`**

Port `renderTebMiniApp` (`index.html:1482-1580`):

```tsx
'use client';

import { useState } from 'react';

interface Diagnosis {
  name: string;
  severity: number;
  region: string;
  detail: string;
}

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

const DIAGNOSES: Diagnosis[] = [
  { name: 'کبد چرب', severity: 75, region: 'بخش میانی (طحال و معده)', detail: 'غلبه شدید صفرا و بلغم، تجمع سموم در کبد' },
  { name: 'سنگ کلیه چپ', severity: 15, region: 'بخش انتهایی (کلیه چپ)', detail: 'مستعد رسوب سودا در کلیه' },
  { name: 'غلبه سردی و تری (بلغم)', severity: 60, region: 'کل زبان (پوشش سفید)', detail: 'غلبه رطوبت بدنی و سردی گوارش' },
];

export function TebMiniApp({ onTransfer }: { onTransfer: (form: NewCardForm) => void }) {
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleStartScan = () => {
    setScanState('scanning');
    setTimeout(() => setScanState('done'), 3000);
  };

  const transferTebToForm = () => {
    if (selectedIndex === null) return;
    const diag = DIAGNOSES[selectedIndex];
    const text = `📋 گزارش غربالگری زبان طب سنتی:\n⚠️ عارضه بررسی شده: ${diag.name} با شدت ${diag.severity}٪\n🎯 موقعیت زبان: ${diag.region}\n💬 تحلیل اولیه: ${diag.detail}\n\n❓ درخواست مشاوره: از اساتید، طبیبان و اطباء گرامی طب سنتی تقاضا دارم جهت برطرف نمودن این عارضه، اصلاح تغذیه، دستور پخت یا نسخه‌های سنتی بنده را راهنمایی فرمایند.`;
    onTransfer({ title: `مشاوره عارضه ${diag.name}`, desc: text, hasImage: false });
  };

  return (
    <div className="space-y-4">
      {scanState === 'idle' && (
        <div className="flex flex-col items-center justify-center p-6 bg-gray-50 border border-dashed border-gray-300 rounded-2xl gap-4">
          <div className="w-24 h-24 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-16 h-16 fill-red-400 opacity-60">
              <path d="M50,10 C20,10 10,40 10,70 C10,90 30,95 50,95 C70,95 90,90 90,70 C90,40 80,10 50,10 Z M50,90 C35,90 20,85 20,70 C20,45 35,20 50,20 C65,20 80,45 80,70 C80,85 65,90 50,90 Z" />
            </svg>
          </div>
          <div className="text-center">
            <h4 className="font-bold text-gray-800 text-[14px]">بارگذاری عکس زبان</h4>
            <p className="text-[11px] text-gray-500 mt-1 leading-normal max-w-[240px]">
              تصویر زبان را در نور طبیعی اتاق و بدون زردی دوربین بگیرید تا چارت‌های تشخیصی مشخص شوند.
            </p>
          </div>
          <button
            onClick={handleStartScan}
            className="bg-[#527DA3] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-[13px] shadow transition active:scale-[0.98]"
          >
            شروع اسکن هوشمند زبان
          </button>
        </div>
      )}

      {scanState === 'scanning' && (
        <div className="flex flex-col items-center justify-center p-8 bg-blue-50/30 border border-blue-100 rounded-2xl gap-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#527DA3]/10 to-transparent animate-[pulse_1.5s_infinite] pointer-events-none" />
          <div className="w-24 h-24 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center relative overflow-hidden">
            <svg viewBox="0 0 100 100" className="w-16 h-16 fill-red-400">
              <path d="M50,10 C20,10 10,40 10,70 C10,90 30,95 50,95 C70,95 90,90 90,70 C90,40 80,10 50,10 Z M50,90 C35,90 20,85 20,70 C20,45 35,20 50,20 C65,20 80,45 80,70 C80,85 65,90 50,90 Z" />
            </svg>
            <div className="absolute left-0 right-0 h-1 bg-blue-500 top-0 animate-[bounce_2s_infinite]" />
          </div>
          <div className="text-center z-10">
            <h4 className="font-bold text-blue-900 text-[14px]">در حال تجزیه و تحلیل عکس زبان توسط هوش مصنوعی...</h4>
            <p className="text-[11px] text-blue-600 mt-1">بررسی بار زبان، رنگ لبه‌ها، علائم سودا و بلغم اندام‌ها</p>
          </div>
          <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#527DA3] h-full w-[70%]" />
          </div>
        </div>
      )}

      {scanState === 'done' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-green-50 border border-green-100 p-3 rounded-2xl text-[12px] text-green-800 font-medium leading-relaxed">
            🎉 <strong>اسکن با موفقیت به پایان رسید.</strong> عارضه‌های تشخیص داده شده در زیر آمده است. برای ارسال به بستر،{' '}
            <strong>روی یکی از موارد ضربه بزنید</strong> تا جزئیات و درمان آن را با اساتید به اشتراک بگذارید.
          </div>

          <div className="space-y-2.5">
            {DIAGNOSES.map((d, index) => (
              <div
                key={index}
                onClick={() => setSelectedIndex(index)}
                className={`p-3.5 rounded-2xl border text-right transition cursor-pointer ${
                  selectedIndex === index ? 'border-green-500 bg-green-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-gray-800 text-[13px]">{d.name}</span>
                  <span className="text-[12px] font-bold text-red-600">{d.severity}٪ احتمال</span>
                </div>
                <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden mb-2">
                  <div className="bg-red-500 h-full rounded-full" style={{ width: `${d.severity}%` }} />
                </div>
                <div className="text-[11px] text-gray-500 flex justify-between">
                  <span>موقعیت: {d.region}</span>
                  <span className="underline text-green-700">کلیک برای انتخاب عارضه</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-100 p-3.5 rounded-2xl text-[11px] leading-relaxed text-amber-800">
            ⚠️ <strong>سلب مسئولیت پزشکی:</strong> این اسکن صرفاً یک شبیه‌سازی آموزشی بر اساس کانتکست طب سنتی است و نباید برای خوددرمانی
            استفاده شود. حتماً عارضه را در بستر با اطباء مطرح کنید و حضوری به طبیب مراجعه نمایید.
          </div>

          <button
            onClick={transferTebToForm}
            disabled={selectedIndex === null}
            className={`w-full py-3.5 rounded-xl font-bold text-[15px] shadow-sm transition active:scale-[0.98] ${
              selectedIndex !== null ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 pointer-events-none'
            }`}
          >
            {selectedIndex !== null ? `اشتراک‌گذاری و مشورت درباره «${DIAGNOSES[selectedIndex].name}»` : 'یک عارضه را برای مشورت کلیک کنید'}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `components/miniapps/PoetryMiniApp.tsx`**

Port `renderPoetryMiniApp` (`index.html:1583-1740`), swapping `callGeminiAPI` for `useGemini().generate`:

```tsx
'use client';

import { useState } from 'react';
import { Sparkles } from '@/components/icons';
import { useGemini } from '@/hooks/useGemini';

const POETRY_STYLES = ['غزل', 'قصیده', 'مثنوی', 'دوبیتی'];

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

export function PoetryMiniApp({ onTransfer }: { onTransfer: (form: NewCardForm) => void }) {
  const { generate } = useGemini();
  const [hemistichs, setHemistichs] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState(POETRY_STYLES[0]);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGeneratePoem = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    try {
      const sysPrompt = `تو استاد شعر و غزل‌سرای بزرگ فارسی هستی. کاربر یک موضوع و قالب از تو می‌خواهد.
باید دقیقا یک شعر با ۴ مصرع (۲ بیت) به زبان فارسی بسرایی.
بین هر مصرع باید علامت پایپ (|) قرار دهی.
خروجی فقط و فقط باید به این صورت باشد و هیچ توضیح، سلام، خداحافظی یا حاشیه‌ای نداشته باشد.
مثال:
توانا بود هر که دانا بود|ز دانش دل پیر برنا بود|به دانش فزای و به یزدان گرای|که او باد جان تو را رهنمای`;
      const userPrompt = `شعر در قالب ${style} با موضوع: ${prompt}`;
      const rawText = await generate(userPrompt, sysPrompt);

      const parts = rawText.split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        setHemistichs(parts);
      } else {
        const splitLines = rawText.split('\n').map((s) => s.trim()).filter((s) => s.length > 3);
        setHemistichs(splitLines);
      }
    } catch {
      setError('سرودن شعر با خطا مواجه شد. دوباره تلاش کنید.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateHemistich = async (index: number) => {
    setLoadingIndex(index);
    try {
      const context = hemistichs.map((h, i) => (i === index ? '[مصرع مورد نظر برای بازسازی]' : h)).join('\n');
      const sysPrompt = `تو استاد شعر هستی. در شعر زیر (قالب: ${style}، موضوع: ${prompt})، مصرع شماره ${index + 1} را دوباره بساز به گونه‌ای که با مصرع‌های دیگر از نظر وزن و قافیه کاملاً هماهنگ باشد.
فقط و فقط مصرع جدید را بنویس، بدون هیچ بخش یا متن اضافی. هیچ علامتی مانند دونقطه یا پرانتز در جواب اضافه نکن.`;
      const userPrompt = `شعر فعلی:\n${context}\n\nلطفاً فقط مصرع شماره ${index + 1} را بازسازی کن و آن را بفرست.`;
      const result = await generate(userPrompt, sysPrompt);
      const newHemistichs = [...hemistichs];
      newHemistichs[index] = result.trim().replace(/"/g, '').replace(/مصرع \d+:/g, '').trim();
      setHemistichs(newHemistichs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingIndex(null);
    }
  };

  const handleHemistichChange = (index: number, value: string) => {
    const newHemistichs = [...hemistichs];
    newHemistichs[index] = value;
    setHemistichs(newHemistichs);
  };

  const transferPoemToForm = () => {
    if (hemistichs.length === 0) return;
    let formattedPoem = `📜 سروده جدید در قالب ${style} با موضوع ${prompt}:\n\n`;
    for (let i = 0; i < hemistichs.length; i += 2) {
      const m1 = hemistichs[i] || '...';
      const m2 = hemistichs[i + 1] || '...';
      formattedPoem += `🔸 ${m1}  /  ${m2}\n`;
    }
    formattedPoem += `\n✍️ اثری مشترک از شاعر و همیار هوشمند شعر محله.`;
    onTransfer({ title: `سروده ${style} در وصف ${prompt.substring(0, 15)}`, desc: formattedPoem, hasImage: false });
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-2xl text-[13px] leading-relaxed text-gray-700">
        موضوع یا بیت اول را بنویسید تا همیار شعر، ابیاتی موزون بسازد. سپس می‌توانید مصرع‌ها را دستی ویرایش کرده یا هر مصرع را جداگانه ریجنریت کنید.
      </div>

      {hemistichs.length === 0 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {POETRY_STYLES.map((s) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={`py-2 text-[12px] font-bold rounded-xl border transition ${
                  style === s ? 'border-[#527DA3] bg-blue-50 text-[#527DA3]' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-bold text-[#527DA3] mr-1">موضوع شعر یا مصرع اول برای الهام:</label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="مثلاً: در وصف فداکاری آتش‌نشانان یا یا امام رضا..."
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#527DA3] focus:bg-white transition"
            />
          </div>

          <button
            onClick={handleGeneratePoem}
            disabled={loading || !prompt.trim()}
            className={`w-full py-3 rounded-xl font-bold text-[14px] transition flex items-center justify-center gap-2 ${
              prompt.trim() && !loading ? 'bg-[#527DA3] text-white shadow active:scale-[0.98]' : 'bg-gray-100 text-gray-400 pointer-events-none'
            }`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                <span>در حال سرودن شعر هوشمند...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>سرودن ابیات</span>
              </>
            )}
          </button>
          {error && <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-[12px] font-bold">⚠️ {error}</div>}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3.5 max-h-[300px] overflow-y-auto">
            {hemistichs.map((h, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-[#527DA3] w-6 text-center">{index + 1}.</span>
                <input
                  type="text"
                  value={h}
                  onChange={(e) => handleHemistichChange(index, e.target.value)}
                  className="flex-1 bg-white border border-gray-150 rounded-xl px-2.5 py-1.5 text-[13px] text-gray-800 focus:outline-none focus:border-[#527DA3]"
                />
                <button
                  onClick={() => handleRegenerateHemistich(index)}
                  disabled={loadingIndex !== null}
                  className={`p-1.5 rounded-full hover:bg-blue-50 border border-gray-200 transition ${
                    loadingIndex === index ? 'bg-blue-100' : 'bg-white text-gray-500'
                  }`}
                  title="بازسازی این مصرع با هوش مصنوعی"
                >
                  {loadingIndex === index ? (
                    <div className="w-4 h-4 border-2 border-[#527DA3] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.56-.56" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setHemistichs([])}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3.5 rounded-xl text-[14px] transition active:scale-[0.98]"
            >
              شعر جدید
            </button>
            <button
              onClick={transferPoemToForm}
              className="flex-[2] bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl text-[14px] shadow-sm transition active:scale-[0.98]"
            >
              تایید و انتقال شعر
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `components/miniapps/DefaultMiniApp.tsx`**

Port `renderDefaultMiniApp` (`index.html:1743-1831`), swapping `callGeminiAPI` for `useGemini().generate`:

```tsx
'use client';

import { useState } from 'react';
import { ArrowRight, Sparkles } from '@/components/icons';
import { useGemini } from '@/hooks/useGemini';
import type { Platform } from '@/lib/types';

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

export function DefaultMiniApp({ platform, onTransfer }: { platform: Platform; onTransfer: (form: NewCardForm) => void }) {
  const { generate } = useGemini();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setOutput('');
    try {
      const systemPrompt = platform.miniappConfig?.systemInstruction || 'متن ورودی کاربر را ویرایش و به شکل زیبایی فرمت کن.';
      const resultText = await generate(input, systemPrompt);
      setOutput(resultText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در برقراری ارتباط با جمینای.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50/50 border border-blue-100/50 p-3.5 rounded-2xl text-[13px] leading-relaxed text-gray-700 shadow-sm flex items-start gap-2.5">
        <Sparkles size={18} className="text-[#527DA3] shrink-0 mt-0.5" />
        <span>
          به دستیار هوش مصنوعی بستر <strong>«{platform.name}»</strong> خوش آمدید. ایده یا نیازمندی خود را بنویسید تا هوش مصنوعی متن کارت
          شما را به صورت حرفه‌ای تنظیم کند.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-bold text-[#527DA3] mr-1">توضیح کوتاه یا ایده شما:</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={platform.miniappConfig?.placeholder || 'ایده خود را بنویسید...'}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] min-h-[90px] resize-none focus:outline-none focus:border-[#527DA3] focus:bg-white transition"
          rows={3}
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !input.trim()}
        className={`w-full py-3 rounded-xl font-bold text-[14px] transition-all flex items-center justify-center gap-2 ${
          input.trim() && !loading ? 'bg-[#527DA3] text-white shadow-md active:scale-[0.98]' : 'bg-gray-100 text-gray-400 pointer-events-none'
        }`}
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span>در حال تولید محتوا توسط جمینای...</span>
          </>
        ) : (
          <>
            <Sparkles size={16} />
            <span>تولید هوشمند محتوا</span>
          </>
        )}
      </button>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-[12px] font-bold">⚠️ {error}</div>}

      {output && (
        <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <label className="text-[12px] font-bold text-green-700 mr-1">پیش‌نویس تولید شده (قابل ویرایش):</label>
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            className="w-full bg-green-50/20 border border-green-200 rounded-xl px-3 py-2.5 text-[14px] min-h-[160px] resize-none focus:outline-none focus:border-green-500 focus:bg-white transition leading-relaxed text-gray-800"
            rows={6}
          />
        </div>
      )}

      <button
        onClick={() => {
          if (output.trim()) onTransfer({ title: '', desc: output, hasImage: false });
        }}
        disabled={!output.trim()}
        className={`w-full py-3.5 rounded-xl font-bold text-[15px] shadow-md transition-transform active:scale-[0.98] flex items-center justify-center gap-2 mt-auto ${
          output.trim() ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 pointer-events-none'
        }`}
      >
        <span>انتقال به فرم ثبت کارت</span>
        <ArrowRight size={18} className="rtl:-scale-x-100" />
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Create `components/platforms/MiniAppSheet.tsx`**

Port the mini-app-sheet wrapper (`index.html:2250-2276`):

```tsx
'use client';

import { Sparkles, X } from '@/components/icons';
import type { Platform } from '@/lib/types';
import { LendingMiniApp } from '@/components/miniapps/LendingMiniApp';
import { MediaMiniApp } from '@/components/miniapps/MediaMiniApp';
import { TebMiniApp } from '@/components/miniapps/TebMiniApp';
import { PoetryMiniApp } from '@/components/miniapps/PoetryMiniApp';
import { DefaultMiniApp } from '@/components/miniapps/DefaultMiniApp';

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

export function MiniAppSheet({
  isOpen,
  platform,
  onClose,
  onTransfer,
}: {
  isOpen: boolean;
  platform: Platform;
  onClose: () => void;
  onTransfer: (form: NewCardForm) => void;
}) {
  if (!isOpen) return null;
  const PlatformIcon = platform.icon || Sparkles;

  return (
    <>
      <div className="absolute inset-0 bg-black/60 z-40 animate-in fade-in duration-200" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 flex flex-col h-[85vh] animate-in slide-in-from-bottom-full duration-300 overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-[#527DA3]">
              <PlatformIcon size={16} />
            </div>
            <div>
              <h3 className="font-bold text-[14px] text-gray-900">{platform.miniappConfig?.title || `ابزار پیشرفته ${platform.name}`}</h3>
              <p className="text-[10px] text-gray-500">مینی‌اپ متصل به جمینای</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-white p-5 flex flex-col gap-4 text-right">
          {platform.id === 1 && <LendingMiniApp onTransfer={onTransfer} />}
          {platform.id === 2 && <MediaMiniApp onTransfer={onTransfer} />}
          {platform.id === 6 && <PoetryMiniApp onTransfer={onTransfer} />}
          {platform.id === 7 && <TebMiniApp onTransfer={onTransfer} />}
          {![1, 2, 6, 7].includes(platform.id) && <DefaultMiniApp platform={platform} onTransfer={onTransfer} />}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 7: Verify it compiles**

```bash
npx tsc --noEmit
```

A full manual check happens in Task 16 once `MiniAppSheet` is mounted inside the platform page.

- [ ] **Step 8: Commit**

```bash
git add components/miniapps components/platforms/MiniAppSheet.tsx
git commit -m "feat: port the four bespoke mini-apps, the default mini-app, and the mini-app sheet"
```

---

### Task 16: Card detail view, platform internal, and the platform route

**Files:**
- Create: `components/platforms/CardDetailView.tsx`, `components/platforms/PlatformInternal.tsx`
- Create: `app/platforms/[platformId]/page.tsx`

**Interfaces:**
- Consumes: `usePlatforms` (Task 6), `CardTemplate`/`CreateCardSheet`/`BioModal`/`MiniAppSheet` (Tasks 13–15), `CURRENT_USER` (Task 3)
- Produces: `<CardDetailView platform card fromComments onClose />` (the `RulesModal` from `index.html:2437-2481` lives inside this file as local JSX + local state, since it is only ever opened from here). `<PlatformInternal platform={Platform} />`, mounted by `app/platforms/[platformId]/page.tsx`.

Routing note: the original's `handleCommentClick` (`index.html:1019-1030`) jumps straight from the comments tab into a specific card, and its close button then skips back past the platform's explore view straight to the comments tab (`index.html:1841-1843`). This plan reproduces that with a `?from=comments&card=<id>` query string: Task 17's `GlobalComments` navigates to `/platforms/<id>?card=<cardId>&from=comments`, this page reads those params once on mount to open the right card, and the card's back button routes straight to `/comments` when `from=comments` was present instead of just closing the card locally. A draft item instead navigates to `/platforms/<id>?draft=1`, which auto-opens the create-card sheet (which itself reads the saved draft, per Task 14).

- [ ] **Step 1: Create `components/platforms/CardDetailView.tsx`**

Port `renderCardDetailView` (`index.html:1833-2011`), `handleCommentScroll` (`index.html:1011-1017`), and `renderRulesModal` (`index.html:2437-2481`):

```tsx
'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCheck, ImageIcon, MessageCircle, Reply, Send, X } from '@/components/icons';
import { usePlatforms } from '@/hooks/usePlatforms';
import { CURRENT_USER } from '@/lib/data/seed';
import type { Card, Comment, Platform } from '@/lib/types';

export function CardDetailView({
  platform,
  card,
  fromComments,
  onClose,
}: {
  platform: Platform;
  card: Card;
  fromComments: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { sendComment, requestCard, approveCard, cancelRequest } = usePlatforms();

  const [isCardCollapsed, setIsCardCollapsed] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ sender: string; text: string } | null>(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const commentScrollRef = useRef<HTMLDivElement>(null);

  const handleBack = () => {
    if (fromComments) {
      router.push('/comments');
    } else {
      onClose();
    }
  };

  const handleCommentScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 40) {
      if (!isCardCollapsed) setIsCardCollapsed(true);
    } else if (isCardCollapsed) {
      setIsCardCollapsed(false);
    }
  };

  const handleSendComment = () => {
    sendComment(platform.id, card.id, commentInput, CURRENT_USER.name, replyingTo);
    setCommentInput('');
    setReplyingTo(null);
  };

  const handleApprove = () => approveCard(platform.id, card.id, CURRENT_USER.name);
  const handleCancel = () => cancelRequest(platform.id, card.id, CURRENT_USER.name);
  const handleSubmitRequest = () => {
    requestCard(platform.id, card.id, CURRENT_USER.name, platform.actionLabel || '');
    setShowRulesModal(false);
    setRulesAccepted(false);
  };

  return (
    <div className="absolute inset-0 bg-[#E4DDD6] z-40 flex flex-col animate-in slide-in-from-right-full duration-200">
      <div className="bg-white text-gray-800 px-2 py-1.5 flex justify-between items-center shadow-sm shrink-0 z-20 relative h-[52px]">
        <button onClick={handleBack} className="flex items-center gap-1.5 p-1.5 hover:bg-gray-100 rounded-xl transition text-gray-800">
          <ArrowRight size={22} className="text-gray-600" />
          <span className="font-bold text-[15px] pr-1">{fromComments ? 'مشارکت‌ها' : 'بازگشت'}</span>
        </button>

        {fromComments && (
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-[#527DA3] px-3 py-1.5 rounded-full transition max-w-[140px]"
          >
            <span className="text-[12px] font-bold truncate">{platform.name}</span>
            <ArrowRight size={14} className="shrink-0 rotate-180" />
          </button>
        )}
      </div>

      <div
        className={`bg-white border-t border-gray-100 shadow-sm px-4 shrink-0 z-10 border-r-4 border-r-amber-400 transition-all duration-300 overflow-hidden ${
          isCardCollapsed ? 'py-2 max-h-[44px] cursor-pointer hover:bg-amber-50/50' : 'py-3 max-h-[300px]'
        }`}
        onClick={() => isCardCollapsed && commentScrollRef.current && (commentScrollRef.current.scrollTop = 0)}
      >
        <div className="flex justify-between items-start mb-1.5">
          <h3
            className={`font-bold text-gray-900 transition-all duration-300 ${
              isCardCollapsed ? 'text-[14px] truncate leading-tight' : 'text-[15px] leading-snug'
            }`}
          >
            {card.title}
          </h3>
          {!isCardCollapsed && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 shrink-0">
              <span className="font-bold text-gray-600">{card.author}</span>
              <span>•</span>
              <span>{card.time}</span>
            </div>
          )}
        </div>
        <div className={`transition-all duration-300 ${isCardCollapsed ? 'opacity-0 h-0 pointer-events-none m-0' : 'opacity-100 h-auto'}`}>
          <p className="text-[13px] text-gray-700 leading-relaxed mb-2">{card.desc}</p>
          {card.hasImage && (
            <div className="w-full h-20 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200 mb-2">
              <ImageIcon size={20} className="text-gray-400" />
            </div>
          )}
        </div>
      </div>

      {card.author === CURRENT_USER.name && card.status === 'pending' && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex items-center justify-between shrink-0 shadow-sm z-10 relative">
          <div className="text-[12px] text-amber-800 font-bold flex-1">{card.requester || 'یک نفر'} درخواست داده است.</div>
          <button onClick={handleApprove} className="bg-[#527DA3] hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-[12px] font-bold transition whitespace-nowrap shadow-sm">
            تایید و تحویل
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={commentScrollRef} onScroll={handleCommentScroll}>
        {card.comments.length === 0 ? (
          <div className="flex justify-center mt-10">
            <span className="bg-[#748EA5]/40 text-white text-[11px] px-3 py-1.5 rounded-full backdrop-blur-sm text-center">
              بسم‌الله! اولین نفری باشید که گره رو باز می‌کنه.
            </span>
          </div>
        ) : (
          card.comments.map((comment: Comment) => {
            if (comment.isSystem) {
              return (
                <div key={comment.id} className="flex justify-center my-2">
                  <span className="bg-[#748EA5]/10 text-[#527DA3] text-[11px] font-bold px-3 py-1.5 rounded-full text-center max-w-[85%] leading-relaxed border border-[#527DA3]/20">
                    {comment.text}
                  </span>
                </div>
              );
            }
            const isMe = comment.sender === CURRENT_USER.name;
            return (
              <div key={comment.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] p-2 px-3 pb-2 rounded-2xl text-[13px] shadow-sm relative group ${
                    isMe ? 'bg-[#EEFFDE] rounded-br-sm' : 'bg-white rounded-bl-sm'
                  }`}
                >
                  {comment.replyTo && (
                    <div className="bg-black/5 border-r-2 border-[#527DA3] pr-2 p-1.5 mb-1.5 mt-1 rounded-sm">
                      <p className="text-[10px] font-bold text-[#527DA3] mb-0.5">{comment.replyTo.sender}</p>
                      <p className="text-[11px] text-gray-600 truncate">{comment.replyTo.text}</p>
                    </div>
                  )}
                  {!isMe && <p className="text-[12px] font-bold text-[#527DA3] mt-1 mb-0.5">{comment.sender}</p>}
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className={`leading-relaxed text-gray-900 ${comment.isAction ? 'font-bold text-amber-700' : ''}`}>{comment.text}</p>
                    {comment.status && (
                      <span className="shrink-0 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-200 shadow-sm whitespace-nowrap">
                        {comment.status}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-center gap-4 mt-2 border-t border-black/5 pt-1">
                    <button
                      onClick={() => setReplyingTo({ sender: comment.sender || '', text: comment.text })}
                      className="text-[11px] text-[#527DA3] font-medium flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded transition"
                    >
                      <Reply size={14} className="rtl:-scale-x-100" /> پاسخ
                    </button>
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      {comment.time}
                      {isMe && <CheckCheck size={12} className="text-blue-500" />}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="bg-white shrink-0 flex flex-col border-t border-gray-200">
        {replyingTo && (
          <div className="bg-gray-50 flex items-center justify-between px-3 py-2 border-b border-gray-200">
            <div className="flex flex-col border-r-2 border-[#527DA3] pr-2 min-w-0">
              <span className="text-[11px] font-bold text-[#527DA3]">پاسخ به {replyingTo.sender}</span>
              <span className="text-[11px] text-gray-600 truncate max-w-[250px]">{replyingTo.text}</span>
            </div>
            <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-gray-200 rounded-full text-gray-500 transition">
              <X size={16} />
            </button>
          </div>
        )}

        {platform.actionLabel && card.author !== CURRENT_USER.name && !card.status && (
          <div className="px-3 pt-3 pb-1">
            <button
              onClick={() => {
                setShowRulesModal(true);
                setRulesAccepted(false);
              }}
              className="w-full py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[14px] font-bold rounded-xl transition border border-amber-200 shadow-sm"
            >
              {platform.actionLabel}
            </button>
          </div>
        )}

        {platform.actionLabel && card.author !== CURRENT_USER.name && card.status === 'pending' && card.requester === CURRENT_USER.name && (
          <div className="px-3 pt-3 pb-1">
            <button onClick={handleCancel} className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-500 text-[14px] font-bold rounded-xl transition border border-red-100 shadow-sm">
              لغو درخواست
            </button>
          </div>
        )}

        {card.status === 'closed' && card.author !== CURRENT_USER.name && (
          <div className="px-3 pt-3 pb-1">
            <button className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-[#527DA3] text-[14px] font-bold rounded-xl transition border border-blue-100 shadow-sm flex items-center justify-center gap-2">
              <MessageCircle size={18} /> پیام شخصی به صاحب آگهی
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 px-2 py-2">
          <input
            type="text"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
            placeholder={platform.formLabels?.commentPlaceholder || 'پاسخ یا نظر خود را بنویسید...'}
            className="flex-1 min-w-0 bg-transparent py-2 px-2 focus:outline-none text-[14px] text-gray-800"
          />
          <button onClick={handleSendComment} className={`p-2 rounded-full transition shrink-0 ${commentInput.trim() ? 'text-[#527DA3] hover:bg-blue-50' : 'text-gray-300 pointer-events-none'}`}>
            <Send size={22} className="rtl:-scale-x-100" />
          </button>
        </div>
      </div>

      {showRulesModal && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="bg-[#527DA3] p-4 flex items-center justify-between text-white shrink-0">
              <h2 className="font-medium text-[16px]">قوانین و میثاق‌نامه</h2>
              <button onClick={() => setShowRulesModal(false)} className="hover:bg-white/10 rounded-full p-1.5 transition">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 text-[13px] text-gray-700 leading-relaxed text-justify space-y-3">
              <p>برادر/خواهر گرامی، با کلیک روی دکمه، شما متعهد می‌شوید که:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>قوانین بستر را به صورت کامل مطالعه کرده‌اید.</li>
                <li>در صورت عدم نیاز، فوراً درخواست خود را لغو کنید.</li>
                <li>اخلاق و ادب را در مراودات رعایت فرمایید.</li>
              </ul>
              <label className="flex items-center gap-2 mt-4 cursor-pointer bg-gray-50 p-3 rounded-xl border border-gray-200">
                <input type="checkbox" checked={rulesAccepted} onChange={(e) => setRulesAccepted(e.target.checked)} className="w-4 h-4 rounded text-[#527DA3] focus:ring-[#527DA3]" />
                <span className="font-medium text-[13px] text-gray-800">قوانین را می‌پذیرم</span>
              </label>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-3">
              <button onClick={() => setShowRulesModal(false)} className="flex-1 py-2.5 rounded-xl font-medium text-gray-600 bg-white border border-gray-300 shadow-sm transition active:scale-95">
                انصراف
              </button>
              <button
                disabled={!rulesAccepted}
                onClick={handleSubmitRequest}
                className={`flex-1 py-2.5 rounded-xl font-bold shadow-sm transition active:scale-95 ${
                  rulesAccepted ? 'bg-[#527DA3] text-white' : 'bg-gray-200 text-gray-400 pointer-events-none'
                }`}
              >
                ثبت درخواست
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/platforms/PlatformInternal.tsx`**

Port `renderPlatformInternal` (`index.html:2150-2315`):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, FileText, Lock, Paperclip, Pin, Search, Settings, Sparkles, Users } from '@/components/icons';
import { usePlatforms } from '@/hooks/usePlatforms';
import { useUI } from '@/hooks/useUI';
import { CURRENT_USER } from '@/lib/data/seed';
import { CardTemplate } from './CardTemplate';
import { CardDetailView } from './CardDetailView';
import { CreateCardSheet } from './CreateCardSheet';
import { BioModal } from './BioModal';
import { MiniAppSheet } from './MiniAppSheet';
import type { Platform } from '@/lib/types';

export function PlatformInternal({ platform }: { platform: Platform }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { joinedPlatforms, joinPlatform, publishPlatform, saveDraft } = usePlatforms();
  const { triggerPublishToast } = useUI();

  const [platformInnerTab, setPlatformInnerTab] = useState<'explore' | 'me'>('explore');
  const [exploreSearchQuery, setExploreSearchQuery] = useState('');
  const [meSubTab, setMeSubTab] = useState<'myCards' | 'myCoops'>('myCards');
  const [showPlatformBio, setShowPlatformBio] = useState(false);
  const [bioTab, setBioTab] = useState<'info' | 'dev'>('info');
  const [activeCardId, setActiveCardId] = useState<number | null>(null);
  const [showNewCardSheet, setShowNewCardSheet] = useState(false);
  const [showMiniAppSheet, setShowMiniAppSheet] = useState(false);

  const fromComments = searchParams.get('from') === 'comments';

  useEffect(() => {
    const cardParam = searchParams.get('card');
    if (cardParam) setActiveCardId(Number(cardParam));
    if (searchParams.get('draft') === '1') setShowNewCardSheet(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPlatformCreator = platform.creator === CURRENT_USER.username;
  const curatedCards = platform.cards.filter((c) => c.isCurated);
  const myCards = platform.cards.filter((c) => c.author === CURRENT_USER.name);
  const activeCard = platform.cards.find((c) => c.id === activeCardId);
  const PlatformIcon = platform.icon;

  const handleMiniAppTransfer = (form: { title: string; desc: string; hasImage: boolean }) => {
    saveDraft(platform.id, form);
    setShowMiniAppSheet(false);
    setTimeout(() => setShowNewCardSheet(true), 300);
  };

  if (activeCard) {
    return <CardDetailView platform={platform} card={activeCard} fromComments={fromComments} onClose={() => setActiveCardId(null)} />;
  }

  return (
    <div className="absolute inset-0 bg-white z-20 flex flex-col animate-in slide-in-from-right-full duration-200">
      <div className="bg-[#527DA3] text-white px-1 py-1.5 flex items-center shadow-sm z-30 shrink-0">
        <button onClick={() => router.back()} className="p-2 hover:bg-white/10 rounded-full ml-1 transition">
          <ArrowRight size={22} />
        </button>
        <div className="flex-1 flex items-center gap-2.5 cursor-pointer p-1 rounded-lg hover:bg-white/5 transition" onClick={() => setShowPlatformBio(true)}>
          <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
            <PlatformIcon size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="font-medium text-[15px] truncate leading-tight flex items-center gap-1.5">
              {platform.name}
              {platform.isDraft && (
                <span className="flex items-center gap-0.5 text-amber-300 text-[10px] bg-white/10 px-1.5 py-0.5 rounded">
                  <Lock size={10} strokeWidth={2.5} /> پیش‌نویس
                </span>
              )}
            </h2>
            <p className="text-[11px] text-[#B0CBE1] truncate mt-0.5">{platform.members} مشارکت‌کننده</p>
          </div>
        </div>
        {isPlatformCreator && (
          <button
            onClick={() => {
              setBioTab('dev');
              setShowPlatformBio(true);
            }}
            className="p-2 hover:bg-white/10 rounded-full transition ml-1"
            title="مدیریت بستر"
          >
            <Settings size={20} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto relative bg-white pb-[72px]">
        {platformInnerTab === 'explore' && (
          <div className="flex flex-col h-full animate-in fade-in bg-[#f4f4f5]">
            <div className="bg-white p-3 shadow-sm shrink-0 sticky top-0 z-20">
              <div className="relative">
                <Search size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={exploreSearchQuery}
                  onChange={(e) => setExploreSearchQuery(e.target.value)}
                  placeholder="جستجو در بستر..."
                  className="w-full bg-gray-100 rounded-xl py-3 pr-12 pl-4 text-[14px] font-medium focus:outline-none focus:ring-2 focus:ring-[#527DA3]/30 text-gray-800 transition"
                />
              </div>
            </div>

            {curatedCards.length > 0 && !exploreSearchQuery && (
              <div
                className="bg-white border-b border-gray-100 px-3 py-2.5 flex items-center gap-3 cursor-pointer shadow-sm sticky z-10 transition hover:bg-gray-50"
                style={{ top: '64px' }}
                onClick={() => setActiveCardId(curatedCards[0].id)}
              >
                <Pin size={20} className="text-[#527DA3] shrink-0" />
                <div className="flex-1 min-w-0 border-r-2 border-[#527DA3] pr-2.5">
                  <div className="text-[11px] font-bold text-[#527DA3] mb-0.5">پست سنجاق شده</div>
                  <div className="text-[12px] text-gray-600 truncate">{curatedCards[0].desc}</div>
                </div>
              </div>
            )}

            <div className="flex-1 p-3 space-y-4 pt-4">
              {platform.cards
                .filter((c) => c.title.includes(exploreSearchQuery) || c.desc.includes(exploreSearchQuery))
                .map((c) => (
                  <CardTemplate key={c.id} card={c} onOpen={setActiveCardId} />
                ))}
            </div>
          </div>
        )}

        {platformInnerTab === 'me' && (
          <div className="animate-in fade-in flex flex-col h-full bg-[#f4f4f5]">
            <div className="bg-white p-5 shadow-sm flex items-center gap-4 shrink-0">
              <div className="w-16 h-16 bg-[#527DA3] text-white rounded-full flex items-center justify-center text-2xl font-bold shadow-sm">
                {CURRENT_USER.name.charAt(0)}
              </div>
              <div>
                <h3 className="font-bold text-[16px] text-gray-900">{CURRENT_USER.name}</h3>
                <div className="flex gap-4 mt-1.5 text-[12px] text-gray-500 font-medium">
                  <span>
                    <strong className="text-gray-800 text-[14px]">{myCards.length}</strong> کارت
                  </span>
                  <span>
                    <strong className="text-gray-800 text-[14px]">۳</strong> مشارکت
                  </span>
                </div>
              </div>
            </div>

            <div className="flex bg-white shadow-sm shrink-0 mt-2">
              <button
                onClick={() => setMeSubTab('myCards')}
                className={`flex-1 py-3.5 text-[14px] font-bold transition-colors ${
                  meSubTab === 'myCards' ? 'text-[#527DA3] border-b-[3px] border-[#527DA3]' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                کارت‌های من
              </button>
              <button
                onClick={() => setMeSubTab('myCoops')}
                className={`flex-1 py-3.5 text-[14px] font-bold transition-colors ${
                  meSubTab === 'myCoops' ? 'text-[#527DA3] border-b-[3px] border-[#527DA3]' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                تعاون‌های من
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4 pt-4">
              {meSubTab === 'myCards' ? (
                myCards.length > 0 ? (
                  myCards.map((c) => <CardTemplate key={c.id} card={c} onOpen={setActiveCardId} />)
                ) : (
                  <div className="bg-white p-8 rounded-2xl border border-dashed border-gray-300 flex flex-col items-center text-center mt-4">
                    <FileText size={40} className="text-gray-300 mb-3" />
                    <p className="text-[14px] font-medium text-gray-500 leading-relaxed">شما هنوز کارتی ثبت نکرده‌اید.</p>
                  </div>
                )
              ) : (
                <div className="bg-white p-8 rounded-2xl border border-dashed border-gray-300 flex flex-col items-center text-center mt-4">
                  <Users size={40} className="text-gray-300 mb-3" />
                  <p className="text-[14px] font-medium text-gray-500 leading-relaxed">تعاونی یافت نشد.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <CreateCardSheet isOpen={showNewCardSheet} platform={platform} onClose={() => setShowNewCardSheet(false)} />
      <BioModal
        isOpen={showPlatformBio}
        onClose={() => setShowPlatformBio(false)}
        platform={platform}
        isCreator={isPlatformCreator}
        bioTab={bioTab}
        onBioTabChange={setBioTab}
      />
      <MiniAppSheet isOpen={showMiniAppSheet} platform={platform} onClose={() => setShowMiniAppSheet(false)} onTransfer={handleMiniAppTransfer} />

      {platform.isDraft && isPlatformCreator && (
        <div className="absolute bottom-[88px] left-4 right-4 bg-[#EEFFDE] border border-green-200 p-3 flex flex-col gap-2 z-40 rounded-2xl shadow-xl">
          <div className="flex items-center justify-center gap-1.5 text-[12px] text-green-800 font-bold px-1 text-center leading-snug">
            بستر شما در حالت پیش‌نمایش است. پس از بررسی، آن را منتشر کنید.
          </div>
          <button
            onClick={() => {
              publishPlatform(platform.id);
              triggerPublishToast();
            }}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl font-bold shadow-sm transition active:scale-[0.98]"
          >
            🚀 انتشار بستر
          </button>
        </div>
      )}

      {joinedPlatforms.includes(platform.id) ? (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-[#f4f4f5] border-t border-gray-200 z-30 flex items-center gap-2 animate-in slide-in-from-bottom-full pb-safe">
          <button
            onClick={() => setShowMiniAppSheet(true)}
            className="p-2 text-[#527DA3] hover:bg-blue-100 transition rounded-full shrink-0 flex items-center justify-center relative bg-blue-50 border border-blue-100 shadow-sm"
            title="اجرای مینی‌اپ ابزار هوشمند"
          >
            <Paperclip size={22} strokeWidth={2} className="text-[#527DA3]" />
            <Sparkles size={12} className="absolute top-1 right-1 text-amber-500" />
          </button>
          <div
            className="flex-1 bg-white rounded-2xl py-3 px-4 text-[14px] text-gray-500 cursor-pointer text-right flex items-center border border-gray-300/60 shadow-sm transition hover:bg-gray-50"
            onClick={() => setShowNewCardSheet(true)}
          >
            ایجاد درخواست یا کارت جدید...
          </div>
        </div>
      ) : (
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-white border-t border-gray-200 z-30 animate-in slide-in-from-bottom-full">
          <button
            onClick={() => joinPlatform(platform.id)}
            className="w-full bg-[#527DA3] hover:bg-blue-700 text-white py-3.5 rounded-2xl font-bold text-[15px] shadow-sm transition active:scale-[0.98]"
          >
            عضویت در این بستر
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `app/platforms/[platformId]/page.tsx`**

```tsx
'use client';

import { notFound } from 'next/navigation';
import { usePlatforms } from '@/hooks/usePlatforms';
import { PlatformInternal } from '@/components/platforms/PlatformInternal';

export default function PlatformPage({ params }: { params: { platformId: string } }) {
  const { getPlatform } = usePlatforms();
  const platform = getPlatform(Number(params.platformId));
  if (!platform) return notFound();
  return <PlatformInternal key={platform.id} platform={platform} />;
}
```

- [ ] **Step 4: Verify in the browser**

```bash
npm run dev
```

Visit `/`, click a platform. Expected: platform header, explore tab with the search box and card list, curated (pinned) card banner where applicable, join button if not joined (click it, the bottom bar switches to the compose bar), clicking a card opens `CardDetailView` full-screen, posting a comment appends it, the platform-owner-only settings gear opens the bio modal on the "dev" tab, the accordion items in the bio "info" tab expand/collapse, copying the card number shows the "کپی شد" confirmation, and — for platform id `1` (امانات محله انصار) — the paperclip button opens the tool-lending mini-app.

- [ ] **Step 5: Commit**

```bash
git add components/platforms/CardDetailView.tsx components/platforms/PlatformInternal.tsx app/platforms
git commit -m "feat: port card detail view, rules modal, and platform internal screen"
```

---

### Task 17: Global comments

**Files:**
- Create: `components/comments/GlobalComments.tsx`
- Modify: `app/(tabs)/comments/page.tsx`

**Interfaces:**
- Consumes: `usePlatforms` (Task 6), `CURRENT_USER` (Task 3)
- Produces: `<GlobalComments/>`, mounted at `/comments`. Clicking a row navigates into the relevant platform/card per the routing note in Task 16.

- [ ] **Step 1: Create `components/comments/GlobalComments.tsx`**

Port `renderGlobalComments` (`index.html:1032-1159`) and `handleCommentClick` (`index.html:1019-1030`), replacing the direct state jumps with route pushes carrying the `card`/`from`/`draft` query params Task 16 reads:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Layers } from '@/components/icons';
import { usePlatforms } from '@/hooks/usePlatforms';
import { CURRENT_USER } from '@/lib/data/seed';

interface Interaction {
  id: string;
  cardId: number | null;
  platformId: number;
  platformName: string;
  cardDesc: string;
  text: string;
  sender: string;
  isSystem?: boolean;
  time: string | null;
  isDraftBadge: boolean;
  badgeText: string | null;
}

export function GlobalComments() {
  const router = useRouter();
  const { platforms, drafts } = usePlatforms();

  const allInteractions: Interaction[] = [];

  platforms.forEach((p) => {
    p.cards.forEach((c) => {
      const isMyCard = c.author === CURRENT_USER.name;
      const myComments = c.comments.filter((com) => com.sender === CURRENT_USER.name);
      if ((isMyCard || myComments.length > 0) && c.comments.length > 0) {
        const lastCom = c.comments[c.comments.length - 1];
        let badgeText: string | null = null;
        if (c.status && p.actionLabel) {
          badgeText = p.actionLabel;
        } else if (c.status) {
          badgeText = c.status === 'pending' ? 'درخواست جدید' : 'واگذار شده';
        }
        allInteractions.push({
          id: c.id + '_' + lastCom.id,
          cardId: c.id,
          platformId: p.id,
          platformName: p.name,
          cardDesc: c.desc,
          text: lastCom.text,
          sender: lastCom.sender || '',
          isSystem: lastCom.isSystem,
          time: lastCom.time || null,
          badgeText,
          isDraftBadge: false,
        });
      }
    });
  });

  drafts.forEach((draft) => {
    const platform = platforms.find((p) => p.id === draft.platformId);
    if (platform) {
      allInteractions.push({
        id: 'draft_' + draft.id,
        cardId: null,
        platformId: platform.id,
        platformName: platform.name,
        cardDesc: draft.title || 'بدون عنوان',
        text: draft.desc || 'بدون توضیحات',
        sender: CURRENT_USER.name,
        isSystem: false,
        time: null,
        isDraftBadge: true,
        badgeText: null,
      });
    }
  });

  allInteractions.sort((a, b) => b.id.localeCompare(a.id));

  const handleInteractionClick = (interaction: Interaction) => {
    if (interaction.isDraftBadge) {
      router.push(`/platforms/${interaction.platformId}?draft=1`);
    } else {
      router.push(`/platforms/${interaction.platformId}?card=${interaction.cardId}&from=comments`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f4f4f5]">
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100 bg-white">
        {allInteractions.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-[13px]">موردی یافت نشد.</div>
        ) : (
          allInteractions.map((interaction) => (
            <div
              key={interaction.id}
              className="flex items-start gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer transition"
              onClick={() => handleInteractionClick(interaction)}
            >
              <div className="w-14 h-14 bg-blue-50 text-[#527DA3] rounded-2xl flex items-center justify-center shrink-0 border border-blue-100 mt-0.5">
                <Layers size={28} strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1.5 gap-2">
                  <h3 className="font-bold text-[14px] text-gray-900 line-clamp-1 leading-snug">{interaction.cardDesc}</h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-[#527DA3] bg-[#748EA5]/10 px-2 py-0.5 rounded-md whitespace-nowrap font-bold">
                      {interaction.platformName}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <p className="text-[12px] text-gray-600 line-clamp-1">
                    {interaction.sender === CURRENT_USER.name ? (
                      <span className="text-[#527DA3] font-bold">من: </span>
                    ) : interaction.isSystem ? null : (
                      <span className="text-gray-500 font-medium">{interaction.sender}: </span>
                    )}
                    {interaction.text.replace(/سیستم:\s*/, '')}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {interaction.isDraftBadge ? (
                      <span className="text-[10px] font-bold text-[#527DA3] bg-blue-50 px-2 py-0.5 rounded-md whitespace-nowrap shadow-sm border border-blue-100">
                        [ پیش‌نویس ]
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{interaction.time}</span>
                    )}
                    {interaction.badgeText && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md whitespace-nowrap shadow-sm">
                        {interaction.badgeText}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/(tabs)/comments/page.tsx`**

```tsx
import { GlobalComments } from '@/components/comments/GlobalComments';

export default function CommentsPage() {
  return <GlobalComments />;
}
```

- [ ] **Step 3: Verify in the browser**

```bash
npm run dev
```

Visit `/comments`. Expected: rows for cards you own or commented on, in reverse-chronological order by the same `id.localeCompare` sort as the original. Click a regular row: navigates to the platform and opens straight into that card, with the header showing "مشارکت‌ها" instead of "بازگشت" and a chip linking back to `/`. Add a card description in a platform's create-card sheet, close the sheet without submitting (leaving a draft), return to `/comments`: the draft appears with a "[ پیش‌نویس ]" badge; clicking it reopens the create-card sheet with your text preserved.

- [ ] **Step 4: Commit**

```bash
git add components/comments "app/(tabs)/comments"
git commit -m "feat: port global comments feed with deep-linking into platforms"
```

---

### Task 18: Remove the old prototype files and do a full end-to-end pass

**Files:**
- Delete: `index.html`, `dist/`

**Interfaces:**
- Consumes: every route and component from Tasks 1–17
- Produces: nothing new — this is the cleanup and verification pass. `index.html` is safe to delete now because every mechanical-copy task that referenced it (Tasks 3, 11–17) is complete.

- [ ] **Step 1: Delete the old prototype file and stale build output**

```bash
rm index.html
rm -rf dist
```

- [ ] **Step 2: Run the full quality gate**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all three succeed with no errors. Fix any type or lint errors surfaced here before proceeding — do not suppress them.

- [ ] **Step 3: Full manual walkthrough**

```bash
npm run dev
```

Work through this checklist in the browser at `http://localhost:3000`:

1. `/` shows all 7 platforms with correct unread badges and owner-settings icons.
2. `/chats` shows all 6 chats with correct unread badges; badge counts match the header tab counts.
3. Open a non-bot chat, send a message, confirm it appears and the back arrow returns to `/chats`.
4. Open "همیار تعاون", click "مدیریت بسترهای من", click one of the inline platform buttons, confirm the bot's follow-up message appears.
5. In the bot chat, type a request and send it: the `AiModal` opens in "processing" state, and (with a real `GEMINI_API_KEY` in `.env.local`) progresses to "suggestions" with at least one card; choosing one moves to "confirmation"; confirming creates a new draft platform and navigates to `/platforms/<newId>`; the "upgrade_offer" step's both buttons work (activate mini-app → "upgrade_success"; decline → modal closes).
6. Open the newly created draft platform: the yellow "پیش‌نمایش" banner and "🚀 انتشار بستر" button appear; publishing it hides the banner and shows the bottom `PublishToast` for ~4 seconds.
7. Open platform id `1` (امانات محله انصار): join it if not already joined, open a card, post a comment, reply to a comment, request the card's action (rules modal → accept checkbox → submit), then as the card's author approve or cancel the request.
8. Open the tool-lending mini-app (platform 1's paperclip button): select a tool, adjust days, accept the checkbox, transfer — confirm it lands in the create-card sheet pre-filled, and submitting adds a new card.
9. Repeat a quick smoke check for platform 2 "پویش سواد رسانه‌ای مادران" (media brief mini-app), platform 6 "شاعران آیینی محله" (poetry mini-app, requires a real Gemini key), and platform 7 "طب سنتی اسلامی محله" (teb tongue-scanner mini-app, 3-second simulated scan then 3 fixed diagnoses).
10. Visit `/comments`, confirm rows appear for cards you've interacted with, click one and confirm it deep-links into the right card with the "مشارکت‌ها" back button behavior; leave a draft in a create-card sheet (type text, close without submitting) and confirm it shows up here with a "[ پیش‌نویس ]" badge.
11. Open the hamburger drawer from any tab screen: shows `CURRENT_USER`'s name and phone.
12. Resize the browser above the `sm:` breakpoint: confirm the phone-frame chrome (rounded border, black notch) appears.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove legacy index.html prototype and stale Vite build output"
```
