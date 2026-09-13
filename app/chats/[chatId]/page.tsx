import { requireUser } from '@/lib/auth/require-user';
import { ChatRoom } from '@/components/chat/ChatRoom';

export default async function ChatRoomPage({ params }: { params: Promise<{ chatId: string }> }) {
  await requireUser();
  const { chatId } = await params;
  return <ChatRoom conversationId={chatId} />;
}
