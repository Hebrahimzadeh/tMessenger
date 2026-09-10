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
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-50 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">ثبت کارت جدید</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <CardComposer spaceId={spaceId} initialBody={initialBody} onCreated={onCreated} onCancel={onClose} />
      </div>
    </div>
  );
}
