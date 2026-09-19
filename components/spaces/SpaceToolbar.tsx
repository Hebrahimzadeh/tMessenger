'use client';

import Link from 'next/link';
import type { SpaceStatus } from '@taavon/contracts';
import { ArrowRight, Layers, Lock, Settings } from '@/components/icons';
import { toPersianDigits } from '@/lib/persian-digits';
import { spaceStatusLabel } from './space-status';

export interface SpaceToolbarProps {
  title: string;
  status: SpaceStatus;
  followerCount: number;
  canManage: boolean;
  /** Opens the space's own information sheet - the whole bar is the tap target, as a chat's header is. */
  onOpenInfo: () => void;
  /** Opens the same sheet on its management tab. Only rendered when `canManage`. */
  onOpenManage: () => void;
}

/**
 * The bar at the top of a space: back, who this is, how many people are in
 * it, and - for whoever runs it - the gear.
 *
 * This is the chat header from `tmessenger-v1.html`'s `renderPlatformInternal`,
 * down to the colours and sizes. Everything that used to be stacked down the
 * page (roles, invite link, health, rules, editing) now lives behind the two
 * taps this bar offers, because a chat does not put its own settings in the
 * conversation.
 */
export function SpaceToolbar({ title, status, followerCount, canManage, onOpenInfo, onOpenManage }: SpaceToolbarProps) {
  const statusLabel = spaceStatusLabel(status);

  return (
    <div className="z-30 flex shrink-0 items-center bg-[#527DA3] px-1 py-1.5 text-white shadow-sm">
      <Link href="/" aria-label="بازگشت به فهرست بسترها" className="ml-1 rounded-full p-2 transition hover:bg-white/10">
        <ArrowRight size={22} />
      </Link>

      {/* The heading stays a heading; the button laid over it makes the whole
          bar tappable without nesting flow content inside a <button>. */}
      <div className="relative flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
          <Layers size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="flex items-center gap-1.5 truncate text-[15px] font-medium leading-tight">
            <span className="truncate">{title}</span>
            {statusLabel && (
              <span className="flex shrink-0 items-center gap-0.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                <Lock size={10} strokeWidth={2.5} aria-hidden />
                {statusLabel}
              </span>
            )}
          </h1>
          <p className="mt-0.5 truncate text-[11px] text-[#B0CBE1]">{toPersianDigits(String(followerCount))} مشارکت‌کننده</p>
        </div>
        <button type="button" onClick={onOpenInfo} aria-label="مشخصات بستر" className="absolute inset-0 rounded-lg hover:bg-white/5" />
      </div>

      {canManage && (
        <button type="button" onClick={onOpenManage} aria-label="مدیریت بستر" className="mr-1 rounded-full p-2 transition hover:bg-white/10">
          <Settings size={20} />
        </button>
      )}
    </div>
  );
}
