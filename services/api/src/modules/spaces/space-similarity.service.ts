import { normalizePersianLetters } from '../../lib/persian-text';

export interface SimilarityCandidate {
  spaceId: string;
  slug: string;
  title: string;
  purpose: string;
}

/** Matches `spaceSimilarItemSchema`'s wire shape exactly (`id`, not `spaceId`) - this is returned to the client as-is, not remapped in the route. */
export interface SimilarityResult {
  id: string;
  slug: string;
  title: string;
  overlapScore: number;
}

export interface SpaceSimilarityRepository {
  /** Every currently-PUBLISHED space's title/purpose - a candidate pool for token-overlap scoring. */
  listPublishedForSimilarity(): Promise<SimilarityCandidate[]>;
}

const TOKEN_SPLIT = /[^a-z0-9؀-ۿ]+/;

function tokenize(text: string): Set<string> {
  const normalized = normalizePersianLetters(text.trim().toLowerCase());
  return new Set(normalized.split(TOKEN_SPLIT).filter((token) => token.length > 0));
}

function jaccardOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersectionSize = 0;
  for (const token of a) {
    if (b.has(token)) intersectionSize += 1;
  }
  const unionSize = a.size + b.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

const DEFAULT_LIMIT = 5;

/**
 * Temporary, rule-based `SpaceCreationGate`-style adapter for "did someone
 * already build this?" (this task's own requirement: "similarity قاعده‌محور
 * را با token overlap عنوان/هدف بساز؛ AI در M5 تکمیل می‌کند"). Pure and
 * deterministic - Jaccard overlap of the normalized word sets from
 * title+purpose, same ي/ك normalization as slug.ts so spelling variants
 * still match. Candidates with zero overlap are dropped entirely rather
 * than shown as a weak, meaningless "5th similar result".
 */
export function rankSimilarSpaces(
  query: { title: string; purpose: string },
  candidates: SimilarityCandidate[],
  limit: number = DEFAULT_LIMIT
): SimilarityResult[] {
  const queryTokens = tokenize(`${query.title} ${query.purpose}`);

  return candidates
    .map((candidate) => ({
      id: candidate.spaceId,
      slug: candidate.slug,
      title: candidate.title,
      overlapScore: jaccardOverlap(queryTokens, tokenize(`${candidate.title} ${candidate.purpose}`)),
    }))
    .filter((result) => result.overlapScore > 0)
    .sort((a, b) => b.overlapScore - a.overlapScore)
    .slice(0, limit);
}

/**
 * `GET /spaces/similar`'s orchestration: fetch every published space's
 * title/purpose, then rank in application code. Intended to be called
 * while a space is still being drafted, before publish ("مشابهت قبل
 * انتشار") - the frontend (Task 12) offers exactly two CTAs per result,
 * "مشارکت در موجود" and "ادامهٔ ساخت مستقل"; there is no merge/transfer
 * action or backend endpoint of any kind for this - a result is purely
 * informational, and "joining" the existing space uses the same
 * join-a-role flow Task 10 already built, nothing new.
 */
export async function findSimilarSpaces(
  repo: SpaceSimilarityRepository,
  title: string,
  purpose: string,
  limit?: number
): Promise<SimilarityResult[]> {
  const candidates = await repo.listPublishedForSimilarity();
  return rankSimilarSpaces({ title, purpose }, candidates, limit);
}
