const TITLE_MAX_LENGTH = 80;
const EMPTY_TITLE_FALLBACK = 'کارت بدون عنوان';

/**
 * A client-side mirror of the API's own `deriveTitle` (services/api/src/
 * modules/cards/card-state-machine.ts) - used only for the composer's live
 * "preview-first" display before submission. The server's derivation is
 * still the one actually persisted; this never needs to agree byte-for-
 * byte, only closely enough that the preview isn't misleading.
 */
export function deriveTitlePreview(explicitTitle: string, body: string): string {
  const trimmedTitle = explicitTitle.trim();
  if (trimmedTitle.length > 0) return trimmedTitle;

  const firstLine = body.split('\n')[0]?.trim() ?? '';
  if (firstLine.length === 0) return EMPTY_TITLE_FALLBACK;

  return firstLine.length > TITLE_MAX_LENGTH ? firstLine.slice(0, TITLE_MAX_LENGTH).trimEnd() : firstLine;
}
