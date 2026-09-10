import type { UploadableAttachmentKind } from '@taavon/contracts';

/**
 * The initial allowlist - "allowlist اولیه را تصویر، صوت، ویدئو و فایل سند
 * تعریف کن". Deliberately narrow: only content types this app can actually
 * sniff from magic bytes below, so a file's declared kind can be checked
 * against what the bytes really are, not what a header claims. New types
 * are a one-line addition here plus a matching signature in `sniffContentType`.
 */
export const ALLOWLIST: Record<UploadableAttachmentKind, readonly string[]> = {
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  AUDIO: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
  VIDEO: ['video/mp4', 'video/webm'],
  FILE: ['application/pdf'],
};

function startsWith(buf: Buffer, ...prefix: number[]): boolean {
  if (buf.length < prefix.length) return false;
  return prefix.every((byte, i) => buf[i] === byte);
}

function hasAsciiAt(buf: Buffer, offset: number, ascii: string): boolean {
  if (buf.length < offset + ascii.length) return false;
  return buf.toString('latin1', offset, offset + ascii.length) === ascii;
}

/**
 * Best-effort content-type detection from the leading bytes only. Returns
 * a canonical MIME string for a recognized type, or null - a null result
 * means "do not trust this file", and the caller rejects the attachment.
 */
export function sniffContentType(buf: Buffer): string | null {
  if (buf.length === 0) return null;

  if (startsWith(buf, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(buf, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (hasAsciiAt(buf, 0, 'GIF87a') || hasAsciiAt(buf, 0, 'GIF89a')) return 'image/gif';
  if (hasAsciiAt(buf, 0, '%PDF-')) return 'application/pdf';
  if (startsWith(buf, 0x1a, 0x45, 0xdf, 0xa3)) return 'video/webm';
  if (startsWith(buf, 0x4f, 0x67, 0x67, 0x53)) return 'audio/ogg';

  // RIFF containers: WEBP (image) and WAVE (audio) share the same first 4 bytes.
  if (hasAsciiAt(buf, 0, 'RIFF')) {
    if (hasAsciiAt(buf, 8, 'WEBP')) return 'image/webp';
    if (hasAsciiAt(buf, 8, 'WAVE')) return 'audio/wav';
    return null;
  }

  // MP3: an ID3v2 tag, or a raw MPEG audio frame sync (11 set bits).
  if (hasAsciiAt(buf, 0, 'ID3')) return 'audio/mpeg';
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return 'audio/mpeg';

  // ISO base media (MP4/MOV): a `ftyp` box at offset 4.
  if (hasAsciiAt(buf, 4, 'ftyp')) return 'video/mp4';

  return null;
}

export function isContentTypeAllowedForKind(kind: UploadableAttachmentKind, contentType: string | null): boolean {
  if (contentType === null) return false;
  return ALLOWLIST[kind].includes(contentType);
}
