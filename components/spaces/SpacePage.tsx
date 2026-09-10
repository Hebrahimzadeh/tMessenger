'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createSpaceInviteResponseSchema,
  spaceResponseSchema,
  spaceRoleMembershipActionResponseSchema,
  spaceSearchResponseSchema,
  type SpaceResponse,
  type SpaceRoleContract,
  type SpaceSearchItem,
} from '@taavon/contracts';
import type { CardResponse } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { CreateCardSheet } from './CreateCardSheet';
import { PinnedCards } from './PinnedCards';
import { SpaceHeader } from './SpaceHeader';
import { SpaceFeed } from './SpaceFeed';
import { SpaceHealthPanel } from './SpaceHealthPanel';

type GateState =
  | { status: 'loading' }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; space: SpaceResponse };

function EmptySection({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">{children}</div>;
}

export function SpacePage({ idOrSlug }: { idOrSlug: string }) {
  const router = useRouter();
  const [gate, setGate] = useState<GateState>({ status: 'loading' });
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [joinedRoleIds, setJoinedRoleIds] = useState<Set<string>>(new Set());
  const [roleError, setRoleError] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpaceSearchItem[] | null>(null);

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

  async function handleCreateInvite(spaceId: string) {
    setInviteError(null);
    try {
      const result = createSpaceInviteResponseSchema.parse(await apiFetch(`/spaces/${spaceId}/invites`, { method: 'POST' }));
      setInviteToken(result.token);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.');
    }
  }

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = spaceSearchResponseSchema.parse(await apiFetch(`/spaces?q=${encodeURIComponent(searchQuery)}`));
      setSearchResults(result.items);
    } catch {
      setSearchResults([]);
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
  const isOwnerView = space.canManage;

  return (
    <div dir="rtl" className="mx-auto max-w-2xl pb-10 text-right">
      <SpaceHeader
        spaceId={space.id}
        title={space.definition.title}
        purpose={space.definition.purpose}
        status={space.status}
        isOwnerView={isOwnerView}
      />

      {isOwnerView && (
        <section className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-800">سلامت بستر</h2>
          <SpaceHealthPanel spaceId={space.id} />
        </section>
      )}

      <section className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">نقش‌ها</h2>
        {space.definition.roles.length === 0 ? (
          <EmptySection>هنوز نقشی تعریف نشده است.</EmptySection>
        ) : (
          <ul className="space-y-2">
            {space.definition.roles.map((role) => (
              <li key={role.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-3">
                <span className="flex items-center gap-2 text-sm text-gray-800">
                  {role.title}
                  {role.isPrimary && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">اصلی</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => toggleRole(space, role)}
                  className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
                >
                  {joinedRoleIds.has(role.id) ? 'خروج از نقش' : 'پیوستن به نقش'}
                </button>
              </li>
            ))}
          </ul>
        )}
        {roleError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {roleError}
          </p>
        )}
      </section>

      {isOwnerView && (
        <section className="p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-800">پیوند دعوت</h2>
          {inviteToken ? (
            <p dir="ltr" className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              {`${typeof window !== 'undefined' ? window.location.origin : ''}/spaces/invite/${inviteToken}`}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => handleCreateInvite(space.id)}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
            >
              ساخت پیوند دعوت
            </button>
          )}
          {inviteError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {inviteError}
            </p>
          )}
        </section>
      )}

      <section className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">جست‌وجوی بسترها</h2>
        <form onSubmit={handleSearch} className="flex gap-2" noValidate>
          <label htmlFor="space-page-search" className="sr-only">
            جست‌وجوی بسترها
          </label>
          <input
            id="space-page-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 rounded-xl border border-gray-300 p-2 text-sm text-gray-900"
          />
          <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white">
            جست‌وجو
          </button>
        </form>
        {searchResults && (
          <ul className="mt-2 space-y-2">
            {searchResults.length === 0 ? (
              <EmptySection>نتیجه‌ای پیدا نشد.</EmptySection>
            ) : (
              searchResults.map((item) => (
                <li key={item.id}>
                  <Link href={`/spaces/${item.slug}`} className="text-sm font-medium text-blue-600 underline">
                    {item.title}
                  </Link>
                </li>
              ))
            )}
          </ul>
        )}
      </section>

      <section className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">سنجاق‌شده‌ها</h2>
        <PinnedCards spaceId={space.id} />
      </section>

      <section className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">ایجاد کارت</h2>
        <button
          type="button"
          onClick={() => setCreateSheetOpen(true)}
          className="w-full rounded-xl border border-dashed border-gray-300 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          ثبت کارت جدید
        </button>
        <CreateCardSheet
          isOpen={createSheetOpen}
          spaceId={space.id}
          onClose={() => setCreateSheetOpen(false)}
          onCreated={(card: CardResponse) => {
            setCreateSheetOpen(false);
            router.push(`/cards/${card.id}`);
          }}
        />
      </section>

      <section className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">فید</h2>
        <SpaceFeed spaceId={space.id} cardHints={space.definition.cardHints} />
      </section>

      <section className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">ابزارها</h2>
        <EmptySection>ابزاری برای این بستر هنوز اضافه نشده است.</EmptySection>
      </section>

      <section className="p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">قوانین و گزارش</h2>
        {space.definition.audience ? (
          <p className="text-sm text-gray-600">{space.definition.audience}</p>
        ) : (
          <EmptySection>قانونی برای این بستر ثبت نشده است.</EmptySection>
        )}
        <button type="button" disabled className="mt-2 text-sm text-gray-400">
          گزارش این بستر (به‌زودی)
        </button>
      </section>
    </div>
  );
}
