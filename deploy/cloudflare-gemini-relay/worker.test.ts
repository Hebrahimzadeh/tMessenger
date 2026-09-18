import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error - plain JS module, deployed as-is to Cloudflare.
import worker from './worker.js';

const originalFetch = global.fetch;
const ENV = { RELAY_TOKEN: 'relay-token-abcdefghijklmnop', GEMINI_API_KEY: 'AIzaSy-the-real-google-key' };
const PATH = '/v1beta/models/gemini-3.6-flash:generateContent';

function upstream(body: unknown = { candidates: [] }, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  global.fetch = vi.fn((url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ url: String(url), init: (init ?? {}) as RequestInit });
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    );
  }) as unknown as typeof fetch;
  return calls;
}

function post(path = PATH, key = ENV.RELAY_TOKEN, body = '{"contents":[]}') {
  const url = key === null ? `https://relay.workers.dev${path}` : `https://relay.workers.dev${path}?key=${key}`;
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
}

describe('the Gemini relay', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('forwards to Google and swaps the relay token for the real key', async () => {
    const calls = upstream();

    const response = await worker.fetch(post(), ENV);

    expect(response.status).toBe(200);
    const sent = new URL(calls[0]!.url);
    expect(sent.origin).toBe('https://generativelanguage.googleapis.com');
    expect(sent.pathname).toBe(PATH);
    // The caller's token never reaches Google, and Google's key never reaches
    // the caller: that swap is the whole point of relaying rather than
    // proxying.
    expect(sent.searchParams.get('key')).toBe(ENV.GEMINI_API_KEY);
    expect(calls[0]!.url).not.toContain(ENV.RELAY_TOKEN);
  });

  it('passes the upstream status and body straight back', async () => {
    upstream({ error: { code: 429, message: 'quota' } }, 429);

    const response = await worker.fetch(post(), ENV);

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: 429 } });
  });

  it.each([
    ['no key at all', null],
    ['a wrong key of the same length', 'relay-token-ABCDEFGHIJKLMNOP'],
    ['a wrong key of a different length', 'short'],
    ['the real Google key, which is not the relay token', ENV.GEMINI_API_KEY],
  ])('refuses %s, and calls nothing', async (_label, key) => {
    const calls = upstream();

    const response = await worker.fetch(post(PATH, key as string), ENV);

    // An open relay would let anyone who found the URL spend the account's
    // quota, so a refusal must happen before the upstream call, not after.
    expect(response.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ['a path outside the one endpoint it exists for', '/v1beta/tunedModels/x:generateContent'],
    ['the root', '/'],
    ['an attempt to reach another Google API', '/v1/projects/x/locations/y'],
  ])('refuses %s', async (_label, path) => {
    const calls = upstream();

    const response = await worker.fetch(post(path), ENV);

    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('refuses any method but POST', async () => {
    const calls = upstream();
    const request = new Request(`https://relay.workers.dev${PATH}?key=${ENV.RELAY_TOKEN}`, { method: 'GET' });

    expect((await worker.fetch(request, ENV)).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('refuses to run at all when it has not been configured', async () => {
    const calls = upstream();

    const response = await worker.fetch(post(), { RELAY_TOKEN: '', GEMINI_API_KEY: '' });

    // Better a clear 500 than a Worker that quietly forwards with no key and
    // reports Google's confusing error as if it were ours.
    expect(response.status).toBe(500);
    expect(calls).toHaveLength(0);
  });

  it('does not carry the caller\'s headers through to Google', async () => {
    const calls = upstream();
    const request = new Request(`https://relay.workers.dev${PATH}?key=${ENV.RELAY_TOKEN}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'session=secret', 'x-forwarded-for': '1.2.3.4' },
      body: '{"contents":[]}',
    });

    await worker.fetch(request, ENV);

    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('x-forwarded-for')).toBeNull();
    expect(headers.get('content-type')).toBe('application/json');
  });
});
