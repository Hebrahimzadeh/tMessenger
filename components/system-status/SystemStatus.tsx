'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { healthReadyResponseSchema, type HealthReadyResponse } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: HealthReadyResponse };

type CheckName = keyof HealthReadyResponse['checks'];

const CHECK_LABELS: Record<CheckName, string> = {
  database: 'پایگاه‌داده',
  redis: 'صف/کش (Redis)',
};

const CHECK_STATUS_LABELS: Record<HealthReadyResponse['checks'][CheckName], string> = {
  ok: 'سالم',
  down: 'قطع',
};

async function loadReadyStatus(): Promise<HealthReadyResponse> {
  const data = await apiFetch<HealthReadyResponse>('/health/ready');
  // Re-validate against the same shared schema the API used to build this
  // response, so a drift between client and server expectations fails loudly
  // here instead of silently rendering a wrong page.
  return healthReadyResponseSchema.parse(data);
}

export function SystemStatus() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: 'loading' });
      try {
        const data = await loadReadyStatus();
        if (!cancelled) setState({ status: 'success', data });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setState({ status: 'error', message: err.message });
        } else if (err instanceof z.ZodError) {
          setState({ status: 'error', message: 'داده دریافتی از سرور با قرارداد مورد انتظار مطابقت ندارد.' });
        } else {
          setState({ status: 'error', message: 'خطای غیرمنتظره‌ای رخ داد.' });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      dir="rtl"
      className="min-h-[100dvh] bg-gray-50 p-6 text-right"
      style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
    >
      <h1 className="text-xl font-bold text-gray-900 mb-4">وضعیت سامانه</h1>

      {state.status === 'loading' && (
        <p role="status" className="text-gray-500">
          در حال بررسی وضعیت سرویس‌ها...
        </p>
      )}

      {state.status === 'error' && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          ارتباط با سرویس API برقرار نشد: {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <div className="space-y-3">
          <div
            className={`rounded-xl p-4 font-medium ${
              state.data.status === 'ok'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            وضعیت کلی: {state.data.status === 'ok' ? 'سالم' : 'ناقص (Degraded)'}
          </div>
          <ul className="space-y-2">
            {(Object.keys(state.data.checks) as CheckName[]).map((key) => (
              <li
                key={key}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3"
              >
                <span className="text-gray-700">{CHECK_LABELS[key]}</span>
                <span
                  className={
                    state.data.checks[key] === 'ok' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'
                  }
                >
                  {CHECK_STATUS_LABELS[state.data.checks[key]]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
