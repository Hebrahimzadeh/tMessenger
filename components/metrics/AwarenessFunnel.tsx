'use client';

import { useEffect, useState } from 'react';
import { awarenessMetricsResponseSchema, type AwarenessDailyAggregateContract } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { MfaChallengeForm } from '@/components/mfa/MfaChallengeForm';
import { toPersianDigits } from '@/lib/persian-digits';

type GateState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'mfa_required' }
  | { status: 'ready'; days: AwarenessDailyAggregateContract[] };

function sumField(days: AwarenessDailyAggregateContract[], field: keyof AwarenessDailyAggregateContract): number {
  return days.reduce((total, day) => total + (day[field] as number), 0);
}

/**
 * "dashboard فقط آمار تجمیعی و بدون score انسان نمایش دهد" - every number
 * here comes straight from a pre-computed daily aggregate row; there is no
 * per-user id or score anywhere in this component or the response it
 * reads. The funnel is produced -> received (meaningful view) -> applied
 * -> reservation closed (Task 18's own "metric اصلی تعداد کارت‌های
 * به‌کارگرفته‌شده است"), plus the public/private contribution ratio.
 */
export function AwarenessFunnel() {
  const [gate, setGate] = useState<GateState>({ status: 'loading' });

  async function load() {
    setGate({ status: 'loading' });
    try {
      const result = awarenessMetricsResponseSchema.parse(await apiFetch('/admin/metrics/awareness'));
      setGate({ status: 'ready', days: result.days });
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
    (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (gate.status === 'loading') {
    return (
      <p role="status" className="p-6 text-center text-gray-500">
        در حال بارگذاری...
      </p>
    );
  }
  if (gate.status === 'mfa_required') {
    return (
      <div dir="rtl" className="mx-auto max-w-sm p-6 text-right">
        <MfaChallengeForm onVerified={load} />
      </div>
    );
  }
  if (gate.status === 'error') {
    return (
      <p role="alert" className="p-6 text-center text-red-700">
        {gate.message}
      </p>
    );
  }

  const { days } = gate;
  const produced = sumField(days, 'producedCount');
  const meaningfulViews = sumField(days, 'meaningfulViewCount');
  const applied = sumField(days, 'appliedCount');
  const publicContributions = sumField(days, 'publicContributionCount');
  const privateChats = sumField(days, 'privateChatStartedCount');
  const closed = sumField(days, 'reservationClosedCount');
  const ratio = privateChats > 0 ? (publicContributions / privateChats).toFixed(2) : null;

  const funnelStages: Array<{ label: string; value: number }> = [
    { label: 'کارت تولید شد', value: produced },
    { label: 'بازدید معنادار', value: meaningfulViews },
    { label: 'مشارکت/عضویت', value: applied },
    { label: 'کارت به‌کارگرفته شد', value: closed },
  ];

  return (
    <div dir="rtl" className="mx-auto max-w-3xl p-4 text-right">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">قیف آگاهی</h1>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {funnelStages.map((stage) => (
          <div key={stage.label} className="rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">{stage.label}</p>
            <p className="mt-1 font-medium text-gray-900" dir="ltr">
              {toPersianDigits(String(stage.value))}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 p-3">
        <p className="text-xs text-gray-500">نسبت مشارکت عمومی به گفت‌وگوی خصوصی</p>
        <p className="mt-1 font-medium text-gray-900" dir="ltr">
          {ratio ? toPersianDigits(ratio) : '—'}
        </p>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-800">روزهای اخیر</h2>
      {days.length === 0 ? (
        <p className="text-sm text-gray-500">هنوز داده‌ای محاسبه نشده است.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="p-2 text-right">تاریخ</th>
                <th className="p-2 text-right">تولید</th>
                <th className="p-2 text-right">بازدید</th>
                <th className="p-2 text-right">مشارکت</th>
                <th className="p-2 text-right">به‌کارگیری</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date} className="border-b border-gray-100">
                  <td className="p-2" dir="ltr">
                    {day.date}
                  </td>
                  <td className="p-2" dir="ltr">
                    {toPersianDigits(String(day.producedCount))}
                  </td>
                  <td className="p-2" dir="ltr">
                    {toPersianDigits(String(day.meaningfulViewCount))}
                  </td>
                  <td className="p-2" dir="ltr">
                    {toPersianDigits(String(day.appliedCount))}
                  </td>
                  <td className="p-2" dir="ltr">
                    {toPersianDigits(String(day.reservationClosedCount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
