import { parsePhoneNumberWithError } from 'libphonenumber-js/max';

/**
 * Which countries currently have an active, real SMS delivery route -
 * deliberately a separate, independently-versioned list from phone.ts's
 * SUPPORTED_PHONE_COUNTRIES (phone *format* support). A country can be
 * phone-format-supported before a real vendor route for it goes live, and
 * this list is what actually gates sending - see auth.service.ts's
 * requestOtp. Bump `version` whenever `countries` changes, so any future
 * audit/ops tooling can tell which allow-list a given OTP challenge was
 * evaluated against.
 */
export const ACTIVE_SMS_ROUTE_ALLOWLIST = {
  version: 1,
  countries: ['IR', 'IQ', 'TR', 'AZ', 'AM', 'TM', 'AF', 'PK'] as const,
};

export function hasActiveSmsRoute(country: string): boolean {
  return (ACTIVE_SMS_ROUTE_ALLOWLIST.countries as readonly string[]).includes(country);
}

/** Resolves the ISO country of an already-normalized E.164 number, or null if it can't be determined. */
export function countryOfE164(phoneE164: string): string | null {
  try {
    return parsePhoneNumberWithError(phoneE164).country ?? null;
  } catch {
    return null;
  }
}
