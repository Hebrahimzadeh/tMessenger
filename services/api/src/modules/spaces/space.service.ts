import { randomBytes } from 'node:crypto';
import type { SpaceGateVerdict, SpaceStatus } from '@taavon/database';
import type { SpaceCardHint, SpaceCreationGuidance } from '@taavon/contracts';
import type { SpaceCreationGate } from './space-creation-gate';
import type { SpaceBuildResult } from '../ai/capabilities/space-builder';
import { generateUniqueSlug } from './slug';

export class SpaceNotFoundError extends Error {
  constructor() {
    super('Space not found.');
    this.name = 'SpaceNotFoundError';
  }
}

/** Caller is neither the creator nor holds a SPACE_ADMIN role scoped to this space. */
export class NotSpaceEditorError extends Error {
  constructor() {
    super('Only the creator or a space admin may do this.');
    this.name = 'NotSpaceEditorError';
  }
}

/** The space's current status does not allow this action (e.g. editing an already-PUBLISHED/ARCHIVED space). */
export class SpaceNotEditableError extends Error {
  constructor(status: SpaceStatus) {
    super(`Space in status ${status} cannot be edited.`);
    this.name = 'SpaceNotEditableError';
  }
}

export class DuplicateRoleKeyError extends Error {
  constructor(key: string) {
    super(`Role key "${key}" is used more than once.`);
    this.name = 'DuplicateRoleKeyError';
  }
}

/** publish() called when the latest version's gate verdict is not ALLOW - "publish بدون ALLOW ممنوع". */
export class GateNotAllowedError extends Error {
  constructor() {
    super('This space cannot be published until it passes precheck with an ALLOW verdict.');
    this.name = 'GateNotAllowedError';
  }
}

/**
 * The title alone matched a SEVERE rule, so nothing was created - no Space
 * row and no slug. "BLOCK هیچ Space/slug عمومی نسازد": the cheapest way to
 * keep that promise is to never claim the name in the first place.
 */
export class SpaceBlockedError extends Error {
  constructor() {
    super('This title matches an explicit policy rule and no space was created.');
    this.name = 'SpaceBlockedError';
  }
}

/**
 * An edit to a published space that was not applied. The published version is
 * untouched: a refused edit changes nothing anybody can see.
 */
export class SpaceEditRefusedError extends Error {
  constructor(
    readonly verdict: SpaceGateVerdict,
    readonly reason: string,
    readonly matchedPolicyRules: string[]
  ) {
    super(reason);
    this.name = 'SpaceEditRefusedError';
  }
}

export class RoleNotFoundError extends Error {
  constructor() {
    super('That role does not exist in this space.');
    this.name = 'RoleNotFoundError';
  }
}

export class InviteNotFoundError extends Error {
  constructor() {
    super('This invite link is invalid or has been revoked.');
    this.name = 'InviteNotFoundError';
  }
}

export interface SpaceRoleInputRecord {
  key: string;
  title: string;
  description?: string;
  isPrimary: boolean;
}

export interface SpaceRoleRecord {
  id: string;
  key: string;
  title: string;
  description: string | null;
  isPrimary: boolean;
}

export interface SpaceVersionRecord {
  versionNumber: number;
  title: string;
  purpose: string;
  audience: string | null;
  participationMethods: string[];
  cardHints: SpaceCardHint[] | null;
  policyVersion: number;
  gateVerdict: SpaceGateVerdict | null;
  gateReason: string | null;
  primaryRoleIds: string[];
  supplementaryRoleIds: string[];
}

export interface SpaceRecord {
  id: string;
  slug: string;
  status: SpaceStatus;
  creatorId: string;
  publishedAt: Date | null;
  archivedAt: Date | null;
  latestVersion: SpaceVersionRecord;
  /** Every role ever created for this space (not just the ones the latest version references) - the service filters down to `latestVersion`'s own reference set when building a response. */
  roles: SpaceRoleRecord[];
}

/** A row of `listByCreator` - the latest version's title and purpose, and nothing else a list needs. */
export interface MySpaceRecord {
  id: string;
  slug: string;
  title: string;
  purpose: string;
  status: SpaceStatus;
  createdAt: Date;
}

