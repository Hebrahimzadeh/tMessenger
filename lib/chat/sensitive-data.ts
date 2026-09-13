/**
 * Spots a phone number or a street address that someone is about to type into
 * a private message.
 *
 * The point is a warning, never a block. "شماره/نشانی هشدار غیرمسدودکننده" -
 * people have every right to share their own number with someone they are
 * arranging to meet, and a messenger that refuses to send it is a broken
 * messenger. What this prevents is doing it without noticing. So the rule for
 * every decision below is: when in doubt, stay quiet. A false warning that
 * interrupts an ordinary sentence trains people to dismiss the warning
 * without reading it, which costs more than the one it was meant to catch.
 *
 * Nothing here is sent anywhere. The check runs in the browser, on text that
 * has not left the composer yet.
 */

export type SensitiveKind = 'PHONE' | 'ADDRESS';

export interface SensitiveFinding {
  kind: SensitiveKind;
  /** The exact substring that triggered it, for highlighting in the warning. */
  match: string;
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Persian and Arabic-Indic digits normalise to ASCII so one set of patterns covers all three. */
export function toAsciiDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const persian = PERSIAN_DIGITS.indexOf(ch);
    if (persian !== -1) return String(persian);
    return String(ARABIC_DIGITS.indexOf(ch));
  });
}

/**
 * An Iranian mobile number, with or without the country code, and tolerant of
 * the spaces, dashes and dots people actually type. Landlines are covered by
 * the same shape: an 0XX area code followed by eight digits.
 */
const PHONE_PATTERNS: RegExp[] = [
  // +989xxxxxxxxx / 00989xxxxxxxxx / 09xxxxxxxxx, separators allowed between groups
  /(?:\+98|0098|98)?[\s.\-]?0?9\d{2}[\s.\-]?\d{3}[\s.\-]?\d{4}/,
  // 0XX landline: 021 1234 5678 and friends
  /0\d{2}[\s.\-]?\d{4}[\s.\-]?\d{4}/,
];

/**
 * Words that only really appear when someone is writing out where a place is.
 * Deliberately short: each one is a word that rarely shows up in an ordinary
 * sentence about anything else, and a longer list would mean more false
 * warnings, not better protection.
 */
const ADDRESS_MARKERS = ['خیابان', 'خیابون', 'کوچه', 'بن‌بست', 'بن بست', 'پلاک', 'بلوار', 'میدان', 'بزرگراه', 'کدپستی', 'کد پستی'];

/**
 * An address marker alone is not enough - "میدان انقلاب شلوغ بود" is not an
 * address. It counts only when a number is nearby, which is what turns a
 * place name into directions to a door.
 */
function looksLikeAddress(text: string): string | null {
  const ascii = toAsciiDigits(text);
  for (const marker of ADDRESS_MARKERS) {
    const at = ascii.indexOf(marker);
    if (at === -1) continue;
    const window = ascii.slice(Math.max(0, at - 20), at + marker.length + 30);
    if (/\d/.test(window)) return text.slice(Math.max(0, at - 20), at + marker.length + 30).trim();
  }
  return null;
}

/**
 * Returns every distinct kind of sensitive content found, or an empty array.
 * Callers show a warning and let the person decide; they never refuse to send.
 */
export function findSensitiveData(text: string): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];
  const ascii = toAsciiDigits(text);

  for (const pattern of PHONE_PATTERNS) {
    const found = ascii.match(pattern);
    if (found?.[0]) {
      // A run of digits that is only part of a longer number is usually a
      // date, an amount or an id, not a phone number.
      const digits = found[0].replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 13) {
        findings.push({ kind: 'PHONE', match: found[0].trim() });
        break;
      }
    }
  }

  const address = looksLikeAddress(text);
  if (address) findings.push({ kind: 'ADDRESS', match: address });

  return findings;
}

export function hasSensitiveData(text: string): boolean {
  return findSensitiveData(text).length > 0;
}
