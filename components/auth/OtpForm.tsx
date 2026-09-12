'use client';

import { useEffect, useState } from 'react';
import { otpRequestResponseSchema, otpVerifyResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { toPersianDigits } from '@/lib/persian-digits';

function formatCountdown(secondsLeft: number): string {
  const minutes = Math.floor(secondsLeft / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (secondsLeft % 60).toString().padStart(2, '0');
  return toPersianDigits(`${minutes}:${seconds}`);
}

export interface OtpFormProps {
  phone: string;
  country: string;
  challengeId: string;
  expiresInSeconds: number;
  termsVersion: number;
  privacyVersion: number;
  onVerified: (userId: string) => void;
  /** Called (never onVerified) when the server reports the accepted terms/privacy version moved - `message` is the ready-to-show Persian text. */
  onLegalVersionChanged: (message: string) => void;
}

interface Challenge {
  challengeId: string;
  termsVersion: number;
  privacyVersion: number;
}

export function OtpForm({
  phone,
  country,
  challengeId,
  expiresInSeconds,
  termsVersion,
  privacyVersion,
  onVerified,
  onLegalVersionChanged,
}: OtpFormProps) {
  const [challenge, setChallenge] = useState<Challenge>({ challengeId, termsVersion, privacyVersion });
  const [secondsLeft, setSecondsLeft] = useState(expiresInSeconds);
  // Deliberately React state only - never localStorage/sessionStorage (Task
  // 07 acceptance: OTP must not be persisted anywhere client-side).
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  // Only ever set on a deployment with no real SMS gateway - see the effect below.
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    // A test deployment runs without a contracted SMS gateway, so the API
    // swaps in a sink that records the code instead of sending it, and
    // exposes this endpoint only while that sink is the configured provider
    // (createSmsProvider never returns it when NODE_ENV is production, and
    // the route is registered only if it did). In production the request
    // 404s, the catch below swallows it, and nothing is rendered - there is
    // no flag here that could be turned on by mistake.
    let cancelled = false;

    void (async () => {
      try {
        const result = await apiFetch<{ code?: string | null }>(
          `/auth/otp/_dev-sink?phone=${encodeURIComponent(phone)}&country=${encodeURIComponent(country)}`
        );
        if (!cancelled && typeof result?.code === 'string' && result.code.length > 0) {
          setDevCode(result.code);
          setCode(result.code);
        }
      } catch {
        // Production (no such route), or no code recorded yet. Either way
        // the person just types the code themselves, exactly as before.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [challenge.challengeId, phone, country]);

  useEffect(() => {
    // Keyed on challenge.challengeId, not secondsLeft: one interval per
    // challenge (restarted fresh on resend), self-clearing once it reaches
    // zero rather than needing secondsLeft itself as a dependency.
    const interval = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearInterval(interval);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [challenge.challengeId]);

  async function handleResend() {
    setError(null);
    setResending(true);
    try {
      const result = otpRequestResponseSchema.parse(
        await apiFetch('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone, country }) })
      );
      setChallenge({ challengeId: result.challengeId, termsVersion: result.termsVersion, privacyVersion: result.privacyVersion });
      setSecondsLeft(result.expiresInSeconds);
      setCode('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد. دوباره تلاش کنید.');
    } finally {
      setResending(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (code.trim().length === 0) {
      setError('کد تأیید را وارد کنید.');
      return;
    }

    setSubmitting(true);
    try {
      const result = otpVerifyResponseSchema.parse(
        await apiFetch('/auth/otp/verify', {
          method: 'POST',
          body: JSON.stringify({
            challengeId: challenge.challengeId,
            code,
            termsVersion: challenge.termsVersion,
            privacyVersion: challenge.privacyVersion,
          }),
        })
      );
      onVerified(result.userId);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'LEGAL_VERSION_CHANGED') {
        onLegalVersionChanged(err.message);
        return;
      }
      setError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد. دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div dir="rtl" className="p-6 text-right">
      <h1 className="text-xl font-bold text-gray-900 mb-2">کد تأیید را وارد کنید</h1>
      <p className="text-sm text-gray-500 mb-6">کد شش‌رقمی ارسال‌شده به شمارهٔ {phone} را وارد کنید.</p>

      {devCode && (
        <p
          data-testid="dev-sink-code"
          role="status"
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          حالت آزمایشی: پیامکی ارسال نمی‌شود. کد تأیید{' '}
          <span className="font-bold tracking-[0.3em]">{toPersianDigits(devCode)}</span> است و در کادر زیر وارد شده
          است.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="otp-code" className="block text-sm font-medium text-gray-700 mb-1">
            کد تأیید
          </label>
          <input
            id="otp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^0-9۰-۹]/g, ''))}
            className="w-full rounded-xl border border-gray-300 p-3 text-center text-lg tracking-[0.5em] text-gray-900"
            placeholder="------"
          />
        </div>

        <p role="status" aria-live="polite" className="text-center text-sm text-gray-500">
          {secondsLeft > 0 ? (
            <>
              زمان باقی‌مانده: <span data-testid="countdown">{formatCountdown(secondsLeft)}</span>
            </>
          ) : (
            'کد منقضی شد.'
          )}
        </p>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-blue-600 p-3 font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'در حال بررسی...' : 'تأیید کد'}
        </button>

        {secondsLeft <= 0 && (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="w-full rounded-xl border border-blue-600 p-3 font-medium text-blue-600 disabled:opacity-50"
          >
            {resending ? 'در حال ارسال...' : 'ارسال دوباره کد'}
          </button>
        )}
      </form>
    </div>
  );
}
