import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPrisma, resetPrismaClientForTests } from './client';

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

describe('getPrisma', () => {
  beforeEach(() => {
    resetPrismaClientForTests();
  });

  afterEach(() => {
    resetPrismaClientForTests();
    process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  });

  it('throws immediately when DATABASE_URL is missing, without a live connection', () => {
    delete process.env.DATABASE_URL;
    expect(() => getPrisma()).toThrow(/DATABASE_URL/);
  });

  it('returns a client exposing the models created by the base migration', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    const prisma = getPrisma();
    expect(typeof prisma.systemSetting.findMany).toBe('function');
    expect(typeof prisma.outboxEvent.findMany).toBe('function');
    expect(typeof prisma.$connect).toBe('function');
    expect(typeof prisma.$disconnect).toBe('function');
  });

  it('returns the same cached instance across calls', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    expect(getPrisma()).toBe(getPrisma());
  });

  it('builds a fresh instance after resetPrismaClientForTests', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    const first = getPrisma();
    resetPrismaClientForTests();
    const second = getPrisma();
    expect(first).not.toBe(second);
  });
});
