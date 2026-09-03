export interface SmsProvider {
  sendOtp(phoneE164: string, code: string): Promise<void>;
}

export class SmsDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmsDeliveryError';
  }
}

export class SmsProviderNotConfiguredError extends Error {
  constructor() {
    super('No SMS provider is configured - set SMS_PROVIDER_WEBHOOK_URL and SMS_PROVIDER_API_KEY.');
    this.name = 'SmsProviderNotConfiguredError';
  }
}

/**
 * Test/dev-only sink: never sends a real SMS, just records every call so
 * tests (and a developer logging in locally without a real gateway) can
 * read the code back out. createSmsProvider() below refuses to hand this
 * out in production - see SmsProviderNotConfiguredError.
 */
export class DevSmsSinkProvider implements SmsProvider {
  readonly sent: Array<{ phoneE164: string; code: string; sentAt: Date }> = [];

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    this.sent.push({ phoneE164, code, sentAt: new Date() });
  }

  lastCodeFor(phoneE164: string): string | undefined {
    for (let i = this.sent.length - 1; i >= 0; i -= 1) {
      if (this.sent[i]?.phoneE164 === phoneE164) return this.sent[i]?.code;
    }
    return undefined;
  }
}

/**
 * Generic HTTP-webhook SMS provider: real production sending, without
 * pinning this codebase to one specific vendor's SDK. Whichever gateway is
 * actually contracted can sit behind this same interface (or later replace
 * it) as a thin adapter that already speaks "POST {phoneE164, code} with a
 * bearer key" - the common shape of most SMS gateway HTTP APIs.
 */
export class HttpSmsProvider implements SmsProvider {
  constructor(
    private readonly webhookUrl: string,
    private readonly apiKey: string
  ) {}

  async sendOtp(phoneE164: string, code: string): Promise<void> {
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ phoneE164, code }),
    });

    if (!response.ok) {
      throw new SmsDeliveryError(`SMS provider responded with ${response.status}`);
    }
  }
}

export interface SmsProviderEnv {
  NODE_ENV: string;
  SMS_PROVIDER_WEBHOOK_URL?: string;
  SMS_PROVIDER_API_KEY?: string;
}

/**
 * Task 06 acceptance: "production بدون provider معتبر start نشود" - production
 * must not start without a valid provider. Called eagerly at server boot
 * (not lazily on first OTP request), so a misconfigured production
 * deployment fails fast instead of silently no-op-ing real users' OTP
 * delivery.
 */
export function createSmsProvider(env: SmsProviderEnv): SmsProvider {
  if (env.NODE_ENV !== 'production') {
    return new DevSmsSinkProvider();
  }

  if (!env.SMS_PROVIDER_WEBHOOK_URL || !env.SMS_PROVIDER_API_KEY) {
    throw new SmsProviderNotConfiguredError();
  }

  return new HttpSmsProvider(env.SMS_PROVIDER_WEBHOOK_URL, env.SMS_PROVIDER_API_KEY);
}
