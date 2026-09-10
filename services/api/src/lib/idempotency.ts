export interface IdempotencyRepository {
  find(scope: string, actorId: string, key: string): Promise<{ responseStatus: number; responseBody: unknown } | null>;
  save(scope: string, actorId: string, key: string, responseStatus: number, responseBody: unknown): Promise<void>;
}

export interface IdempotentOutcome<T> {
  status: number;
  body: T;
  /** True when this result came from a previous call's cached response rather than actually re-running `fn`. */
  replayed: boolean;
}

/**
 * "header Idempotency-Key اجباری" - runs `fn` at most once per
 * (scope, actorId, key). A repeat call with the same key returns the exact
 * cached response instead of re-executing `fn` - this is what makes a
 * network-retried reservation request return the same
 * `{reservationId, conversationId}` rather than erroring or double-booking.
 * Only a genuinely successful (2xx) result is ever cached: a call that
 * fails can be retried under the same key rather than replaying the
 * failure forever.
 */
export async function withIdempotency<T>(
  repo: IdempotencyRepository,
  scope: string,
  actorId: string,
  key: string,
  fn: () => Promise<{ status: number; body: T }>
): Promise<IdempotentOutcome<T>> {
  const existing = await repo.find(scope, actorId, key);
  if (existing) {
    return { status: existing.responseStatus, body: existing.responseBody as T, replayed: true };
  }

  const result = await fn();
  if (result.status >= 200 && result.status < 300) {
    await repo.save(scope, actorId, key, result.status, result.body);
  }
  return { ...result, replayed: false };
}
