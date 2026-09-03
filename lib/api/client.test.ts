import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from './client';

const originalFetch = global.fetch;

function mockFetchOnce(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('apiFetch', () => {
  beforeEach(() => {
    document.cookie = '';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    // jsdom has no "clear all cookies" primitive - expire each one we set.
    document.cookie.split(';').forEach((c) => {
      const name = c.split('=')[0]?.trim();
      if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    });
  });

  it('always sends credentials: include, so cross-origin session cookies are sent and Set-Cookie is honored', async () => {
    const fetchMock = mockFetchOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await apiFetch('/legal/current');

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe('include');
  });

  it('attaches X-CSRF-Token from the csrf_token cookie when one is present', async () => {
    document.cookie = 'csrf_token=abc123';
    const fetchMock = mockFetchOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await apiFetch('/auth/refresh', { method: 'POST' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBe('abc123');
  });

  it('sends no X-CSRF-Token header when no csrf_token cookie exists yet', async () => {
    const fetchMock = mockFetchOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await apiFetch('/auth/otp/request', { method: 'POST' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBeUndefined();
  });

  it('parses the standard {error:{code,message,correlationId,details}} envelope into an ApiError', async () => {
    mockFetchOnce(
      new Response(
        JSON.stringify({
          error: { code: 'OTP_EXPIRED', message: 'کد تأیید منقضی شده است.', correlationId: 'req-1', details: [] },
        }),
        { status: 422, headers: { 'content-type': 'application/json' } }
      )
    );

    await expect(apiFetch('/auth/otp/verify', { method: 'POST' })).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
      message: 'کد تأیید منقضی شده است.',
      correlationId: 'req-1',
      status: 422,
    });
  });

  it('carries structured details through (e.g. LEGAL_VERSION_CHANGED)', async () => {
    const detail = { termsVersion: 2, privacyVersion: 1, termsUrl: 'https://x/terms', privacyUrl: 'https://x/privacy' };
    mockFetchOnce(
      new Response(
        JSON.stringify({ error: { code: 'LEGAL_VERSION_CHANGED', message: 'نسخه تغییر کرد.', correlationId: 'req-2', details: [detail] } }),
        { status: 422, headers: { 'content-type': 'application/json' } }
      )
    );

    let caught: ApiError | undefined;
    try {
      await apiFetch('/auth/otp/verify', { method: 'POST' });
    } catch (err) {
      caught = err as ApiError;
    }
    expect(caught?.details).toEqual([detail]);
  });
});
