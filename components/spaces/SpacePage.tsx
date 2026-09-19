'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  spaceResponseSchema,
  spaceRoleMembershipActionResponseSchema,
  type CardResponse,
  type SpaceResponse,
  type SpaceRoleContract,
} from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { Search, X } from '@/components/icons';
import { CreateCardSheet } from './CreateCardSheet';
import { PinnedCards } from './PinnedCards';
import { SpaceActionBar } from './SpaceActionBar';
import { SpaceFeed } from './SpaceFeed';
import { SpaceInfoSheet, type SpaceInfoTab } from './SpaceInfoSheet';
import { SpaceToolbar } from './SpaceToolbar';

type GateState =
  | { status: 'loading' }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; space: SpaceResponse };

/**
 * A space, as a conversation.
 *
 * Owner instruction, 2026-09-19: "زمانی که می‌ریم داخل بستر هم باید عین یک
 * چت (گفتگو) تلگرام باشه فقط یک جستجو بالا (زیر تولبار مشخصات بستر) داره و
 * یک ابزار برای ساخت کارت داره دقیقا عین tmessenger-v1.html". So the page is
 * four fixed pieces in a column - the space's bar, one search box under it,
 * the cards, and the bar that makes a card - and nothing else. Roles, the
 * invite link, health, the rules and editing were a stack of nine labelled
 * sections down this page; they are all still here, behind the toolbar, in
 * SpaceInfoSheet.
 */
