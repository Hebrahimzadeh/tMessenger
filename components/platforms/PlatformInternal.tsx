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

  const [platformInnerTab] = useState<'explore' | 'me'>('explore');
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing initial UI state from the URL on mount for deep-linking.
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
