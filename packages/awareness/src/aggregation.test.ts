import { describe, expect, it } from 'vitest';
import { aggregateDay, publicPrivateRatio } from './aggregation';

describe('aggregateDay', () => {
  it('counts each event type into its own bucket', () => {
    const counts = aggregateDay([
      { type: 'PRODUCED' },
      { type: 'PRODUCED' },
      { type: 'MEANINGFUL_VIEW' },
      { type: 'PUBLIC_CONTRIBUTION' },
      { type: 'APPLIED' },
      { type: 'PRIVATE_CHAT_STARTED' },
      { type: 'RESERVATION_CLOSED' },
    ]);
    expect(counts).toEqual({
      producedCount: 2,
      meaningfulViewCount: 1,
      publicContributionCount: 1,
      appliedCount: 1,
      privateChatStartedCount: 1,
      reservationClosedCount: 1,
    });
  });

  it('does not add a column for RESERVED - it stays derivable from live reservation state, not double-counted here', () => {
    const counts = aggregateDay([{ type: 'RESERVED' }, { type: 'RESERVED' }]);
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });

  it('returns all zeros for an empty day - never crashes on no events', () => {
    expect(aggregateDay([])).toEqual({
      producedCount: 0,
      meaningfulViewCount: 0,
      publicContributionCount: 0,
      appliedCount: 0,
      privateChatStartedCount: 0,
      reservationClosedCount: 0,
    });
  });
});

describe('publicPrivateRatio', () => {
  it('divides public contributions by private chats started', () => {
    expect(publicPrivateRatio({ producedCount: 0, meaningfulViewCount: 0, appliedCount: 0, publicContributionCount: 6, privateChatStartedCount: 3, reservationClosedCount: 0 })).toBe(2);
  });

  it('is null (not zero, not Infinity) when there are no private chats to divide by', () => {
    expect(publicPrivateRatio({ producedCount: 0, meaningfulViewCount: 0, appliedCount: 0, publicContributionCount: 5, privateChatStartedCount: 0, reservationClosedCount: 0 })).toBeNull();
  });
});
