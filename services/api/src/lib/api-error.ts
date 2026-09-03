import type { FastifyRequest } from 'fastify';
import type { ApiErrorPayload } from '@taavon/contracts';

/**
 * Builds the one error envelope every API response uses
 * (docs/*-mvp-sonnet5.md section 7). `correlationId` is Fastify's own
 * per-request id - already unique, already in every log line for this
 * request, so a client-visible failure can be matched to server logs
 * without inventing a second id scheme.
 */
export function apiError(
  request: FastifyRequest,
  code: string,
  message: string,
  details: unknown[] = []
): { error: ApiErrorPayload } {
  return { error: { code, message, correlationId: String(request.id), details } };
}
