'use client';

import { useEffect, useState } from 'react';
import { myProfileResponseSchema, type MyProfileResponse } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { ProfileForm } from './ProfileForm';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; profile: MyProfileResponse };

/**
 * Fetches the caller's own profile client-side. Deliberately not
 * server-fetched from app/profile/page.tsx: a Server Component's own
 * fetch() has no access to the browser's cookies (they're never
 * automatically forwarded), so GET /v1/me would always 401 there - the
 * route protection redirect itself still happens server-side, via
 * requireUser() in the page, ahead of this component ever rendering.
 */
export function ProfileEditor() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const profile = myProfileResponseSchema.parse(await apiFetch('/me'));
        if (!cancelled) setState({ status: 'success', profile });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.',
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <p role="status" className="p-6 text-gray-500">
        در حال بارگذاری پروفایل...
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
        {state.message}
      </p>
    );
  }

  return <ProfileForm profile={state.profile} />;
}
