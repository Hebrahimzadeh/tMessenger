import type { CardAttachmentKind, CardAttachmentStatus, CardKind, CardStatus, SpaceStatus } from '@taavon/database';
import type { CardLinkInput, CardLocationInput } from '@taavon/contracts';
import { deriveTitle } from './card-state-machine';
import { inferCardKind } from './card-kind-inference';

export class CardNotFoundError extends Error {
  constructor() {
    super('Card not found.');
    this.name = 'CardNotFoundError';
  }
}

export class SpaceNotFoundForCardError extends Error {
  constructor() {
    super('Space not found.');
    this.name = 'SpaceNotFoundForCardError';
  }
}

/** The space is TEMPORARILY_SUSPENDED (or archived/removed) - "suspended space اجازهٔ ساخت کارت عمومی ندهد". */
export class SpaceNotAcceptingCardsError extends Error {
  constructor(status: SpaceStatus) {
    super(`Space in status ${status} does not accept new cards.`);
    this.name = 'SpaceNotAcceptingCardsError';
  }
}

export class NotCardEditorError extends Error {
  constructor() {
    super('Only the card author may edit it.');
    this.name = 'NotCardEditorError';
  }
}

/** An attachment id passed to create/update is not the caller's, not READY, or already on another card. */
export class InvalidAttachmentReferenceError extends Error {
  constructor() {
    super('One or more attachments cannot be used: not yours, not ready, or already attached elsewhere.');
    this.name = 'InvalidAttachmentReferenceError';
  }
}

export interface CardAttachmentRecord {
  id: string;
  cardId: string | null;
  ownerId: string;
  kind: CardAttachmentKind;
  status: CardAttachmentStatus;
  objectKey: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  linkUrl: string | null;
  locationLabel: string | null;
  approxLat: number | null;
  approxLng: number | null;
}

export interface CardRecord {
  id: string;
  spaceId: string;
  authorId: string;
  kind: CardKind;
  status: CardStatus;
  publishedAt: Date;
  latestRevision: { revisionNumber: number; title: string; body: string };
  inferredKind: CardKind;
  attachments: CardAttachmentRecord[];
}

export interface CardListRow {
  id: string;
  authorId: string;
  kind: CardKind;
  publishedAt: Date;
  title: string;
  body: string;
  attachmentCount: number;
}

export interface CreateCardInput {
  spaceId: string;
  authorId: string;
  body: string;
  title?: string;
  kind?: CardKind;
  attachmentIds: string[];
  links: CardLinkInput[];
  locations: CardLocationInput[];
}

export interface CardRepository {
  getSpaceStatus(spaceId: string): Promise<SpaceStatus | null>;
  /** Attachments referenced by id at create/update time - the service checks each is the caller's, READY, and unlinked. */
  findAttachmentsByIds(ids: string[]): Promise<CardAttachmentRecord[]>;
  createCard(input: {
    spaceId: string;
    authorId: string;
    kind: CardKind;
    title: string;
    body: string;
    inferredKind: CardKind;
    confidence: number;
    fileAttachmentIds: string[];
    links: CardLinkInput[];
    locations: CardLocationInput[];
  }): Promise<{ id: string }>;
  addRevision(input: {
    cardId: string;
    editorId: string;
    kind: CardKind;
    title: string;
    body: string;
    inferredKind: CardKind;
    confidence: number;
    fileAttachmentIds: string[];
    links: CardLinkInput[];
    locations: CardLocationInput[];
  }): Promise<{ revisionNumber: number }>;
  findCard(cardId: string): Promise<CardRecord | null>;
  listCards(spaceId: string, params: { limit: number; before: { publishedAt: string; id: string } | null }): Promise<CardListRow[]>;
}

const MEANINGFUL_ATTACHMENT_KINDS: CardAttachmentKind[] = ['IMAGE', 'AUDIO', 'VIDEO', 'FILE'];

function assertHasContent(input: { body: string; fileCount: number; links: unknown[]; locations: unknown[] }): void {
  if (input.body.trim().length === 0 && input.fileCount === 0 && input.links.length === 0 && input.locations.length === 0) {
    throw new InvalidAttachmentReferenceError();
  }
}

async function resolveFileAttachments(
  repo: CardRepository,
  attachmentIds: string[],
  authorId: string
): Promise<string[]> {
  if (attachmentIds.length === 0) return [];
  const found = await repo.findAttachmentsByIds(attachmentIds);
  const byId = new Map(found.map((a) => [a.id, a]));

  for (const id of attachmentIds) {
    const attachment = byId.get(id);
    if (
      !attachment ||
      attachment.ownerId !== authorId ||
      attachment.status !== 'READY' ||
      attachment.cardId !== null ||
      !MEANINGFUL_ATTACHMENT_KINDS.includes(attachment.kind)
    ) {
      throw new InvalidAttachmentReferenceError();
    }
  }
  return attachmentIds;
}

/**
 * "متن تنها یا پیوست معنادار کافی؛ kind اجباری نیست" - a card needs body
 * text OR at least one meaningful attachment (a finalized file, a link, or
 * a location); the author never has to pick a kind (it defaults AWARENESS
 * and a rule-based `inferredKind` is kept alongside).
 */
