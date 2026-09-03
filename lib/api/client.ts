export interface ApiErrorPayload {
  code: string;
  message: string;
  correlationId: string;
  details?: unknown[];
}

interface ApiErrorEnvelope {
  error: ApiErrorPayload;
}

export class ApiError extends Error {
  readonly code: string;
  readonly correlationId: string;
  readonly details: unknown[];
  readonly status: number;

  constructor(status: number, payload: ApiErrorPayload) {
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

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/v1';
}

/**
 * The only client web code is allowed to use to reach the API. Adds a
 * per-request correlation id, a 10s timeout, and normalizes every failure
 * (HTTP error envelope, timeout, or network failure) into a typed ApiError.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const correlationId = createCorrelationId();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl()}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
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
