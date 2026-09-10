import { describe, expect, it } from 'vitest';
import type { ReservationState } from '@taavon/database';
import {
  canTransitionAttachment,
  canTransitionReservation,
  deriveTitle,
  isTerminalAttachmentStatus,
  isTerminalReservationState,
} from './card-state-machine';

describe('canTransitionAttachment', () => {
  it('PENDING -> PROCESSING when the upload lands', () => {
    expect(canTransitionAttachment('PENDING', 'PROCESSING')).toBe(true);
  });

  it('PROCESSING -> READY and PROCESSING -> REJECTED are the two finalize outcomes', () => {
    expect(canTransitionAttachment('PROCESSING', 'READY')).toBe(true);
    expect(canTransitionAttachment('PROCESSING', 'REJECTED')).toBe(true);
  });

  it('PENDING -> REJECTED is allowed (a never-uploaded or invalid intent can be rejected outright)', () => {
    expect(canTransitionAttachment('PENDING', 'REJECTED')).toBe(true);
  });

  it('never allows going backwards or skipping PROCESSING', () => {
    expect(canTransitionAttachment('PROCESSING', 'PENDING')).toBe(false);
    expect(canTransitionAttachment('PENDING', 'READY')).toBe(false);
  });

  it('READY and REJECTED are terminal - no transition out of either', () => {
    expect(canTransitionAttachment('READY', 'PROCESSING')).toBe(false);
    expect(canTransitionAttachment('READY', 'REJECTED')).toBe(false);
    expect(canTransitionAttachment('REJECTED', 'READY')).toBe(false);
    expect(canTransitionAttachment('REJECTED', 'PROCESSING')).toBe(false);
  });

  it('a no-op transition to the same status is not a valid transition', () => {
    expect(canTransitionAttachment('READY', 'READY')).toBe(false);
    expect(canTransitionAttachment('PENDING', 'PENDING')).toBe(false);
  });
});

describe('isTerminalAttachmentStatus', () => {
  it('READY and REJECTED are terminal, PENDING and PROCESSING are not', () => {
    expect(isTerminalAttachmentStatus('READY')).toBe(true);
    expect(isTerminalAttachmentStatus('REJECTED')).toBe(true);
    expect(isTerminalAttachmentStatus('PENDING')).toBe(false);
    expect(isTerminalAttachmentStatus('PROCESSING')).toBe(false);
  });
});

describe('deriveTitle', () => {
  it('uses an explicit title verbatim when given', () => {
    expect(deriveTitle('کمک به آبیاری باغچه', 'a long body of text here')).toBe('کمک به آبیاری باغچه');
  });

  it('derives from the first line of the body when no title is given', () => {
    expect(deriveTitle(undefined, 'خط اول\nخط دوم و توضیحات بیشتر')).toBe('خط اول');
  });

  it('truncates a long first line to a sensible length', () => {
    const longLine = 'الف '.repeat(80).trim();
    const title = deriveTitle(undefined, longLine);
    expect(title.length).toBeLessThanOrEqual(80);
  });

  it('falls back to a fixed placeholder when there is no body and no title (attachment-only card)', () => {
    expect(deriveTitle(undefined, '')).toBe('کارت بدون عنوان');
    expect(deriveTitle('   ', '   ')).toBe('کارت بدون عنوان');
  });

  it('trims surrounding whitespace on the derived line', () => {
    expect(deriveTitle(undefined, '   عنوان با فاصله   \nبدنه')).toBe('عنوان با فاصله');
  });
});

describe('canTransitionReservation ("جدول transition مجاز")', () => {
  it('ACTIVE -> RESERVED is the only way in (no accept step)', () => {
    expect(canTransitionReservation('ACTIVE', 'RESERVED')).toBe(true);
  });

  it('RESERVED can go back to ACTIVE (cancel or release) or forward to IN_USE or straight to closed', () => {
    expect(canTransitionReservation('RESERVED', 'ACTIVE')).toBe(true);
    expect(canTransitionReservation('RESERVED', 'IN_USE')).toBe(true);
    expect(canTransitionReservation('RESERVED', 'RESERVATION_CLOSED')).toBe(true);
  });

  it('IN_USE can only close, never go back to RESERVED or ACTIVE', () => {
    expect(canTransitionReservation('IN_USE', 'RESERVATION_CLOSED')).toBe(true);
    expect(canTransitionReservation('IN_USE', 'RESERVED')).toBe(false);
    expect(canTransitionReservation('IN_USE', 'ACTIVE')).toBe(false);
  });

  it('RESERVATION_CLOSED is terminal - every transition out of it is invalid ("reopen 409")', () => {
    const targets: ReservationState[] = ['ACTIVE', 'RESERVED', 'IN_USE', 'RESERVATION_CLOSED'];
    for (const to of targets) {
      expect(canTransitionReservation('RESERVATION_CLOSED', to)).toBe(false);
    }
  });

  it('never skips a step: ACTIVE cannot jump straight to IN_USE or RESERVATION_CLOSED', () => {
    expect(canTransitionReservation('ACTIVE', 'IN_USE')).toBe(false);
    expect(canTransitionReservation('ACTIVE', 'RESERVATION_CLOSED')).toBe(false);
  });
});

describe('isTerminalReservationState', () => {
  it('only RESERVATION_CLOSED is terminal', () => {
    expect(isTerminalReservationState('RESERVATION_CLOSED')).toBe(true);
    expect(isTerminalReservationState('ACTIVE')).toBe(false);
    expect(isTerminalReservationState('RESERVED')).toBe(false);
    expect(isTerminalReservationState('IN_USE')).toBe(false);
  });
});
