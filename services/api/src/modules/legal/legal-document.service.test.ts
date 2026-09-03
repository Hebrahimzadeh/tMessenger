import { describe, expect, it } from 'vitest';
import {
  getCurrentLegalDocuments,
  LegalDocumentsNotConfiguredError,
  type LegalDocumentRecord,
  type LegalDocumentRepository,
} from './legal-document.service';
import type { LegalDocumentType } from '@taavon/contracts';

function fakeRepo(docs: Partial<Record<LegalDocumentType, LegalDocumentRecord>>): LegalDocumentRepository {
  return {
    async findLatestEffective(type) {
      return docs[type] ?? null;
    },
  };
}

describe('getCurrentLegalDocuments', () => {
  it('resolves version numbers and absolute URLs from a relative publicUrl and appOrigin', async () => {
    const repo = fakeRepo({
      TERMS: { version: 3, publicUrl: '/legal/terms/v3' },
      PRIVACY: { version: 1, publicUrl: '/legal/privacy/v1' },
    });

    const result = await getCurrentLegalDocuments(repo, 'https://taavon.example');

    expect(result).toEqual({
      termsVersion: 3,
      privacyVersion: 1,
      termsUrl: 'https://taavon.example/legal/terms/v3',
      privacyUrl: 'https://taavon.example/legal/privacy/v1',
    });
  });

  it('throws LegalDocumentsNotConfiguredError when TERMS has no effective version', async () => {
    const repo = fakeRepo({ PRIVACY: { version: 1, publicUrl: '/legal/privacy/v1' } });
    await expect(getCurrentLegalDocuments(repo, 'https://taavon.example')).rejects.toThrow(
      LegalDocumentsNotConfiguredError
    );
  });

  it('throws LegalDocumentsNotConfiguredError when PRIVACY has no effective version', async () => {
    const repo = fakeRepo({ TERMS: { version: 1, publicUrl: '/legal/terms/v1' } });
    await expect(getCurrentLegalDocuments(repo, 'https://taavon.example')).rejects.toThrow(
      LegalDocumentsNotConfiguredError
    );
  });

  it('resolves against an appOrigin that already has a path prefix', async () => {
    const repo = fakeRepo({
      TERMS: { version: 1, publicUrl: '/legal/terms/v1' },
      PRIVACY: { version: 1, publicUrl: '/legal/privacy/v1' },
    });

    const result = await getCurrentLegalDocuments(repo, 'https://taavon.example/app/');

    // URL resolution against a base with a path: an absolute-path reference
    // ("/legal/...") replaces the whole path, per the WHATWG URL spec - this
    // pins that behavior down explicitly rather than leaving it implicit.
    expect(result.termsUrl).toBe('https://taavon.example/legal/terms/v1');
  });
});