export function SpacePage({ idOrSlug }: { idOrSlug: string }) {
  const router = useRouter();
  const [gate, setGate] = useState<GateState>({ status: 'loading' });
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [infoTab, setInfoTab] = useState<SpaceInfoTab | null>(null);
  const [joinedRoleIds, setJoinedRoleIds] = useState<Set<string>>(new Set());
  const [roleError, setRoleError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [query, setQuery] = useState('');

  /** Set once, right after a space is built from a prompt and the person lands here. */
  // From the router, not from `window.location`: on a client navigation the
  // address bar is updated after the new route renders, so reading it during
  // render showed the *previous* URL and the notice never appeared. Frozen in
  // state on mount so stripping the query below cannot make it vanish.
  const searchParams = useSearchParams();
  const [builtNotice, setBuiltNotice] = useState<{ outcome: 'published' | 'review'; aiWrote: boolean } | null>(() => {
    const built = searchParams.get('built');
    return built === 'published' || built === 'review' ? { outcome: built, aiWrote: searchParams.get('ai') === '1' } : null;
  });

  useEffect(() => {
    // A one-time notice: strip it from the address bar so a reload or a shared
    // link does not repeat it forever.
    if (builtNotice) window.history.replaceState(null, '', window.location.pathname);
    // Deliberately mount-only: this must not re-run when the notice is dismissed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = spaceResponseSchema.parse(await apiFetch(`/spaces/${encodeURIComponent(idOrSlug)}`));
        if (!cancelled) setGate({ status: 'ready', space: result });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'SPACE_NOT_FOUND') {
          setGate({ status: 'not_found', message: err.message });
        } else {
          setGate({ status: 'error', message: err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.' });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [idOrSlug]);

  async function toggleRole(space: SpaceResponse, role: SpaceRoleContract) {
    setRoleError(null);
    const isJoined = joinedRoleIds.has(role.id);
    try {
      spaceRoleMembershipActionResponseSchema.parse(
        await apiFetch(`/spaces/${space.id}/roles/${role.id}/${isJoined ? 'leave' : 'join'}`, { method: 'POST' })
      );
      setJoinedRoleIds((ids) => {
        const next = new Set(ids);
        if (isJoined) next.delete(role.id);
        else next.add(role.id);
        return next;
      });
    } catch (err) {
      setRoleError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.');
    }
  }

  async function setFollowing(space: SpaceResponse, next: boolean) {
    setJoining(true);
    try {
      await apiFetch(`/spaces/${space.id}/${next ? 'follow' : 'unfollow'}`, { method: 'POST' });
      setGate({
        status: 'ready',
        space: { ...space, isFollowing: next, followerCount: Math.max(0, space.followerCount + (next ? 1 : -1)) },
      });
    } catch (err) {
      setRoleError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.');
    } finally {
      setJoining(false);
    }
  }

  if (gate.status === 'loading') {
    return (
      <p role="status" className="p-6 text-center text-gray-500">
        در حال بارگذاری...
      </p>
    );
  }

  if (gate.status === 'not_found' || gate.status === 'error') {
    return (
      <p role={gate.status === 'error' ? 'alert' : 'status'} className="p-6 text-center text-gray-500">
        {gate.message}
      </p>
    );
  }

  const { space } = gate;
  // Whoever runs the space is always in it; everyone else joins first, which
  // is the one gate between reading a space and writing in it.
  const canParticipate = space.canManage || space.isFollowing;

  return (
    <div dir="rtl" className="relative flex h-full flex-col overflow-hidden bg-[#f4f4f5] text-right">
      <SpaceToolbar
        title={space.definition.title}
        status={space.status}
        followerCount={space.followerCount}
        canManage={space.canManage}
        onOpenInfo={() => setInfoTab('info')}
        onOpenManage={() => setInfoTab('manage')}
      />

      <div className="z-20 shrink-0 bg-white p-3 shadow-sm">
        <div className="relative">
          <Search size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="جستجو در بستر"
            placeholder="جستجو در بستر..."
            className="w-full rounded-xl bg-gray-100 py-3 pl-4 pr-12 text-[14px] font-medium text-gray-800 transition focus:outline-none focus:ring-2 focus:ring-[#527DA3]/30"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!query && <PinnedCards spaceId={space.id} />}
        <div className="p-3">
          <SpaceFeed spaceId={space.id} cardHints={space.definition.cardHints} query={query} />
        </div>
      </div>

      {builtNotice && (
        <div role="status" className="z-30 shrink-0 border-t border-green-200 bg-[#EEFFDE] px-4 py-2.5 text-[12px] text-green-900">
          <div className="flex items-start gap-2">
            <p className="flex-1 leading-relaxed">
              {builtNotice.outcome === 'published'
                ? 'بستر شما ساخته و منتشر شد. شما مدیر این بستر هستید و می‌توانید هر بخش آن را ویرایش کنید.'
                : 'بستر شما ساخته شد و پس از نگاه یک نفر منتشر می‌شود. چیزی رد نشده است و تا آن زمان فقط خودتان آن را می‌بینید.'}
              {/* Said out loud: a person acting on the design deserves to know
                  a model did not write it. */}
              {!builtNotice.aiWrote && ' این بستر بدون دستیار هوش مصنوعی و فقط بر پایهٔ قاعده‌ها ساخته شد.'}
            </p>
            <button type="button" onClick={() => setBuiltNotice(null)} aria-label="بستن پیام" className="shrink-0 p-0.5 text-green-800">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <SpaceActionBar
        canParticipate={canParticipate}
        joining={joining}
        onOpenTools={() => setToolsOpen(true)}
        onCreateCard={() => setCreateSheetOpen(true)}
        onJoin={() => setFollowing(space, true)}
      />

      <CreateCardSheet
        isOpen={createSheetOpen}
        spaceId={space.id}
        onClose={() => setCreateSheetOpen(false)}
        onCreated={(card: CardResponse) => {
          setCreateSheetOpen(false);
          router.push(`/cards/${card.id}`);
        }}
      />

      {toolsOpen && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={() => setToolsOpen(false)}>
          <div className="sheet-in rounded-t-3xl bg-white p-5 pb-8 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 text-[15px] font-bold text-gray-900">ابزارهای این بستر</h2>
            <p className="text-[13px] leading-relaxed text-gray-500">
              هنوز ابزاری به این بستر افزوده نشده است. کارت‌ها روش مشارکت در این بستر هستند.
            </p>
            <button type="button" onClick={() => setToolsOpen(false)} className="mt-4 w-full rounded-xl bg-gray-100 py-2.5 text-[14px] font-medium text-gray-700">
              بستن
            </button>
          </div>
        </div>
      )}

      {infoTab && (
        <SpaceInfoSheet
          space={space}
          initialTab={infoTab}
          joinedRoleIds={joinedRoleIds}
          onToggleRole={(role) => toggleRole(space, role)}
          roleError={roleError}
          onLeave={space.isFollowing && !space.canManage ? () => setFollowing(space, false) : null}
          onUpdated={(updated) => setGate({ status: 'ready', space: updated })}
          onClose={() => setInfoTab(null)}
        />
      )}
    </div>
  );
}