export interface SpaceRepository {
  slugExists(slug: string): Promise<boolean>;
  /** Creates the Space row plus its version-1 SpaceDefinitionVersion, and appends a `space.created` outbox event, all in one transaction. */
  createDraft(input: { title: string; slug: string; policyVersion: number; creatorId: string }): Promise<{ id: string }>;
  findById(id: string): Promise<SpaceRecord | null>;
  findBySlug(slug: string): Promise<SpaceRecord | null>;
  /**
   * Every space this person created, newest first, whatever its status.
   *
   * The one listing allowed to return a space that is not PUBLISHED, and
   * it is safe precisely because it is keyed on the caller's own id - the
   * public search index (space-search.repository.ts) still structurally
   * excludes everything but PUBLISHED.
   */
  listByCreator(creatorId: string, limit: number): Promise<MySpaceRecord[]>;
  /** How many people follow this space, and whether this caller is one of them (false for an anonymous caller). */
  followState(spaceId: string, userId: string | null): Promise<{ followerCount: number; isFollowing: boolean }>;
  /** SPACE-scoped SPACE_ADMIN role assignment (see schema.prisma's RoleAssignment) - the creator check itself is done by the service, not the repository. */
  hasSpaceAdminRole(userId: string, spaceId: string): Promise<boolean>;
  /** Upserts each role by (spaceId, key), inserts the new version, resets `Space.status` to DRAFT (a fresh edit always needs a fresh precheck), and appends a `space.versioned` outbox event - all in one transaction. */
  createNewVersion(input: {
    spaceId: string;
    title: string;
    purpose: string;
    audience?: string;
    participationMethods: string[];
    cardHints?: SpaceCardHint[];
    roles: SpaceRoleInputRecord[];
    policyVersion: number;
    createdBy: string;
  }): Promise<{ versionNumber: number }>;
  /** Persists the verdict on that exact version, moves the space's status, and writes one audit event naming the baseline that decided it - all in one transaction. */
  /**
   * Creates a whole space from a built definition - the Space row, version 1
   * with its verdict, its roles, its outbox events and one audit event - in a
   * single transaction. There is no half-built state: either the person has a
   * space or they do not.
   */
  createBuiltSpace(input: {
    slug: string;
    creatorId: string;
    title: string;
    purpose: string;
    audience?: string;
    participationMethods: string[];
    cardHints: SpaceCardHint[];
    roles: SpaceRoleInputRecord[];
    policyVersion: number;
    status: 'PUBLISHED' | 'HUMAN_REVIEW';
    verdict: 'ALLOW' | 'HUMAN_REVIEW';
    reason: string;
    policyVersionRef: string;
    matchedPolicyRules: string[];
    documentRef: string;
    creativityApplied: boolean;
  }): Promise<{ id: string }>;
  /**
   * Adds a version to a space that stays PUBLISHED, with its ALLOW verdict and
   * an audit event naming the baseline that allowed it, in one transaction.
   * Unlike `createNewVersion` it does not reset the status - a published
   * space being corrected is not a draft.
   */
  publishNewVersion(input: {
    spaceId: string;
    title: string;
    purpose: string;
    audience?: string;
    participationMethods: string[];
    cardHints?: SpaceCardHint[];
    roles: SpaceRoleInputRecord[];
    policyVersion: number;
    createdBy: string;
    gateReason: string;
    policyVersionRef: string;
    matchedPolicyRules: string[];
  }): Promise<{ versionNumber: number }>;
  setGateVerdict(input: {
    spaceId: string;
    versionNumber: number;
    verdict: SpaceGateVerdict;
    reason: string;
    newStatus: SpaceStatus;
    actorId: string;
    policyVersionRef: string;
    matchedPolicyRules: string[];
  }): Promise<void>;
  /** Sets status=PUBLISHED, publishedAt=now, and appends a `space.published` outbox event in one transaction. */
  publish(spaceId: string): Promise<{ publishedAt: Date }>;
  archive(spaceId: string): Promise<{ archivedAt: Date }>;
  findRoleInSpace(spaceId: string, roleId: string): Promise<{ id: string } | null>;
  /** Idempotent - joining a role already held is a no-op, not an error. */
  joinRole(spaceId: string, userId: string, roleId: string): Promise<void>;
  /** Idempotent - leaving a role never held is a no-op, not an error. */
  leaveRole(userId: string, roleId: string): Promise<void>;
  createInvite(spaceId: string, createdBy: string, token: string): Promise<void>;
  /** Returns whether an active (unrevoked) invite with this token existed for this space. Idempotent - revoking an already-revoked or unknown token returns false rather than throwing. */
  revokeInvite(spaceId: string, token: string): Promise<boolean>;
  resolveInvite(token: string): Promise<{ spaceId: string; slug: string } | null>;
}

