'use client';

import { useState } from 'react';
import type { MyProfileResponse } from '@taavon/contracts';
import { myProfileResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { toPersianDigits } from '@/lib/persian-digits';

const BIO_MAX_LENGTH = 320;

export interface ProfileFormProps {
  profile: MyProfileResponse;
}

export function ProfileForm({ profile }: ProfileFormProps) {
  const [username, setUsername] = useState(profile.username ?? '');
  const [displayName, setDisplayName] = useState(profile.displayName ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [phoneVisibility, setPhoneVisibility] = useState(profile.phoneVisibility);
  // Two-step confirmation before PRIVATE -> PUBLIC (Task 08 acceptance:
  // "عمومی‌کردن شماره با هشدار و تأیید صریح دومرحله‌ای"). Reverting to
  // PRIVATE needs no such gate - that's the safe direction.
  const [confirmingPublic, setConfirmingPublic] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const result = myProfileResponseSchema.parse(
        await apiFetch('/me/profile', {
          method: 'PATCH',
          body: JSON.stringify({ username, displayName, bio, phoneVisibility }),
        })
      );
      setUsername(result.username ?? '');
      setDisplayName(result.displayName ?? '');
      setBio(result.bio ?? '');
      setPhoneVisibility(result.phoneVisibility);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد. دوباره تلاش کنید.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div dir="rtl" className="p-6 text-right">
      <h1 className="text-xl font-bold text-gray-900 mb-6">ویرایش پروفایل</h1>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
            نام کاربری
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full rounded-xl border border-gray-300 p-3 text-gray-900"
            placeholder="ali_2000"
            dir="ltr"
          />
        </div>

        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
            نام نمایشی
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="w-full rounded-xl border border-gray-300 p-3 text-gray-900"
          />
        </div>

        <div>
          <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
            بیوگرافی
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(event) => setBio(event.target.value.slice(0, BIO_MAX_LENGTH))}
            maxLength={BIO_MAX_LENGTH}
            rows={4}
            className="w-full rounded-xl border border-gray-300 p-3 text-gray-900"
          />
          <p className="mt-1 text-left text-xs text-gray-400" dir="ltr">
            {toPersianDigits(`${bio.length} / ${BIO_MAX_LENGTH}`)}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-700 mb-2">حریم خصوصی شماره موبایل</p>
          <p className="text-sm text-gray-500 mb-3">
            وضعیت فعلی: {phoneVisibility === 'PUBLIC' ? 'عمومی' : 'خصوصی'}
          </p>

          {phoneVisibility === 'PRIVATE' && !confirmingPublic && (
            <button
              type="button"
              onClick={() => setConfirmingPublic(true)}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
            >
              نمایش عمومی شماره
            </button>
          )}

          {confirmingPublic && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                شمارهٔ شما برای همه قابل مشاهده خواهد شد. این تغییر را می‌توانید بعداً بازگردانید.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPhoneVisibility('PUBLIC');
                    setConfirmingPublic(false);
                  }}
                  className="rounded-xl bg-amber-600 px-3 py-1.5 text-sm font-medium text-white"
                >
                  بله، شماره را عمومی کن
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingPublic(false)}
                  className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
                >
                  انصراف
                </button>
              </div>
            </div>
          )}

          {phoneVisibility === 'PUBLIC' && (
            <button
              type="button"
              onClick={() => setPhoneVisibility('PRIVATE')}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
            >
              مخفی کردن شماره
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
            {error}
          </p>
        )}
        {saved && !error && (
          <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-green-700 text-sm">
            ذخیره شد.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-blue-600 p-3 font-medium text-white disabled:opacity-50"
        >
          {submitting ? 'در حال ذخیره...' : 'ذخیره'}
        </button>
      </form>
    </div>
  );
}
