import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GEMINI_BASE_URL, DEFAULT_GEMINI_MODEL, GeminiProvider, RETRYABLE_ATTEMPTS } from './gemini-provider';
import { ProviderTimeoutError, ProviderUnavailableError } from './ai-provider';

const originalFetch = global.fetch;

function answer(text: string) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

function capture(response: Response | Promise<Response> = answer('{"ok":true}')) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  global.fetch = vi.fn((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) });
    return Promise.resolve(response);
  }) as unknown as typeof fetch;
  return calls;
}

const INPUT = { capability: 'CARD_DRAFT' as const, prompt: 'سلام', timeoutMs: 5_000 };

describe('GeminiProvider', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('calls Google by default, at the current model', async () => {
    const calls = capture();
    await new GeminiProvider('key-1').generate(INPUT);

    expect(calls[0]!.url).toBe(`${DEFAULT_GEMINI_BASE_URL}/${DEFAULT_GEMINI_MODEL}:generateContent?key=key-1`);
  });

  it('calls a configured gateway instead, when one is given', async () => {
    // The reason this is configurable: Google refuses the production host's
    // address outright, so a working path has to be configurable without a
    // release. Nothing else about the request changes.
    const calls = capture();
    await new GeminiProvider('key-1', 'gemini-3.6-flash', 'https://gateway.example.com/v1beta/models').generate(INPUT);

    expect(calls[0]!.url).toBe('https://gateway.example.com/v1beta/models/gemini-3.6-flash:generateContent?key=key-1');
  });

  it('sends the system instruction and the prompt as separate parts', async () => {
    const calls = capture();
    await new GeminiProvider('key-1').generate({ ...INPUT, systemInstruction: 'سند ساخت' });

    expect(calls[0]!.body).toMatchObject({
      contents: [{ parts: [{ text: 'سلام' }] }],
      systemInstruction: { parts: [{ text: 'سند ساخت' }] },
    });
  });

  it('honours a capability that needs a longer answer', async () => {
    const calls = capture();
    await new GeminiProvider('key-1').generate({ ...INPUT, maxOutputTokens: 8192 });

    expect(calls[0]!.body.generationConfig).toMatchObject({ maxOutputTokens: 8192, responseMimeType: 'application/json' });
  });

  it('reports a refusal as unavailable, without carrying the response body into the message', async () => {
    capture(new Response('{"error":{"message":"سلام echoed back"}}', { status: 400 }));

    const failure = await new GeminiProvider('key-1').generate(INPUT).catch((err: Error) => err);

    expect(failure).toBeInstanceOf(ProviderUnavailableError);
    // An upstream error body can echo the prompt, and this message reaches logs.
    expect((failure as Error).message).not.toContain('سلام');
  });

  it('reports an abort as a timeout, which the orchestrator treats differently', async () => {
    global.fetch = vi.fn(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))) as unknown as typeof fetch;

    await expect(new GeminiProvider('key-1').generate(INPUT)).rejects.toBeInstanceOf(ProviderTimeoutError);
  });

  it('refuses an answer with no text rather than returning an empty one', async () => {
    capture(new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    await expect(new GeminiProvider('key-1').generate(INPUT)).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  describe('asking again when the answer means "ask again"', () => {
    function sequence(statuses: number[]) {
      const calls: string[] = [];
      let i = 0;
      global.fetch = vi.fn((url: Parameters<typeof fetch>[0]) => {
        calls.push(String(url));
        const status = statuses[Math.min(i, statuses.length - 1)]!;
        i += 1;
        return Promise.resolve(
          status === 200
            ? answer('{"ok":true}')
            : new Response(JSON.stringify({ error: { code: status, message: 'high demand' } }), { status })
        );
      }) as unknown as typeof fetch;
      return calls;
    }

    it('retries a 503 and succeeds, which is what the live API actually does', async () => {
      // Measured 2026-09-18: gemini-3.6-flash answered one call in three, the
      // rest 503 "high demand". Without this, nearly every space build fell
      // back to rules while the model was in fact available.
      const calls = sequence([503, 200]);

      const result = await new GeminiProvider('key-1').generate(INPUT);

      expect(result.text).toBe('{"ok":true}');
      expect(calls).toHaveLength(2);
    });

    it.each([429, 500, 502, 503, 504])('retries a %i', async (status) => {
      const calls = sequence([status, 200]);
      await new GeminiProvider('key-1').generate(INPUT);
      expect(calls).toHaveLength(2);
    });

    it('gives up after a bounded number of attempts rather than hammering', async () => {
      const calls = sequence([503]);

      await expect(new GeminiProvider('key-1').generate(INPUT)).rejects.toBeInstanceOf(ProviderUnavailableError);
      expect(calls).toHaveLength(RETRYABLE_ATTEMPTS + 1);
    });

    it.each([400, 401, 403, 404])('never retries a %i - a wrong request does not improve by repeating', async (status) => {
      const calls = sequence([status]);

      await expect(new GeminiProvider('key-1').generate(INPUT)).rejects.toBeInstanceOf(ProviderUnavailableError);
      expect(calls).toHaveLength(1);
    });

    it('stops retrying when the caller timeout fires', async () => {
      const calls = sequence([503]);

      // A budget shorter than a single backoff: the retry must not outlive it.
      const failure = await new GeminiProvider('key-1').generate({ ...INPUT, timeoutMs: 50 }).catch((err: Error) => err);

      expect(failure).toBeInstanceOf(ProviderTimeoutError);
      expect(calls.length).toBeLessThanOrEqual(RETRYABLE_ATTEMPTS + 1);
    });
  });
});
