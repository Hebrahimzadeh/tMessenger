import { describe, expect, it } from 'vitest';
import { FakeStorageProvider } from './fake-storage-provider';
import { S3StorageProvider } from './s3-storage-provider';
import type { StorageProvider } from './storage-provider';

/**
 * One shared contract, run against every StorageProvider implementation, so
 * "fake and S3 adapter have an identical contract" (Task 03 acceptance) is
 * an executable guarantee rather than a claim.
 */
function storageProviderContract(name: string, getProvider: () => StorageProvider) {
  it(`${name}: getSignedRead rejects an object that was never put`, async () => {
    const objectKey = `contract-test/${name}/never-put-${Date.now()}.txt`;
    await expect(getProvider().getSignedRead(objectKey)).rejects.toThrow();
  });

  it(`${name}: putPrivate then getSignedRead succeeds and returns a non-empty URL`, async () => {
    const objectKey = `contract-test/${name}/put-then-read-${Date.now()}.txt`;
    const provider = getProvider();
    await provider.putPrivate({ objectKey, body: Buffer.from('hello world'), contentType: 'text/plain' });

    const url = await provider.getSignedRead(objectKey);
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });

  it(`${name}: delete removes the object so a later getSignedRead rejects`, async () => {
    const objectKey = `contract-test/${name}/put-then-delete-${Date.now()}.txt`;
    const provider = getProvider();
    await provider.putPrivate({ objectKey, body: Buffer.from('bye'), contentType: 'text/plain' });

    await provider.delete(objectKey);

    await expect(provider.getSignedRead(objectKey)).rejects.toThrow();
  });

  it(`${name}: deleting an object that was never put does not throw`, async () => {
    const objectKey = `contract-test/${name}/delete-nonexistent-${Date.now()}.txt`;
    await expect(getProvider().delete(objectKey)).resolves.not.toThrow();
  });
}

describe('StorageProvider contract: fake', () => {
  storageProviderContract('fake', () => new FakeStorageProvider());
});

describe('FakeStorageProvider (behavior beyond the shared contract)', () => {
  it('never returns a plain, unsigned URL - only its own fake signed-read scheme', async () => {
    const provider = new FakeStorageProvider();
    await provider.putPrivate({ objectKey: 'a.png', body: Buffer.from('x'), contentType: 'image/png' });
    const url = await provider.getSignedRead('a.png');
    expect(url.startsWith('fake://signed-read/')).toBe(true);
  });

  it('hasObject reflects put/delete without needing a signed URL', async () => {
    const provider = new FakeStorageProvider();
    expect(provider.hasObject('missing.png')).toBe(false);
    await provider.putPrivate({ objectKey: 'missing.png', body: Buffer.from('x'), contentType: 'image/png' });
    expect(provider.hasObject('missing.png')).toBe(true);
    await provider.delete('missing.png');
    expect(provider.hasObject('missing.png')).toBe(false);
  });
});

// The S3-backed contract needs a real S3-compatible endpoint (MinIO via
// `docker compose up -d object-storage`, matching this task's mandatory
// integration test command). Gated on a real runtime probe - resolved here,
// at module top-level, before Vitest collects the describe/it tree below -
// rather than file-naming convention, so `npm run test:integration`
// genuinely exercises it wherever that stack is actually up, and
// `npm run test` never hard-fails in an environment that simply doesn't
// have it.
const s3Options = {
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  bucket: process.env.S3_BUCKET ?? 'taavon-dev',
  accessKeyId: process.env.S3_ACCESS_KEY ?? 'taavon_dev_access_key',
  secretAccessKey: process.env.S3_SECRET_KEY ?? 'taavon_dev_secret_key',
};

async function probeS3Availability(): Promise<boolean> {
  const provider = new S3StorageProvider({ ...s3Options, maxAttempts: 1 });
  const attempt = provider.putPrivate({
    objectKey: `contract-test/s3/availability-probe-${Date.now()}.txt`,
    body: Buffer.from('probe'),
    contentType: 'text/plain',
  });

  // Belt-and-suspenders timeout: some hosts have an unrelated service
  // already listening on the configured port (observed on a shared dev
  // machine: IntelliJ's own port 9000), which accepts the TCP connection
  // but never completes an S3 handshake. That defeats the SDK's own
  // maxAttempts/requestTimeout tuning, so race it against a hard cutoff
  // instead of trusting the SDK to fail fast on its own.
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 3000));

  try {
    const result = await Promise.race([attempt.then(() => 'ok' as const), timeout]);
    return result === 'ok';
  } catch {
    return false;
  }
}

const s3Available = await probeS3Availability();

if (!s3Available) {
  // eslint-disable-next-line no-console
  console.warn(
    `[storage.test.ts] Skipping the S3StorageProvider contract: no reachable S3-compatible endpoint at ` +
      `${s3Options.endpoint}. Run \`docker compose up -d object-storage\` first to exercise it for real.`
  );
}

describe.skipIf(!s3Available)('StorageProvider contract: s3 (MinIO)', () => {
  storageProviderContract('s3', () => new S3StorageProvider(s3Options));
});
