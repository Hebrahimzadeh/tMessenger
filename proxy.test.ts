import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

function requestFor(path: string, cookies: Record<string, string> = {}): NextRequest {
  const request = new NextRequest(new URL(path, 'http://localhost:4300'));
  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }
  return request;
}

describe('proxy', () => {
  it('sets an x-pathname header on every non-redirected request (public or authenticated)', async () => {
    const response = await proxy(requestFor('/system-status'));
    expect(response.headers.get('x-pathname')).toBe('/system-status');

    const authenticated = await proxy(requestFor('/chats/42', { access_token: 'whatever-looks-like-a-token' }));
    expect(authenticated.headers.get('x-pathname')).toBe('/chats/42');
  });

  const publicPaths = ['/login', '/legal/terms', '/legal/privacy', '/system-status'];
  for (const path of publicPaths) {
    it(`allows an anonymous request through for the public path ${path}`, async () => {
      const response = await proxy(requestFor(path));
      expect(response.status).not.toBe(307);
      expect(response.headers.get('location')).toBeNull();
    });
  }

  it('redirects an anonymous request to a protected path, to /login with next set', async () => {
    const response = await proxy(requestFor('/chats/42?tab=media'));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get('location')!);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('next')).toBe('/chats/42?tab=media');
  });

  it('lets a request through to a protected path when an access_token cookie is present (presence only - no signature check here)', async () => {
    const response = await proxy(requestFor('/chats/42', { access_token: 'whatever-looks-like-a-token' }));
    expect(response.status).not.toBe(307);
  });

  it('never redirects the root path\'s own login destination into a loop', async () => {
    const response = await proxy(requestFor('/login?next=/chats'));
    expect(response.status).not.toBe(307);
  });
});
