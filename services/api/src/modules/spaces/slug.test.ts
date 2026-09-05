import { describe, expect, it } from 'vitest';
import { generateUniqueSlug, slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates a plain Latin title', () => {
    expect(slugify('Community Garden')).toBe('community-garden');
  });

  it('keeps Persian letters as-is (no lossy transliteration)', () => {
    expect(slugify('باغ محله')).toBe('باغ-محله');
  });

  it('normalizes Arabic-style ي/ك to the Persian ی/ک forms, so both spellings produce the same slug', () => {
    // ي (Arabic yeh) / ك (Arabic kaf) vs ی (Persian ye) / ک (Persian keh).
    const arabicForm = 'كي'; // ك + ي
    const persianForm = 'کی'; // ک + ی
    expect(slugify(arabicForm)).toBe(slugify(persianForm));
    expect(slugify(arabicForm)).toBe('کی');
  });

  it('collapses runs of non-alphanumeric characters into a single hyphen', () => {
    expect(slugify('a   b!!c__d')).toBe('a-b-c-d');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --Hello World--  ')).toBe('hello-world');
  });

  it('falls back to a fixed placeholder when nothing alphanumeric survives', () => {
    expect(slugify('!!!')).toBe('space');
  });

  it('mixes Persian and Latin/digit segments in one title', () => {
    expect(slugify('پروژه Open Source 2026')).toBe('پروژه-open-source-2026');
  });
});

describe('generateUniqueSlug', () => {
  it('returns the bare slug when it is not taken', async () => {
    const slug = await generateUniqueSlug('Community Garden', async () => false);
    expect(slug).toBe('community-garden');
  });

  it('appends -2, -3, ... deterministically until an untaken candidate is found', async () => {
    const taken = new Set(['community-garden', 'community-garden-2', 'community-garden-3']);
    const slug = await generateUniqueSlug('Community Garden', async (candidate) => taken.has(candidate));
    expect(slug).toBe('community-garden-4');
  });
});
