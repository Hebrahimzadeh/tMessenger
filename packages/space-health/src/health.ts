import type { SpaceHealthStatus } from '@taavon/database';

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_GRACE_DAYS = 7;
const FRAGILE_AFTER_DAYS = 14;
const DORMANT_AFTER_DAYS = 30;
const MIN_HEALTHY_CONTRIBUTORS = 2;

export interface HealthSignals {
  publishedAt: Date;
  /** Most recent real engagement signal available today - see repository.ts for exactly what feeds this (role joins, definition edits); real card/reaction/view events (Task 14/15) will feed it too once they exist. */
  lastActivityAt: Date | null;
  contributorCount: number;
  totalRoleCount: number;
  /** Roles with at least one real contributor. */
  activeRoleCount: number;
  cardCount: number;
}

function daysSince(from: Date, now: Date): number {
  return (now.getTime() - from.getTime()) / DAY_MS;
}

/**
 * Rule-based, multi-dimensional status ("health رفتار اتصال را چندبعدی
 * می‌سنجد") - recency of activity and contributor count are independent
 * inputs, neither one alone decides the outcome. A brand-new space always
 * gets a grace period regardless of how quiet it's been, so publishing
 * itself is never penalized. Shared by services/api (the on-demand health
 * endpoint) and services/worker (the daily batch job) - this is genuine,
 * non-trivial business logic neither service should duplicate or reach
 * into the other's private module tree for.
 */
export function computeHealthStatus(signals: HealthSignals, now: Date): SpaceHealthStatus {
  if (daysSince(signals.publishedAt, now) < NEW_GRACE_DAYS) {
    return 'NEW';
  }

  const reference = signals.lastActivityAt ?? signals.publishedAt;
  const staleDays = daysSince(reference, now);

  if (staleDays >= DORMANT_AFTER_DAYS) return 'DORMANT';
  if (staleDays >= FRAGILE_AFTER_DAYS || signals.contributorCount < MIN_HEALTHY_CONTRIBUTORS) return 'FRAGILE';
  return 'ACTIVE';
}

export type HealthSuggestionCode = 'CREATE_FIRST_CARD' | 'IMPROVE_INTRO' | 'RECRUIT_UNDERACTIVE_ROLE' | 'CONSIDER_ARCHIVE_OR_SIMILAR';

export interface HealthSuggestion {
  code: HealthSuggestionCode;
}

/**
 * Purely advisory text for the creator's own dashboard - "فقط پیشنهاد و
 * اعلان ثبت کن" (record a suggestion/notification only). This function has
 * no side effects and never touches a Space's own status/data: there is no
 * archive, merge, or transfer action anywhere in this module's vocabulary,
 * and nothing here is ever invoked automatically against a space by the
 * worker job - it only computes text for a human to read and decide on.
 */
export function computeSuggestions(signals: HealthSignals, status: SpaceHealthStatus): HealthSuggestion[] {
  const suggestions: HealthSuggestion[] = [];

  if (status !== 'NEW' && signals.cardCount === 0) {
    suggestions.push({ code: 'CREATE_FIRST_CARD' });
  }
  if (status === 'FRAGILE') {
    suggestions.push({ code: 'IMPROVE_INTRO' });
  }
  if (signals.totalRoleCount > 0 && signals.activeRoleCount < signals.totalRoleCount) {
    suggestions.push({ code: 'RECRUIT_UNDERACTIVE_ROLE' });
  }
  if (status === 'DORMANT') {
    suggestions.push({ code: 'CONSIDER_ARCHIVE_OR_SIMILAR' });
  }

  return suggestions;
}
