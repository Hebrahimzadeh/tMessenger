import { createHash, randomUUID } from 'node:crypto';
import type { CardAttachmentStatus } from '@taavon/database';
import type { UploadableAttachmentKind } from '@taavon/contracts';
import type { StorageProvider } from '../storage/storage-provider';
import { isTerminalAttachmentStatus } from './card-state-machine';
import { isContentTypeAllowedForKind, sniffContentType } from './content-sniff';

/** 25 MiB. A single hard ceiling for every uploadable kind in the MVP - "اندازه" is checked here and again at finalize. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export class AttachmentNotFoundError extends Error {
  constructor() {
    super('Attachment not found.');
    this.name = 'AttachmentNotFoundError';
  }
}

export class NotAttachmentOwnerError extends Error {
  constructor() {
    super('This attachment belongs to another user.');
    this.name = 'NotAttachmentOwnerError';
  }
}

export class AttachmentNotAwaitingUploadError extends Error {
  constructor() {
    super('This attachment is not awaiting an upload.');
    this.name = 'AttachmentNotAwaitingUploadError';
  }
}

export class AttachmentNotAwaitingFinalizeError extends Error {
  constructor() {
    super('This attachment is not awaiting finalization.');
    this.name = 'AttachmentNotAwaitingFinalizeError';
  }
}

export interface AttachmentRecord {
  id: string;
  ownerId: string;
  kind: UploadableAttachmentKind;
  status: CardAttachmentStatus;
  objectKey: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  rejectionReason: string | null;
}

export interface AttachmentRepository {
  createPending(input: { ownerId: string; kind: UploadableAttachmentKind; objectKey: string }): Promise<{ id: string }>;
  findById(id: string): Promise<AttachmentRecord | null>;
  markProcessing(
    id: string,
    data: { objectKey: string; contentType: string | null; sizeBytes: number; checksumSha256: string }
  ): Promise<void>;
  markReady(id: string): Promise<void>;
  markRejected(id: string, reason: string): Promise<void>;
}

export interface AttachmentOutcome {
  attachmentId: string;
  status: CardAttachmentStatus;
  rejectionReason: string | null;
}

/** "upload-intent فقط objectKey تصادفی در prefix کاربر بدهد" - the caller can never choose the key, and it is always scoped to their own user id. */
export function objectKeyForUpload(userId: string): string {
  return `users/${userId}/card-uploads/${randomUUID()}`;
}

export async function createUploadIntent(
  repo: AttachmentRepository,
  ownerId: string,
  kind: UploadableAttachmentKind
): Promise<{ attachmentId: string; objectKey: string }> {
  const objectKey = objectKeyForUpload(ownerId);
  const { id } = await repo.createPending({ ownerId, kind, objectKey });
  return { attachmentId: id, objectKey };
}

/**
 * Called by the storage upload route once the raw bytes land. Sniffs the
 * real content type from the magic bytes (never trusts a client-declared
 * type), records size and a SHA-256 checksum, and only then writes the
 * object to private storage. An empty, oversized, or unrecognizable body is
 * rejected outright (PENDING -> REJECTED) and no object is ever stored.
 */
export async function recordUpload(
  repo: AttachmentRepository,
  storage: StorageProvider,
  attachmentId: string,
  uploaderId: string,
  body: Buffer
): Promise<AttachmentOutcome> {
  const attachment = await requireOwnedAttachment(repo, attachmentId, uploaderId);
  if (attachment.status !== 'PENDING') throw new AttachmentNotAwaitingUploadError();

  const objectKey = attachment.objectKey;
  if (objectKey === null) throw new AttachmentNotAwaitingUploadError();

  const sizeReason = body.length === 0 ? 'EMPTY_FILE' : body.length > MAX_ATTACHMENT_BYTES ? 'TOO_LARGE' : null;
  if (sizeReason) {
    await repo.markRejected(attachmentId, sizeReason);
    return { attachmentId, status: 'REJECTED', rejectionReason: sizeReason };
  }

  const sniffed = sniffContentType(body);
  if (sniffed === null) {
    await repo.markRejected(attachmentId, 'UNRECOGNIZED_CONTENT');
    return { attachmentId, status: 'REJECTED', rejectionReason: 'UNRECOGNIZED_CONTENT' };
  }

  const checksumSha256 = createHash('sha256').update(body).digest('hex');
  await storage.putPrivate({ objectKey, body, contentType: sniffed });
  await repo.markProcessing(attachmentId, { objectKey, contentType: sniffed, sizeBytes: body.length, checksumSha256 });

  return { attachmentId, status: 'PROCESSING', rejectionReason: null };
}

/**
 * The one authoritative gate - "finalize نوع واقعی، اندازه، checksum،
 * مالکیت و status READY را کنترل کند". The sniffed content type must be in
 * the allowlist for the kind the author declared, and the size must still
 * be within the ceiling; otherwise the attachment is REJECTED and its
 * bytes are deleted, so a rejected attachment can never be shown on a card
 * or handed a signed read URL.
 */
export async function finalizeAttachment(
  repo: AttachmentRepository,
  storage: StorageProvider,
  attachmentId: string,
  ownerId: string
): Promise<AttachmentOutcome> {
  const attachment = await requireOwnedAttachment(repo, attachmentId, ownerId);

  if (isTerminalAttachmentStatus(attachment.status)) {
    return { attachmentId, status: attachment.status, rejectionReason: attachment.rejectionReason };
  }
  if (attachment.status !== 'PROCESSING') throw new AttachmentNotAwaitingFinalizeError();

  const reasons: string[] = [];
  if (attachment.sizeBytes === null || attachment.sizeBytes > MAX_ATTACHMENT_BYTES) reasons.push('TOO_LARGE');
  if (!isContentTypeAllowedForKind(attachment.kind, attachment.contentType)) reasons.push('TYPE_NOT_ALLOWED');

  if (reasons.length > 0) {
    const reason = reasons.join(',');
    await repo.markRejected(attachmentId, reason);
    if (attachment.objectKey) await storage.delete(attachment.objectKey);
    return { attachmentId, status: 'REJECTED', rejectionReason: reason };
  }

  await repo.markReady(attachmentId);
  return { attachmentId, status: 'READY', rejectionReason: null };
}

async function requireOwnedAttachment(
  repo: AttachmentRepository,
  attachmentId: string,
  userId: string
): Promise<AttachmentRecord> {
  const attachment = await repo.findById(attachmentId);
  if (!attachment) throw new AttachmentNotFoundError();
  if (attachment.ownerId !== userId) throw new NotAttachmentOwnerError();
  return attachment;
}
