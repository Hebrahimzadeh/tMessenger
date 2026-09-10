'use client';

import { useEffect, useState } from 'react';
import type { CardAttachmentView, UploadableAttachmentKind } from '@taavon/contracts';
import { FileText } from '@/components/icons';

export type MediaPreviewSource =
  | { source: 'local'; file: File; kind: UploadableAttachmentKind }
  | { source: 'remote'; attachment: CardAttachmentView };

export interface MediaPreviewProps {
  item: MediaPreviewSource;
  /** "شرح دسترس‌پذیر" - the accessible description the uploader wrote for this attachment. */
  altText?: string;
}

function useObjectUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    // Syncing with an external system (the browser's object-URL registry) -
    // exactly the sanctioned use case for a direct setState call in an
    // effect body, per React's own docs on this rule.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  // Derived rather than reset-in-effect: as soon as `file` goes away the
  // hook returns null immediately, without needing a matching setState
  // call in the effect body just to clear stale state.
  return file ? url : null;
}

/**
 * Renders one attachment, whether it is still a local file waiting to
 * upload (a preview only - never sent anywhere as-is) or an already
 * finalized, server-attached one. A REJECTED or not-yet-`READY` remote
 * attachment never reaches this component with a `readUrl` at all (see
 * card.route.ts's `toCardResponse`), so there is nothing here that can
 * accidentally render forbidden media.
 */
export function MediaPreview({ item, altText }: MediaPreviewProps) {
  const localUrl = useObjectUrl(item.source === 'local' ? item.file : null);

  if (item.source === 'local') {
    const { kind } = item;
    if (kind === 'IMAGE') {
      if (!localUrl) return null;
      // next/image cannot render a blob: object URL at all (no server round-trip is possible for a local, not-yet-uploaded file).
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={localUrl} alt={altText ?? ''} className="max-h-48 rounded-xl border border-gray-200 object-contain" />;
    }
    if (kind === 'AUDIO') {
      return localUrl ? <audio controls src={localUrl} aria-label={altText ?? 'پیش‌نمایش فایل صوتی'} className="w-full" /> : null;
    }
    if (kind === 'VIDEO') {
      return localUrl ? (
        <video controls src={localUrl} aria-label={altText ?? 'پیش‌نمایش فایل ویدئویی'} className="max-h-48 w-full rounded-xl" />
      ) : null;
    }
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 p-2 text-sm text-gray-700">
        <FileText size={18} className="text-gray-400" />
        <span className="truncate">{item.file.name}</span>
      </div>
    );
  }

  const { attachment } = item;
  const description = altText ?? undefined;

  if (attachment.kind === 'IMAGE' && attachment.readUrl) {
    // next/image would need the signed URL's host on an allowlist and would re-fetch it server-side before the short-lived signature expires - a plain <img> is the correct fit for a time-limited signed URL.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={attachment.readUrl} alt={description ?? ''} className="max-h-64 w-full rounded-xl border border-gray-200 object-contain" />;
  }
  if (attachment.kind === 'AUDIO' && attachment.readUrl) {
    return <audio controls src={attachment.readUrl} aria-label={description ?? 'فایل صوتی'} className="w-full" />;
  }
  if (attachment.kind === 'VIDEO' && attachment.readUrl) {
    return <video controls src={attachment.readUrl} aria-label={description ?? 'فایل ویدئویی'} className="max-h-64 w-full rounded-xl" />;
  }
  if (attachment.kind === 'FILE' && attachment.readUrl) {
    return (
      <a
        href={attachment.readUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="flex items-center gap-2 rounded-xl border border-gray-200 p-3 text-sm text-blue-700 underline"
        aria-label={description ?? 'دریافت فایل'}
      >
        <FileText size={18} />
        دریافت فایل
      </a>
    );
  }
  if (attachment.kind === 'LINK' && attachment.linkUrl) {
    return (
      <a
        href={attachment.linkUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="flex items-center gap-2 rounded-xl border border-gray-200 p-3 text-sm text-blue-700 underline"
      >
        {attachment.linkUrl}
      </a>
    );
  }
  if (attachment.kind === 'APPROXIMATE_LOCATION' && attachment.locationLabel) {
    return <div className="rounded-xl border border-gray-200 p-3 text-sm text-gray-700">📍 {attachment.locationLabel}</div>;
  }

  return null;
}
