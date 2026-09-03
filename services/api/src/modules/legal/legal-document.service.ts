import type { LegalDocumentType } from '@taavon/contracts';

export interface LegalDocumentRecord {
  version: number;
  publicUrl: string;
}

export interface LegalDocumentRepository {
  /** Latest version of `type` that is already in effect (effectiveAt <= now), or null if none is seeded yet. */
  findLatestEffective(type: LegalDocumentType): Promise<LegalDocumentRecord | null>;
}

export class LegalDocumentsNotConfiguredError extends Error {
  constructor(missing: LegalDocumentType) {
    super(`No effective ${missing} document version is configured yet.`);
    this.name = 'LegalDocumentsNotConfiguredError';
  }
}

export interface CurrentLegalDocuments {
  termsVersion: number;
  privacyVersion: number;
  termsUrl: string;
  privacyUrl: string;
}

/**
 * Resolves the pair of currently-effective legal document versions. `appOrigin`
 * is injected (rather than read from env here) so this stays a pure function of
 * its inputs - `publicUrl` is stored relative in the database (e.g.
 * `/legal/terms/v1`) precisely so seed data stays environment-agnostic, and
 * gets resolved to an absolute URL against the caller's origin.
 */
export async function getCurrentLegalDocuments(
  repo: LegalDocumentRepository,
  appOrigin: string
): Promise<CurrentLegalDocuments> {
  const [terms, privacy] = await Promise.all([
    repo.findLatestEffective('TERMS'),
    repo.findLatestEffective('PRIVACY'),
  ]);

  if (!terms) throw new LegalDocumentsNotConfiguredError('TERMS');
  if (!privacy) throw new LegalDocumentsNotConfiguredError('PRIVACY');

  return {
    termsVersion: terms.version,
    privacyVersion: privacy.version,
    termsUrl: new URL(terms.publicUrl, appOrigin).toString(),
    privacyUrl: new URL(privacy.publicUrl, appOrigin).toString(),
  };
}
