'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { spaceSearchResponseSchema, type SpaceSearchItem } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

type GateState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: SpaceSearchItem[] };

/** The home tab's real, API-backed replacement for the old `PlatformsList` mock prototype - "خانه را از API تغذیه کن؛ loading، empty و retry داشته باشد." */
export function SpaceDiscoveryList() {
  const [gate, setGate] = useState<GateState>({ status: 'loading' });

  async function load() {
    setGate({ status: 'loading' });
    try {
      const result = spaceSearchResponseSchema.parse(await apiFetch('/spaces?scope=all'));
      setGate({ status: 'ready', items: result.items });
    } catch (err) {
      setGate({ status: 'error', message: err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.' });
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!cancelled) await load();
    }
    run();
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

  if (gate.status === 'error') {
    return (
      <div className="p-6 text-center">
        <p role="alert" className="mb-3 text-sm text-red-700">
          {gate.message}
        </p>
        <button type="button" onClick={load} className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">
          تلاش دوباره
        </button>
      </div>
    );
  }

  if (gate.items.length === 0) {
    return (
      <div dir="rtl" className="p-6 text-center text-sm text-gray-500">
        هنوز بستری منتشر نشده است. شما می‌توانید اولین نفر باشید.
      </div>
    );
  }

  return (
    <ul dir="rtl" className="space-y-3 p-4 text-right">
      {gate.items.map((item) => (
        <li key={item.id}>
          <Link href={`/spaces/${item.slug}`} className="block rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="font-medium text-gray-900">{item.title}</h3>
            <p className="mt-1 text-sm text-gray-500">{item.purpose}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
