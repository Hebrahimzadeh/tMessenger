'use client';

import type { CardResponse } from '@taavon/contracts';
import { X } from '@/components/icons';
import { CardComposer } from './CardComposer';

export interface CreateCardSheetProps {
  isOpen: boolean;
  spaceId: string;
  initialBody?: string;
  onClose: () => void;
  onCreated: (card: CardResponse) => void;
}

/**
 * The real, API-backed replacement for the old prototype's mock
 * `CreateCardSheet` (see `components/platforms/`'s Task 12-era retirement -
 * that whole mock system stopped being reachable once `/platforms/:id`
 * became a redirect to the real spaces list). Same role - a bottom sheet -
 * entirely new content underneath.
 */
export function CreateCardSheet({ isOpen, spaceId, initialBody, onClose, onCreated }: CreateCardSheetProps) {
  if (!isOpen) return null;

  return (
    <div dir="rtl" className="absolute inset-0 z-50 flex flex-col justify-end text-right">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="sheet-in relative z-10 flex max-h-[85%] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 p-4">
          <h2 className="text-[16px] font-medium text-gray-900">ثبت کارت جدید</h2>
          <button type="button" onClick={onClose} aria-label="بستن" className="rounded-full bg-gray-100 p-1.5 text-gray-500 transition hover:bg-gray-200">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          <CardComposer spaceId={spaceId} initialBody={initialBody} onCreated={onCreated} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