const STATUSES_OPEN_FOR_EDITING: SpaceStatus[] = ['DRAFT', 'PRECHECK_REQUIRED', 'HUMAN_REVIEW'];

function assertEditable(status: SpaceStatus): void {
  if (!STATUSES_OPEN_FOR_EDITING.includes(status)) {
    throw new SpaceNotEditableError(status);
  }
}

async function assertIsEditor(repo: SpaceRepository, space: SpaceRecord, userId: string): Promise<void> {
  if (space.creatorId === userId) return;
  if (await repo.hasSpaceAdminRole(userId, space.id)) return;
  throw new NotSpaceEditorError();
}

function assertNoDuplicateRoleKeys(roles: SpaceRoleInputRecord[]): void {
  const seen = new Set<string>();
  for (const role of roles) {
    if (seen.has(role.key)) throw new DuplicateRoleKeyError(role.key);
    seen.add(role.key);
  }
}

/**
 * Creates a new draft space: just enough to claim a slug and start
 * iterating (see this task's own review note on why create/update are
 * deliberately split this way). Any authenticated user may create a draft -
 * "ساخت draft آزاد" (Task 10's own acceptance line).
 */
export async function createSpace(
  repo: SpaceRepository,
  gate: SpaceCreationGate,
  creatorId: string,
  title: string
): Promise<{ id: string; slug: string }> {
  // Checked before the slug is generated, not after: a refusal that has
  // already claimed the name has not actually refused anything.
  if (await gate.blocksOnTitle(title)) throw new SpaceBlockedError();

  const slug = await generateUniqueSlug(title, (candidate) => repo.slugExists(candidate));
  const { id } = await repo.createDraft({ title, slug, policyVersion: 1, creatorId });
  return { id, slug };
}

async function loadForEdit(repo: SpaceRepository, spaceId: string, userId: string): Promise<SpaceRecord> {
  const space = await repo.findById(spaceId);
  if (!space) throw new SpaceNotFoundError();
  await assertIsEditor(repo, space, userId);
  return space;
}

/**
 * Replaces the space's definition with a brand-new immutable version -
 * "هر edit یک version immutable". Only the creator/a space admin may call
 * this, and only while the space is still in its pre-publish pipeline
 * (DRAFT/PRECHECK_REQUIRED/HUMAN_REVIEW) - a PUBLISHED space's content is
 * stable in this task's scope (see this task's own review note).
 */
export async function updateSpaceDefinition(
  repo: SpaceRepository,
  spaceId: string,
  userId: string,
  input: {
    title: string;
    purpose: string;
    audience?: string;
    participationMethods: string[];
    cardHints?: SpaceCardHint[];
    roles: SpaceRoleInputRecord[];
    policyVersion: number;
  }
): Promise<{ versionNumber: number }> {
  const space = await loadForEdit(repo, spaceId, userId);
  assertEditable(space.status);
  assertNoDuplicateRoleKeys(input.roles);

  return repo.createNewVersion({ spaceId, createdBy: userId, ...input });
}

/**
 * Runs the SpaceCreationGate against the space's current latest version and
 * persists the verdict onto that exact version - editing again always
 * produces a new version with a fresh, unset verdict, so a stale ALLOW can
 * never silently carry over to changed content.
 *
 * The verdict is recorded together with the baseline that produced it and
 * the rules that matched, both on the version and in the audit trail:
 * "منبع policyVersion در نتیجه و audit ثبت شود". Without them a stored
 * BLOCK is an unexplainable one once the wording of a rule moves on.
 */
