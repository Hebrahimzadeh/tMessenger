'use client';

import { useState } from 'react';
import type { SpaceStatus } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

export interface SpaceHeaderProps {
  spaceId: string;
  title: string;
  purpose: string;
  status: SpaceStatus;
  /** True when the caller is the creator/a space admin (see space.service.ts's getSpace - `gate` is present only then). Drives whether the status badge and follow button show at all. */
  isOwnerView: boolean;
}

const STATUS_LABELS: Record<Exclude<SpaceStatus, 'PUBLISHED'>, string> = {
  DRAFT: 'پیش‌نویس',
  PRECHECK_REQUIRED: 'نیاز به بازبینی',
  HUMAN_REVIEW: 'در انتظار بررسی دستی',
  TEMPORARILY_SUSPENDED: 'به‌طور موقت معلق',
  ARCHIVED: 'بایگانی‌شده',
  REMOVED: 'حذف‌شده',
};

export function SpaceHeader({ spaceId, title, purpose, status, isOwnerView }: SpaceHeaderProps) {
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleFollow() {
    setError(null);
    const nextFollowing = !following;
    try {
      await apiFetch(`/spaces/${spaceId}/${nextFollowing ? 'follow' : 'unfollow'}`, { method: 'POST' });
      setFollowing(nextFollowing);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.');
    }
  }

  const showFollow = !isOwnerView && status === 'PUBLISHED';

  return (
    <div dir="rtl" className="border-b border-gray-200 p-4 text-right">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{title}</h1>
          {isOwnerView && status !== 'PUBLISHED' && (
            <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {STATUS_LABELS[status]}
            </span>
          )}
        </div>
        {showFollow && (
          <button
            type="button"
            onClick={toggleFollow}
            className={
              following
                ? 'shrink-0 rounded-xl border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700'
                : 'shrink-0 rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-medium text-white'
            }
          >
            {following ? 'دنبال می‌کنید' : 'دنبال کردن'}
          </button>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{purpose}</p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
