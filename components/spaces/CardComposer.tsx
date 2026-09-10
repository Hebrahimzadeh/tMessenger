'use client';

import { useState, type FormEvent } from 'react';
import type { CardResponse } from '@taavon/contracts';
import { cardResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { deriveTitlePreview } from '@/lib/derive-title';
import { CardAttachmentPicker } from './CardAttachmentPicker';

export interface CardComposerProps {
  spaceId: string;
  /** Prefills the body - used by DuplicateCardAction to start a fresh draft from an old card's text. */
  initialBody?: string;
  onCreated: (card: CardResponse) => void;
  onCancel?: () => void;
}

/**
 * "composer را تک‌ورودی و preview-first بساز؛ انتخاب kind اجباری نباشد" -
 * one primary text field (the title is an optional, collapsed extra), no
 * kind selector anywhere (the API defaults it to AWARENESS and infers a
 * guess on its own), and a live preview of the card as it will actually
 * look renders as soon as there is anything to preview. "متن کلی را نیز
 * قابل ارسال نگه دار" - completely generic, unstructured text is always a
 * valid submission; the preview here is the plain rule-based derivation
 * (`deriveTitlePreview`), not any AI generation (Task 25).
 */
export function CardComposer({ spaceId, initialBody, onCreated, onCancel }: CardComposerProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState(initialBody ?? '');
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedBody = body.trim();
  const hasContent = trimmedBody.length > 0 || attachmentIds.length > 0;
  const canSubmit = hasContent && !submitting;
  const previewTitle = deriveTitlePreview(title, body);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = cardResponseSchema.parse(
        await apiFetch(`/spaces/${spaceId}/cards`, {
          method: 'POST',
          body: JSON.stringify({
            body: trimmedBody,
            ...(title.trim() ? { title: title.trim() } : {}),
            attachmentIds,
          }),
        })
      );
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ثبت کارت ممکن نشد.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form dir="rtl" onSubmit={handleSubmit} className="space-y-3 text-right">
      <div>
        <label htmlFor="card-composer-body" className="sr-only">
          متن کارت
        </label>
        <textarea
          id="card-composer-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="هر چیزی که می‌خواهید با محله در میان بگذارید..."
          rows={4}
          disabled={submitting}
          className="w-full rounded-xl border border-gray-300 p-3 text-sm"
        />
      </div>

      <details>
        <summary className="cursor-pointer text-xs font-medium text-gray-500">افزودن عنوان (اختیاری)</summary>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={submitting}
          placeholder="عنوان کوتاه..."
          className="mt-2 w-full rounded-xl border border-gray-200 p-2 text-sm"
        />
      </details>

      <CardAttachmentPicker onChange={setAttachmentIds} disabled={submitting} />

      {hasContent && (
        <div className="rounded-xl border border-dashed border-gray-300 p-3">
          <p className="mb-1 text-xs font-medium text-gray-400">پیش‌نمایش کارت</p>
          <p className="font-medium text-gray-900">{previewTitle}</p>
          {trimmedBody && <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{body}</p>}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          ثبت کارت
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={submitting} className="rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-700">
            انصراف
          </button>
        )}
      </div>
    </form>
  );
}
