import { describe, expect, it } from 'vitest';
import { findSensitiveData, hasSensitiveData, toAsciiDigits } from './sensitive-data';

describe('toAsciiDigits', () => {
  it('normalises Persian and Arabic-Indic digits', () => {
    expect(toAsciiDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789');
    expect(toAsciiDigits('٠٩١٢')).toBe('0912');
    expect(toAsciiDigits('سلام ۱۲۳')).toBe('سلام 123');
  });
});

describe('spotting a phone number', () => {
  it.each([
    ['09123456789', 'a bare mobile number'],
    ['۰۹۱۲۳۴۵۶۷۸۹', 'the same in Persian digits'],
    ['+989123456789', 'with the country code'],
    ['0912 345 6789', 'with spaces'],
    ['0912-345-6789', 'with dashes'],
    ['021 1234 5678', 'a landline'],
  ])('finds %s (%s)', (text) => {
    const findings = findSensitiveData(`شمارم رو می‌فرستم: ${text}`);
    expect(findings.map((f) => f.kind)).toContain('PHONE');
  });

  it('stays quiet on numbers that are not phone numbers', () => {
    for (const text of [
      'ساعت ۸ صبح میام',
      'قیمتش ۱۲۰۰۰ تومنه',
      'سال ۱۴۰۴',
      'کارت ۵ تا بازدید داشت',
      '۱۲۳',
      'شماره کارت را نمی‌فرستم',
    ]) {
      expect(hasSensitiveData(text), text).toBe(false);
    }
  });
});

describe('spotting an address', () => {
  it('finds a street address with a number', () => {
    const findings = findSensitiveData('خیابان انقلاب، کوچه دوم، پلاک ۱۲');
    expect(findings.map((f) => f.kind)).toContain('ADDRESS');
  });

  it('stays quiet when a place name has no number near it', () => {
    // This is a sentence about a place, not directions to a door.
    expect(hasSensitiveData('میدان انقلاب خیلی شلوغ بود')).toBe(false);
    expect(hasSensitiveData('سر خیابان منتظرم')).toBe(false);
  });
});

describe('what the composer does with the result', () => {
  it('reports nothing for ordinary messages', () => {
    for (const text of ['سلام، حالت چطوره؟', 'فردا میام دنبالش', 'ممنون از لطفت', '']) {
      expect(hasSensitiveData(text), text).toBe(false);
    }
  });

  it('returns the matched text so the warning can show what it spotted', () => {
    const [finding] = findSensitiveData('تماس بگیر 09123456789');
    expect(finding?.match).toContain('09123456789');
  });

  it('reports both kinds when a message has both', () => {
    const kinds = findSensitiveData('خیابان آزادی پلاک ۵، شمارم 09123456789').map((f) => f.kind);
    expect(kinds).toContain('PHONE');
    expect(kinds).toContain('ADDRESS');
  });

  // The warning exists to be noticed, not to be obeyed - it never blocks.
  it('is advisory: it reports, and says nothing about whether to send', () => {
    const findings = findSensitiveData('09123456789');
    expect(findings).toHaveLength(1);
    expect(Object.keys(findings[0]!)).toEqual(['kind', 'match']);
  });
});
