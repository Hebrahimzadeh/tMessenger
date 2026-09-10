'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api/client';
import { toPersianDigits } from '@/lib/persian-digits';

export interface CommentComposerProps {
  onSubmit: (body: string) => Promise<void>;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
}

const MAX_LENGTH = 4000;

/**
 * "public-first CTA را «پرسش یا مشارکت عمومی» قرار بده" - the default
 * button text is that exact phrase, so the primary action a visitor sees
 * on a card is always to contribute publicly, never a private message.
 */
export function CommentComposer({ onSubmit, placeholder, submitLabel, autoFocus }: CommentComposerProps) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_LENGTH && !submitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setBody('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ارسال نظر ممکن نشد.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form dir="rtl" onSubmit={handleSubmit} className="space-y-2 text-right">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder ?? 'پرسش یا مشارکت عمومی خود را بنویسید...'}
        maxLength={MAX_LENGTH}
        autoFocus={autoFocus}
        rows={3}
        aria-label="متن نظر"
        className="w-full rounded-xl border border-gray-300 p-3 text-sm"
      />
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400" dir="ltr">
          {toPersianDigits(String(trimmed.length))}/{toPersianDigits(String(MAX_LENGTH))}
        </span>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitLabel ?? 'پرسش یا مشارکت عمومی'}
        </button>
      </div>
    </form>
  );
}
