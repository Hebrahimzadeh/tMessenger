'use client';

import { notFound } from 'next/navigation';
import { useChats } from '@/hooks/useChats';
import { ChatRoom } from '@/components/chat/ChatRoom';

export default function ChatRoomPage({ params }: { params: { chatId: string } }) {
  const { getChat } = useChats();
  const chat = getChat(params.chatId);
  if (!chat) return notFound();
  return <ChatRoom chat={chat} />;
}
