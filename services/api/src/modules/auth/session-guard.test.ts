import { describe, expect, it, vi } from 'vitest';
import { requireSession } from './session-guard';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from './session-tokens';

const SECRET = 'test-only-session-hmac-key';

function fakeRequest(cookieValue: string | undefined) {
  return { cookies: { [ACCESS_TOKEN_COOKIE]: cookieValue }, id: 'req-1' } as unknown as import('fastify').FastifyRequest;
}

function fakeReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as unknown as import('fastify').FastifyReply & { code: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
}

describe('requireSession', () => {
  it('returns the user for a valid, non-expired access token', () => {
    const token = signAccessToken('user-123', SECRET);
    const reply = fakeReply();

    const result = requireSession(fakeRequest(token), reply, SECRET);

    expect(result).toEqual({ userId: 'user-123' });
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('sends a 401 SESSION_INVALID envelope and returns null when no cookie is present', () => {
    const reply = fakeReply();

    const result = requireSession(fakeRequest(undefined), reply, SECRET);

    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(401);
    const [body] = reply.send.mock.calls[0] as [{ error: { code: string } }];
    expect(body.error.code).toBe('SESSION_INVALID');
  });

  it('sends a 401 SESSION_INVALID envelope and returns null for an expired token', () => {
    let now = 1_000_000_000_000;
    const token = signAccessToken('user-123', SECRET, () => now);
    now += 16 * 60 * 1000;
    const reply = fakeReply();

    const result = requireSession(fakeRequest(token), reply, SECRET, () => now);

    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(401);
  });

  it('sends a 401 and returns null for a tampered/malformed token', () => {
    const reply = fakeReply();
    const result = requireSession(fakeRequest('not-a-real-token'), reply, SECRET);
    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(401);
  });
});
