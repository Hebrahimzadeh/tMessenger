import { describe, expect, it } from 'vitest';
import { apiError } from './api-error';

function fakeRequest(id: string) {
  return { id } as import('fastify').FastifyRequest;
}

describe('apiError', () => {
  it('builds the standard envelope with the request id as correlationId', () => {
    const result = apiError(fakeRequest('req-1'), 'OTP_EXPIRED', 'کد تأیید منقضی شده است.');
    expect(result).toEqual({
      error: { code: 'OTP_EXPIRED', message: 'کد تأیید منقضی شده است.', correlationId: 'req-1', details: [] },
    });
  });

  it('carries structured details through when provided', () => {
    const detail = { termsVersion: 2, privacyVersion: 1 };
    const result = apiError(fakeRequest('req-2'), 'LEGAL_VERSION_CHANGED', 'نسخه تغییر کرد.', [detail]);
    expect(result.error.details).toEqual([detail]);
  });
});
