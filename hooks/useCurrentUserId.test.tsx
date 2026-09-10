import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCurrentUserId } from './useCurrentUserId';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('useCurrentUserId', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('resolves to the real userId when logged in', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { userId, hasProfile: true, username: 'x', displayName: 'x', bio: null, phoneVisibility: 'PRIVATE' })) as unknown as typeof fetch;

    const { result } = renderHook(() => useCurrentUserId());
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', userId }));
  });

  it('resolves to null (not an error) for an anonymous visitor', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { error: { code: 'SESSION_INVALID', message: 'x', correlationId: 'x' } })) as unknown as typeof fetch;

    const { result } = renderHook(() => useCurrentUserId());
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', userId: null }));
  });
});
