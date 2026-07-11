'use client';

import { useRouter } from 'next/navigation';
import { Layers } from '@/components/icons';
import { usePlatforms } from '@/hooks/usePlatforms';
import { CURRENT_USER } from '@/lib/data/seed';

interface Interaction {
  id: string;
  cardId: number | null;
  platformId: number;
  platformName: string;
  cardDesc: string;
  text: string;
  sender: string;
  isSystem?: boolean;
  time: string | null;
  isDraftBadge: boolean;
  badgeText: string | null;
}

export function GlobalComments() {
  const router = useRouter();
  const { platforms, drafts } = usePlatforms();

  const allInteractions: Interaction[] = [];

  platforms.forEach((p) => {
    p.cards.forEach((c) => {
      const isMyCard = c.author === CURRENT_USER.name;
      const myComments = c.comments.filter((com) => com.sender === CURRENT_USER.name);
      if ((isMyCard || myComments.length > 0) && c.comments.length > 0) {
        const lastCom = c.comments[c.comments.length - 1];
        let badgeText: string | null = null;
        if (c.status && p.actionLabel) {
          badgeText = p.actionLabel;
        } else if (c.status) {
          badgeText = c.status === 'pending' ? 'درخواست جدید' : 'واگذار شده';
        }
        allInteractions.push({
          id: c.id + '_' + lastCom.id,
          cardId: c.id,
          platformId: p.id,
          platformName: p.name,
          cardDesc: c.desc,
          text: lastCom.text,
          sender: lastCom.sender || '',
          isSystem: lastCom.isSystem,
          time: lastCom.time || null,
          badgeText,
          isDraftBadge: false,
        });
      }
    });
  });

  drafts.forEach((draft) => {
    const platform = platforms.find((p) => p.id === draft.platformId);
    if (platform) {
      allInteractions.push({
        id: 'draft_' + draft.id,
        cardId: null,
        platformId: platform.id,
        platformName: platform.name,
        cardDesc: draft.title || 'بدون عنوان',
        text: draft.desc || 'بدون توضیحات',
        sender: CURRENT_USER.name,
        isSystem: false,
        time: null,
        isDraftBadge: true,
        badgeText: null,
      });
    }
  });

  allInteractions.sort((a, b) => b.id.localeCompare(a.id));

  const handleInteractionClick = (interaction: Interaction) => {
    if (interaction.isDraftBadge) {
      router.push(`/platforms/${interaction.platformId}?draft=1`);
    } else {
      router.push(`/platforms/${interaction.platformId}?card=${interaction.cardId}&from=comments`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f4f4f5]">
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100 bg-white">
        {allInteractions.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-[13px]">موردی یافت نشد.</div>
        ) : (
          allInteractions.map((interaction) => (
            <div
              key={interaction.id}
              className="flex items-start gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer transition"
              onClick={() => handleInteractionClick(interaction)}
            >
              <div className="w-14 h-14 bg-blue-50 text-[#527DA3] rounded-2xl flex items-center justify-center shrink-0 border border-blue-100 mt-0.5">
                <Layers size={28} strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1.5 gap-2">
                  <h3 className="font-bold text-[14px] text-gray-900 line-clamp-1 leading-snug">{interaction.cardDesc}</h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-[#527DA3] bg-[#748EA5]/10 px-2 py-0.5 rounded-md whitespace-nowrap font-bold">
                      {interaction.platformName}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <p className="text-[12px] text-gray-600 line-clamp-1">
                    {interaction.sender === CURRENT_USER.name ? (
                      <span className="text-[#527DA3] font-bold">من: </span>
                    ) : interaction.isSystem ? null : (
                      <span className="text-gray-500 font-medium">{interaction.sender}: </span>
                    )}
                    {interaction.text.replace(/سیستم:\s*/, '')}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {interaction.isDraftBadge ? (
                      <span className="text-[10px] font-bold text-[#527DA3] bg-blue-50 px-2 py-0.5 rounded-md whitespace-nowrap shadow-sm border border-blue-100">
                        [ پیش‌نویس ]
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">{interaction.time}</span>
                    )}
                    {interaction.badgeText && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md whitespace-nowrap shadow-sm">
                        {interaction.badgeText}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
