import { describe, expect, it, vi } from 'vitest';
import { AI_ERROR_CODES, type AiCapability, type AiInputSource } from '@taavon/contracts';
import { assertAllowed, PolicyViolationError, SOURCE_ALLOWLIST, type ConversationKindLookup } from './policy-guard';

const DIRECT_CONVO = '11111111-1111-4111-8111-111111111111';
const ASSISTANT_CONVO = '22222222-2222-4222-8222-222222222222';
const SPACE = '33333333-3333-4333-8333-333333333333';

function lookup(kinds: Record<string, 'DIRECT' | 'SYSTEM_ASSISTANT'> = {}): ConversationKindLookup {
  return { kindOf: async (id) => kinds[id] ?? null };
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    return err instanceof PolicyViolationError ? err.code : 'UNEXPECTED';
  }
}

describe('private correspondence never reaches a model', () => {
  const directLookup = lookup({ [DIRECT_CONVO]: 'DIRECT', [ASSISTANT_CONVO]: 'SYSTEM_ASSISTANT' });

  it('refuses a direct conversation with its own distinct code', async () => {
    const code = await codeOf(
      assertAllowed(
        {
          capability: 'ASSISTANT_REPLY',
          source: 'ASSISTANT_CONVERSATION',
          provenance: { kind: 'ASSISTANT_THREAD', conversationId: DIRECT_CONVO },
        },
        directLookup
      )
    );

    // Its own code, deliberately: this must never be mistaken for an ordinary
    // validation failure in a log or an alert.
    expect(code).toBe(AI_ERROR_CODES.privateInputForbidden);
  });

  it('checks the database rather than believing the caller\'s label', async () => {
    const kindOf = vi.fn(async () => 'DIRECT' as const);

    await expect(
      assertAllowed(
        {
          capability: 'ASSISTANT_REPLY',
          source: 'ASSISTANT_CONVERSATION',
          provenance: { kind: 'ASSISTANT_THREAD', conversationId: DIRECT_CONVO },
        },
        { kindOf }
      )
    ).rejects.toBeInstanceOf(PolicyViolationError);

    // The label said "assistant conversation"; only the lookup knew better.
    expect(kindOf).toHaveBeenCalledWith(DIRECT_CONVO);
  });

  it('allows a genuine assistant thread', async () => {
    await expect(
      assertAllowed(
        {
          capability: 'ASSISTANT_REPLY',
          source: 'ASSISTANT_CONVERSATION',
          provenance: { kind: 'ASSISTANT_THREAD', conversationId: ASSISTANT_CONVO },
        },
        directLookup
      )
    ).resolves.toBeUndefined();
  });

  it('refuses a conversation that does not exist, rather than assuming it is harmless', async () => {
    const code = await codeOf(
      assertAllowed(
        {
          capability: 'ASSISTANT_REPLY',
          source: 'ASSISTANT_CONVERSATION',
          provenance: { kind: 'ASSISTANT_THREAD', conversationId: '44444444-4444-4444-8444-444444444444' },
        },
        directLookup
      )
    );
    expect(code).toBe(AI_ERROR_CODES.provenanceMismatch);
  });

  // The content capabilities are the ones the plan names explicitly: a
  // message from a direct conversation must not reach them by any route.
  it.each(['CARD_DRAFT', 'SPACE_GUIDANCE', 'MODERATION_ASSIST'] as AiCapability[])(
    'gives %s no route to a conversation at all',
    async (capability) => {
      const code = await codeOf(
        assertAllowed(
          {
            capability,
            source: 'ASSISTANT_CONVERSATION',
            provenance: { kind: 'ASSISTANT_THREAD', conversationId: ASSISTANT_CONVO },
          },
          directLookup
        )
      );
      // Refused before the conversation is even looked at - these capabilities
      // may not read that source, assistant or not.
      expect(code).toBe(AI_ERROR_CODES.sourceNotAllowed);
    }
  );
});

describe('the source allowlist', () => {
  it('refuses a source a capability was not granted', async () => {
    const code = await codeOf(
      assertAllowed(
        {
          capability: 'CARD_DRAFT',
          source: 'MODERATION_GRANTED_CONTEXT',
          provenance: { kind: 'MODERATION_GRANT', grantId: SPACE },
        },
        lookup()
      )
    );
    expect(code).toBe(AI_ERROR_CODES.sourceNotAllowed);
  });

  it('keeps moderation context to the moderation capability alone', () => {
    const readers = (Object.keys(SOURCE_ALLOWLIST) as AiCapability[]).filter((c) =>
      SOURCE_ALLOWLIST[c].includes('MODERATION_GRANTED_CONTEXT')
    );
    expect(readers).toEqual(['MODERATION_ASSIST']);
  });

  it('gives the moderation capability nothing but its own granted context', () => {
    expect(SOURCE_ALLOWLIST.MODERATION_ASSIST).toEqual(['MODERATION_GRANTED_CONTEXT']);
  });

  it('grants every capability something, so none is silently useless', () => {
    for (const capability of Object.keys(SOURCE_ALLOWLIST) as AiCapability[]) {
      expect(SOURCE_ALLOWLIST[capability].length, capability).toBeGreaterThan(0);
    }
  });
});

describe('provenance has to back the claim', () => {
  // Each pairs a capability with a source it *is* allowed, so the refusal can
  // only be the provenance check - the allowlist check runs first, and a
  // capability/source mismatch would mask what this is testing.
  it.each([
    ['ASSISTANT_REPLY', 'PUBLIC_USER_INPUT', { kind: 'SPACE' as const, spaceId: SPACE }],
    ['CARD_DRAFT', 'PUBLIC_SPACE_DATA', { kind: 'USER_TYPED' as const }],
    ['ASSISTANT_REPLY', 'ASSISTANT_CONVERSATION', { kind: 'USER_TYPED' as const }],
  ])('refuses %s reading %s backed by the wrong kind of provenance', async (capability, source, provenance) => {
    const code = await codeOf(
      assertAllowed(
        { capability: capability as AiCapability, source: source as AiInputSource, provenance },
        lookup()
      )
    );
    expect(code).toBe(AI_ERROR_CODES.provenanceMismatch);
  });

  it('accepts a space or a card as public space data', async () => {
    for (const provenance of [
      { kind: 'SPACE' as const, spaceId: SPACE },
      { kind: 'CARD' as const, cardId: SPACE },
    ]) {
      await expect(
        assertAllowed({ capability: 'CARD_DRAFT', source: 'PUBLIC_SPACE_DATA', provenance }, lookup())
      ).resolves.toBeUndefined();
    }
  });

  it('accepts what a person typed themselves', async () => {
    await expect(
      assertAllowed(
        { capability: 'CARD_DRAFT', source: 'PUBLIC_USER_INPUT', provenance: { kind: 'USER_TYPED' } },
        lookup()
      )
    ).resolves.toBeUndefined();
  });
});