export async function precheckSpace(
  repo: SpaceRepository,
  gate: SpaceCreationGate,
  spaceId: string,
  userId: string
): Promise<{
  verdict: SpaceGateVerdict;
  reason: string;
  status: SpaceStatus;
  policyVersionRef: string;
  matchedPolicyRules: string[];
  guidance: SpaceCreationGuidance | null;
}> {
  const space = await loadForEdit(repo, spaceId, userId);
  assertEditable(space.status);

  const { verdict, reason, policyVersionRef, matchedPolicyRules, guidance } = await gate.evaluate({
    title: space.latestVersion.title,
    purpose: space.latestVersion.purpose,
    participationMethods: space.latestVersion.participationMethods,
    primaryRoleCount: space.latestVersion.primaryRoleIds.length,
  });

  const newStatus: SpaceStatus = verdict === 'HUMAN_REVIEW' ? 'HUMAN_REVIEW' : verdict === 'ALLOW' ? 'DRAFT' : 'PRECHECK_REQUIRED';
  await repo.setGateVerdict({
    spaceId,
    versionNumber: space.latestVersion.versionNumber,
    verdict,
    reason,
    newStatus,
    actorId: userId,
    policyVersionRef,
    matchedPolicyRules,
  });

  return { verdict, reason, status: newStatus, policyVersionRef, matchedPolicyRules, guidance };
}

// --- One prompt, a whole space (owner decision 2026-09-17) ---------------

/** The builder, as the space module sees it: a prompt in, a decided space out. */
export interface SpaceBuilder {
  build(prompt: string, requesterId: string | null): Promise<SpaceBuildResult>;
}

export interface BuildSpaceOutcome {
  outcome: 'PUBLISHED' | 'HUMAN_REVIEW' | 'BLOCKED';
  space: { id: string; slug: string } | null;
  reason: string;
  matchedPolicyRules: string[];
  policyVersionRef: string;
  creativityApplied: boolean;
}

/**
 * Turns one prompt into a space the person manages.
 *
 * No form, no preview step and no second request: the builder designs the
 * space from the prompt and the space-builder document, the policy baseline
 * decides whether it may exist, and it is stored and - unless a person needs
 * to look first - published, all at once. Editing happens afterwards, on the
 * published space.
 *
 * The creator is its manager by construction: `getSpace` treats the creator
 * as able to manage, exactly as for a space built any other way.
 *
 * A BLOCK is an answer, not an error. Nothing is created, no slug is taken,
 * and the person gets the rule that matched so they know what to rewrite.
 */
export async function buildSpaceFromPrompt(
  repo: SpaceRepository,
  builder: SpaceBuilder,
  creatorId: string,
  prompt: string
): Promise<BuildSpaceOutcome> {
  const result = await builder.build(prompt, creatorId);

  if (result.decision === 'BLOCK' || !result.space) {
    return {
      outcome: 'BLOCKED',
      space: null,
      reason: result.reason,
      matchedPolicyRules: result.matchedPolicyRules,
      policyVersionRef: result.policyVersionRef,
      creativityApplied: result.creativityApplied,
    };
  }

  const built = result.space;
  const slug = await generateUniqueSlug(built.title, (candidate) => repo.slugExists(candidate));

  // Role keys are assigned here rather than by the model: they must match
  // ^[a-z0-9_-]+$ and carry no meaning a person ever sees.
  const primaries = built.roles.filter((role) => role.isPrimary);
  const supporting = built.roles.filter((role) => !role.isPrimary);
  const roles: SpaceRoleInputRecord[] = [
    ...primaries.map((role, i) => ({
      key: `primary-${i + 1}`,
      title: role.title,
      ...(role.description ? { description: role.description } : {}),
      isPrimary: true,
    })),
    ...supporting.map((role, i) => ({
      key: `supporting-${i + 1}`,
      title: role.title,
      ...(role.description ? { description: role.description } : {}),
      isPrimary: false,
    })),
  ];

  const publish = result.decision === 'PUBLISH';
  const { id } = await repo.createBuiltSpace({
    slug,
    creatorId,
    title: built.title,
    purpose: built.description,
    ...(built.audience ? { audience: built.audience } : {}),
    participationMethods: built.participationMethods,
    cardHints: built.cardHints.map((hint) => ({
      isExample: true as const,
      label: 'نمونه' as const,
      title: hint.title,
      ...(hint.description ? { description: hint.description } : {}),
    })),
    roles,
    policyVersion: 1,
    status: publish ? 'PUBLISHED' : 'HUMAN_REVIEW',
    verdict: publish ? 'ALLOW' : 'HUMAN_REVIEW',
    reason: result.reason,
    policyVersionRef: result.policyVersionRef,
    matchedPolicyRules: result.matchedPolicyRules,
    documentRef: result.documentRef,
    creativityApplied: result.creativityApplied,
  });

  return {
    outcome: publish ? 'PUBLISHED' : 'HUMAN_REVIEW',
    space: { id, slug },
    reason: result.reason,
    matchedPolicyRules: result.matchedPolicyRules,
    policyVersionRef: result.policyVersionRef,
    creativityApplied: result.creativityApplied,
  };
}

