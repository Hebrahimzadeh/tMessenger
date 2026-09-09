'use client';

import { useEffect, useState } from 'react';
import type { SpaceHealthResponse } from '@taavon/contracts';
import { spaceHealthResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { toPersianDigits } from '@/lib/persian-digits';

export interface SpaceHealthPanelProps {
  spaceId: string;
}

const STATUS_LABELS: Record<SpaceHealthResponse['status'], string> = {
  NEW: 'جدید',
  ACTIVE: 'فعال',
  FRAGILE: 'شکننده',
  DORMANT: 'خاموش',
};

const SUGGESTION_TEXT: Record<SpaceHealthResponse['suggestions'][number]['code'], string> = {
  CREATE_FIRST_CARD: 'ثبت اولین کارت واقعی را در نظر بگیرید.',
  IMPROVE_INTRO: 'بهبود معرفی بستر می‌تواند به جذب مشارکت بیشتر کمک کند.',
  RECRUIT_UNDERACTIVE_ROLE: 'یکی از نقش‌ها هنوز عضو فعالی ندارد - برای آن دعوت کنید.',
  CONSIDER_ARCHIVE_OR_SIMILAR: 'این بستر مدتی است فعالیتی نداشته - بایگانی یا معرفی بستر مشابه را در نظر بگیرید.',
};

type GateState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; health: SpaceHealthResponse };

/**
 * Creator/admin-only ("endpoint health فقط creator/admin"). Every dimension
 * renders as its own separately-labeled value - there is no combined score
 * field in the response to render even if this component wanted to
 * (see packages/contracts/src/space-health.ts), and nothing here computes
 * one client-side either. No public ranking, no moral/ethical score, no
 * automatic penalty - this panel is advisory information for the space's
 * own owner, never anything visible to a visitor or comparing spaces
 * against each other.
 */
export function SpaceHealthPanel({ spaceId }: SpaceHealthPanelProps) {
  const [gate, setGate] = useState<GateState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const health = spaceHealthResponseSchema.parse(await apiFetch(`/spaces/${spaceId}/health`));
        if (!cancelled) setGate({ status: 'ready', health });
      } catch (err) {
        if (!cancelled) setGate({ status: 'error', message: err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.' });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  if (gate.status === 'loading') {
    return (
      <p role="status" className="text-sm text-gray-500">
        در حال بارگذاری سلامت بستر...
      </p>
    );
  }

  if (gate.status === 'error') {
    return (
      <p role="alert" className="text-sm text-red-700">
        {gate.message}
      </p>
    );
  }

  const { health } = gate;

  return (
    <div dir="rtl" className="space-y-4 text-right">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">وضعیت</p>
          <p className="mt-1 font-medium text-gray-900">{STATUS_LABELS[health.status]}</p>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">مشارکت‌کنندگان</p>
          <p className="mt-1 font-medium text-gray-900" dir="ltr">
            {toPersianDigits(String(health.contributorCount))}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">نقش‌های فعال</p>
          <p className="mt-1 font-medium text-gray-900" dir="ltr">
            {toPersianDigits(`${health.roleActivity.activeRoleCount} / ${health.roleActivity.totalRoleCount}`)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">کارت‌های واقعی</p>
          <p className="mt-1 font-medium text-gray-900" dir="ltr">
            {toPersianDigits(String(health.cardCount))}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-xs text-gray-500">بازدید معنادار</p>
          <p className="mt-1 font-medium text-gray-900" dir="ltr">
            {toPersianDigits(String(health.meaningfulViewCount))}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-800">پیشنهادها</p>
        {health.suggestions.length === 0 ? (
          <p className="text-sm text-gray-500">در حال حاضر پیشنهادی برای این بستر وجود ندارد.</p>
        ) : (
          <ul className="space-y-2">
            {health.suggestions.map((suggestion, index) => (
              <li key={index} className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                {SUGGESTION_TEXT[suggestion.code]}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
