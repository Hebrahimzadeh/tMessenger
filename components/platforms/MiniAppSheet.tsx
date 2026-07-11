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
