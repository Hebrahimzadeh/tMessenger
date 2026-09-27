import type { CardAttachmentKind, CardAttachmentStatus, CardKind, CardStatus, SpaceStatus } from '@taavon/database';
import type { CardInference, CardLinkInput, CardLocationInput, ConfirmedInference } from '@taavon/contracts';
import { inferCardKind } from './card-kind-inference';
import { rankCards, type SpaceHealthStatusForRanking } from './card-ranking';

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
  latestRevision: { revisionNumber: number; body: string };
  inferredKind: CardKind;
  attachments: CardAttachmentRecord[];
}

/** پسند، گفت‌وگو، نشان - everything a card's action bar needs to render itself for one reader. */
export interface CardEngagementRecord {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
}

export interface CardListRow {
  id: string;
  authorId: string;
  kind: CardKind;
  publishedAt: Date;
  /** The caption. Empty for a card that is only an image, a link or a place. */
  body: string;
  attachmentCount: number;
  /** The object key of the card's first READY image, for the route to sign. Null when it has none. */
  imageObjectKey: string | null;
  /** Every reaction type together - what card ranking's small capped coefficient reads. */
  reactionCount: number;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  bookmarkedByMe: boolean;
}

export interface CreateCardInput {
  spaceId: string;
  authorId: string;
  body: string;
  kind?: CardKind;
  attachmentIds: string[];
  links: CardLinkInput[];
  locations: CardLocationInput[];
  /** Present only when the person previewed an inference and kept it. */
  confirmedInference?: ConfirmedInference;
}

export interface SpaceProtocolRecord {
  /**
   * The captions of the space's own most recent cards - the protocol a draft
   * should stay inside, read from what people actually posted rather than
   * from templates on the space's definition. Empty for a space whose cards
   * have all been removed.
   */
  recentCaptions: string[];
  roleTitles: string[];
}

/**
 * The inference, as the card module sees it.
 *
 * A port rather than a direct import of the AI capability, for the same
 * reason the space-creation gate is one: this module should depend on the
 * shape of an answer, not on where it comes from.
 */
export interface CardInferencePort {
  infer(
    input: { body: string; protocol?: SpaceProtocolRecord },
    requesterId: string | null
  ): Promise<CardInference>;
}

export interface CardRepository {
  getSpaceStatus(spaceId: string): Promise<SpaceStatus | null>;
  /** The space's own recent captions and role titles - the protocol a draft should stay inside. */
  getSpaceProtocol(spaceId: string): Promise<SpaceProtocolRecord | null>;
  /** The card's like/comment/bookmark state for one reader (`viewerId` null for an anonymous one). */
  getEngagement(cardId: string, viewerId: string | null): Promise<CardEngagementRecord>;
  /** Attachments referenced by id at create/update time - the service checks each is the caller's, READY, and unlinked. */
  findAttachmentsByIds(ids: string[]): Promise<CardAttachmentRecord[]>;
  createCard(input: {
    spaceId: string;
    authorId: string;
    kind: CardKind;
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
    body: string;
    inferredKind: CardKind;
    confidence: number;
    fileAttachmentIds: string[];
    links: CardLinkInput[];
    locations: CardLocationInput[];
  }): Promise<{ revisionNumber: number }>;
  findCard(cardId: string): Promise<CardRecord | null>;
  listCards(
    spaceId: string,
    params: { limit: number; before: { publishedAt: string; id: string } | null; viewerId: string | null }
  ): Promise<CardListRow[]>;
  /** Null when no snapshot has ever been computed for the space (e.g. brand new) - ranking treats that the same as a healthy default. */
  getSpaceHealthStatus(spaceId: string): Promise<SpaceHealthStatusForRanking>;
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
 * "متن تنها یا پیوست معنادار کافی؛ kind اجباری نیست" - a card needs a
 * caption OR at least one meaningful attachment (a finalized file, a link,
 * or a location); the author never has to pick a kind (it defaults AWARENESS
 * and a rule-based `inferredKind` is kept alongside). Nothing here derives a
 * name for the card: it does not have one.
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

