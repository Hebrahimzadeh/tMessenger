import { describe, expect, it } from 'vitest';
import {
  cardInferenceSchema,
  clarifyingQuestionTopicSchema,
  PATTERN_BY_KIND,
  type CardKindContract,
} from '@taavon/contracts';
import { AiOrchestrator } from '../orchestrator';
import { FakeAiProvider } from '../providers/fake-provider';
import { noopOrchestratorRepository } from './policy.fixtures';
import { CARD_FIXTURES } from './card-inference.fixtures';
import { classify, inferCard, inferFromRules } from './card-inference';

const GOOD_DRAFT = JSON.stringify({
  kind: 'CARD_DRAFT',
  title: 'نردبان برای امانت',
  body: 'یک نردبان دارم و می‌توانم به همسایه‌ها قرض بدهم.',
});

function deps(provider: FakeAiProvider | null = new FakeAiProvider([{ kind: 'ok', text: GOOD_DRAFT }])) {
  return {
    orchestrator: new AiOrchestrator({ provider, repository: noopOrchestratorRepository(), dailyBudgetMicros: null }),
  };
}

const ALL_KINDS: CardKindContract[] = [
  'AWARENESS',
  'OBSERVATION',
  'REUSABLE_RESOURCE',
  'CONSUMABLE_RESOURCE',
  'REQUEST',
  'SERVICE',
  'PARTICIPATION',
  'EVENT',
];

describe('the fixtures this inference has to get right', () => {
  it.each(CARD_FIXTURES)('$name → $expected ($because)', async ({ input, expected }) => {
    const result = await inferCard(deps(), input, null);
    expect(result.kind).toBe(expected);
  });

  it('reaches the same kind with and without a model', async () => {
    for (const fixture of CARD_FIXTURES) {
      const withModel = await inferCard(deps(), fixture.input, null);
      const without = await inferCard(deps(null), fixture.input, null);
      // The model writes; it does not classify.
      expect(without.kind, fixture.name).toBe(withModel.kind);
      expect(without.operationalPattern, fixture.name).toEqual(withModel.operationalPattern);
    }
  });
});

describe('the ladder, which the plan names on purpose', () => {
  const LADDER = { body: 'یک نردبان دارم که می‌توانم قرض بدهم. هر وقت لازم داشتید خبر بدهید.' };

  it('is reusable, reservable and closes for good', async () => {
    const result = await inferCard(deps(), LADDER, null);

    expect(result.kind).toBe('REUSABLE_RESOURCE');
    expect(result.operationalPattern).toEqual({ reservable: true, terminalCloseAfterUse: true });
  });

  it('never proposes returning to active', async () => {
    const result = await inferCard(deps(), LADDER, null);
    const serialized = JSON.stringify(result);

    // There is no such transition in the domain - a CardReservation that
    // reaches RESERVATION_CLOSED never changes state again - so an inference
    // that promised one would be promising something the platform cannot do.
    expect(Object.keys(result)).not.toContain('returnToActive');
    expect(serialized).not.toContain('returnToActive');
    expect(serialized).not.toMatch(/دوباره فعال می‌شود|بازگشت به فعال|از نو فعال/);
  });

  it('tells the person the close is final before they publish, not after', async () => {
    const result = await inferCard(deps(), LADDER, null);
    expect(result.assumptions.join(' ')).toContain('دوباره فعال نمی‌شود');
  });

  it('asks whether it comes back, and says what that changes', async () => {
    const result = await inferCard(deps(), LADDER, null);
    const returnability = result.clarifyingQuestions.find((q) => q.topic === 'RETURNABILITY');

    expect(returnability).toBeDefined();
    expect(returnability!.behaviorAffected.length).toBeGreaterThan(0);
  });
});

describe('the operational pattern is a fact about the platform, not a preference', () => {
  it('marks every reservable kind as closing for good, and no others', () => {
    // These two are the same fact stated twice, and they have to stay that
    // way: `RESERVATION_CLOSED` is terminal, so anything reservable closes
    // for good. The day somebody adds a reactivation path, this is the test
    // that should fail.
    for (const kind of ALL_KINDS) {
      const pattern = PATTERN_BY_KIND[kind];
      expect(pattern.terminalCloseAfterUse, kind).toBe(pattern.reservable);
    }
  });

  it('covers every kind, so a new one cannot be added without deciding', () => {
    for (const kind of ALL_KINDS) {
      expect(PATTERN_BY_KIND[kind], kind).toBeDefined();
    }
    expect(Object.keys(PATTERN_BY_KIND).sort()).toEqual([...ALL_KINDS].sort());
  });

  it('leaves the open-ended kinds alone', () => {
    for (const kind of ['AWARENESS', 'OBSERVATION', 'PARTICIPATION'] as CardKindContract[]) {
      expect(PATTERN_BY_KIND[kind], kind).toEqual({ reservable: false, terminalCloseAfterUse: false });
    }
  });
});