const MIN_PUBLISHED_PURPOSE_LENGTH = 20;

const EDIT_REFUSAL_REASONS = {
  BLOCK: 'این ویرایش با یکی از قواعد صریح پلتفرم مغایرت دارد و اعمال نشد. نسخهٔ منتشرشده بدون تغییر ماند.',
  HUMAN_REVIEW: 'این ویرایش پیش از اعمال به نگاه یک نفر نیاز دارد و اعمال نشد. نسخهٔ منتشرشده بدون تغییر ماند.',
} as const;

function rolesText(roles: { title: string; description?: string | null }[]): string {
  return roles.map((role) => `${role.title}\n${role.description ?? ''}`).join('\n');
}

function hintsText(hints: SpaceCardHint[] | null | undefined): string {
  return (hints ?? []).map((hint) => `${hint.title}\n${hint.description ?? ''}`).join('\n');
}

/**
 * Edits a space, whatever state it is in.
 *
 * Before publication this is the existing draft edit. After it - the path the
 * one-prompt flow leads to - the change is checked against the policy baseline
 * before it becomes visible, and applied to the published space only if it
 * passes. A refused edit leaves what is published exactly as it was.
 *
 * Ambiguity signals are read from what the person changed, not from the whole
 * definition: a model-written description may mention "respectful
 * disagreement", and refusing a title fix over wording nobody touched would
 * make a space uneditable for being well described.
 */
export async function editSpace(
  repo: SpaceRepository,
  gate: SpaceCreationGate,
  spaceId: string,
  userId: string,
  input: {
    title: string;
    purpose: string;
    audience?: string;
    participationMethods: string[];
    cardHints?: SpaceCardHint[];
    roles: SpaceRoleInputRecord[];
    policyVersion: number;
  }
): Promise<{ versionNumber: number }> {
  const space = await loadForEdit(repo, spaceId, userId);
  if (space.status !== 'PUBLISHED') return updateSpaceDefinition(repo, spaceId, userId, input);
  assertNoDuplicateRoleKeys(input.roles);

  // Structural gaps get a specific message rather than a generic REVISE: the
  // person is looking at the form and needs to know which field.
  const primaryCount = input.roles.filter((role) => role.isPrimary).length;
  if (input.purpose.trim().length < MIN_PUBLISHED_PURPOSE_LENGTH) {
    // Persian digits, like every other number the interface shows.
    throw new SpaceEditRefusedError('REVISE', 'معرفی بستر باید دست‌کم ۲۰ نویسه باشد.', []);
  }
  if (input.participationMethods.length < 1) {
    throw new SpaceEditRefusedError('REVISE', 'دست‌کم یک روش مشارکت لازم است.', []);
  }
  if (primaryCount !== 2) {
    throw new SpaceEditRefusedError('REVISE', 'بستر باید دقیقاً دو نقش اصلی داشته باشد.', []);
  }

  const current = space.latestVersion;
  const changed: string[] = [];
  if (input.title !== current.title) changed.push(input.title);
  if (input.purpose !== current.purpose) changed.push(input.purpose);
  if ((input.audience ?? '') !== (current.audience ?? '')) changed.push(input.audience ?? '');
  if (JSON.stringify(input.participationMethods) !== JSON.stringify(current.participationMethods)) {
    changed.push(...input.participationMethods);
  }
  if (rolesText(input.roles) !== rolesText(referencedRoles(space))) changed.push(rolesText(input.roles));
  if (hintsText(input.cardHints) !== hintsText(current.cardHints)) changed.push(hintsText(input.cardHints));

  const verdict = await gate.check({
    title: input.title,
    purpose: input.purpose,
    participationMethods: input.participationMethods,
    primaryRoleCount: primaryCount,
    publicText: [input.audience ?? '', rolesText(input.roles), hintsText(input.cardHints)].join('\n'),
    ambiguityText: changed.join('\n'),
  });

  if (verdict.verdict === 'BLOCK' || verdict.verdict === 'HUMAN_REVIEW') {
    throw new SpaceEditRefusedError(verdict.verdict, EDIT_REFUSAL_REASONS[verdict.verdict], verdict.matchedPolicyRules);
  }
  if (verdict.verdict !== 'ALLOW') {
    throw new SpaceEditRefusedError(verdict.verdict, verdict.reason, verdict.matchedPolicyRules);
  }

  return repo.publishNewVersion({
    spaceId,
    ...input,
    createdBy: userId,
    gateReason: verdict.reason,
    policyVersionRef: verdict.policyVersionRef,
    matchedPolicyRules: verdict.matchedPolicyRules,
  });
}

