const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a path parameter is shaped like an id at all.
 *
 * Worth checking before a query rather than after: Postgres rejects a
 * malformed uuid at the statement, which surfaces as a driver error about
 * our SQL instead of an answer about the thing that was asked for. A route
 * that checks first can say "no such thing", which is both true and the
 * status a caller can act on.
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