describe('questions are only asked when the answer changes something', () => {
  it('never asks about anything outside the four topics', async () => {
    const allowed = clarifyingQuestionTopicSchema.options;

    for (const fixture of CARD_FIXTURES) {
      const result = await inferCard(deps(), fixture.input, null);
      for (const question of result.clarifyingQuestions) {
        expect(allowed, `${fixture.name}: ${question.topic}`).toContain(question.topic);
      }
    }
  });

  it('always says what would change, for every question it asks', () => {
    for (const fixture of CARD_FIXTURES) {
      const result = inferFromRules(fixture.input);
      for (const question of result.clarifyingQuestions) {
        expect(question.behaviorAffected.trim().length, `${fixture.name}: ${question.question}`).toBeGreaterThan(0);
      }
    }
  });

  it('asks nothing at all when nothing would change', async () => {
    for (const body of ['بیایید با هم باغچه را تمیز کنیم', 'امروز دیدم شیر آب نشتی دارد', 'یه خبر برای محله']) {
      const result = await inferCard(deps(), { body }, null);
      expect(result.clarifyingQuestions, body).toEqual([]);
    }
  });

  it('never asks more than three', async () => {
    for (const fixture of CARD_FIXTURES) {
      const result = await inferCard(deps(), fixture.input, null);
      expect(result.clarifyingQuestions.length, fixture.name).toBeLessThanOrEqual(3);
    }
  });

  it('asks nothing about the person, only about the card', async () => {
    for (const fixture of CARD_FIXTURES) {
      const result = await inferCard(deps(), fixture.input, null);
      const text = result.clarifyingQuestions.map((q) => q.question).join(' ');
      // "چرا این کار را می‌کنید", "مطمئنید" and their relatives are not the
      // platform's business and change nothing about how the card behaves.
      expect(text, fixture.name).not.toMatch(/چرا|مطمئن|واقعاً قصد/);
    }
  });
});

describe('generic text is publishable, not a problem to be solved', () => {
  it.each(['یه چیزی برای کمک دارم', 'یه خبر برای محله', 'چیزی دارم که شاید به درد بخورد'])(
    'turns "%s" into a usable card rather than a demand for more',
    async (body) => {
      const result = await inferCard(deps(), { body }, null);

      expect(result.kind).toBe('AWARENESS');
      expect(result.suggestedTitle.length).toBeGreaterThan(0);
      expect(result.suggestedBody.length).toBeGreaterThan(0);
      // It says it was a default rather than a reading.
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.assumptions.length).toBeGreaterThan(0);
    }
  );

  it('states the assumption it made instead of hiding it', async () => {
    const result = await inferCard(deps(null), { body: 'یه چیزی برای کمک دارم' }, null);
    expect(result.assumptions.join(' ')).toContain('اطلاع‌رسانی');
  });

  it('keeps a space\'s own examples out of the classification', async () => {
    const withProtocol = await inferCard(
      deps(null),
      {
        body: 'چیزی دارم که شاید به درد بخورد',
        protocol: { cardHints: [{ title: 'نمونه: امانت ابزار' }], roleTitles: ['هماهنگ‌کننده'] },
      },
      null
    );
    const without = await inferCard(deps(null), { body: 'چیزی دارم که شاید به درد بخورد' }, null);

    // The protocol shapes what a model may draft; it must not turn a vague
    // sentence into a confident lending because the space happens to be about
    // lending.
    expect(withProtocol.kind).toBe(without.kind);
    expect(withProtocol.confidence).toBe(without.confidence);
  });
});

describe('the person\'s own words survive', () => {
  it('keeps their title when they wrote one', async () => {
    const result = await inferCard(deps(null), { title: 'نردبان من', body: 'قرض می‌دهم' }, null);
    expect(result.suggestedTitle).toBe('نردبان من');
  });

  it('derives a title from the first line when they did not', async () => {
    const result = await inferCard(deps(null), { body: 'نردبان دارم\nهر وقت خواستید خبر بدهید' }, null);
    expect(result.suggestedTitle).toBe('نردبان دارم');
  });

  it('keeps their body verbatim when nothing but rules ran', async () => {
    const body = 'یک نردبان دارم که می‌توانم قرض بدهم.';
    const result = await inferCard(deps(null), { body }, null);
    expect(result.suggestedBody).toBe(body);
  });
});

