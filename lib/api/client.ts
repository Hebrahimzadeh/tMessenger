import type { ApiErrorEnvelope, ApiErrorPayloadInput } from '@taavon/contracts';

export type { ApiErrorPayloadInput as ApiErrorPayload };

export class ApiError extends Error {
  readonly code: string;
  readonly correlationId: string;
  readonly details: unknown[];
  readonly status: number;

  constructor(status: number, payload: ApiErrorPayloadInput) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.correlationId = payload.correlationId;
    this.details = payload.details ?? [];
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;

function isApiErrorEnvelope(body: unknown): body is ApiErrorEnvelope {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error?: unknown }).error === 'object' &&
    (body as { error: unknown }).error !== null
  );
}

function createCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Exported for the rare caller that needs a raw XHR instead of `apiFetch` (e.g. CardAttachmentPicker's real upload-progress events, which `fetch` cannot report). */
export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/v1';
}

const CSRF_COOKIE_NAME = 'csrf_token';

/**
 * Reads a cookie by name from document.cookie. Returns undefined outside a
 * browser (no `document`) - server-side callers of apiFetch never have a
 * CSRF cookie to attach anyway (see Task 07's auth.route.ts: CSRF only
 * gates browser-originated mutations against an existing session).
 */
function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.split('; ').find((entry) => entry.startsWith(`${name}=`));
  return match?.slice(name.length + 1);
}

/**
 * The only client web code is allowed to use to reach the API. Adds a
 * per-request correlation id, a 10s timeout, `credentials: 'include'` (the
 * session/CSRF cookies are set by the API's own origin - without this, the
 * browser neither sends them cross-origin nor stores a cross-origin
 * Set-Cookie response at all), the CSRF double-submit header whenever a
 * csrf_token cookie already exists, and normalizes every failure (the
 * standard {error:{code,message,correlationId,details}} envelope, a
 * timeout, or a network failure) into a typed ApiError.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const correlationId = createCorrelationId();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const csrfToken = readCookie(CSRF_COOKIE_NAME);

  try {
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl()}${path}`, {
        ...init,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          // Only set Content-Type when there's an actual body - Fastify's
          // strict JSON body parser rejects an empty body sent with
          // content-type: application/json (FST_ERR_CTP_EMPTY_JSON_BODY)
          // before the request ever reaches the route handler, and that
          // error uses Fastify's own {statusCode,code,error,message} shape
          // rather than this app's {error:{code,message,...}} envelope -
          // so it was surfacing as a generic UNKNOWN_ERROR client-side for
          // every body-less POST (e.g. /auth/mfa/enroll).
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          'X-Correlation-Id': correlationId,
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
          ...init.headers,
        },
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError(0, {
          code: 'REQUEST_TIMEOUT',
          message: 'ارتباط با سرور بیش از حد معمول طول کشید.',
          correlationId,
        });
      }
      throw new ApiError(0, {
        code: 'NETWORK_ERROR',
        message: 'برقراری ارتباط با سرور ممکن نشد.',
        correlationId,
      });
    }

    const contentType = response.headers.get('content-type') ?? '';
    const body: unknown = contentType.includes('application/json') ? await response.json() : undefined;

    if (!response.ok) {
      if (isApiErrorEnvelope(body)) {
        throw new ApiError(response.status, body.error);
      }
      throw new ApiError(response.status, {
        code: 'UNKNOWN_ERROR',
        message: 'خطای غیرمنتظره‌ای در ارتباط با سرور رخ داد.',
        correlationId,
      });
    }

    return body as T;
  } finally {
    clearTimeout(timeoutId);
  }
}
