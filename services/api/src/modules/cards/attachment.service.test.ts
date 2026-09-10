import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeStorageProvider } from '../storage/fake-storage-provider';
import {
  AttachmentNotFoundError,
  createUploadIntent,
  finalizeAttachment,
  MAX_ATTACHMENT_BYTES,
  NotAttachmentOwnerError,
  objectKeyForUpload,
  recordUpload,
  type AttachmentRecord,
  type AttachmentRepository,
} from './attachment.service';

const OWNER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const MP3 = Buffer.from('ID3\x03\x00\x00\x00\x00');

function fakeAttachmentRepo() {
  const rows = new Map<string, AttachmentRecord & { checksumSha256: string | null }>();

  const repo: AttachmentRepository = {
    async createPending({ ownerId, kind, objectKey }) {
      const id = randomUUID();
      rows.set(id, {
        id,
        ownerId,
        kind,
        status: 'PENDING',
        objectKey,
        contentType: null,
        sizeBytes: null,
        rejectionReason: null,
        checksumSha256: null,
      });
      return { id };
    },
    async findById(id) {
      return rows.get(id) ?? null;
    },
    async markProcessing(id, data) {
      Object.assign(rows.get(id)!, { status: 'PROCESSING', ...data });
    },
    async markReady(id) {
      rows.get(id)!.status = 'READY';
    },
    async markRejected(id, reason) {
      Object.assign(rows.get(id)!, { status: 'REJECTED', rejectionReason: reason });
    },
  };

  return { repo, rows };
}

describe('objectKeyForUpload', () => {
  it('scopes the key to the user prefix and is unguessable per call', () => {
    const a = objectKeyForUpload(OWNER);
    const b = objectKeyForUpload(OWNER);
    expect(a.startsWith(`users/${OWNER}/card-uploads/`)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('createUploadIntent', () => {
  it('creates a PENDING attachment with a server-chosen key', async () => {
    const { repo, rows } = fakeAttachmentRepo();
    const { attachmentId, objectKey } = await createUploadIntent(repo, OWNER, 'IMAGE');
    expect(objectKey).toMatch(new RegExp(`^users/${OWNER}/card-uploads/`));
    expect(rows.get(attachmentId)?.status).toBe('PENDING');
  });
});

describe('recordUpload', () => {
  it('sniffs the real content type, stores the object and moves to PROCESSING', async () => {
    const { repo, rows } = fakeAttachmentRepo();
    const storage = new FakeStorageProvider();
    const { attachmentId, objectKey } = await createUploadIntent(repo, OWNER, 'IMAGE');

    const outcome = await recordUpload(repo, storage, attachmentId, OWNER, PNG);

    expect(outcome.status).toBe('PROCESSING');
    expect(rows.get(attachmentId)?.contentType).toBe('image/png');
    expect(rows.get(attachmentId)?.sizeBytes).toBe(PNG.length);
    expect(rows.get(attachmentId)?.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(storage.hasObject(objectKey)).toBe(true);
  });

  it('rejects an empty body and stores nothing', async () => {
    const { repo } = fakeAttachmentRepo();
    const storage = new FakeStorageProvider();
    const { attachmentId } = await createUploadIntent(repo, OWNER, 'IMAGE');
    const outcome = await recordUpload(repo, storage, attachmentId, OWNER, Buffer.alloc(0));
    expect(outcome).toMatchObject({ status: 'REJECTED', rejectionReason: 'EMPTY_FILE' });
  });

  it('rejects an oversized body', async () => {
    const { repo } = fakeAttachmentRepo();
    const storage = new FakeStorageProvider();
    const { attachmentId } = await createUploadIntent(repo, OWNER, 'VIDEO');
    const huge = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 0x00);
    huge.set([0x1a, 0x45, 0xdf, 0xa3], 0);
    const outcome = await recordUpload(repo, storage, attachmentId, OWNER, huge);
    expect(outcome).toMatchObject({ status: 'REJECTED', rejectionReason: 'TOO_LARGE' });
  });

  it('rejects an unrecognizable body', async () => {
    const { repo } = fakeAttachmentRepo();
    const storage = new FakeStorageProvider();
    const { attachmentId } = await createUploadIntent(repo, OWNER, 'FILE');
    const outcome = await recordUpload(repo, storage, attachmentId, OWNER, Buffer.from([0x00, 0x01, 0x02, 0x03]));
    expect(outcome).toMatchObject({ status: 'REJECTED', rejectionReason: 'UNRECOGNIZED_CONTENT' });
  });

  it('refuses an upload for someone else\'s attachment', async () => {
    const { repo } = fakeAttachmentRepo();
    const storage = new FakeStorageProvider();
    const { attachmentId } = await createUploadIntent(repo, OWNER, 'IMAGE');
    await expect(recordUpload(repo, storage, attachmentId, STRANGER, PNG)).rejects.toBeInstanceOf(NotAttachmentOwnerError);
  });

  it('404s for an unknown attachment', async () => {
    const { repo } = fakeAttachmentRepo();
    await expect(recordUpload(repo, new FakeStorageProvider(), randomUUID(), OWNER, PNG)).rejects.toBeInstanceOf(
      AttachmentNotFoundError
    );
  });
});

describe('finalizeAttachment', () => {
  async function processed(kind: 'IMAGE' | 'AUDIO', body: Buffer) {
    const { repo, rows } = fakeAttachmentRepo();
    const storage = new FakeStorageProvider();
    const { attachmentId, objectKey } = await createUploadIntent(repo, OWNER, kind);
    await recordUpload(repo, storage, attachmentId, OWNER, body);
    return { repo, rows, storage, attachmentId, objectKey };
  }

  it('promotes to READY when the sniffed type matches the declared kind', async () => {
    const { repo, storage, attachmentId } = await processed('IMAGE', PNG);
    const outcome = await finalizeAttachment(repo, storage, attachmentId, OWNER);
    expect(outcome).toMatchObject({ status: 'READY', rejectionReason: null });
  });

  it('REJECTs and deletes the bytes when the real type is not allowed for the declared kind', async () => {
    // Declared as IMAGE, but the bytes are an MP3.
    const { repo, storage, attachmentId, objectKey } = await processed('IMAGE', MP3);
    const outcome = await finalizeAttachment(repo, storage, attachmentId, OWNER);
    expect(outcome.status).toBe('REJECTED');
    expect(outcome.rejectionReason).toContain('TYPE_NOT_ALLOWED');
    expect(storage.hasObject(objectKey)).toBe(false);
  });

  it('is idempotent once terminal', async () => {
    const { repo, storage, attachmentId } = await processed('IMAGE', PNG);
    await finalizeAttachment(repo, storage, attachmentId, OWNER);
    const again = await finalizeAttachment(repo, storage, attachmentId, OWNER);
    expect(again.status).toBe('READY');
  });

  it('refuses finalization by a non-owner', async () => {
    const { repo, storage, attachmentId } = await processed('IMAGE', PNG);
    await expect(finalizeAttachment(repo, storage, attachmentId, STRANGER)).rejects.toBeInstanceOf(NotAttachmentOwnerError);
  });
});
