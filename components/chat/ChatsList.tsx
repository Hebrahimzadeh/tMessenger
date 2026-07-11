'use client';

import { useRouter } from 'next/navigation';
import { CheckCheck } from '@/components/icons';
import { useChats } from '@/hooks/useChats';

export function ChatsList() {
  const router = useRouter();
  const { chats } = useChats();

  return (
    <div className="divide-y divide-gray-100 bg-white min-h-full">
      {chats.map((chat) => {
        const lastMsg = chat.messages[chat.messages.length - 1];
        return (
          <div
            key={chat.id}
            className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer transition active:bg-gray-100"
            onClick={() => router.push('/chats/' + chat.id)}
          >
            <div className="relative shrink-0">
              <div className="w-12 h-12 bg-gradient-to-t from-[#527DA3] to-blue-400 rounded-full flex items-center justify-center text-white text-lg font-medium">
                {chat.avatar}
              </div>
              {chat.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#4CAF50] border-2 border-white rounded-full" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline mb-0.5">
                <h3 className="font-medium text-[15px] text-gray-900 truncate">{chat.name}</h3>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{lastMsg?.time}</span>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-[13px] text-gray-500 truncate pr-1">{lastMsg?.text}</p>
                {chat.unread > 0 ? (
                  <span className="bg-[#4CAF50] text-white text-[11px] font-bold px-1.5 min-w-[18px] h-4.5 flex items-center justify-center rounded-full">
                    {chat.unread}
                  </span>
                ) : (
                  lastMsg?.sender === 'me' && <CheckCheck size={14} className="text-[#527DA3]" />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
