import { ProviderTimeoutError, ProviderUnavailableError, type AiProvider, type ProviderInput, type ProviderResult } from './ai-provider';

export type FakeBehaviour =
  | { kind: 'ok'; text: string }
  | { kind: 'invalid-json' }
  | { kind: 'wrong-shape' }
  | { kind: 'timeout' }
  | { kind: 'error' };

/**
 * A provider that does exactly what a test tells it to, including all the
 * ways a real one misbehaves.
 *
 * Every failure mode the orchestrator claims to handle is reachable from
 * here without a network: a timeout, a refusal, prose where JSON was asked
 * for, and valid JSON of the wrong shape - which is the interesting one,
 * because it is what a model actually does most often and the case a
 * try/catch around `JSON.parse` silently lets through.
 */
export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';
  readonly calls: ProviderInput[] = [];

  constructor(private behaviours: FakeBehaviour[] = [{ kind: 'ok', text: '{}' }]) {}

  /** Queues what the next call (and each one after) should do. */
  setBehaviours(behaviours: FakeBehaviour[]): void {
    this.behaviours = behaviours;
  }

  async generate(input: ProviderInput): Promise<ProviderResult> {
    this.calls.push(input);
    // The last behaviour repeats, so a test can say "always fail" with one entry.
    const behaviour = this.behaviours[Math.min(this.calls.length - 1, this.behaviours.length - 1)] ?? {
      kind: 'ok' as const,
      text: '{}',
    };

    if (behaviour.kind === 'timeout') throw new ProviderTimeoutError();
    if (behaviour.kind === 'error') throw new ProviderUnavailableError();

    const text =
      behaviour.kind === 'invalid-json'
        ? 'I think a good title would be... actually let me reconsider.'
        : behaviour.kind === 'wrong-shape'
          ? JSON.stringify({ kind: 'CARD_DRAFT', title: '', somethingElse: true })
          : behaviour.text;

    return { text, model: 'fake-1', inputTokens: 10, outputTokens: 20, costMicros: 1 };
  }
}
