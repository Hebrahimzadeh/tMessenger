import type { AwarenessEventType } from '@taavon/database';

export interface DailyAggregateCounts {
  producedCount: number;
  meaningfulViewCount: number;
  publicContributionCount: number;
  appliedCount: number;
  privateChatStartedCount: number;
  reservationClosedCount: number;
}

const EMPTY_COUNTS: DailyAggregateCounts = {
  producedCount: 0,
  meaningfulViewCount: 0,
  publicContributionCount: 0,
  appliedCount: 0,
  privateChatStartedCount: 0,
  reservationClosedCount: 0,
};

const FIELD_BY_TYPE: Partial<Record<AwarenessEventType, keyof DailyAggregateCounts>> = {
  PRODUCED: 'producedCount',
  MEANINGFUL_VIEW: 'meaningfulViewCount',
  PUBLIC_CONTRIBUTION: 'publicContributionCount',
  APPLIED: 'appliedCount',
  PRIVATE_CHAT_STARTED: 'privateChatStartedCount',
  RESERVATION_CLOSED: 'reservationClosedCount',
};

/**
 * "aggregation روزانه produced/received/applied و public/private ratio
 * بساز" - a pure count of one day's events into the six buckets the
 * dashboard reads: produced, received (`meaningfulViewCount`), applied,
 * public contribution vs. private chat (the ratio - see
 * `publicPrivateRatio` below), and `reservationClosedCount` (Task 18's own
 * "metric اصلی تعداد کارت‌های به‌کارگرفته‌شده است" - the count of cards
 * genuinely put to use). `RESERVED` on its own is deliberately not a
 * counted column - it is already fully derivable from Task 16's own live
 * reservation state ("در حال حاضر چند رزرو باز است") and duplicating a raw
 * daily count of it here would only drift from that authoritative source
 * across cancel/re-reserve cycles.
 */
export function aggregateDay(events: Array<{ type: AwarenessEventType }>): DailyAggregateCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const event of events) {
    const field = FIELD_BY_TYPE[event.type];
    if (field) counts[field] += 1;
  }
  return counts;
}

/** Null (not zero, not Infinity) when there is nothing to divide by - a dashboard renders that as "no private chats yet", never a fake 0 or a division error. */
export function publicPrivateRatio(counts: DailyAggregateCounts): number | null {
  if (counts.privateChatStartedCount === 0) return null;
  return counts.publicContributionCount / counts.privateChatStartedCount;
}
