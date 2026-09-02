'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { useChats } from '@/hooks/useChats';
import { ChatRoom } from '@/components/chat/ChatRoom';

export default function ChatRoomPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = use(params);
  const { getChat } = useChats();
  const chat = getChat(chatId);
  if (!chat) return notFound();
  return <ChatRoom chat={chat} />;
}
