import { describe, expect, it } from 'vitest';
import { InvalidPhoneNumberError, normalizePhone, UnsupportedCountryError } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['09191953219', 'IR', '+989191953219'],
    ['+989191953219', 'IR', '+989191953219'],
    ['07701234567', 'IQ', '+9647701234567'],
    ['05321234567', 'TR', '+905321234567'],
    ['0501234567', 'AZ', '+994501234567'],
    ['077123456', 'AM', '+37477123456'],
    ['65123456', 'TM', '+99365123456'],
    ['0701234567', 'AF', '+93701234567'],
    ['03001234567', 'PK', '+923001234567'],
  ] as const)('normalizes a valid %s number for %s to %s', (input, country, expected) => {
    expect(normalizePhone(input, country)).toBe(expected);
  });

  it('converts Persian digits before parsing', () => {
    expect(normalizePhone('۰۹۱۹۱۹۵۳۲۱۹', 'IR')).toBe('+989191953219');
  });

  it('converts Arabic-Indic digits before parsing', () => {
    expect(normalizePhone('٠٩١٩١٩٥٣٢١٩', 'IR')).toBe('+989191953219');
  });

  it('rejects a defaultCountry outside the supported neighbor list', () => {
    expect(() => normalizePhone('09191953219', 'US')).toThrow(UnsupportedCountryError);
  });

  it('rejects an invalid/too-short number', () => {
    expect(() => normalizePhone('123', 'IR')).toThrow(InvalidPhoneNumberError);
  });

  it('rejects garbage input', () => {
    expect(() => normalizePhone('not a phone number', 'IR')).toThrow(InvalidPhoneNumberError);
  });

  it('rejects empty input', () => {
    expect(() => normalizePhone('', 'IR')).toThrow(InvalidPhoneNumberError);
  });

  it('rejects a genuinely valid number from a country outside the allow-list', () => {
    // A real, valid US number typed in full international form - must still
    // be rejected, since isValid() alone would let it through.
    expect(() => normalizePhone('+14155552671', 'IR')).toThrow(UnsupportedCountryError);
  });

  it('accepts full E.164 input for a supported country even when defaultCountry differs', () => {
    // The number's own + prefix takes precedence; defaultCountry is only a
    // fallback for national-format input.
    expect(normalizePhone('+9647701234567', 'IR')).toBe('+9647701234567');
  });
});
