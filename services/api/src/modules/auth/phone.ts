import { parsePhoneNumberWithError, type CountryCode } from 'libphonenumber-js/max';

/** Iran plus its allow-listed neighboring countries - see docs/new-plan.md Task 05. */
export const SUPPORTED_PHONE_COUNTRIES = ['IR', 'IQ', 'TR', 'AZ', 'AM', 'TM', 'AF', 'PK'] as const;
export type SupportedPhoneCountry = (typeof SUPPORTED_PHONE_COUNTRIES)[number];

export class InvalidPhoneNumberError extends Error {
  constructor(message = 'شماره موبایل نامعتبر است.') {
    super(message);
    this.name = 'InvalidPhoneNumberError';
  }
}

export class UnsupportedCountryError extends Error {
  constructor(country: string) {
    super(`کشور پشتیبانی‌نشده: ${country}`);
    this.name = 'UnsupportedCountryError';
  }
}

function isSupportedCountry(country: string): country is SupportedPhoneCountry {
  return (SUPPORTED_PHONE_COUNTRIES as readonly string[]).includes(country);
}

/**
 * Normalizes a phone number to E.164. `libphonenumber-js` already handles
 * Persian/Arabic-Indic digits internally, so no separate digit-conversion
 * step is needed. Both the requested `defaultCountry` and the number's own
 * resolved country (relevant when the input already carries a `+` prefix,
 * which overrides `defaultCountry`) must be in the supported allow-list -
 * `isValid()` alone is not enough, since a genuinely valid number from an
 * unsupported country (e.g. a real US number) would otherwise pass through.
 */
export function normalizePhone(input: string, defaultCountry: string): string {
  if (!isSupportedCountry(defaultCountry)) {
    throw new UnsupportedCountryError(defaultCountry);
  }

  let parsed;
  try {
    parsed = parsePhoneNumberWithError(input, defaultCountry as CountryCode);
  } catch {
    throw new InvalidPhoneNumberError();
  }

  if (!parsed.isValid()) {
    throw new InvalidPhoneNumberError();
  }

  if (!parsed.country || !isSupportedCountry(parsed.country)) {
    throw new UnsupportedCountryError(parsed.country ?? 'unknown');
  }

  return parsed.number;
}
