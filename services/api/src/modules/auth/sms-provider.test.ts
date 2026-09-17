import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSmsProvider, DevSmsSinkProvider, HttpSmsProvider, SmsDeliveryError, SmsProviderNotConfiguredError } from './sms-provider';

describe('DevSmsSinkProvider', () => {
  it('records every sendOtp call for tests to inspect', async () => {
    const provider = new DevSmsSinkProvider();
    await provider.sendOtp('+15550001111', '123456');
    await provider.sendOtp('+15550002222', '654321');

    expect(provider.sent).toHaveLength(2);
    expect(provider.sent[0]).toMatchObject({ phoneE164: '+15550001111', code: '123456' });
  });

  it('lastCodeFor returns the most recent code sent to a given number', async () => {
    const provider = new DevSmsSinkProvider();
    await provider.sendOtp('+15550001111', '111111');
    await provider.sendOtp('+15550001111', '222222');

    expect(provider.lastCodeFor('+15550001111')).toBe('222222');
    expect(provider.lastCodeFor('+15559999999')).toBeUndefined();
  });
});

describe('HttpSmsProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs the phone and code to the configured webhook with the API key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new HttpSmsProvider('https://sms.example/send', 'test-api-key');
    await provider.sendOtp('+989121234567', '482913');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sms.example/send');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer test-api-key');
    expect(JSON.parse(init.body as string)).toEqual({ phoneE164: '+989121234567', code: '482913' });
  });

  it('throws SmsDeliveryError when the webhook responds with a non-2xx status', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 })) as unknown as typeof fetch;

    const provider = new HttpSmsProvider('https://sms.example/send', 'test-api-key');
    await expect(provider.sendOtp('+989121234567', '482913')).rejects.toThrow(SmsDeliveryError);
  });
});

describe('createSmsProvider', () => {
  beforeEach(() => {
    vi.stubEnv('SMS_PROVIDER_WEBHOOK_URL', '');
    vi.stubEnv('SMS_PROVIDER_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a DevSmsSinkProvider outside production, even with no config', () => {
    const provider = createSmsProvider({ NODE_ENV: 'development' });
    expect(provider).toBeInstanceOf(DevSmsSinkProvider);
  });

  it('returns a DevSmsSinkProvider in test, even with no config', () => {
    const provider = createSmsProvider({ NODE_ENV: 'test' });
    expect(provider).toBeInstanceOf(DevSmsSinkProvider);
  });

  it('throws SmsProviderNotConfiguredError in production with no config - production must not start without a valid provider', () => {
    expect(() => createSmsProvider({ NODE_ENV: 'production' })).toThrow(SmsProviderNotConfiguredError);
  });

  it('still throws in production when the test-login flag is explicitly off', () => {
    expect(() => createSmsProvider({ NODE_ENV: 'production', ALLOW_TEST_LOGIN_WITHOUT_SMS: false })).toThrow(
      SmsProviderNotConfiguredError
    );
  });

  it('hands out the sink in production only when asked for by name', () => {
    const provider = createSmsProvider({ NODE_ENV: 'production', ALLOW_TEST_LOGIN_WITHOUT_SMS: true });
    expect(provider).toBeInstanceOf(DevSmsSinkProvider);
  });

  it('prefers a real gateway over the flag, so leaving it on cannot keep the hole open', () => {
    const provider = createSmsProvider({
      NODE_ENV: 'production',
      ALLOW_TEST_LOGIN_WITHOUT_SMS: true,
      SMS_PROVIDER_WEBHOOK_URL: 'https://sms.example.com/send',
      SMS_PROVIDER_API_KEY: 'real-key',
    });
    expect(provider).toBeInstanceOf(HttpSmsProvider);
  });

  it('throws in production when only the webhook URL is set', () => {
    expect(() =>
      createSmsProvider({ NODE_ENV: 'production', SMS_PROVIDER_WEBHOOK_URL: 'https://sms.example/send' })
    ).toThrow(SmsProviderNotConfiguredError);
  });

  it('returns a real HttpSmsProvider in production when fully configured', () => {
    const provider = createSmsProvider({
      NODE_ENV: 'production',
      SMS_PROVIDER_WEBHOOK_URL: 'https://sms.example/send',
      SMS_PROVIDER_API_KEY: 'real-key',
    });
    expect(provider).toBeInstanceOf(HttpSmsProvider);
  });
});
