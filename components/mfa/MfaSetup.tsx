'use client';

import { useState } from 'react';
import { mfaConfirmResponseSchema, mfaEnrollResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

type Step =
  | { name: 'start' }
  | { name: 'confirm'; secretBase32: string; otpauthUri: string }
  | { name: 'done'; recoveryCodes: string[] };

export function MfaSetup() {
  const [step, setStep] = useState<Step>({ name: 'start' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleEnroll() {
    setError(null);
    setSubmitting(true);
    try {
      const result = mfaEnrollResponseSchema.parse(await apiFetch('/auth/mfa/enroll', { method: 'POST' }));
      setStep({ name: 'confirm', secretBase32: result.secretBase32, otpauthUri: result.otpauthUri });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = mfaConfirmResponseSchema.parse(
        await apiFetch('/auth/mfa/confirm', { method: 'POST', body: JSON.stringify({ code }) })
      );
      setStep({ name: 'done', recoveryCodes: result.recoveryCodes });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.');
    } finally {
      setSubmitting(false);
    }
  }

  if (step.name === 'start') {
    return (
      <div dir="rtl" className="p-6 text-right">
        <h1 className="text-xl font-bold text-gray-900 mb-2">احراز هویت دومرحله‌ای</h1>
        <p className="text-sm text-gray-500 mb-4">
          برای دسترسی به بخش مدیریت، فعال‌سازی احراز دومرحله‌ای (TOTP) الزامی است.
        </p>
        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={handleEnroll}
          disabled={submitting}
          className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          شروع فعال‌سازی
        </button>
      </div>
    );
  }

  if (step.name === 'confirm') {
    return (
      <div dir="rtl" className="p-6 text-right">
        <h1 className="text-xl font-bold text-gray-900 mb-2">افزودن به برنامهٔ احراز هویت</h1>
        <p className="text-sm text-gray-500 mb-3">
          این کد را در برنامهٔ احراز هویت خود (مانند Google Authenticator) وارد کنید:
        </p>
        <p
          data-testid="mfa-secret"
          dir="ltr"
          className="mb-4 break-all rounded-xl border border-gray-200 bg-gray-50 p-3 text-center font-mono text-sm"
        >
          {step.secretBase32}
        </p>

        <form onSubmit={handleConfirm} className="space-y-4" noValidate>
          <div>
            <label htmlFor="mfa-confirm-code" className="block text-sm font-medium text-gray-700 mb-1">
              کد شش‌رقمی
            </label>
            <input
              id="mfa-confirm-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))}
              className="w-full rounded-xl border border-gray-300 p-3 text-center text-lg tracking-[0.5em] text-gray-900"
              placeholder="------"
            />
          </div>

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
            تأیید
          </button>
        </form>
      </div>
    );
  }

  return (
    <div dir="rtl" className="p-6 text-right">
      <h1 className="text-xl font-bold text-gray-900 mb-2">احراز دومرحله‌ای فعال شد</h1>
      <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        این کدها را فقط یک‌بار می‌بینید. آن‌ها را در جای امنی نگه دارید - هرکدام فقط یک‌بار قابل استفاده است.
      </p>
      <ul dir="ltr" className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 font-mono text-sm">
        {step.recoveryCodes.map((recoveryCode) => (
          <li key={recoveryCode}>{recoveryCode}</li>
        ))}
      </ul>
    </div>
  );
}
