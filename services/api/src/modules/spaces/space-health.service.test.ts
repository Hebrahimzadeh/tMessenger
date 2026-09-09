import { describe, expect, it, vi } from 'vitest';
import type { SpaceHealthRepository, SpaceHealthSnapshotRecord, HealthSignals } from '@taavon/space-health';
import { getSpaceHealth } from './space-health.service';
import { NotSpaceEditorError, SpaceNotFoundError } from './space.service';

// computeHealthStatus/computeSuggestions themselves (including all the
// fixed-clock boundary tests) are covered in @taavon/space-health's own
// test suite (packages/space-health/src/health.test.ts) - this file only
// tests the API-specific orchestration around them: authorization and the
// on-demand compute-and-store fallback.

const PUBLISHED_AT = new Date('2026-01-01T00:00:00Z');
const SPACE_ID = '11111111-1111-4111-8111-111111111111';
const CREATOR_ID = '22222222-2222-4222-8222-222222222222';

function fakeSpaceRecord(overrides: Partial<{ creatorId: string }> = {}) {
  return {
    id: SPACE_ID,
    slug: 'baagh-mahalle',
    status: 'PUBLISHED' as const,
    creatorId: CREATOR_ID,
    publishedAt: PUBLISHED_AT,
    archivedAt: null,
    latestVersion: {
      versionNumber: 1,
      title: 'باغ محله',
      purpose: 'purpose',
      audience: null,
      participationMethods: [],
      cardHints: null,
      policyVersion: 1,
      gateVerdict: null,
      gateReason: null,
      primaryRoleIds: [],
      supplementaryRoleIds: [],
    },
    roles: [],
    ...overrides,
  };
}

function fakeSnapshot(): SpaceHealthSnapshotRecord {
  return {
    status: 'ACTIVE',
    cardCount: 0,
    contributorCount: 2,
    meaningfulViewCount: 0,
    firstUseLatencySeconds: null,
    roleActivity: { totalRoleCount: 2, activeRoleCount: 2 },
    crossRoleCardRate: 0,
    appliedRate: 0,
    reservationClosedRate: 0,
    reportQuality: null,
    lastActivityAt: null,
    suggestions: [],
    computedAt: new Date(),
  };
}

describe('getSpaceHealth', () => {
  it('throws SpaceNotFoundError when the space does not exist', async () => {
    const spaceRepo = { findById: vi.fn().mockResolvedValue(null), hasSpaceAdminRole: vi.fn() };
    const healthRepo = {} as SpaceHealthRepository;
    await expect(getSpaceHealth(spaceRepo, healthRepo, SPACE_ID, CREATOR_ID)).rejects.toThrow(SpaceNotFoundError);
  });

  it('throws NotSpaceEditorError for a caller who is neither creator nor space admin', async () => {
    const spaceRepo = { findById: vi.fn().mockResolvedValue(fakeSpaceRecord()), hasSpaceAdminRole: vi.fn().mockResolvedValue(false) };
    const healthRepo = {} as SpaceHealthRepository;
    await expect(getSpaceHealth(spaceRepo, healthRepo, SPACE_ID, 'stranger-id')).rejects.toThrow(NotSpaceEditorError);
  });

  it('returns the existing snapshot without recomputing when one already exists', async () => {
    const spaceRepo = { findById: vi.fn().mockResolvedValue(fakeSpaceRecord()), hasSpaceAdminRole: vi.fn() };
    const existing = fakeSnapshot();
    const gatherSignals = vi.fn();
    const healthRepo: SpaceHealthRepository = {
      gatherSignals,
      upsertSnapshot: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue(existing),
      listPublishedSpaceIds: vi.fn(),
    };

    const result = await getSpaceHealth(spaceRepo, healthRepo, SPACE_ID, CREATOR_ID);
    expect(result).toBe(existing);
    expect(gatherSignals).not.toHaveBeenCalled();
  });

  it('computes and stores a fresh snapshot on demand when none exists yet, then returns it', async () => {
    const spaceRepo = { findById: vi.fn().mockResolvedValue(fakeSpaceRecord()), hasSpaceAdminRole: vi.fn() };
    const signals: HealthSignals = {
      publishedAt: PUBLISHED_AT,
      lastActivityAt: null,
      contributorCount: 0,
      totalRoleCount: 2,
      activeRoleCount: 0,
      cardCount: 0,
    };
    const stored = fakeSnapshot();
    const upsertSnapshot = vi.fn();
    const getSnapshot = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(stored);
    const healthRepo: SpaceHealthRepository = {
      gatherSignals: vi.fn().mockResolvedValue(signals),
      upsertSnapshot,
      getSnapshot,
      listPublishedSpaceIds: vi.fn(),
    };

    const now = () => new Date(PUBLISHED_AT.getTime());
    const result = await getSpaceHealth(spaceRepo, healthRepo, SPACE_ID, CREATOR_ID, now);

    // status is NEW (computed at the exact publish moment); with 0 of 2
    // roles active, computeSuggestions also legitimately adds
    // RECRUIT_UNDERACTIVE_ROLE - this test is about the on-demand
    // compute-and-store wiring, not re-asserting computeSuggestions' own
    // already-tested behavior (see @taavon/space-health's health.test.ts),
    // so it just uses whatever that real function returns for these signals.
    expect(upsertSnapshot).toHaveBeenCalledWith(SPACE_ID, 'NEW', signals, [{ code: 'RECRUIT_UNDERACTIVE_ROLE' }]);
    expect(result).toBe(stored);
  });

  it('allows a space admin (not just the creator) to view health', async () => {
    const spaceRepo = {
      findById: vi.fn().mockResolvedValue(fakeSpaceRecord()),
      hasSpaceAdminRole: vi.fn().mockResolvedValue(true),
    };
    const existing = fakeSnapshot();
    const healthRepo: SpaceHealthRepository = {
      gatherSignals: vi.fn(),
      upsertSnapshot: vi.fn(),
      getSnapshot: vi.fn().mockResolvedValue(existing),
      listPublishedSpaceIds: vi.fn(),
    };

    await expect(getSpaceHealth(spaceRepo, healthRepo, SPACE_ID, 'some-admin-id')).resolves.toBe(existing);
  });
});
