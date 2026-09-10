'use client';

import { useEffect, useRef, useState } from 'react';
import type { UploadableAttachmentKind } from '@taavon/contracts';
import { finalizeAttachmentResponseSchema, uploadIntentResponseSchema } from '@taavon/contracts';
import { apiBaseUrl, apiFetch, ApiError } from '@/lib/api/client';
import { MediaPreview } from './MediaPreview';

export interface CardAttachmentPickerProps {
  /** The ids of currently-READY attachments, in picker order - the parent (CardComposer) sends exactly these on submit. */
  onChange: (readyAttachmentIds: string[]) => void;
  disabled?: boolean;
}

type PendingStatus = 'uploading' | 'finalizing' | 'ready' | 'rejected';

interface PendingAttachment {
  localId: string;
  kind: UploadableAttachmentKind;
  file: File;
  status: PendingStatus;
  progress: number;
  attachmentId?: string;
  rejectionReason?: string | null;
  altText: string;
  xhr?: XMLHttpRequest;
}

const KIND_LABELS: Record<UploadableAttachmentKind, string> = {
  IMAGE: 'تصویر',
  AUDIO: 'صوت',
  VIDEO: 'ویدئو',
  FILE: 'فایل',
};

const KIND_ACCEPT: Record<UploadableAttachmentKind, string> = {
  IMAGE: 'image/*',
  AUDIO: 'audio/*',
  VIDEO: 'video/*',
  FILE: 'application/pdf',
};

const REJECTION_MESSAGES: Record<string, string> = {
  EMPTY_FILE: 'فایل خالی است.',
  TOO_LARGE: 'حجم فایل بیش از حد مجاز است.',
  UNRECOGNIZED_CONTENT: 'نوع فایل قابل شناسایی نیست.',
  TYPE_NOT_ALLOWED: 'این نوع فایل برای این دسته مجاز نیست.',
};

function describeRejection(reason: string | null | undefined): string {
  if (!reason) return 'این پیوست پذیرفته نشد.';
  return reason
    .split(',')
    .map((code) => REJECTION_MESSAGES[code] ?? code)
    .join(' ');
}

/** Bypasses `apiFetch` on purpose - `fetch` gives no upload-progress events at all, and this is the one place the plan explicitly asks for one ("پیشرفت upload"). Cookie-based session auth still applies (`withCredentials`); this route has no CSRF check to replicate (Task 07's CSRF verification is scoped to the auth routes only). */
function uploadWithProgress(
  attachmentId: string,
  file: File,
  onProgress: (percent: number) => void,
  onXhrReady: (xhr: XMLHttpRequest) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onXhrReady(xhr);
    xhr.open('POST', `${apiBaseUrl()}/storage/uploads/${attachmentId}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('upload_failed'));
    };
    xhr.onerror = () => reject(new Error('network_error'));
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.send(file);
  });
}

export function CardAttachmentPicker({ onChange, disabled }: CardAttachmentPickerProps) {
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const inputRefs = useRef<Partial<Record<UploadableAttachmentKind, HTMLInputElement | null>>>({});

  useEffect(() => {
    onChange(items.filter((item) => item.status === 'ready' && item.attachmentId).map((item) => item.attachmentId!));
  }, [items, onChange]);

  function updateItem(localId: string, patch: Partial<PendingAttachment>) {
    setItems((prev) => prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }

  async function startUpload(file: File, kind: UploadableAttachmentKind) {
    const localId = crypto.randomUUID();
    setItems((prev) => [...prev, { localId, kind, file, status: 'uploading', progress: 0, altText: '' }]);

    try {
      const intent = uploadIntentResponseSchema.parse(
        await apiFetch('/cards/attachments/upload-intent', { method: 'POST', body: JSON.stringify({ kind }) })
      );
      updateItem(localId, { attachmentId: intent.attachmentId });

      await uploadWithProgress(
        intent.attachmentId,
        file,
        (progress) => updateItem(localId, { progress }),
        (xhr) => updateItem(localId, { xhr })
      );

      updateItem(localId, { status: 'finalizing' });
      const result = finalizeAttachmentResponseSchema.parse(
        await apiFetch(`/cards/attachments/${intent.attachmentId}/finalize`, { method: 'POST' })
      );
      if (result.status === 'READY') {
        updateItem(localId, { status: 'ready', progress: 100 });
      } else {
        updateItem(localId, { status: 'rejected', rejectionReason: result.rejectionReason });
      }
    } catch (err) {
      updateItem(localId, {
        status: 'rejected',
        rejectionReason: err instanceof ApiError ? err.message : 'بارگذاری با خطا مواجه شد.',
      });
    }
  }

  function handlePick(kind: UploadableAttachmentKind, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) startUpload(file, kind);
  }

  function cancel(item: PendingAttachment) {
    item.xhr?.abort();
    setItems((prev) => prev.filter((i) => i.localId !== item.localId));
  }

  function retry(item: PendingAttachment) {
    setItems((prev) => prev.filter((i) => i.localId !== item.localId));
    startUpload(item.file, item.kind);
  }

  return (
    <div dir="rtl" className="space-y-3 text-right">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(KIND_LABELS) as UploadableAttachmentKind[]).map((kind) => (
          <div key={kind}>
            <input
              ref={(el) => {
                inputRefs.current[kind] = el;
              }}
              type="file"
              accept={KIND_ACCEPT[kind]}
              className="hidden"
              disabled={disabled}
              onChange={(event) => handlePick(kind, event)}
              aria-label={`افزودن ${KIND_LABELS[kind]}`}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRefs.current[kind]?.click()}
              className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"
            >
              افزودن {KIND_LABELS[kind]}
            </button>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.localId} className="space-y-1 rounded-xl border border-gray-200 p-2">
              <MediaPreview item={{ source: 'local', file: item.file, kind: item.kind }} altText={item.altText} />

              {item.status === 'uploading' && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <progress value={item.progress} max={100} className="h-1.5 flex-1" />
                  <span dir="ltr">{item.progress}%</span>
                </div>
              )}
              {item.status === 'finalizing' && <p className="text-xs text-gray-500">در حال بررسی...</p>}
              {item.status === 'ready' && <p className="text-xs text-green-700">آمادهٔ افزودن به کارت</p>}
              {item.status === 'rejected' && (
                <p role="alert" className="text-xs text-red-700">
                  {describeRejection(item.rejectionReason)}
                </p>
              )}

              <label className="block text-xs text-gray-500">
                شرح دسترس‌پذیر (اختیاری)
                <input
                  type="text"
                  value={item.altText}
                  onChange={(event) => updateItem(item.localId, { altText: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-200 p-1.5 text-xs"
                  placeholder="توضیحی کوتاه برای این پیوست..."
                />
              </label>

              <div className="flex gap-2">
                {item.status === 'rejected' ? (
                  <button type="button" onClick={() => retry(item)} className="text-xs font-medium text-blue-700">
                    تلاش دوباره
                  </button>
                ) : null}
                <button type="button" onClick={() => cancel(item)} className="text-xs font-medium text-red-600">
                  {item.status === 'uploading' ? 'لغو' : 'حذف'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
