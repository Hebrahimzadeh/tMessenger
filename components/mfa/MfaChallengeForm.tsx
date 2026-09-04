'use client';

import { useState } from 'react';
import { mfaChallengeResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

export interface MfaChallengeFormProps {
  onVerified: () => void;
}

/** A TOTP or recovery code challenge for an already-logged-in user whose role needs a second factor (services/api's requireRole - see AdminDashboard.tsx). */
export function MfaChallengeForm({ onVerified }: MfaChallengeFormProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      mfaChallengeResponseSchema.parse(await apiFetch('/auth/mfa/challenge', { method: 'POST', body: JSON.stringify({ code }) }));
      onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div dir="rtl" className="p-6 text-right">
      <h1 className="text-xl font-bold text-gray-900 mb-2">تأیید دومرحله‌ای</h1>
      <p className="text-sm text-gray-500 mb-4">برای ادامه، کد برنامهٔ احراز هویت یا یکی از کدهای بازیابی خود را وارد کنید.</p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="mfa-challenge-code" className="block text-sm font-medium text-gray-700 mb-1">
            کد احراز دومرحله‌ای
          </label>
          <input
            id="mfa-challenge-code"
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="w-full rounded-xl border border-gray-300 p-3 text-center text-lg tracking-widest text-gray-900"
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
