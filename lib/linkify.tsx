import type { ReactNode } from 'react';

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/**
 * "متن را plain text render کن و link را با rel امن نمایش بده" - the body
 * is never treated as HTML (no `dangerouslySetInnerHTML` anywhere), so
 * there is no XSS surface; only a bare `http(s)://` URL inside otherwise
 * plain text becomes a real, clickable `<a>` with a safe `rel`
 * (`noopener noreferrer nofollow` - no window-hijack, no referrer leak, no
 * SEO credit for arbitrary user-submitted links) and `target="_blank"`.
 * Everything else renders as literal text.
 */
export function renderPlainTextWithLinks(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  URL_PATTERN.lastIndex = 0;
  while ((match = URL_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[0];
    parts.push(
      <a key={key++} href={url} target="_blank" rel="noopener noreferrer nofollow" className="underline">
        {url}
      </a>
    );
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
