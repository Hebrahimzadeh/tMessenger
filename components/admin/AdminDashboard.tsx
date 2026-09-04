'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  assignRoleResponseSchema,
  identityClaimListResponseSchema,
  roleKeySchema,
  type IdentityClaimSummary,
  type RoleKeyContract,
} from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { MfaChallengeForm } from '@/components/mfa/MfaChallengeForm';

type GateState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'mfa_required' }
  | { status: 'ready'; claims: IdentityClaimSummary[] };

const ROLE_OPTIONS = roleKeySchema.options;

export function AdminDashboard() {
  const [gate, setGate] = useState<GateState>({ status: 'loading' });
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRole, setAssignRole] = useState<RoleKeyContract>('MODERATOR');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState(false);

  async function loadClaims() {
    setGate({ status: 'loading' });
    try {
      const result = identityClaimListResponseSchema.parse(await apiFetch('/admin/identity-claims'));
      setGate({ status: 'ready', claims: result.claims });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_REQUIRED') {
        setGate({ status: 'mfa_required' });
      } else {
        setGate({ status: 'error', message: err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.' });
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!cancelled) await loadClaims();
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleReview(userId: string, decision: 'VERIFIED' | 'REJECTED') {
    await apiFetch(`/admin/identity-claims/${userId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    setGate((current) =>
      current.status === 'ready' ? { ...current, claims: current.claims.filter((c) => c.userId !== userId) } : current
    );
  }

  async function handleAssign(event: React.FormEvent) {
    event.preventDefault();
    setAssignError(null);
    setAssignSuccess(false);
    try {
      assignRoleResponseSchema.parse(
        await apiFetch('/admin/role-assignments', {
          method: 'POST',
          body: JSON.stringify({ userId: assignUserId, role: assignRole }),
        })
      );
      setAssignSuccess(true);
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.');
    }
  }

  if (gate.status === 'loading') {
    return (
      <p role="status" className="p-6 text-gray-500">
        در حال بارگذاری...
      </p>
    );
  }

  if (gate.status === 'error') {
    return (
      <p role="alert" className="m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
        {gate.message}
      </p>
    );
  }

  if (gate.status === 'mfa_required') {
    return (
      <div>
        <MfaChallengeForm onVerified={loadClaims} />
        <p className="px-6 pb-6 text-right text-sm text-gray-500">
          هنوز احراز دومرحله‌ای را فعال نکرده‌اید؟{' '}
          <Link href="/settings/security" className="text-blue-600 underline">
            از اینجا فعال کنید
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="p-6 text-right space-y-8">
      <h1 className="text-xl font-bold text-gray-900">پیشخوان مدیریت</h1>

      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">مدارک هویت رسمی در انتظار بررسی</h2>
        {gate.claims.length === 0 ? (
          <p className="text-gray-500">موردی برای بررسی وجود ندارد.</p>
        ) : (
          <ul className="space-y-2">
            {gate.claims.map((claim) => (
              <li key={claim.userId} className="flex items-center justify-between rounded-xl border border-gray-200 p-3">
                <span dir="ltr" className="font-mono text-sm text-gray-700">
                  {claim.userId}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleReview(claim.userId, 'VERIFIED')}
                    className="rounded-xl bg-green-600 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    تأیید مدرک
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReview(claim.userId, 'REJECTED')}
                    className="rounded-xl bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
                  >
                    رد مدرک
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">اعطای نقش</h2>
        <form onSubmit={handleAssign} className="space-y-4" noValidate>
          <div>
            <label htmlFor="assign-user-id" className="block text-sm font-medium text-gray-700 mb-1">
              شناسهٔ کاربر
            </label>
            <input
              id="assign-user-id"
              type="text"
              dir="ltr"
              value={assignUserId}
              onChange={(event) => setAssignUserId(event.target.value)}
              className="w-full rounded-xl border border-gray-300 p-3 text-gray-900"
            />
          </div>

          <div>
            <label htmlFor="assign-role" className="block text-sm font-medium text-gray-700 mb-1">
              نقش
            </label>
            <select
              id="assign-role"
              value={assignRole}
              onChange={(event) => setAssignRole(event.target.value as RoleKeyContract)}
              className="w-full rounded-xl border border-gray-300 p-3 text-gray-900"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          {assignError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
              {assignError}
            </p>
          )}
          {assignSuccess && !assignError && (
            <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-green-700 text-sm">
              نقش با موفقیت اعطا شد.
            </p>
          )}

          <button type="submit" className="w-full rounded-xl bg-blue-600 p-3 font-medium text-white">
            اعطای نقش
          </button>
        </form>
      </section>
    </div>
  );
}
