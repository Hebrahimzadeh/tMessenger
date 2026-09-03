import type { PutPrivateInput, StorageProvider } from './storage-provider';

/**
 * In-memory StorageProvider for unit tests. Implements the exact same
 * contract as S3StorageProvider (see storage.test.ts's shared contract
 * suite) so tests never need a real S3-compatible endpoint.
 */
export class FakeStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async putPrivate({ objectKey, body, contentType }: PutPrivateInput): Promise<void> {
    this.objects.set(objectKey, { body: Buffer.from(body), contentType });
  }

  async getSignedRead(objectKey: string, expiresInSeconds = 300): Promise<string> {
    if (!this.objects.has(objectKey)) {
      throw new Error(`Object not found: ${objectKey}`);
    }
    return `fake://signed-read/${encodeURIComponent(objectKey)}?expiresIn=${expiresInSeconds}`;
  }

  async delete(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
  }

  /** Test-only helper, not part of the StorageProvider contract. */
  hasObject(objectKey: string): boolean {
    return this.objects.has(objectKey);
  }
}
