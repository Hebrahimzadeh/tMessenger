'use client';

import { ChatIcon, Heart, ImageIcon, Pin, Share2 } from '@/components/icons';
import type { Card } from '@/lib/types';

export function CardTemplate({ card, onOpen }: { card: Card; onOpen: (cardId: number) => void }) {
  return (
    <div
      onClick={() => onOpen(card.id)}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md cursor-pointer transition active:scale-[0.98] w-full text-right mb-3"
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-[#527DA3] to-blue-400 text-white rounded-full flex items-center justify-center text-[13px] font-bold shrink-0">
            {card.avatar}
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-gray-800 leading-tight">{card.author}</span>
            <span className="text-[10px] text-gray-400">{card.time}</span>
          </div>
          <div className="mr-auto flex items-center gap-2">
            {card.isCurated && <Pin size={14} className="text-amber-400" />}
            {card.status && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${
                  card.status === 'pending' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-500 border border-gray-200'
                }`}
              >
                {card.status === 'pending' ? 'درخواست جدید' : 'واگذار شده'}
              </span>
            )}
          </div>
        </div>
        <p className="text-[13px] text-gray-700 line-clamp-3 leading-relaxed">{card.desc}</p>
      </div>
      {card.hasImage && (
        <div className="w-full h-36 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          <ImageIcon size={36} className="text-gray-300" />
        </div>
      )}
      <div className="flex items-center border-t border-gray-100 divide-x divide-x-reverse divide-gray-100">
        <button
          onClick={(e) => e.stopPropagation()}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition"
        >
          <Heart size={17} strokeWidth={1.8} />
        </button>
        <button
          onClick={(e) => e.stopPropagation()}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition"
        >
          <Share2 size={17} strokeWidth={1.8} />
        </button>
        <button onClick={() => onOpen(card.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-400 hover:text-[#527DA3] hover:bg-blue-50 transition">
          <ChatIcon size={17} strokeWidth={1.8} />
          {card.comments.length > 0 && <span className="text-[11px] font-bold text-gray-500">{card.comments.length}</span>}
        </button>
      </div>
    </div>
  );
}
