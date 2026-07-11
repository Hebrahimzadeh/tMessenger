'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChatIcon, Layers, Paperclip, Send, X } from '@/components/icons';
import { useChats } from '@/hooks/useChats';
import { usePlatforms } from '@/hooks/usePlatforms';
import { useAiCopilot } from '@/hooks/useAiCopilot';
import { CURRENT_USER } from '@/lib/data/seed';
import { getTime } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import type { Chat, InlineButton } from '@/lib/types';

export function ChatRoom({ chat }: { chat: Chat }) {
  const router = useRouter();
  const { sendMessage, appendMessages } = useChats();
  const { platforms } = usePlatforms();
  const { startFlow } = useAiCopilot();

  const [messageInput, setMessageInput] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chat.messages]);

  const handleBotManagePlatforms = () => {
    const userPlatforms = platforms.filter((p) => p.creator === CURRENT_USER.username);
    const newMsgMe = { id: Date.now(), text: 'مدیریت بسترهای من', sender: 'me' as const, time: getTime() };
    const inlineButtons: InlineButton[] = userPlatforms.map((p) => ({ id: p.id, label: p.name, action: 'select_platform' }));
    const newMsgBot = {
      id: Date.now() + 1,
      text: 'کدام بستر را می‌خواهید آپدیت کنید؟',
      sender: 'them' as const,
      time: getTime(),
      inlineButtons,
    };
    appendMessages(chat.id, [newMsgMe, newMsgBot]);
  };

  const handleBotInlineClick = (btn: InlineButton) => {
    if (btn.action !== 'select_platform') return;
    const p = platforms.find((x) => x.id === btn.id);
    if (!p) return;
    const newMsgMe = { id: Date.now(), text: p.name, sender: 'me' as const, time: getTime() };
    const newMsgBot = {
      id: Date.now() + 1,
      text: `بسیار خب. حالا به من بگویید دقیقاً چه تغییری در بستر «${p.name}» می‌خواهید انجام دهم؟ (مثلاً: فیلد شماره تماس رو اضافه کن)`,
      sender: 'them' as const,
      time: getTime(),
    };
    appendMessages(chat.id, [newMsgMe, newMsgBot]);
  };

  const handleSend = () => {
    sendMessage(chat.id, messageInput);
    setMessageInput('');
  };

  const handleBotSend = () => {
    if (!messageInput.trim()) return;
    startFlow(messageInput);
    setMessageInput('');
  };

  return (
    <div className="absolute inset-0 bg-[#E4DDD6] z-40 flex flex-col animate-in slide-in-from-right-full duration-200">
      <div className="bg-[#527DA3] text-white px-2 py-2 flex items-center gap-3 shadow-sm shrink-0">
        <button onClick={() => router.back()} className="p-2 hover:bg-white/10 rounded-full">
          <ArrowRight size={22} />
        </button>
        <div className="flex-1 flex items-center gap-3 cursor-pointer" onClick={() => setShowProfile(true)}>
          <div className="w-10 h-10 bg-[#6490B1] border border-white/20 rounded-full flex items-center justify-center font-medium">
            {chat.avatar}
          </div>
          <div>
            <h2 className="font-medium leading-tight">{chat.name}</h2>
            <p className="text-xs text-blue-200">{chat.online ? 'آنلاین' : 'آخرین بازدید اخیراً'}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={chatScrollRef}>
        <div className="flex justify-center mb-4">
          <span className="bg-[#748EA5]/40 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">امروز</span>
        </div>
        {chat.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onInlineButtonClick={handleBotInlineClick} />
        ))}
      </div>

      <div className="bg-white shrink-0 flex flex-col shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        {chat.isBot ? (
          <>
            <div className="border-b border-gray-100 p-2">
              <button
                onClick={handleBotManagePlatforms}
                className="w-full bg-blue-50 hover:bg-blue-100 text-[#527DA3] font-medium py-2.5 rounded-lg text-[13px] transition border border-blue-100 shadow-sm flex items-center justify-center gap-2"
              >
                <Layers size={16} /> مدیریت بسترهای من
              </button>
            </div>
            <div className="p-2.5">
              <div className="relative">
                <textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && messageInput.trim()) {
                      e.preventDefault();
                      handleBotSend();
                    }
                  }}
                  placeholder="مثلاً بنویس: بچه‌های محل برای برپایی موکب فاطمیه نیاز به داربست و پارچه مشکی دارن..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 pr-4 pl-12 text-[14px] min-h-[90px] resize-none focus:outline-none focus:border-[#527DA3] focus:ring-2 focus:ring-[#527DA3]/10 transition leading-relaxed text-gray-800"
                  rows={3}
                />
                <button
                  onClick={handleBotSend}
                  className={`absolute left-3 bottom-3 w-8 h-8 flex items-center justify-center rounded-xl transition-all ${
                    messageInput.trim() ? 'bg-[#527DA3] text-white shadow-md active:scale-95' : 'bg-gray-200 text-gray-400 pointer-events-none'
                  }`}
                >
                  <ArrowRight size={16} className="rotate-180" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 px-2 py-2 border-t border-gray-200">
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition">
              <Paperclip size={24} strokeWidth={1.5} />
            </button>
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="پیام..."
              className="flex-1 bg-transparent py-2 px-1 focus:outline-none text-[15px]"
            />
            {messageInput.trim() ? (
              <button onClick={handleSend} className="p-2 text-[#527DA3] hover:bg-blue-50 rounded-full transition">
                <Send size={24} className="rtl:-scale-x-100" />
              </button>
            ) : (
              <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition">
                <ChatIcon size={24} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}
      </div>

      {showProfile && (
        <div className="absolute inset-0 bg-white z-50 flex flex-col animate-in slide-in-from-bottom-full duration-200">
          <div className="bg-white px-2 py-3 flex items-center gap-4 shadow-sm border-b">
            <button onClick={() => setShowProfile(false)} className="p-2 hover:bg-gray-100 rounded-full">
              <X size={24} className="text-gray-600" />
            </button>
            <h2 className="text-lg font-medium text-gray-800">اطلاعات کاربر</h2>
          </div>
          <div className="flex flex-col items-center py-6 bg-gray-50 border-b border-gray-200">
            <div className="w-24 h-24 bg-[#527DA3] rounded-full flex items-center justify-center text-4xl font-medium text-white shadow-md mb-3">
              {chat.avatar}
            </div>
            <h2 className="text-xl font-medium text-gray-900">{chat.name}</h2>
            <p className="text-[#527DA3] mt-1" dir="ltr">
              {chat.username}
            </p>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <p className="text-sm text-[#527DA3] font-medium mb-1">بیوگرافی / تخصص</p>
              <p className="text-[14px] text-gray-800 leading-relaxed bg-white p-3 border border-gray-100 rounded-xl">{chat.bio}</p>
            </div>
            <div className="h-px bg-gray-200 w-full" />
            <div>
              <p className="text-sm text-[#527DA3] font-medium mb-3">بسترهای مشترک</p>
              <div className="space-y-2">
                {chat.sharedPlatforms.map((plat, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-100 rounded-xl">
                    <Layers size={20} className="text-[#527DA3]" />
                    <span className="font-medium text-[13px] text-gray-800">{plat}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
