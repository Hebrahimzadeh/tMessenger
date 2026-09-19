import Link from 'next/link';
import type { SpaceStatus } from '@taavon/contracts';
import { Layers, Lock, Settings } from '@/components/icons';
import { toPersianDigits } from '@/lib/persian-digits';
import { spaceStatusLabel } from './space-status';

export interface SpaceListRowProps {
  slug: string;
  title: string;
  purpose: string;
  status: SpaceStatus;
  /** The creator/admin view: the row carries the same gear their space's own toolbar does. */
  canManage?: boolean;
  /** Shown as the trailing pill when present, the way an unread count is in a chat list. */
  followerCount?: number;
}

/**
 * One row of the spaces list, built to be the chat-list row of a messenger
 * and nothing else.
 *
 * Owner instruction, 2026-09-19: "لیست بستر دقیقا این لیست گفتگو تلگرام" -
 * every measurement here (the 14×14 rounded-2xl avatar, the 15px title over
 * a 12px single line of truncated description, the trailing pill, the
 * divider between rows) comes from `tmessenger-v1.html`'s own
 * `renderPlatformsList`, which is the reference design for this app. Keep
 * them in step with that file rather than adjusting them by eye.
 */
export function SpaceListRow({ slug, title, purpose, status, canManage = false, followerCount }: SpaceListRowProps) {
  const statusLabel = spaceStatusLabel(status);

  return (
    <Link
      href={`/spaces/${encodeURIComponent(slug)}`}
      className="flex items-center gap-3 px-3 py-3 transition hover:bg-gray-50 active:bg-gray-100"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#527DA3]">
        <Layers size={28} strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center text-[15px] font-medium text-gray-900">
            <span className="truncate">{title}</span>
            {canManage && <Settings size={18} strokeWidth={1.5} className="mr-2 shrink-0 text-[#527DA3]" aria-hidden />}
          </h3>
          {statusLabel ? (
            <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              <Lock size={10} strokeWidth={2.5} aria-hidden />
              {statusLabel}
            </span>
          ) : (
            followerCount !== undefined &&
            followerCount > 0 && (
              <span className="shrink-0 whitespace-nowrap rounded-md bg-[#527DA3] px-1.5 py-0.5 text-[10px] text-white shadow-sm">
                {toPersianDigits(String(followerCount))} عضو
              </span>
            )
          )}
        </div>
        <p className="truncate text-[12px] text-gray-500">{purpose}</p>
      </div>
    </Link>
  );
}
