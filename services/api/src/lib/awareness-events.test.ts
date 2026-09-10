import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '@taavon/database';
import { logAwarenessEvent } from './awareness-events';

async function probeDatabaseAvailability(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000));
    const probe = getPrisma().$queryRaw`SELECT 1`.then(() => 'ok' as const);
    return (await Promise.race([probe, timeout])) === 'ok';
  } catch {
    return false;
  }
}

const databaseAvailable = await probeDatabaseAvailability();

describe.skipIf(!databaseAvailable)('logAwarenessEvent: real Postgres', () => {
  let userId: string;

  beforeAll(async () => {
    userId = (await getPrisma().user.create({ data: {} })).id;
  });

  afterEach(async () => {
    await getPrisma().awarenessEvent.deleteMany({ where: { actorId: userId } });
  });

  afterAll(async () => {
    await getPrisma().user.deleteMany({ where: { id: userId } });
  });

  it('writes a real row with the given type, actor, subject, and deep link', async () => {
    const subjectId = '11111111-1111-4111-8111-111111111111';
    await getPrisma().$transaction((tx) =>
      logAwarenessEvent(tx, { type: 'PRODUCED', actorId: userId, subjectId, deepLink: `/cards/${subjectId}`, idempotencyKey: 'test-key-1' })
    );

    const row = await getPrisma().awarenessEvent.findUnique({ where: { idempotencyKey: 'test-key-1' } });
    expect(row).toMatchObject({ type: 'PRODUCED', actorId: userId, subjectId, deepLink: `/cards/${subjectId}` });
  });

  it('is idempotent - a repeat call with the same key is a silent no-op, not an error', async () => {
    const subjectId = '22222222-2222-4222-8222-222222222222';
    const write = () =>
      getPrisma().$transaction((tx) =>
        logAwarenessEvent(tx, { type: 'MEANINGFUL_VIEW', actorId: userId, subjectId, idempotencyKey: 'test-key-2' })
      );

    await expect(write()).resolves.not.toThrow();
    await expect(write()).resolves.not.toThrow();

    const count = await getPrisma().awarenessEvent.count({ where: { idempotencyKey: 'test-key-2' } });
    expect(count).toBe(1);
  });

  it('never stores anything beyond type, actor, subject, deepLink, and idempotencyKey (no private text)', async () => {
    const subjectId = '33333333-3333-4333-8333-333333333333';
    await getPrisma().$transaction((tx) =>
      logAwarenessEvent(tx, { type: 'PUBLIC_CONTRIBUTION', actorId: userId, subjectId, idempotencyKey: 'test-key-3' })
    );
    const row = await getPrisma().awarenessEvent.findUniqueOrThrow({ where: { idempotencyKey: 'test-key-3' } });
    expect(Object.keys(row).sort()).toEqual(['actorId', 'createdAt', 'deepLink', 'id', 'idempotencyKey', 'subjectId', 'type'].sort());
  });
});
