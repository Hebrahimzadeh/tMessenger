'use client';

import Link from 'next/link';
import { useState } from 'react';
import { otpRequestResponseSchema, type OtpRequestResponse } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

/** Iran plus the neighboring allow-list (matches services/api's SUPPORTED_PHONE_COUNTRIES - kept as a separate, UI-only list since the server is the actual validation authority). */
const COUNTRIES: Array<{ code: string; label: string }> = [
  { code: 'IR', label: 'ایران' },
  { code: 'IQ', label: 'عراق' },
  { code: 'TR', label: 'ترکیه' },
  { code: 'AZ', label: 'آذربایجان' },
  { code: 'AM', label: 'ارمنستان' },
  { code: 'TM', label: 'ترکمنستان' },
  { code: 'AF', label: 'افغانستان' },
  { code: 'PK', label: 'پاکستان' },
];

export interface PhoneFormProps {
  onRequested: (result: OtpRequestResponse, phone: string, country: string) => void;
  /** Shown as a banner above the form - used when the caller bounced back here after a LEGAL_VERSION_CHANGED error, so the user sees why before retrying. */
  notice?: string;
}

export function PhoneForm({ onRequested, notice }: PhoneFormProps) {
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('IR');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (phone.trim().length === 0) {
      setError('شماره موبایل را وارد کنید.');
      return;
    }

    setSubmitting(true);
    try {
      const result = otpRequestResponseSchema.parse(
        await apiFetch('/auth/otp/request', { method: 'POST', body: JSON.stringify({ phone, country }) })
      );
      onRequested(result, phone, country);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد. دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div dir="rtl" className="p-6 text-right">
      <h1 className="text-xl font-bold text-gray-900 mb-6">ورود به تعاون‌آفرینی</h1>

      {notice && (
        <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          {notice}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
            کشور
          </label>
          <select
            id="country"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className="w-full rounded-xl border border-gray-300 p-3 text-gray-900"
          >
            {COUNTRIES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            شماره موبایل
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded-xl border border-gray-300 p-3 text-gray-900"
            placeholder="09xxxxxxxxx"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
            {error}
          </p>
        )}

        <p data-testid="acceptance-text" className="text-sm text-gray-500">
          ثبت‌نام و ورود به منزلهٔ پذیرش{' '}
          <Link href="/legal/terms" className="text-blue-600 underline">
            قوانین و مقررات
          </Link>{' '}
          و{' '}
          <Link href="/legal/privacy" className="text-blue-600 underline">
            حریم خصوصی
          </Link>{' '}
          جامعهٔ تعاون‌آفرینی است.
        </p>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-blue-600 p-3 font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'در حال ارسال...' : 'دریافت کد'}
        </button>
      </form>
    </div>
  );
}
