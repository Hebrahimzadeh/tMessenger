/**
 * Deterministic, Persian/Latin-safe slug generation for space titles (this
 * task's own "slug فارسی/لاتین امن" requirement). Persian text is kept
 * as-is rather than transliterated to Latin - Persian has no upper/lower
 * case, and a transliteration scheme would be lossy and unfamiliar to
 * Persian-speaking users reading or sharing the resulting URL. Latin text
 * is lowercased. Arabic-style ي/ك are normalized to the Persian ی/ک forms
 * first, so two titles differing only by that common input variation (the
 * same normalization Task 11's search will need) collapse to one slug.
 */
function normalizePersianLetters(input: string): string {
  return input.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
}

const NON_SLUG_CHARS = /[^a-z0-9؀-ۿ]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;

export function slugify(title: string): string {
  const normalized = normalizePersianLetters(title.trim().toLowerCase());
  const hyphenated = normalized.replace(NON_SLUG_CHARS, '-').replace(EDGE_HYPHENS, '');
  return hyphenated.length > 0 ? hyphenated : 'space';
}

/**
 * Deterministic collision strategy: try the bare slug, then `${slug}-2`,
 * `${slug}-3`, ... until `exists` reports one that isn't taken. `exists` is
 * injected so this stays pure/testable without a real repository.
 */
export async function generateUniqueSlug(baseTitle: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
  const base = slugify(baseTitle);
  let candidate = base;
  let suffix = 2;
  while (await exists(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