  // What the person confirmed after previewing, when they previewed at all.
  // Falling back to the offline classifier is what keeps every caller that
  // never asks for a suggestion - and the whole composer with the model
  // switched off - working exactly as before.
  const { inferredKind, confidence } = input.confirmedInference ?? inferCardKind(input.body);

  return repo.createCard({
    spaceId: input.spaceId,
    authorId: input.authorId,
    kind: input.kind ?? 'AWARENESS',
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
 * event بسازد". Only the author may edit. Text (the caption) and `kind` are
 * replaced and the semantic profile recomputed; `attachmentIds`/`links`/
 * `locations` on an update *add* to the card - Task 14 does not remove
 * existing attachments (nothing physical is ever deleted).
 */
export async function updateCard(
  repo: CardRepository,
  cardId: string,
  editorId: string,
  input: { body: string; kind?: CardKind; attachmentIds: string[]; links: CardLinkInput[]; locations: CardLocationInput[] }
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
/**
 * Proposes how a piece of text would behave as a card, before any card
 * exists.
 *
 * Nothing is written. The person previews the answer, takes the parts they
 * agree with, and creates the card themselves - "preview/confirm اجباری".
 * The space must be accepting cards, checked here rather than trusted from
 * the caller, so this cannot be used to probe a draft or archived space.
 */
export async function inferCardDraft(
  repo: CardRepository,
  port: CardInferencePort,
  input: { spaceId: string; body: string; requesterId: string | null }
): Promise<CardInference> {
  const spaceStatus = await repo.getSpaceStatus(input.spaceId);
  if (spaceStatus === null) throw new SpaceNotFoundForCardError();
  if (spaceStatus !== 'PUBLISHED') throw new SpaceNotAcceptingCardsError(spaceStatus);

  const protocol = (await repo.getSpaceProtocol(input.spaceId)) ?? undefined;
  return port.infer({ body: input.body, protocol }, input.requesterId);
}

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The keyset cursor stays purely recency-based - it names an exact
 * `(publishedAt, id)` boundary, so paging is stable and nothing is ever
 * skipped or repeated. Ranking ("ترکیب تازگی/relevance/تنوع/health و
 * reaction فقط ضریب کوچک سقف‌دار") only reorders *within* the page that
 * boundary already fetched - `rankCards` (see card-ranking.ts) is applied
 * to the page's rows before they're returned, never to which rows are
 * fetched, so the two concerns can't interfere with each other.
 */
export async function listCards(
  repo: CardRepository,
  spaceId: string,
  params: { limit: number; cursor?: string; now?: Date; viewerId?: string | null }
): Promise<CardListResult> {
  const spaceStatus = await repo.getSpaceStatus(spaceId);
  if (spaceStatus !== 'PUBLISHED') throw new SpaceNotFoundForCardError();

  const before = params.cursor ? decodeCursor(params.cursor) : null;
  const rows = await repo.listCards(spaceId, { limit: params.limit + 1, before, viewerId: params.viewerId ?? null });
  const hasMore = rows.length > params.limit;
  const page = rows.slice(0, params.limit);
  const last = page[page.length - 1];

  const now = params.now ?? new Date();
  const spaceHealth = page.length > 0 ? await repo.getSpaceHealthStatus(spaceId) : null;
  const order = rankCards(
    page.map((row) => ({
      cardId: row.id,
      authorId: row.authorId,
      relevance: 1, // no query in a plain space feed - same convention as space search.
      ageDays: Math.max(0, (now.getTime() - row.publishedAt.getTime()) / MS_PER_DAY),
      reactionCount: row.reactionCount,
      spaceHealth,
    }))
  );
  const byId = new Map(page.map((row) => [row.id, row]));
  const ranked = order.map((id) => byId.get(id)!);

  return {
    items: ranked,
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
