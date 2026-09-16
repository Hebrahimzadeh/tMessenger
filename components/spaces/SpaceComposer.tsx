'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  precheckSpaceResponseSchema,
  publishSpaceResponseSchema,
  spaceResponseSchema,
  type SpaceCreationGuidance,
  type SpaceGateVerdict,
} from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { SimilarSpaces } from './SimilarSpaces';
import { CooperationGuidance, type AcceptedGuidance } from './CooperationGuidance';

type Step =
  | { name: 'describe' }
  | { name: 'roles' }
  | { name: 'review'; verdict: SpaceGateVerdict; reason: string; guidance: SpaceCreationGuidance | null }
  | { name: 'published' };

/** Starting suggestions the user edits before any guidance exists. Framed in the UI as a starting point, never presented as inferred from the free text - the real guidance arrives with the precheck. */
const STARTER_PRIMARY_ROLE_1 = 'سازمان‌دهنده';
const STARTER_PRIMARY_ROLE_2 = 'همکار';

function splitParticipationMethods(raw: string): string[] {
  return raw
    .split(/[،,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function SpaceComposer() {
  const [step, setStep] = useState<Step>({ name: 'describe' });
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [participationMethodsText, setParticipationMethodsText] = useState('');
  const [primaryRole1, setPrimaryRole1] = useState(STARTER_PRIMARY_ROLE_1);
  const [primaryRole2, setPrimaryRole2] = useState(STARTER_PRIMARY_ROLE_2);
  const [supplementaryRoles, setSupplementaryRoles] = useState<string[]>([]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleDescribeSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (title.trim().length === 0) {
      setError('عنوان بستر را وارد کنید.');
      return;
    }
    setSubmitting(true);
    try {
      const result = spaceResponseSchema.parse(await apiFetch('/spaces', { method: 'POST', body: JSON.stringify({ title }) }));
      setSpaceId(result.id);
      setSlug(result.slug);
      setStep({ name: 'roles' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRolesSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (primaryRole1.trim().length === 0 || primaryRole2.trim().length === 0) {
      setError('هر دو نقش اصلی را وارد کنید.');
      return;
    }
    if (!spaceId) return;

    setSubmitting(true);
    try {
      const roles = [
        { key: 'primary-1', title: primaryRole1.trim(), isPrimary: true },
        { key: 'primary-2', title: primaryRole2.trim(), isPrimary: true },
        ...supplementaryRoles
          .filter((r) => r.trim().length > 0)
          .map((r, i) => ({ key: `supplementary-${i}`, title: r.trim(), isPrimary: false })),
      ];
      await apiFetch(`/spaces/${spaceId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          purpose,
          participationMethods: splitParticipationMethods(participationMethodsText),
          roles,
          policyVersion: 1,
        }),
      });
      const precheck = precheckSpaceResponseSchema.parse(await apiFetch(`/spaces/${spaceId}/precheck`, { method: 'POST' }));
      setStep({ name: 'review', verdict: precheck.verdict, reason: precheck.reason, guidance: precheck.guidance });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.');
    } finally {
      setSubmitting(false);
    }
  }


  /**
   * Folds what the person accepted back into the form they came from, then
   * returns them to it.
   *
   * Deliberately not straight to a re-precheck: they see the applied text in
   * their own fields and press ادامه themselves, so nothing the guidance
   * proposed reaches their space without them looking at it.
   */
  function applyAccepted(accepted: AcceptedGuidance) {
    for (const revision of accepted.revisions) {
      if (revision.field === 'title') setTitle(revision.value);
      if (revision.field === 'purpose') setPurpose(revision.value);
      if (revision.field === 'participationMethods') {
        setParticipationMethodsText((current) => {
          const existing = splitParticipationMethods(current);
          return existing.includes(revision.value) ? current : [...existing, revision.value].join('، ');
        });
      }
    }

    const primaries = accepted.participationRoles.filter((role) => role.isPrimary);
    if (primaries[0]) setPrimaryRole1(primaries[0].title);
    if (primaries[1]) setPrimaryRole2(primaries[1].title);
    const supplementary = accepted.participationRoles.filter((role) => !role.isPrimary).map((role) => role.title);
    if (supplementary.length > 0) setSupplementaryRoles(supplementary);

    setStep({ name: 'roles' });
  }

  async function handlePublish() {
    if (!spaceId) return;
    setError(null);
    setSubmitting(true);
    try {
      publishSpaceResponseSchema.parse(await apiFetch(`/spaces/${spaceId}/publish`, { method: 'POST' }));
      setStep({ name: 'published' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.');
    } finally {
      setSubmitting(false);
    }
  }

  if (step.name === 'describe') {
    return (
      <div dir="rtl" className="p-6 text-right">
        <h1 className="mb-2 text-xl font-bold text-gray-900">ساخت بستر جدید</h1>
        <p className="mb-4 text-sm text-gray-500">با زبان خودتان بنویسید چه می‌خواهید بسازید - جزئیات را بعداً کامل می‌کنید.</p>

        <form onSubmit={handleDescribeSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="space-title" className="mb-1 block text-sm font-medium text-gray-700">
              عنوان بستر
            </label>
            <input
              id="space-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-300 p-3 text-gray-900"
              placeholder="مثلاً: باغ محله"
            />
          </div>

          <div>
            <label htmlFor="space-purpose" className="mb-1 block text-sm font-medium text-gray-700">
              این بستر برای چیست؟
            </label>
            <textarea
              id="space-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-gray-300 p-3 text-gray-900"
              placeholder="هدف، مخاطب و اینکه چطور مردم مشارکت می‌کنند را توضیح دهید."
            />
          </div>

          <SimilarSpaces title={title} purpose={purpose} />

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-blue-600 p-3 font-medium text-white disabled:opacity-50"
          >
            ادامه
          </button>
        </form>
      </div>
    );
  }

  if (step.name === 'roles') {
    return (
      <div dir="rtl" className="p-6 text-right">
        <h1 className="mb-2 text-xl font-bold text-gray-900">نقش‌های مشارکت</h1>
        <p className="mb-4 text-sm text-gray-500">
          هر بستر دو نقش اصلی دارد. این‌ها نقطهٔ شروع هستند - هرطور می‌خواهید ویرایششان کنید.
        </p>

        <form onSubmit={handleRolesSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="primary-role-1" className="mb-1 block text-sm font-medium text-gray-700">
              نقش اصلی اول
            </label>
            <input
              id="primary-role-1"
              type="text"
              value={primaryRole1}
              onChange={(e) => setPrimaryRole1(e.target.value)}
              className="w-full rounded-xl border border-gray-300 p-3 text-gray-900"
            />
          </div>

          <div>
            <label htmlFor="primary-role-2" className="mb-1 block text-sm font-medium text-gray-700">
              نقش اصلی دوم
            </label>
            <input
              id="primary-role-2"
              type="text"
              value={primaryRole2}
              onChange={(e) => setPrimaryRole2(e.target.value)}
              className="w-full rounded-xl border border-gray-300 p-3 text-gray-900"
            />
          </div>

          <div>
            <label htmlFor="participation-methods" className="mb-1 block text-sm font-medium text-gray-700">
              روش‌های مشارکت (با ویرگول جدا کنید)
            </label>
            <input
              id="participation-methods"
              type="text"
              value={participationMethodsText}
              onChange={(e) => setParticipationMethodsText(e.target.value)}
              className="w-full rounded-xl border border-gray-300 p-3 text-gray-900"
              placeholder="حضوری، آنلاین"
            />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">نقش‌های تکمیلی (اختیاری)</p>
            {supplementaryRoles.map((role, index) => (
              <input
                key={index}
                type="text"
                value={role}
                onChange={(e) =>
                  setSupplementaryRoles((roles) => roles.map((r, i) => (i === index ? e.target.value : r)))
                }
                className="mb-2 w-full rounded-xl border border-gray-300 p-3 text-gray-900"
              />
            ))}
            <button
              type="button"
              onClick={() => setSupplementaryRoles((roles) => [...roles, ''])}
              className="text-sm font-medium text-blue-600"
            >
              + افزودن نقش تکمیلی
            </button>
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-blue-600 p-3 font-medium text-white disabled:opacity-50"
          >
            ادامه
          </button>
        </form>
      </div>
    );
  }

  if (step.name === 'review') {
    return (
      <div dir="rtl" className="p-6 text-right">
        <h1 className="mb-4 text-xl font-bold text-gray-900">پیش‌نمایش و بررسی</h1>

        {error && (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {step.guidance ? (
          <div className="space-y-4">
            <CooperationGuidance
              guidance={step.guidance}
              onApply={applyAccepted}
              onEdit={() => setStep({ name: 'roles' })}
              busy={submitting}
            />
            {step.verdict === 'ALLOW' && (
              <button
                type="button"
                onClick={handlePublish}
                disabled={submitting}
                className="w-full rounded-xl bg-blue-600 p-3 font-medium text-white disabled:opacity-50"
              >
                انتشار
              </button>
            )}
          </div>
        ) : (
          /* The gate failed closed, so there is a verdict but nothing to show
             beside it. HUMAN_REVIEW is what an outage produces, and the copy
             here says so plainly rather than implying the person did
             something wrong. */
          <div className="space-y-4">
            <p className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{step.reason}</p>
            <p className="text-sm text-gray-500">پیش‌نویس شما ذخیره شده و تا پایان بررسی به‌صورت عمومی منتشر نمی‌شود.</p>
            <button
              type="button"
              onClick={() => setStep({ name: 'roles' })}
              className="w-full rounded-xl border border-gray-300 p-3 font-medium text-gray-700"
            >
              بازگشت و ویرایش
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div dir="rtl" className="p-6 text-right">
      <h1 className="mb-2 text-xl font-bold text-gray-900">بستر شما منتشر شد!</h1>
      <p className="mb-4 text-sm text-gray-500">حالا دیگران می‌توانند آن را پیدا کرده و مشارکت کنند.</p>
      {slug && (
        <Link href={`/spaces/${slug}`} className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white">
          مشاهدهٔ بستر
        </Link>
      )}
    </div>
  );
}
