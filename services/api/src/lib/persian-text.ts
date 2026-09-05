/**
 * Normalizes the common Arabic-vs-Persian letter variants a user might type
 * interchangeably - ي (Arabic yeh) → ی (Persian ye), ك (Arabic kaf) → ک
 * (Persian keh) - so two spellings of the same word compare/search/slugify
 * identically. Shared by slug.ts (Task 10) and space-search.service.ts
 * (Task 11's own "ی/ي، ک/ك" acceptance requirement) rather than duplicated.
 */
export function normalizePersianLetters(input: string): string {
  return input.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
}
