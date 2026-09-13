'use client';

import { Check, CheckCheck, AlertCircle, Clock } from '@/components/icons';
import type { ChatMessage } from '@/hooks/useChats';
import { AssistantProposalCard } from './AssistantProposalCard';

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export interface MessageBubbleProps {
  message: ChatMessage;
  mine: boolean;
  /** The message this one is replying to, already resolved by the room. */
  replyTo?: { body: string | null; mine: boolean } | null;
  /** True once the other side's read receipt has passed this message. */
  readByPeer?: boolean;
  onRetry?: () => void;
  onLongPress?: () => void;
  onDecideProposal?: (decision: 'CONFIRM' | 'REJECT') => void;
  onEditProposal?: () => void;
}

/**
 * One message. The delivery state on our own messages is the familiar
 * messenger ladder - a clock while it is in flight, one tick once the server
 * has it, two once the other side has read it - and a failed send stays in
 * place with a retry rather than vanishing, so nothing a person typed is ever
 * silently lost.
 */
export function MessageBubble({
  message,
  mine,
  replyTo,
  readByPeer,
  onRetry,
  onLongPress,
  onDecideProposal,
  onEditProposal,
}: MessageBubbleProps) {
  const deleted = message.status === 'DELETED';
  const failed = message.sendState === 'failed';
  const pending = message.sendState === 'pending';

  return (
    <div className={`flex ${mine ? 'justify-start' : 'justify-end'}`} data-testid="message">
      <div
        role="group"
        aria-label={mine ? 'پیام شما' : 'پیام طرف مقابل'}
        onContextMenu={(event) => {
          if (!onLongPress) return;
          event.preventDefault();
          onLongPress();
        }}
        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 text-[14px] shadow-sm ${
          mine ? 'bg-[#EEFFDE] rounded-bl-sm' : 'bg-white rounded-br-sm'
        } ${failed ? 'ring-1 ring-red-300' : ''}`}
      >
        {replyTo && (
          <div className="mb-1.5 border-r-2 border-[#527DA3] bg-black/[0.03] rounded-md px-2 py-1">
            <p className="text-[11px] text-[#527DA3] font-medium">{replyTo.mine ? 'شما' : 'پاسخ به'}</p>
            <p className="text-[12px] text-gray-600 truncate">{replyTo.body ?? 'پیام حذف شده'}</p>
          </div>
        )}

        {deleted ? (
          <p className="leading-relaxed text-gray-400 italic">این پیام حذف شد</p>
        ) : (
          <p className="leading-relaxed whitespace-pre-wrap break-words text-gray-900">{message.body}</p>
        )}

        {message.proposedAction && (
          <AssistantProposalCard
            proposal={message.proposedAction}
            state={message.proposalState}
            onDecide={onDecideProposal}
            onEdit={onEditProposal}
          />
        )}

        <div className={`mt-1 flex items-center gap-1 ${mine ? 'justify-start' : 'justify-end'}`}>
          <span className="text-[10px] text-gray-400">{timeLabel(message.createdAt)}</span>
          {message.edited && !deleted && <span className="text-[10px] text-gray-400">ویرایش‌شده</span>}
          {mine && !deleted && (
            <span data-testid="send-state" data-state={message.sendState ?? (readByPeer ? 'read' : 'sent')}>
              {pending && <Clock size={13} className="text-gray-400" aria-label="در حال ارسال" />}
              {failed && <AlertCircle size={13} className="text-red-500" aria-label="ارسال نشد" />}
              {!pending && !failed && readByPeer && <CheckCheck size={14} className="text-[#527DA3]" aria-label="خوانده شد" />}
              {!pending && !failed && !readByPeer && <Check size={14} className="text-gray-400" aria-label="ارسال شد" />}
            </span>
          )}
        </div>

        {failed && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 w-full rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[12px] font-medium text-red-700"
          >
            ارسال نشد — تلاش دوباره
          </button>
        )}
      </div>
    </div>
  );
}
