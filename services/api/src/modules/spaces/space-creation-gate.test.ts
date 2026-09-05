import { describe, expect, it } from 'vitest';
import { evaluateSpaceCreationGate } from './space-creation-gate';

const VALID_PURPOSE = 'این بستر برای هماهنگی داوطلبانه‌ی نگهداری باغچه‌ی محله تشکیل شده است.'; // > 20 chars

function definition(overrides: Partial<Parameters<typeof evaluateSpaceCreationGate>[0]> = {}) {
  return {
    title: 'باغ محله',
    purpose: VALID_PURPOSE,
    participationMethods: ['حضوری'],
    primaryRoleCount: 2,
    ...overrides,
  };
}

describe('evaluateSpaceCreationGate', () => {
  it('REVISE: purpose shorter than the minimum length, with a reason naming the gap', () => {
    const result = evaluateSpaceCreationGate(definition({ purpose: 'کوتاه' }));
    expect(result.verdict).toBe('REVISE');
    expect(result.reason).toMatch(/هدف/);
  });

  it('REVISE: no participation methods yet', () => {
    const result = evaluateSpaceCreationGate(definition({ participationMethods: [] }));
    expect(result.verdict).toBe('REVISE');
    expect(result.reason).toMatch(/مشارکت/);
  });

  it('REVISE: not exactly two primary roles (too few)', () => {
    const result = evaluateSpaceCreationGate(definition({ primaryRoleCount: 1 }));
    expect(result.verdict).toBe('REVISE');
    expect(result.reason).toMatch(/نقش/);
  });

  it('REVISE: not exactly two primary roles (too many)', () => {
    const result = evaluateSpaceCreationGate(definition({ primaryRoleCount: 3 }));
    expect(result.verdict).toBe('REVISE');
  });

  it('BLOCK: title or purpose contains an explicit banned fixture term, even when structurally complete', () => {
    const result = evaluateSpaceCreationGate(definition({ purpose: `${VALID_PURPOSE} این بستر برای قمار آنلاین است.` }));
    expect(result.verdict).toBe('BLOCK');
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it('BLOCK takes priority even if a review-flag term also appears in the same text', () => {
    const result = evaluateSpaceCreationGate(
      definition({ purpose: `${VALID_PURPOSE} تضمین سود از طریق کلاهبرداری.` })
    );
    expect(result.verdict).toBe('BLOCK');
  });

  it('HUMAN_REVIEW: structurally complete, no banned term, but matches a borderline review-flag fixture - never guessed as ALLOW', () => {
    const result = evaluateSpaceCreationGate(definition({ purpose: `${VALID_PURPOSE} با تضمین سود ثابت ماهانه.` }));
    expect(result.verdict).toBe('HUMAN_REVIEW');
  });

  it('ALLOW: structurally complete and no fixture rule matched', () => {
    const result = evaluateSpaceCreationGate(definition());
    expect(result.verdict).toBe('ALLOW');
  });

  it('is a pure function - the same input always produces the same verdict', () => {
    const input = definition();
    expect(evaluateSpaceCreationGate(input)).toEqual(evaluateSpaceCreationGate(input));
  });
});
