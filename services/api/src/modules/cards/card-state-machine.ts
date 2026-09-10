import type { CardAttachmentStatus } from '@taavon/database';

/**
 * The attachment lifecycle - "وضعیت پیوست PENDING|PROCESSING|READY|REJECTED".
 * PENDING is the bare intent; PROCESSING means real bytes landed via the
 * upload route; finalize is the one authoritative gate that moves it to
 * READY or REJECTED. READY and REJECTED are terminal - an attachment's
 * outcome never changes once decided, so a card view can trust that a
 * READY attachment stays valid and a REJECTED one is permanently out.
 */
const ALLOWED: ReadonlyArray<readonly [CardAttachmentStatus, CardAttachmentStatus]> = [
  ['PENDING', 'PROCESSING'],
  ['PENDING', 'REJECTED'],
  ['PROCESSING', 'READY'],
  ['PROCESSING', 'REJECTED'],
];

export function canTransitionAttachment(from: CardAttachmentStatus, to: CardAttachmentStatus): boolean {
  return ALLOWED.some(([f, t]) => f === from && t === to);
}

export function isTerminalAttachmentStatus(status: CardAttachmentStatus): boolean {
  return status === 'READY' || status === 'REJECTED';
}

const TITLE_MAX_LENGTH = 80;
const EMPTY_TITLE_FALLBACK = 'کارت بدون عنوان';

/**
 * A card's title is derived from its body when the author doesn't supply
 * one - "derivation عنوان" - so an attachment-only card (no body at all)
 * still has something to show in a list. Never fails, never returns an
 * empty string.
 */
export function deriveTitle(explicitTitle: string | undefined, body: string): string {
  const trimmedTitle = explicitTitle?.trim();
  if (trimmedTitle && trimmedTitle.length > 0) return trimmedTitle;

  const firstLine = body.split('\n')[0]?.trim() ?? '';
  if (firstLine.length === 0) return EMPTY_TITLE_FALLBACK;

  return firstLine.length > TITLE_MAX_LENGTH ? firstLine.slice(0, TITLE_MAX_LENGTH).trimEnd() : firstLine;
}
