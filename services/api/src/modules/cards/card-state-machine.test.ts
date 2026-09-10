import { describe, expect, it } from 'vitest';
import { canTransitionAttachment, isTerminalAttachmentStatus, deriveTitle } from './card-state-machine';

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
