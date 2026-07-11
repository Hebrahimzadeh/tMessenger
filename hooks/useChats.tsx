'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Chat, Message } from '@/lib/types';
import { INITIAL_CHATS } from '@/lib/data/seed';
import { getTime } from '@/lib/utils';

interface ChatsContextValue {
  chats: Chat[];
  getChat: (id: string | number) => Chat | undefined;
  sendMessage: (chatId: string | number, text: string) => void;
  appendMessages: (chatId: string | number, messages: Message[]) => void;
}

const ChatsContext = createContext<ChatsContextValue | null>(null);

export function ChatsProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<Chat[]>(INITIAL_CHATS);

  const getChat = (id: string | number) => chats.find((c) => String(c.id) === String(id));

  const sendMessage = (chatId: string | number, text: string) => {
    if (!text.trim()) return;
    const newMessage: Message = { id: Date.now(), text, sender: 'me', time: getTime() };
    setChats((prev) =>
      prev.map((c) => (String(c.id) === String(chatId) ? { ...c, messages: [...c.messages, newMessage], unread: 0 } : c))
    );
  };

  const appendMessages = (chatId: string | number, messages: Message[]) => {
    setChats((prev) =>
      prev.map((c) => (String(c.id) === String(chatId) ? { ...c, messages: [...c.messages, ...messages], unread: 0 } : c))
    );
  };

  return (
    <ChatsContext.Provider value={{ chats, getChat, sendMessage, appendMessages }}>{children}</ChatsContext.Provider>
  );
}

export function useChats() {
  const ctx = useContext(ChatsContext);
  if (!ctx) throw new Error('useChats must be used within a ChatsProvider');
  return ctx;
}
