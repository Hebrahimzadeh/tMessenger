import { computeHealthStatus, computeSuggestions, type SpaceHealthRepository, type SpaceHealthSnapshotRecord } from '@taavon/space-health';
import { NotSpaceEditorError, SpaceNotFoundError, type SpaceRepository } from './space.service';

export type { HealthSignals, HealthSuggestion, HealthSuggestionCode } from '@taavon/space-health';
export { computeHealthStatus, computeSuggestions };

/**
 * `GET /spaces/:spaceId/health` - "endpoint health فقط creator/admin" -
 * the exact same creator-or-`SPACE_ADMIN` check `space.service.ts`'s own
 * edit/precheck/publish functions use (small deliberate duplication here
 * rather than a shared helper, matching this codebase's established
 * pattern - see e.g. mfa-token.ts vs session-tokens.ts). A space that
 * exists but the caller can't manage gets `NotSpaceEditorError` (403), not
 * `SpaceNotFoundError` - unlike `getSpace`'s own DRAFT-hiding 404, a
 * PUBLISHED space's mere existence is already public knowledge; only its
 * health data is owner-only.
 *
 * The actual health computation (`computeHealthStatus`/`computeSuggestions`)
 * and the repository live in `@taavon/space-health`, shared with
 * services/worker's own daily job - this function is the API-specific
 * authorization + on-demand-compute orchestration around that shared core,
 * which the worker has no need for at all.
 *
 * If the daily worker hasn't computed a snapshot for this space yet (e.g.
 * it was only just published), this computes one on demand and stores it,
 * rather than making the owner wait up to 24h for their first real health
 * view - the worker's own daily run stays the primary, efficient path for
 * every space that already has a snapshot.
 */
export async function getSpaceHealth(
  spaceRepo: Pick<SpaceRepository, 'findById' | 'hasSpaceAdminRole'>,
  healthRepo: SpaceHealthRepository,
  spaceId: string,
  userId: string,
  now: () => Date = () => new Date()
): Promise<SpaceHealthSnapshotRecord> {
  const space = await spaceRepo.findById(spaceId);
  if (!space) throw new SpaceNotFoundError();

  const isEditor = space.creatorId === userId || (await spaceRepo.hasSpaceAdminRole(userId, spaceId));
  if (!isEditor) throw new NotSpaceEditorError();

  const existing = await healthRepo.getSnapshot(spaceId);
  if (existing) return existing;

  const signals = await healthRepo.gatherSignals(spaceId);
  const status = computeHealthStatus(signals, now());
  const suggestions = computeSuggestions(signals, status);
  await healthRepo.upsertSnapshot(spaceId, status, signals, suggestions);

  return (await healthRepo.getSnapshot(spaceId))!;
}
