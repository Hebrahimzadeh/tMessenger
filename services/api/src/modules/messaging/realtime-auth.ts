import type { PrismaClient } from '@taavon/database';
import { ACCESS_TOKEN_COOKIE, InvalidAccessTokenError, verifyAccessToken } from '../auth/session-tokens';

export class HandshakeUnauthorizedError extends Error {
  constructor(message = 'No valid session for this connection.') {
    super(message);
    this.name = 'HandshakeUnauthorizedError';
  }
}

/**
 * Raised when the handshake's `Origin` is anything but the application's own.
 *
 * This check is not redundant with CORS. A browser applies the same-origin
 * policy to XHR and fetch, but it will open a WebSocket to any host and
 * attach that host's cookies while doing so - the CORS preflight simply does
 * not happen. Without an explicit Origin check, any page on the internet
 * could open a socket to this gateway as a logged-in visitor and read their
 * private conversations (cross-site WebSocket hijacking). So the origin is
 * checked here, on the handshake, and a missing one is refused too: the only
 * clients that hold the session cookie are browsers, and a browser always
 * sends Origin on a WebSocket handshake.
 */
export class HandshakeOriginRejectedError extends Error {
  constructor() {
    super('Connection origin is not allowed.');
    this.name = 'HandshakeOriginRejectedError';
  }
}

export interface HandshakeHeaders {
  cookie?: string | undefined;
  origin?: string | undefined;
}

export interface HandshakeAuthOptions {
  sessionHmacKey: string;
  /** The single allowed origin - the same APP_ORIGIN that CORS is configured with. */
  appOrigin: string;
  now?: () => number;
}

/**
 * Reads one cookie out of a raw `Cookie` header. The gateway sees the
 * handshake's headers directly rather than a Fastify request, so it cannot
 * lean on @fastify/cookie's parsing.
 */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return undefined;
}

/**
 * The whole of "handshake را به session cookie و CSRF/origin policy متصل
 * کن": a connection is admitted only with an allowed origin and a valid,
 * unexpired access-token cookie. Stateless, like every other token check in
 * this codebase - liveness against the database is a separate concern,
 * because it has to be re-checked for the life of the connection rather than
 * only at the handshake (see SessionLivenessPort).
 */
export function authenticateHandshake(headers: HandshakeHeaders, opts: HandshakeAuthOptions): { userId: string } {
  if (!headers.origin || headers.origin !== opts.appOrigin) {
    throw new HandshakeOriginRejectedError();
  }

  const token = readCookie(headers.cookie, ACCESS_TOKEN_COOKIE);
  if (!token) throw new HandshakeUnauthorizedError('No session cookie on the connection.');

  try {
    return { userId: verifyAccessToken(token, opts.sessionHmacKey, opts.now).sub };
  } catch (err) {
    if (err instanceof InvalidAccessTokenError) throw new HandshakeUnauthorizedError();
    throw err;
  }
}

/**
 * Whether a person still has any session that has not been revoked and has
 * not expired.
 *
 * The access token is deliberately stateless, so it stays verifiable for its
 * full fifteen minutes after a logout - an accepted trade for ordinary REST
 * requests, where the worst case is one more short-lived request. A socket
 * is different: it can stay open for hours, so the same trade would mean a
 * revoked session keeps streaming private messages long after the person
 * logged out. The gateway therefore re-checks liveness on a timer and closes
 * connections that no longer have one, which is what "revoke اتصال را
 * می‌بندد" actually requires.
 *
 * Liveness is keyed on the user rather than on a specific session row
 * because the access token carries only `sub`; there is no session id in it
 * to match. Logging out of every session - which is what both logout and
 * Task 06's reuse-detection family revoke do - therefore closes the socket.
 */
export interface SessionLivenessPort {
  hasLiveSession(userId: string): Promise<boolean>;
}

export function createPrismaSessionLiveness(prisma: PrismaClient): SessionLivenessPort {
  return {
    async hasLiveSession(userId) {
      const live = await prisma.session.count({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      });
      return live > 0;
    },
  };
}
