import { normalizePersianLetters } from '../../lib/persian-text';

export class FollowingScopeRequiresSessionError extends Error {
  constructor() {
    super('scope=following requires an authenticated caller.');
    this.name = 'FollowingScopeRequiresSessionError';
  }
}

export class InvalidCursorError extends Error {
  constructor() {
    super('This cursor is invalid or malformed.');
    this.name = 'InvalidCursorError';
  }
}

export interface SpaceSearchResultRecord {
  id: string;
  slug: string;
  title: string;
  purpose: string;
  followerCount: number;
  publishedAt: Date;
  /** Trigram similarity to the query (1 when there is no query text - see space-search.repository.ts). Internal ranking input only, never returned to the client. */
  score: number;
}

/** The keyset a client's opaque cursor decodes to - see `encodeCursor`/`decodeCursor` below. Never constructed or read outside this module. */
export interface SpaceSearchCursor {
  score: number;
  followerCount: number;
  publishedAt: string;
  id: string;
}

export interface SpaceSearchRepository {
  /**
   * Ranked by `(score DESC, followerCount DESC, publishedAt DESC, id DESC)`
   * ("ranking بر relevance، تازگی و health باشد؛ popularity تنها عامل نباشد" -
   * relevance is the trigram score, "تازگی" is publishedAt, "health" is
   * follower count as the only real engagement signal that exists this
   * early in the plan - see this task's review note). Only PUBLISHED spaces
   * are ever candidates - "دسترسی عمومی فقط PUBLISHED را برگرداند" carries
   * over from Task 10, so suspended/archived/removed/draft spaces are
   * structurally excluded, not filtered after the fact.
   */
  search(params: {
    normalizedQuery: string;
    scope: 'all' | 'following';
    userId: string | null;
    limit: number;
    after: SpaceSearchCursor | null;
  }): Promise<SpaceSearchResultRecord[]>;
  /** Idempotent - following a space already followed is a no-op, not an error. */
  followSpace(spaceId: string, userId: string): Promise<void>;
  /** Idempotent - unfollowing a space never followed is a no-op, not an error. */
  unfollowSpace(spaceId: string, userId: string): Promise<void>;
}

function encodeCursor(cursor: SpaceSearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): SpaceSearchCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as SpaceSearchCursor).score === 'number' &&
      typeof (parsed as SpaceSearchCursor).followerCount === 'number' &&
      typeof (parsed as SpaceSearchCursor).publishedAt === 'string' &&
      typeof (parsed as SpaceSearchCursor).id === 'string'
    ) {
      return parsed as SpaceSearchCursor;
    }
    throw new Error('shape mismatch');
  } catch {
    throw new InvalidCursorError();
  }
}

export interface SearchSpacesResult {
  items: Array<Omit<SpaceSearchResultRecord, 'score'>>;
  nextCursor: string | null;
}

/**
 * `GET /spaces?q=&cursor=&limit=&scope=`. Keyset (not offset) pagination:
 * the cursor encodes the exact sort-tuple of the last item on the previous
 * page, so a page fetched a moment later never repeats or omits an item
 * because of the pagination mechanism itself moving an offset around a
 * space published in between - see this task's own review note on what
 * "stable" does and does not guarantee here.
 */
export async function searchSpaces(
  repo: SpaceSearchRepository,
  params: { query?: string; scope: 'all' | 'following'; userId: string | null; limit: number; cursor?: string }
): Promise<SearchSpacesResult> {
  if (params.scope === 'following' && !params.userId) {
    throw new FollowingScopeRequiresSessionError();
  }

  const normalizedQuery = normalizePersianLetters((params.query ?? '').trim().toLowerCase());
  const after = params.cursor ? decodeCursor(params.cursor) : null;

  // Fetch one extra row to know whether a next page exists, without a
  // separate count query.
  const rows = await repo.search({ normalizedQuery, scope: params.scope, userId: params.userId, limit: params.limit + 1, after });
  const hasMore = rows.length > params.limit;
  const page = rows.slice(0, params.limit);
  const last = page[page.length - 1];

  return {
    items: page.map(({ score: _score, ...item }) => item),
    nextCursor:
      hasMore && last
        ? encodeCursor({ score: last.score, followerCount: last.followerCount, publishedAt: last.publishedAt.toISOString(), id: last.id })
        : null,
  };
}

export async function followSpace(repo: SpaceSearchRepository, spaceId: string, userId: string): Promise<void> {
  await repo.followSpace(spaceId, userId);
}

export async function unfollowSpace(repo: SpaceSearchRepository, spaceId: string, userId: string): Promise<void> {
  await repo.unfollowSpace(spaceId, userId);
}
