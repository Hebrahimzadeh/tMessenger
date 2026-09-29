'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { spaceBuildAttemptListResponseSchema, type SpaceBuildAttemptContract } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { MfaChallengeForm } from '@/components/mfa/MfaChallengeForm';
import { toPersianDigits } from '@/lib/persian-digits';

type GateState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'mfa_required' }
  | { status: 'ready'; items: SpaceBuildAttemptContract[]; retentionDays: number };

const DECISION_LABELS: Record<SpaceBuildAttemptContract['decision'], string> = {
  PUBLISH: 'منتشر شد',
  HUMAN_REVIEW: 'در انتظار بررسی',
  BLOCK: 'رد شد',
};

const DECISION_STYLES: Record<SpaceBuildAttemptContract['decision'], string> = {
  PUBLISH: 'bg-green-100 text-green-800',
  HUMAN_REVIEW: 'bg-amber-100 text-amber-800',
  BLOCK: 'bg-red-100 text-red-800',
};

function dateTime(iso: string): string {
  return toPersianDigits(new Date(iso).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' }));
}

/** A block of prompt text, or an honest account of why there is none. */
function PromptBlock({ label, text, purgedAt, absent }: { label: string; text: string | null; purgedAt: string | null; absent: string }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-gray-500">{label}</p>
      {text === null ? (
        // Three different absences, and the reader needs to tell them apart:
        // expired, never sent, never recorded.
        <p className="rounded-lg bg-gray-50 p-2 text-[12px] text-gray-400">
          {purgedAt ? `متن پس از پایان مهلت نگهداری پاک شد (${dateTime(purgedAt)}).` : absent}
        </p>
      ) : (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-2 text-[12px] leading-relaxed text-gray-800">
          {text}
        </pre>
      )}
    </div>
  );
}

/**
 * Every recent space build, with what the person asked and what we sent the
 * model (owner request 2026-09-29).
 *
 * SUPERADMIN + MFA is enforced by `GET /v1/admin/space-builds` itself, never
 * here - this component only renders what that route agrees to return, the
 * same division of responsibility as the rest of /admin.
 */
export function SpaceBuildReview() {
  const [gate, setGate] = useState<GateState>({ status: 'loading' });
  const [openId, setOpenId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = spaceBuildAttemptListResponseSchema.parse(await apiFetch('/admin/space-builds'));
        if (!cancelled) setGate({ status: 'ready', items: result.items, retentionDays: result.retentionDays });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'MFA_REQUIRED') setGate({ status: 'mfa_required' });
        else setGate({ status: 'error', message: err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.' });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function reload() {
    setGate({ status: 'loading' });
    setAttempt((n) => n + 1);
  }

  if (gate.status === 'loading') {
    return (
      <p role="status" className="p-6 text-center text-gray-500">
        در حال بارگذاری...
      </p>
    );
  }

  if (gate.status === 'mfa_required') {
    return (
      <div dir="rtl" className="p-6 text-right">
        <h1 className="mb-3 text-lg font-bold text-gray-900">بررسی ساخت بسترها</h1>
        <MfaChallengeForm onVerified={reload} />
      </div>
    );
  }

  if (gate.status === 'error') {
    return (
      <div dir="rtl" className="p-6 text-center">
        <p role="alert" className="mb-3 text-sm text-red-700">
          {gate.message}
        </p>
        <button type="button" onClick={reload} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">
          تلاش دوباره
        </button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="p-4 text-right">
      <h1 className="mb-1 text-lg font-bold text-gray-900">بررسی ساخت بسترها</h1>
      <p className="mb-4 text-xs leading-relaxed text-gray-500">
        هر تلاش برای ساخت بستر، از جمله آن‌هایی که رد شده‌اند و بستری نساخته‌اند. متن پرامپت‌ها{' '}
        {toPersianDigits(String(gate.retentionDays))} روز نگه داشته می‌شود و پس از آن پاک می‌شود؛ تصمیم، قاعده‌های منطبق و هزینه
        می‌مانند.
      </p>

      {gate.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          هنوز بستری ساخته نشده است.
        </p>
      ) : (
        <ul className="space-y-2">
          {gate.items.map((item) => {
            const open = openId === item.id;
            return (
              <li key={item.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : item.id)}
                  aria-expanded={open}
                  className="flex w-full items-start gap-3 p-3 text-right transition hover:bg-gray-50"
                >
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${DECISION_STYLES[item.decision]}`}>
                    {DECISION_LABELS[item.decision]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-gray-900">
                      {item.space ? item.space.title : item.userPrompt ?? 'بدون متن'}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-gray-500">
                      {dateTime(item.createdAt)}
                      {!item.creativityApplied && ' · ساختهٔ قاعده‌ها، نه مدل'}
                    </span>
                  </span>
                </button>

                {open && (
                  <div className="space-y-3 border-t border-gray-100 bg-white p-3">
                    <PromptBlock
                      label="پرامپت کاربر"
                      text={item.userPrompt}
                      purgedAt={item.textPurgedAt}
                      absent="متنی ثبت نشده است."
                    />
                    <PromptBlock
                      label="پرامپتی که به مدل ارسال شد"
                      text={item.renderedPrompt}
                      purgedAt={item.textPurgedAt}
                      absent="هیچ مدلی فراخوانی نشد؛ درخواست پیش از ارسال رد شد."
                    />
                    <PromptBlock
                      label={`سند سیستمی${item.documentRef ? ` (${item.documentRef})` : ''}`}
                      text={item.systemInstruction}
                      purgedAt={null}
                      absent="سند سیستمی همراه این فراخوانی ارسال نشد."
                    />

                    <div className="grid grid-cols-2 gap-2 text-[12px] text-gray-700">
                      <p>
                        <span className="text-gray-500">تصمیم: </span>
                        {item.reason}
                      </p>
                      <p>
                        <span className="text-gray-500">مبنای قواعد: </span>
                        {item.policyVersionRef}
                      </p>
                      {item.call && (
                        <>
                          <p>
                            <span className="text-gray-500">نتیجهٔ فراخوانی: </span>
                            {item.call.outcome}
                            {item.call.errorCode && ` (${item.call.errorCode})`}
                          </p>
                          <p>
                            <span className="text-gray-500">زمان و هزینه: </span>
                            {toPersianDigits(String(item.call.latencyMs))} میلی‌ثانیه
                            {item.call.costMicros !== null && ` · ${toPersianDigits(String(item.call.costMicros))} میکرو`}
                            {item.call.model && ` · ${item.call.model}`}
                          </p>
                        </>
                      )}
                    </div>

                    {item.matchedPolicyRules.length > 0 && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-gray-500">قاعده‌های منطبق</p>
                        <ul className="list-inside list-disc text-[12px] text-gray-700">
                          {item.matchedPolicyRules.map((rule) => (
                            <li key={rule}>{rule}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {item.space && (
                      <Link href={`/spaces/${encodeURIComponent(item.space.slug)}`} className="text-[12px] font-medium text-[#527DA3] underline">
                        دیدن بستر
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
