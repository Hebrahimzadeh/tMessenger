import { describe, expect, it, vi } from 'vitest';

const getCurrentUserMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
let pathnameHeader: string | null = null;

vi.mock('./session', () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => (name === 'x-pathname' ? pathnameHeader : null),
  }),
}));

describe('requireUser', () => {
  it('returns the user when a session exists, without redirecting', async () => {
    getCurrentUserMock.mockResolvedValue({ userId: 'user-123' });
    const { requireUser } = await import('./require-user');

    await expect(requireUser()).resolves.toEqual({ userId: 'user-123' });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects to /login with the current path as `next` when there is no session', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    pathnameHeader = '/chats/42';
    const { requireUser } = await import('./require-user');

    await expect(requireUser()).rejects.toThrow('REDIRECT:/login?next=%2Fchats%2F42');
  });

  it('redirects to bare /login when no pathname header is available', async () => {
    getCurrentUserMock.mockResolvedValue(null);
    pathnameHeader = null;
    const { requireUser } = await import('./require-user');

    await expect(requireUser()).rejects.toThrow('REDIRECT:/login');
  });
});
