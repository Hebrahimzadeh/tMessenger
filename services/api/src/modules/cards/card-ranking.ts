/**
 * Card feed ranking - "ranking را از relevance/تازگی/تنوع/health بسازد و
 * reaction فقط ضریب کوچک سقف‌دار باشد". A pure function over per-card
 * signals; the repository gathers the signals, this decides the order.
 *
 * The design invariant the plan calls out explicitly - "کارت پرپسند
 * نامرتبط بالاتر از مرتبط قرار نگیرد" - holds structurally: relevance
 * carries full weight (up to 1.0) while the *entire* reaction contribution
 * is capped at MAX_REACTION_BOOST (0.1), so no amount of popularity can
 * lift an irrelevant card over a clearly relevant one.
 */

export type SpaceHealthStatusForRanking = 'NEW' | 'ACTIVE' | 'FRAGILE' | 'DORMANT' | null;

export interface CardRankingSignals {
  cardId: string;
  authorId: string;
  /** 0..1 topic/text relevance to the current context. 1 when there is no query (same convention as space search). */
  relevance: number;
  /** Whole days since publish (>= 0). */
  ageDays: number;
  /** Distinct-user reaction count across all types. */
  reactionCount: number;
  /** The card's space health at ranking time - a fragile/dormant space's cards are gently down-weighted, never hidden. */
  spaceHealth: SpaceHealthStatusForRanking;
}

const RELEVANCE_WEIGHT = 1;
const RECENCY_WEIGHT = 0.4;
const HEALTH_WEIGHT = 0.15;
/** The whole reaction term can never exceed this. */
export const MAX_REACTION_BOOST = 0.1;
const REACTION_PER_UNIT = 0.02;
const RECENCY_HALF_LIFE_DAYS = 7;
/** Each further card by an author already placed is pushed down by this, compounding - "تنوع". */
const DIVERSITY_PENALTY_PER_REPEAT = 0.12;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function recencyScore(ageDays: number): number {
  return Math.pow(0.5, Math.max(0, ageDays) / RECENCY_HALF_LIFE_DAYS);
}

function healthScore(status: SpaceHealthStatusForRanking): number {
  switch (status) {
    case 'ACTIVE':
      return 1;
    case 'NEW':
      return 0.8;
    case 'FRAGILE':
      return 0.5;
    case 'DORMANT':
      return 0.2;
    default:
      return 0.6;
  }
}

export function reactionBoost(reactionCount: number): number {
  return Math.min(MAX_REACTION_BOOST, Math.max(0, reactionCount) * REACTION_PER_UNIT);
}

/** The score before the diversity re-rank - useful to test each term in isolation. */
export function baseCardScore(s: CardRankingSignals): number {
  return (
    RELEVANCE_WEIGHT * clamp01(s.relevance) +
    RECENCY_WEIGHT * recencyScore(s.ageDays) +
    HEALTH_WEIGHT * healthScore(s.spaceHealth) +
    reactionBoost(s.reactionCount)
  );
}

/**
 * Returns the card ids in feed order. Greedy diversity-aware ordering:
 * repeatedly take the best remaining card after applying a compounding
 * penalty for how many of its author's cards are already placed, so one
 * prolific author cannot monopolize the top of the feed.
 */
export function rankCards(signals: CardRankingSignals[]): string[] {
  const scored = signals.map((s) => ({ id: s.cardId, authorId: s.authorId, score: baseCardScore(s) }));
  const seenByAuthor = new Map<string, number>();
  const ordered: string[] = [];
  const remaining = [...scored];

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestAdjusted = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const r = remaining[i]!;
      const repeats = seenByAuthor.get(r.authorId) ?? 0;
      const adjusted = r.score - repeats * DIVERSITY_PENALTY_PER_REPEAT;
      if (adjusted > bestAdjusted || (adjusted === bestAdjusted && r.id < remaining[bestIdx]!.id)) {
        bestAdjusted = adjusted;
        bestIdx = i;
      }
    }
    const picked = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(picked.id);
    seenByAuthor.set(picked.authorId, (seenByAuthor.get(picked.authorId) ?? 0) + 1);
  }

  return ordered;
}
