import { describe, expect, it } from 'vitest';
import { sanitizeNextPath } from './redirect-allowlist';

describe('sanitizeNextPath', () => {
  it('accepts a plain internal path', () => {
    expect(sanitizeNextPath('/chats')).toBe('/chats');
  });

  it('accepts an internal path with a query string', () => {
    expect(sanitizeNextPath('/chats/123?tab=media')).toBe('/chats/123?tab=media');
  });

  it('falls back to "/" for null/undefined/empty', () => {
    expect(sanitizeNextPath(null)).toBe('/');
    expect(sanitizeNextPath(undefined)).toBe('/');
    expect(sanitizeNextPath('')).toBe('/');
  });

  it('falls back to "/" for an absolute external URL', () => {
    expect(sanitizeNextPath('https://evil.example/steal')).toBe('/');
    expect(sanitizeNextPath('http://evil.example')).toBe('/');
  });

  it('falls back to "/" for a protocol-relative URL (open redirect classic)', () => {
    expect(sanitizeNextPath('//evil.example')).toBe('/');
    expect(sanitizeNextPath('///evil.example')).toBe('/');
  });

  it('falls back to "/" for a path not starting with "/"', () => {
    expect(sanitizeNextPath('chats')).toBe('/');
    expect(sanitizeNextPath('javascript:alert(1)')).toBe('/');
  });

  it('falls back to "/" for any embedded "://" (defense in depth against exotic schemes)', () => {
    expect(sanitizeNextPath('/redirect?to=https://evil.example')).toBe('/');
  });

  it('falls back to "/" for a backslash-based trick some browsers normalize to a slash', () => {
    expect(sanitizeNextPath('/\\evil.example')).toBe('/');
    expect(sanitizeNextPath('\\\\evil.example')).toBe('/');
  });

  it('falls back to "/" rather than bouncing back into /login itself', () => {
    expect(sanitizeNextPath('/login')).toBe('/');
    expect(sanitizeNextPath('/login?next=/chats')).toBe('/');
  });

  it('rejects a non-string array value (Next.js searchParams can be string[])', () => {
    expect(sanitizeNextPath(['/chats', '/other'])).toBe('/');
  });
});
