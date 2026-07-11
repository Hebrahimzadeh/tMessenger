'use client';

import { CheckCheck } from '@/components/icons';
import type { InlineButton, Message } from '@/lib/types';

export function MessageBubble({
  message,
  onInlineButtonClick,
}: {
  message: Message;
  onInlineButtonClick: (btn: InlineButton) => void;
}) {
  const isMe = message.sender === 'me';
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] relative p-2.5 px-3.5 rounded-2xl text-[14px] shadow-sm ${
          isMe ? 'bg-[#EEFFDE] rounded-br-sm text-black' : 'bg-white rounded-bl-sm text-black'
        }`}
      >
        <p className="leading-relaxed whitespace-pre-wrap">{message.text}</p>
        <div className={`flex items-center gap-1 mt-1 ${isMe ? 'justify-end text-green-600' : 'justify-start text-gray-400'}`}>
          <span className="text-[10px]">{message.time}</span>
          {isMe && <CheckCheck size={14} />}
        </div>
        {message.inlineButtons && (
          <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
            {message.inlineButtons.map((btn) => (
              <button
                key={btn.id}
                onClick={() => onInlineButtonClick(btn)}
                className="w-full bg-blue-50/50 hover:bg-blue-50 text-[#527DA3] font-medium py-1.5 px-3 rounded-lg text-[12px] border border-blue-100 transition truncate block text-center"
              >
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
