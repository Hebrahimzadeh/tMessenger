'use client';

import { Layers } from '@/components/icons';
import type { AssistantProposal, ProposalState } from '@taavon/contracts';

export interface AssistantProposalCardProps {
  proposal: AssistantProposal;
  state: ProposalState;
  onDecide?: (decision: 'CONFIRM' | 'REJECT') => void;
  onEdit?: () => void;
}

/**
 * What the assistant is suggesting, shown as a preview of something that has
 * not happened.
 *
 * The wording and the shape both carry the same point: this is a draft
 * awaiting the person, not a report of work done. Nothing is created while
 * this sits here - "بدون تأیید هیچ domain command ارسال نشود" - and the three
 * choices are deliberately equal in weight, with reject as plain to reach as
 * confirm. Once decided, the buttons are replaced by what was decided, so the
 * record of the person's choice stays visible in the conversation.
 */
export function AssistantProposalCard({ proposal, state, onDecide, onEdit }: AssistantProposalCardProps) {
  return (
    <div
      data-testid="assistant-proposal"
      data-state={state}
      className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5"
    >
      <p className="mb-1 text-[11px] font-medium text-amber-800">پیش‌نویس پیشنهادی — هنوز ساخته نشده است</p>

      <div className="flex items-start gap-2 rounded-lg bg-white/80 p-2">
        <Layers size={18} className="mt-0.5 shrink-0 text-[#527DA3]" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-gray-900">{proposal.title}</p>
          <p className="line-clamp-3 text-[12px] leading-relaxed text-gray-600">{proposal.summary}</p>
        </div>
      </div>

      {state === 'PENDING' && (
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => onDecide?.('CONFIRM')}
            className="flex-1 rounded-lg bg-[#527DA3] px-2 py-1.5 text-[12px] font-medium text-white"
          >
            تأیید و ساخت
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[12px] font-medium text-gray-700"
          >
            ویرایش
          </button>
          <button
            type="button"
            onClick={() => onDecide?.('REJECT')}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[12px] font-medium text-gray-700"
          >
            رد
          </button>
        </div>
      )}

      {state === 'CONFIRMED' && <p className="mt-2 text-[12px] font-medium text-green-700">شما این پیشنهاد را تأیید کردید.</p>}
      {state === 'REJECTED' && <p className="mt-2 text-[12px] font-medium text-gray-600">شما این پیشنهاد را رد کردید.</p>}
    </div>
  );
}
