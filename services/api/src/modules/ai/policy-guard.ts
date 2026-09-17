import { AI_ERROR_CODES, type AiCapability, type AiInputSource, type AiProvenance } from '@taavon/contracts';

export class PolicyViolationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'PolicyViolationError';
  }
}

/**
 * Which sources each capability may read. An allowlist, not a blocklist:
 * adding a capability without deciding what it may see gives it nothing,
 * which is the failure direction that costs nothing to recover from.
 *
 * `MODERATION_ASSIST` is the only capability that can read granted context,
 * and it can read nothing else - a moderator's case is not a place to mix in
 * public chatter.
 */
export const SOURCE_ALLOWLIST: Record<AiCapability, readonly AiInputSource[]> = {
  SPACE_GUIDANCE: ['PUBLIC_USER_INPUT', 'PUBLIC_SPACE_DATA'],
  CARD_DRAFT: ['PUBLIC_USER_INPUT', 'PUBLIC_SPACE_DATA'],
  ASSISTANT_REPLY: ['PUBLIC_USER_INPUT', 'ASSISTANT_CONVERSATION'],
  MODERATION_ASSIST: ['MODERATION_GRANTED_CONTEXT'],
  // What the person typed into the one prompt box, and nothing else - no
  // space data, no conversation, nothing they did not write for this purpose.
  SPACE_BUILD: ['PUBLIC_USER_INPUT'],
};

/**
 * Which provenance kinds can honestly back each claimed source. A caller
 * naming `ASSISTANT_CONVERSATION` must point at a conversation; naming
 * `PUBLIC_SPACE_DATA` must point at a space or a card. A label on its own
 * proves nothing.
 */
const PROVENANCE_FOR_SOURCE: Record<AiInputSource, readonly AiProvenance['kind'][]> = {
  PUBLIC_USER_INPUT: ['USER_TYPED'],
  PUBLIC_SPACE_DATA: ['SPACE', 'CARD'],
  ASSISTANT_CONVERSATION: ['ASSISTANT_THREAD'],
  MODERATION_GRANTED_CONTEXT: ['MODERATION_GRANT'],
};

/**
 * The one thing the guard cannot decide on its own: whether a conversation is
 * actually the assistant's, or two people talking.
 *
 * This is the crux of the whole task. A caller can claim
 * `ASSISTANT_CONVERSATION` about any conversation id; only the database knows
 * whether that id is a `SYSTEM_ASSISTANT` thread or a `DIRECT` one, and the
 * answer decides whether private correspondence is about to be fed to a
 * model. So it is looked up, every time, and never inferred from the label.
 */
export interface ConversationKindLookup {
  /** Null when no such conversation exists. */
  kindOf(conversationId: string): Promise<'DIRECT' | 'SYSTEM_ASSISTANT' | null>;
}

export interface GuardInput {
  capability: AiCapability;
  source: AiInputSource;
  provenance: AiProvenance;
}

/**
 * Decides whether this input may reach a model at all.
 *
 * Three checks, in an order chosen so the most consequential refusal is never
 * masked by a lesser one:
 *
 * 1. The claimed source must be allowed for the capability.
 * 2. The provenance must be capable of backing that source.
 * 3. If the provenance names a conversation, the database must agree it is
 *    the assistant's - and a DIRECT conversation is refused with
 *    `AI_PRIVATE_INPUT_FORBIDDEN`, which is its own code precisely so it can
 *    never be confused with an ordinary validation failure in a log or an
 *    alert.
 *
 * Nothing here is advisory. `assertAllowed` throws, and the orchestrator has
 * no path to a provider that does not go through it.
 */
export async function assertAllowed(input: GuardInput, lookup: ConversationKindLookup): Promise<void> {
  const allowedSources = SOURCE_ALLOWLIST[input.capability];
  if (!allowedSources.includes(input.source)) {
    throw new PolicyViolationError(
      AI_ERROR_CODES.sourceNotAllowed,
      `Capability ${input.capability} may not read ${input.source}.`
    );
  }

  const allowedProvenance = PROVENANCE_FOR_SOURCE[input.source];
  if (!allowedProvenance.includes(input.provenance.kind)) {
    throw new PolicyViolationError(
      AI_ERROR_CODES.provenanceMismatch,
      `Source ${input.source} cannot be backed by ${input.provenance.kind} provenance.`
    );
  }

  if (input.provenance.kind === 'ASSISTANT_THREAD') {
    const kind = await lookup.kindOf(input.provenance.conversationId);

    if (kind === 'DIRECT') {
      // Private correspondence between two people. This is the refusal the
      // whole milestone exists to guarantee.
      throw new PolicyViolationError(
        AI_ERROR_CODES.privateInputForbidden,
        'A direct conversation may never be used as model input.'
      );
    }
    if (kind !== 'SYSTEM_ASSISTANT') {
      // Missing, or some kind added later that nobody has decided about.
      // Unknown is refused rather than allowed.
      throw new PolicyViolationError(
        AI_ERROR_CODES.provenanceMismatch,
        'That conversation is not an assistant thread.'
      );
    }
  }
}
