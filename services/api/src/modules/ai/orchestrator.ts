import { createHash } from 'node:crypto';
import {
  AI_ERROR_CODES,
  aiRequestInputSchema,
  type AiCapability,
  type AiOutput,
  type AiRequestInput,
  type AiResultView,
} from '@taavon/contracts';
import { fallbackFor } from './fallbacks';
import { assertAllowed, PolicyViolationError, type ConversationKindLookup } from './policy-guard';
import { InvalidModelOutputError, parseAndValidate } from './schemas';
import { ProviderTimeoutError, type AiProvider } from './providers/ai-provider';

/** "timeout ده‌ثانیه". */
export const AI_TIMEOUT_MS = 10_000;
/** Requests one person may make per window. */
export const AI_QUOTA_PER_USER = 30;
export const AI_QUOTA_WINDOW_SECONDS = 3600;
/** Consecutive provider failures before the circuit opens. */
export const CIRCUIT_FAILURE_THRESHOLD = 5;
/** How long the circuit stays open before one request is allowed through to test the water. */
export const CIRCUIT_COOLDOWN_MS = 60_000;

export interface AiUsageRecord {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}

export interface OrchestratorRepository {
  /** Records the attempt. Stores the input's hash and length, never its text. */
  createRequest(input: {
    requesterId: string | null;
    capability: AiCapability;
    source: AiRequestInput['source'];
    promptVersionId: string | null;
    inputHash: string;
    inputChars: number;
  }): Promise<{ id: string }>;
  recordResult(input: {
    requestId: string;
    outcome: 'SUGGESTION' | 'FALLBACK' | 'UNAVAILABLE';
    payload: AiOutput | null;
    errorCode: string | null;
    latencyMs: number;
  }): Promise<void>;
  recordUsage(requestId: string, usage: AiUsageRecord): Promise<void>;
  /** How many requests this person has made in the current window. */
  countRecentRequests(requesterId: string, sinceSeconds: number): Promise<number>;
  /** Micros spent across everyone today, for the budget ceiling. */
  spentTodayMicros(): Promise<number>;
  /** The prompt template in force for a capability, or null if none is configured. */
  currentPromptVersion(capability: AiCapability): Promise<{ id: string; template: string } | null>;
  conversationKind: ConversationKindLookup;
}

/**
 * What a server-side capability may add to a request, and a browser never can.
 *
 * Deliberately a separate argument rather than fields on `AiRequestInput`,
 * which is also the public `/ai/suggest` body. Task 23 removed a route that
 * forwarded a browser-supplied system instruction straight to the model - the
 * strongest lever there is over what a model does - and putting these on the
 * public schema would reopen exactly that hole.
 */
export interface GenerateOptions {
  /** A versioned document from this codebase, sent as the model's system instruction. */
  systemInstruction?: string;
  /** Overrides the default for a capability that legitimately needs longer, e.g. designing a whole space. */
  timeoutMs?: number;
  maxOutputTokens?: number;
}

export interface OrchestratorOptions {
  provider: AiProvider | null;
  repository: OrchestratorRepository;
  /** Daily ceiling across everyone, in micros. Null disables the budget. */
  dailyBudgetMicros: number | null;
  timeoutMs?: number;
  now?: () => number;
}

/**
 * Tracks consecutive provider failures so a dead vendor is not dialled once
 * per request. Deliberately in-process and simple: it protects latency, not
 * correctness, and every path it guards already has a fallback.
 */
class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(private readonly now: () => number) {}

  isOpen(): boolean {
    if (this.openedAt === null) return false;
    if (this.now() - this.openedAt >= CIRCUIT_COOLDOWN_MS) {
      // Half-open: let the next request through to find out whether the
      // provider has recovered, rather than staying shut forever.
      this.openedAt = null;
      this.failures = 0;
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= CIRCUIT_FAILURE_THRESHOLD) this.openedAt = this.now();
  }
}

/**
 * Everything between a caller wanting a suggestion and a model producing one.
 *
 * The shape of it is one idea: **the caller always gets an answer, and the
 * answer is always a suggestion**. Never an error they have to handle, never
 * a domain change they did not ask for. A provider that is off, over budget,
 * timing out, or returning nonsense all resolve to a FALLBACK or an
 * UNAVAILABLE that the interface can show, which is what makes "خاموشی
 * provider مسیر کارت دستی را نمی‌بندد" true by construction rather than by
 * remembering to catch things.
 *
 * The one case that is *not* softened is a policy refusal. If the guard says
 * private correspondence was about to be sent to a model, that is not a
 * degraded outcome to fall back from - it is a bug in the caller, and it
 * throws.
 */
