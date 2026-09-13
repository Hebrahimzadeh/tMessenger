'use client';

import { AlertCircle } from '@/components/icons';
import type { SensitiveFinding } from '@/lib/chat/sensitive-data';

const KIND_LABELS: Record<SensitiveFinding['kind'], string> = {
  PHONE: 'شمارهٔ تماس',
  ADDRESS: 'نشانی',
};

export interface SensitiveDataWarningProps {
  findings: SensitiveFinding[];
  onEdit: () => void;
  onSendAnyway: () => void;
}

/**
 * Shown when someone is about to send their own phone number or address.
 *
 * It does not block, and it is careful not to pretend the decision is wrong -
 * sharing a number with someone you are arranging to meet is an ordinary,
 * legitimate thing to do. What it prevents is doing it by accident, or
 * without realising that a private message is the wrong place if the other
 * person is a stranger. Hence two equally reachable choices: go back and
 * change it, or send it knowingly.
 *
 * "هیچ contact خودکار" is the other half of the same principle, and lives in
 * the composer: nothing here ever offers to fill in the person's own number
 * for them.
 */
export function SensitiveDataWarning({ findings, onEdit, onSendAnyway }: SensitiveDataWarningProps) {
  const kinds = [...new Set(findings.map((f) => f.kind))];

  return (
    <div
      role="alertdialog"
      aria-label="هشدار اطلاعات حساس"
      data-testid="sensitive-warning"
      className="border-t border-amber-200 bg-amber-50 px-3 py-2.5"
    >
      <div className="flex items-start gap-2">
        <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-amber-900">
            به نظر می‌رسد {kinds.map((k) => KIND_LABELS[k]).join(' و ')} در این پیام هست.
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-amber-800">
            اگر طرف مقابل را می‌شناسید مشکلی نیست. فقط مطمئن شوید که خودتان می‌خواهید این را بفرستید.
          </p>

          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              className="flex-1 rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-[12px] font-medium text-amber-900"
            >
              ویرایش می‌کنم
            </button>
            <button
              type="button"
              onClick={onSendAnyway}
              className="flex-1 rounded-lg bg-amber-600 px-2 py-1.5 text-[12px] font-medium text-white"
            >
              با آگاهی ارسال می‌کنم
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
