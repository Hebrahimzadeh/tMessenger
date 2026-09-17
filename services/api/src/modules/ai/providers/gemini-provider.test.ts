import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GEMINI_BASE_URL, DEFAULT_GEMINI_MODEL, GeminiProvider } from './gemini-provider';
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
});