export class AiOrchestrator {
  private readonly circuit: CircuitBreaker;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(private readonly opts: OrchestratorOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.timeoutMs = opts.timeoutMs ?? AI_TIMEOUT_MS;
    this.circuit = new CircuitBreaker(this.now);
  }

  async generate(rawInput: AiRequestInput, requesterId: string | null, options: GenerateOptions = {}): Promise<AiResultView> {
    const input = aiRequestInputSchema.parse(rawInput);

    // The guard runs before anything is stored, so a refused request leaves
    // no record of the text's shape either.
    await assertAllowed(
      { capability: input.capability, source: input.source, provenance: input.provenance },
      this.opts.repository.conversationKind
    );

    const promptVersion = await this.opts.repository.currentPromptVersion(input.capability);
    const request = await this.opts.repository.createRequest({
      requesterId,
      capability: input.capability,
      source: input.source,
      promptVersionId: promptVersion?.id ?? null,
      // The hash lets a replay be recognised; the text is not kept.
      inputHash: createHash('sha256').update(input.text).digest('hex'),
      inputChars: input.text.length,
    });

    const startedAt = this.now();
    const settle = async (
      outcome: 'SUGGESTION' | 'FALLBACK' | 'UNAVAILABLE',
      output: AiOutput | null,
      errorCode: string | null
    ): Promise<AiResultView> => {
      await this.opts.repository.recordResult({
        requestId: request.id,
        outcome,
        payload: output,
        errorCode,
        latencyMs: this.now() - startedAt,
      });
      return { requestId: request.id, outcome, output, errorCode };
    };

    const degrade = (code: string) => settle('FALLBACK', fallbackFor(input.capability, input.text), code);

    if (!this.opts.provider) return degrade(AI_ERROR_CODES.disabled);
    if (this.circuit.isOpen()) return degrade(AI_ERROR_CODES.circuitOpen);

    if (requesterId) {
      const recent = await this.opts.repository.countRecentRequests(requesterId, AI_QUOTA_WINDOW_SECONDS);
      // The request just created counts, hence `>`.
      if (recent > AI_QUOTA_PER_USER) return degrade(AI_ERROR_CODES.quotaExceeded);
    }

    if (this.opts.dailyBudgetMicros !== null) {
      const spent = await this.opts.repository.spentTodayMicros();
      if (spent >= this.opts.dailyBudgetMicros) return degrade(AI_ERROR_CODES.budgetExhausted);
    }

    let result;
    try {
      result = await this.opts.provider.generate({
        capability: input.capability,
        // Minimization: the prompt is the template plus this one input, never
        // a conversation history or anything the caller did not pass.
        prompt: renderPrompt(promptVersion?.template ?? null, input.text),
        systemInstruction: options.systemInstruction,
        timeoutMs: options.timeoutMs ?? this.timeoutMs,
        maxOutputTokens: options.maxOutputTokens,
      });
    } catch (err) {
      this.circuit.recordFailure();
      return degrade(err instanceof ProviderTimeoutError ? AI_ERROR_CODES.timeout : AI_ERROR_CODES.providerFailed);
    }

    // Usage is recorded even when the output turns out to be unusable: the
    // call was made and the money was spent, and a budget that only counted
    // successes would undercount exactly when things are going worst.
    await this.opts.repository.recordUsage(request.id, {
      provider: this.opts.provider.name,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costMicros: result.costMicros,
    });

    let output: AiOutput;
    try {
      output = parseAndValidate(input.capability, result.text);
    } catch (err) {
      // Not a provider failure - the vendor answered. Counting it against the
      // circuit would trip on a prompt that needs fixing rather than on an
      // outage.
      if (err instanceof InvalidModelOutputError) return degrade(AI_ERROR_CODES.invalidOutput);
      throw err;
    }

    this.circuit.recordSuccess();
    return settle('SUGGESTION', output, null);
  }
}

export { PolicyViolationError };

/**
 * Builds the prompt from the versioned template and the one input.
 *
 * `{{input}}` is substituted rather than concatenated so a template can put
 * the input where it belongs. With no configured template the input is sent
 * alone, which keeps the system usable before any prompt is seeded.
 */
export function renderPrompt(template: string | null, input: string): string {
  if (!template) return input;
  return template.includes('{{input}}') ? template.replace('{{input}}', input) : `${template}\n\n${input}`;
}