/** "publish حداقل title، purpose، یک participation method و دو نقش اصلی متفاوت بخواهد" - re-checked here independently of the gate, which already implies these via REVISE, as defense in depth. */
export async function publishSpace(repo: SpaceRepository, spaceId: string, userId: string): Promise<{ status: SpaceStatus; publishedAt: Date }> {
  const space = await loadForEdit(repo, spaceId, userId);
  if (space.status !== 'DRAFT') {
    throw space.status === 'PUBLISHED' || space.status === 'ARCHIVED' || space.status === 'REMOVED' || space.status === 'TEMPORARILY_SUSPENDED'
      ? new SpaceNotEditableError(space.status)
      : new GateNotAllowedError();
  }
  if (space.latestVersion.gateVerdict !== 'ALLOW') {
    throw new GateNotAllowedError();
  }

  const { publishedAt } = await repo.publish(spaceId);
  return { status: 'PUBLISHED', publishedAt };
}

/** "archive را فقط creator/space-admin مجاز" - the same authorization set as editing, deliberately with no staff/SUPERADMIN override (unlike some other modules) since the plan states this restriction explicitly. */
export async function archiveSpace(repo: SpaceRepository, spaceId: string, userId: string): Promise<{ status: SpaceStatus; archivedAt: Date }> {
  const space = await repo.findById(spaceId);
  if (!space) throw new SpaceNotFoundError();
  await assertIsEditor(repo, space, userId);
  if (space.status === 'ARCHIVED' || space.status === 'REMOVED') {
    throw new SpaceNotEditableError(space.status);
  }

  const { archivedAt } = await repo.archive(spaceId);
  return { status: 'ARCHIVED', archivedAt };
}

export interface SpaceView {
  id: string;
  slug: string;
  status: SpaceStatus;
  creatorId: string;
  publishedAt: Date | null;
  archivedAt: Date | null;
  definition: {
    versionNumber: number;
    title: string;
    purpose: string;
    audience: string | null;
    participationMethods: string[];
    cardHints: SpaceCardHint[] | null;
    policyVersion: number;
    roles: SpaceRoleRecord[];
  };
  /**
   * Always present, regardless of publish status - "is this caller the
   * creator or a space admin" (see this field's own contract-level
   * comment in packages/contracts/src/space.ts for the real bug this
   * fixed: relying on `gate`'s mere presence as an ownership signal, as
   * this module originally did, silently breaks once PUBLISHED).
   */
  canManage: boolean;
  /** The space page's "N مشارکت‌کننده", and whether the caller has joined - the two things its toolbar and its join button need. */
  followerCount: number;
  isFollowing: boolean;
  /** Only present for the owner/admin view of a *non-published* space - never on the public view (internal pre-publish moderation state, meaningless once actually published). */
  gate?: { verdict: SpaceGateVerdict | null; reason: string | null };
}

function referencedRoles(space: SpaceRecord): SpaceRoleRecord[] {
  const referencedIds = new Set([...space.latestVersion.primaryRoleIds, ...space.latestVersion.supplementaryRoleIds]);
  return space.roles.filter((role) => referencedIds.has(role.id));
}

