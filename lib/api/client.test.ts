import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError, LONG_REQUEST_TIMEOUT_MS } from './client';

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

  it('omits the Content-Type header on a body-less POST (Fastify\'s strict JSON parser rejects an empty body sent with content-type: application/json)', async () => {
    const fetchMock = mockFetchOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await apiFetch('/auth/mfa/enroll', { method: 'POST' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('still sends the Content-Type header when a body is provided', async () => {
    const fetchMock = mockFetchOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await apiFetch('/auth/mfa/challenge', { method: 'POST', body: JSON.stringify({ code: '123456' }) });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
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

  describe('the request budget', () => {
    /** Resolves only when the signal aborts, which is what a slow endpoint looks like. */
    function neverResolves() {
      const fetchMock = vi.fn((_input: unknown, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          );
        })
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    }

    afterEach(() => vi.useRealTimers());

    it('gives up after ten seconds by default', async () => {
      vi.useFakeTimers();
      neverResolves();

      const pending = apiFetch('/legal/current').catch((err: ApiError) => err);
      await vi.advanceTimersByTimeAsync(10_000);

      expect(((await pending) as ApiError).code).toBe('REQUEST_TIMEOUT');
    });

    it('waits longer when a call is slow by nature, instead of abandoning work the server is still doing', async () => {
      // Building a space takes a model 11-20 seconds. With the fixed budget the
      // browser aborted while the server went on and published the space, so
      // the person saw a timeout and never learned they owned one.
      vi.useFakeTimers();
      neverResolves();

      const pending = apiFetch('/spaces/build', { method: 'POST', body: '{}', timeoutMs: LONG_REQUEST_TIMEOUT_MS }).catch(
        (err: ApiError) => err
      );

      await vi.advanceTimersByTimeAsync(15_000);
      expect(await Promise.race([pending, Promise.resolve('still waiting')])).toBe('still waiting');

      await vi.advanceTimersByTimeAsync(LONG_REQUEST_TIMEOUT_MS - 15_000);
      expect(((await pending) as ApiError).code).toBe('REQUEST_TIMEOUT');
    });

    it('does not send timeoutMs on to fetch as a request option', async () => {
      const fetchMock = mockFetchOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
      );

      await apiFetch('/spaces/build', { method: 'POST', body: '{}', timeoutMs: 20_000 });

      expect(fetchMock.mock.calls[0]![1]).not.toHaveProperty('timeoutMs');
    });
  });
});
