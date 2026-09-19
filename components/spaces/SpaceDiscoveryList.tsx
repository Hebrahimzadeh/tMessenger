'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { mySpacesResponseSchema, spaceSearchResponseSchema, type MySpaceItem, type SpaceSearchItem } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { Plus } from '@/components/icons';
import { SpaceListRow } from './SpaceListRow';

type GateState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; mine: MySpaceItem[]; discovered: SpaceSearchItem[] };

/**
 * The spaces list - the chat list of this messenger.
 *
 * The person's own spaces come first, published or not, then everything
 * else that is published. Two calls rather than one because they are two
 * different things: the search index is public, ranked and PUBLISHED-only
 * by design, so a space of theirs still waiting for a person to look at it
 * appears in no ranking at all and used to be reachable only by whoever
 * still had the link. `/spaces/mine` is that shelf.
 *
 * A failing `/spaces/mine` never fails the page: a signed-out visitor gets
 * a 401 there and the public list is the whole list for them.
 */
export function SpaceDiscoveryList() {
  const [gate, setGate] = useState<GateState>({ status: 'loading' });

  /** Bumped by the retry button; the effect below is the only thing that fetches. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [discovered, mine] = await Promise.all([
          apiFetch('/spaces?scope=all').then((body) => spaceSearchResponseSchema.parse(body)),
          apiFetch('/spaces/mine')
            .then((body) => mySpacesResponseSchema.parse(body).items)
            .catch(() => [] as MySpaceItem[]),
        ]);
        if (!cancelled) setGate({ status: 'ready', mine, discovered: discovered.items });
      } catch (err) {
        if (!cancelled) setGate({ status: 'error', message: err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.' });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (gate.status === 'loading') {
    return (
      <p role="status" className="p-6 text-center text-gray-500">
        در حال بارگذاری...
      </p>
    );
  }

  if (gate.status === 'error') {
    return (
      <div className="p-6 text-center">
        <p role="alert" className="mb-3 text-sm text-red-700">
          {gate.message}
        </p>
        <button
          type="button"
          onClick={() => {
            setGate({ status: 'loading' });
            setAttempt((n) => n + 1);
          }}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">
          تلاش دوباره
        </button>
      </div>
    );
  }

  // Their own row wins: it is the one that knows the space is theirs and
  // what state it is in.
  const mineIds = new Set(gate.mine.map((item) => item.id));
  const others = gate.discovered.filter((item) => !mineIds.has(item.id));

  if (gate.mine.length === 0 && others.length === 0) {
    return (
      <div dir="rtl" className="flex flex-col items-center px-6 py-12 text-center">
        <p className="mb-4 text-sm text-gray-500">هنوز بستری ساخته نشده است. شما می‌توانید اولین نفر باشید.</p>
        <Link
          href="/spaces/new"
          className="flex items-center gap-1.5 rounded-xl bg-[#527DA3] px-4 py-2.5 text-sm font-medium text-white shadow-sm"
        >
          <Plus size={18} />
          ساخت بستر
        </Link>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-full divide-y divide-gray-100 bg-white">
      {gate.mine.map((item) => (
        <SpaceListRow key={item.id} slug={item.slug} title={item.title} purpose={item.purpose} status={item.status} canManage />
      ))}
      {others.map((item) => (
        <SpaceListRow
          key={item.id}
          slug={item.slug}
          title={item.title}
          purpose={item.purpose}
          status="PUBLISHED"
          followerCount={item.followerCount}
        />
      ))}
    </div>
  );
}