export async function createCard(
  repo: CardRepository,
  input: CreateCardInput
): Promise<{ id: string }> {
  const spaceStatus = await repo.getSpaceStatus(input.spaceId);
  if (spaceStatus === null) throw new SpaceNotFoundForCardError();
  if (spaceStatus !== 'PUBLISHED') throw new SpaceNotAcceptingCardsError(spaceStatus);

  const fileAttachmentIds = await resolveFileAttachments(repo, input.attachmentIds, input.authorId);
  assertHasContent({ body: input.body, fileCount: fileAttachmentIds.length, links: input.links, locations: input.locations });

  const { inferredKind, confidence } = inferCardKind(input.body);

  return repo.createCard({
    spaceId: input.spaceId,
    authorId: input.authorId,
    kind: input.kind ?? 'AWARENESS',
    title: deriveTitle(input.title, input.body),
    body: input.body,
    inferredKind,
    confidence,
    fileAttachmentIds,
    links: input.links,
    locations: input.locations,
  });
}

/**
 * An edit is always a new immutable revision - "edit revision و outbox
 * event بسازد". Only the author may edit. Text (body/title/kind) is
 * replaced and the semantic profile recomputed; `attachmentIds`/`links`/
 * `locations` on an update *add* to the card - Task 14 does not remove
 * existing attachments (nothing physical is ever deleted).
 */
export async function updateCard(
  repo: CardRepository,
  cardId: string,
  editorId: string,
  input: { body: string; title?: string; kind?: CardKind; attachmentIds: string[]; links: CardLinkInput[]; locations: CardLocationInput[] }
): Promise<{ revisionNumber: number }> {
  const card = await repo.findCard(cardId);
  if (!card) throw new CardNotFoundError();
  if (card.authorId !== editorId) throw new NotCardEditorError();

  const fileAttachmentIds = await resolveFileAttachments(repo, input.attachmentIds, editorId);

  const existingMeaningful =
    card.latestRevision.body.trim().length > 0 || card.attachments.some((a) => MEANINGFUL_ATTACHMENT_KINDS.includes(a.kind) && a.status === 'READY') ||
    card.attachments.some((a) => a.kind === 'LINK' || a.kind === 'APPROXIMATE_LOCATION');
  if (
    input.body.trim().length === 0 &&
    fileAttachmentIds.length === 0 &&
    input.links.length === 0 &&
    input.locations.length === 0 &&
    !existingMeaningful
  ) {
    throw new InvalidAttachmentReferenceError();
  }

  const { inferredKind, confidence } = inferCardKind(input.body);

  return repo.addRevision({
    cardId,
    editorId,
    kind: input.kind ?? card.kind,
    title: deriveTitle(input.title, input.body),
    body: input.body,
    inferredKind,
    confidence,
    fileAttachmentIds,
    links: input.links,
    locations: input.locations,
  });
}

/**
 * A card view is public, but only for a card that lives in a PUBLISHED
 * space - a suspended or draft space's cards are not shown, and the caller
 * cannot tell "no such card" from "space not public" (both are 404). This
 * is also what keeps a non-READY or REJECTED attachment out of the
 * response: the route only renders READY attachments and only mints a
 * signed URL for one with an object key.
 */
export async function getCard(repo: CardRepository, cardId: string): Promise<CardRecord> {
  const card = await repo.findCard(cardId);
  if (!card || card.status === 'REMOVED') throw new CardNotFoundError();

  const spaceStatus = await repo.getSpaceStatus(card.spaceId);
  if (spaceStatus !== 'PUBLISHED') throw new CardNotFoundError();

  return card;
}

export interface CardListResult {
  items: CardListRow[];
  nextCursor: string | null;
}

export async function listCards(
  repo: CardRepository,
  spaceId: string,
  params: { limit: number; cursor?: string }
): Promise<CardListResult> {
  const spaceStatus = await repo.getSpaceStatus(spaceId);
  if (spaceStatus !== 'PUBLISHED') throw new SpaceNotFoundForCardError();

  const before = params.cursor ? decodeCursor(params.cursor) : null;
  const rows = await repo.listCards(spaceId, { limit: params.limit + 1, before });
  const hasMore = rows.length > params.limit;
  const page = rows.slice(0, params.limit);
  const last = page[page.length - 1];

  return {
    items: page,
    nextCursor: hasMore && last ? encodeCursor({ publishedAt: last.publishedAt.toISOString(), id: last.id }) : null,
  };
}

export class InvalidCardCursorError extends Error {
  constructor() {
    super('Invalid pagination cursor.');
    this.name = 'InvalidCardCursorError';
  }
}

function encodeCursor(c: { publishedAt: string; id: string }): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { publishedAt: string; id: string } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { publishedAt: unknown }).publishedAt === 'string' &&
      typeof (parsed as { id: unknown }).id === 'string'
    ) {
      return parsed as { publishedAt: string; id: string };
    }
    throw new Error('shape');
  } catch {
    throw new InvalidCardCursorError();
  }
}