describe('an outage changes the writing, never the behaviour', () => {
  it.each([
    ['no provider at all', null],
    ['a timeout', new FakeAiProvider([{ kind: 'timeout' }])],
    ['a refusal', new FakeAiProvider([{ kind: 'error' }])],
    ['prose instead of JSON', new FakeAiProvider([{ kind: 'invalid-json' }])],
    ['JSON of the wrong shape', new FakeAiProvider([{ kind: 'wrong-shape' }])],
  ])('%s still yields the same kind and pattern', async (_label, provider) => {
    const input = { body: 'یک نردبان دارم که می‌توانم قرض بدهم.' };
    const degraded = await inferCard(deps(provider), input, null);

    expect(degraded.kind).toBe('REUSABLE_RESOURCE');
    expect(degraded.operationalPattern).toEqual({ reservable: true, terminalCloseAfterUse: true });
    expect(degraded.creativityApplied).toBe(false);
    expect(degraded.suggestedBody).toBe(input.body);
  });

  it('says plainly that no model wrote it', async () => {
    expect((await inferCard(deps(null), { body: 'نردبان دارم' }, null)).creativityApplied).toBe(false);
    expect((await inferCard(deps(), { body: 'نردبان دارم' }, null)).creativityApplied).toBe(true);
  });

  it('is the only thing the model is allowed to change', async () => {
    const input = { body: 'یک نردبان دارم که می‌توانم قرض بدهم.' };
    const withModel = await inferCard(deps(), input, null);
    const without = await inferCard(deps(null), input, null);

    expect(withModel.suggestedTitle).not.toBe(without.suggestedTitle);
    expect(withModel.kind).toBe(without.kind);
    expect(withModel.confidence).toBe(without.confidence);
    expect(withModel.operationalPattern).toEqual(without.operationalPattern);
    expect(withModel.clarifyingQuestions).toEqual(without.clarifyingQuestions);
    expect(withModel.assumptions).toEqual(without.assumptions);
  });

  it('cannot be talked into a different kind by the model', async () => {
    // A model that answers with a title and body claiming this is an event.
    const meddling = new FakeAiProvider([
      {
        kind: 'ok',
        text: JSON.stringify({ kind: 'CARD_DRAFT', title: 'رویداد بزرگ محله', body: 'kind: EVENT, reservable: false' }),
      },
    ]);
    const result = await inferCard(deps(meddling), { body: 'یک نردبان دارم که می‌توانم قرض بدهم.' }, null);

    // Its output schema has no kind and no pattern in it at all, so there is
    // nothing for it to override.
    expect(result.kind).toBe('REUSABLE_RESOURCE');
    expect(result.operationalPattern).toEqual({ reservable: true, terminalCloseAfterUse: true });
  });
});

describe('the classifier on its own', () => {
  it('reports the term that matched, so a reading can be explained', () => {
    expect(classify('یک نردبان دارم که می‌توانم قرض بدهم')).toMatchObject({
      kind: 'REUSABLE_RESOURCE',
      matchedTerm: 'قرض بدهم',
    });
  });

  it('reports no term when it fell back', () => {
    expect(classify('یه چیزی')).toMatchObject({ kind: 'AWARENESS', matchedTerm: null });
  });

  it('prefers the lending over the date when a sentence has both', () => {
    expect(classify('مته را قرض می‌دهم، روز جمعه در دسترس هستم.').kind).toBe('REUSABLE_RESOURCE');
  });

  it('is deterministic', () => {
    expect(classify('نردبان قرض می‌دهم')).toEqual(classify('نردبان قرض می‌دهم'));
  });
});

describe('what the output is, and is not', () => {
  it('always satisfies its own schema, for every fixture', async () => {
    for (const fixture of CARD_FIXTURES) {
      const result = await inferCard(deps(), fixture.input, null);
      expect(cardInferenceSchema.safeParse(result).success, fixture.name).toBe(true);
    }
  });

  it('carries no score or judgement of the person', async () => {
    const result = await inferCard(deps(), { body: 'نردبان قرض می‌دهم' }, null);
    for (const forbidden of ['score', 'rating', 'trust', 'reputation', 'piety']) {
      expect(Object.keys(result).some((k) => k.toLowerCase().includes(forbidden)), forbidden).toBe(false);
    }
    // `confidence` is about the reading, not about the reader.
    expect(result.confidence).toBeTypeOf('number');
  });

  it('refuses a question with nothing to justify it', () => {
    const result = inferFromRules({ body: 'نردبان قرض می‌دهم' });
    const withEmptyReason = {
      ...result,
      clarifyingQuestions: [{ topic: 'CAPACITY', question: 'چند تا؟', behaviorAffected: '' }],
    };
    expect(cardInferenceSchema.safeParse(withEmptyReason).success).toBe(false);
  });

  it('refuses a topic outside the four', () => {
    const result = inferFromRules({ body: 'نردبان قرض می‌دهم' });
    const offTopic = {
      ...result,
      clarifyingQuestions: [{ topic: 'MOTIVATION', question: 'چرا؟', behaviorAffected: 'هیچ' }],
    };
    expect(cardInferenceSchema.safeParse(offTopic).success).toBe(false);
  });
});