function toView(space: SpaceRecord, canManage: boolean, follow: { followerCount: number; isFollowing: boolean }): SpaceView {
  const view: SpaceView = {
    id: space.id,
    slug: space.slug,
    status: space.status,
    creatorId: space.creatorId,
    publishedAt: space.publishedAt,
    archivedAt: space.archivedAt,
    definition: {
      versionNumber: space.latestVersion.versionNumber,
      title: space.latestVersion.title,
      purpose: space.latestVersion.purpose,
      audience: space.latestVersion.audience,
      participationMethods: space.latestVersion.participationMethods,
      cardHints: space.latestVersion.cardHints,
      policyVersion: space.latestVersion.policyVersion,
      roles: referencedRoles(space),
    },
    canManage,
    followerCount: follow.followerCount,
    isFollowing: follow.isFollowing,
  };
  if (canManage && space.status !== 'PUBLISHED') {
    view.gate = { verdict: space.latestVersion.gateVerdict, reason: space.latestVersion.gateReason };
  }
  return view;
}

/**
 * "دسترسی عمومی فقط PUBLISHED را برگرداند" - a published space is visible
 * to anyone; anything else 404s for everyone except its creator/space admin
 * (never revealing to an unauthorized caller that a non-public space with
 * this id/slug exists at all, matching Task 08's public-profile precedent).
 */
export async function getSpace(repo: SpaceRepository, idOrSlug: string, callerUserId: string | null): Promise<SpaceView> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const space = isUuid ? await repo.findById(idOrSlug) : await repo.findBySlug(idOrSlug);
  if (!space) throw new SpaceNotFoundError();

  const canManage = Boolean(
    callerUserId && (space.creatorId === callerUserId || (await repo.hasSpaceAdminRole(callerUserId, space.id)))
  );

  if (space.status === 'PUBLISHED' || canManage) {
    return toView(space, canManage, await repo.followState(space.id, callerUserId));
  }

  throw new SpaceNotFoundError();
}

/** How many of a person's own spaces one list page carries. Far above anything a person has built, and a bound rather than an unbounded scan. */
export const MY_SPACES_LIMIT = 100;

/**
 * The caller's own spaces, newest first.
 *
 * Exists because the spaces list is the person's list, the way a chat
 * list is: a space built from a prompt that still waits for a person to
 * look at it is theirs, and before this it appeared in no list at all -
 * only whoever still had the link could reach it.
 */
export async function listMySpaces(repo: SpaceRepository, userId: string): Promise<MySpaceRecord[]> {
  return repo.listByCreator(userId, MY_SPACES_LIMIT);
}

export async function joinSpaceRole(repo: SpaceRepository, spaceId: string, roleId: string, userId: string): Promise<void> {
  const role = await repo.findRoleInSpace(spaceId, roleId);
  if (!role) throw new RoleNotFoundError();
  await repo.joinRole(spaceId, userId, roleId);
}

export async function leaveSpaceRole(repo: SpaceRepository, spaceId: string, roleId: string, userId: string): Promise<void> {
  const role = await repo.findRoleInSpace(spaceId, roleId);
  if (!role) throw new RoleNotFoundError();
  await repo.leaveRole(userId, roleId);
}

function randomInviteToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function createSpaceInvite(repo: SpaceRepository, spaceId: string, userId: string): Promise<{ token: string }> {
  const space = await repo.findById(spaceId);
  if (!space) throw new SpaceNotFoundError();
  await assertIsEditor(repo, space, userId);

  const token = randomInviteToken();
  await repo.createInvite(spaceId, userId, token);
  return { token };
}

export async function revokeSpaceInvite(repo: SpaceRepository, spaceId: string, token: string, userId: string): Promise<void> {
  const space = await repo.findById(spaceId);
  if (!space) throw new SpaceNotFoundError();
  await assertIsEditor(repo, space, userId);
  await repo.revokeInvite(spaceId, token);
}

/** "صرفاً shortcut عمومی" - resolving a token only reveals which space it points to; it grants no permission of its own, and never bypasses `getSpace`'s own visibility rules for whatever the caller does next. */
export async function resolveSpaceInvite(repo: SpaceRepository, token: string): Promise<{ spaceId: string; slug: string }> {
  const result = await repo.resolveInvite(token);
  if (!result) throw new InviteNotFoundError();
  return result;
}
