'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildSpaceResponseSchema, SPACE_BUILD_PROMPT_MAX_CHARS, type BuildSpaceResponse } from '@taavon/contracts';
import { apiFetch, ApiError, LONG_REQUEST_TIMEOUT_MS } from '@/lib/api/client';
import { SimilarSpaces } from './SimilarSpaces';

/**
 * Where a space is made: one prompt, and nothing else.
 *
 * Owner decision, 2026-09-17: a person does not fill in a title, a purpose,
 * participation methods or roles. They write what they want in their own
 * words; the API combines that with the space-builder document (the
 * Taavonafarin framework - cooperation in بر و تقوا, the ten indicators, the
 * space protocol), has the AI design the whole space, checks it against the
 * policy baseline and publishes it. The person lands on their space as its
 * manager, and edits it there if they want to.
 *
 * The earlier composer asked for every field and then showed a long review
 * panel before publishing, and a real person got stuck in it. That is why
 * this component has exactly one input.
 */
export function SpaceComposer() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<BuildSpaceResponse | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBlocked(null);
    if (prompt.trim().length === 0) {
      setError('بنویسید چه بستری می‌خواهید.');
      return;
    }

    setBuilding(true);
    try {
      const result = buildSpaceResponseSchema.parse(
        await apiFetch('/spaces/build', {
          method: 'POST',
          body: JSON.stringify({ prompt: prompt.trim() }),
          // Designing a whole space takes a model 11-20 seconds. The
          // default budget aborted it in the browser while the server
          // carried on and published the space, leaving the person with
          // an error and a space they did not know they had.
          timeoutMs: LONG_REQUEST_TIMEOUT_MS,
        })
      );

      if (result.outcome === 'BLOCKED' || !result.space) {
        // Their words stay in the box, so rewriting is an edit, not a retype.
        setBlocked(result);
        return;
      }

      const notice = result.outcome === 'PUBLISHED' ? 'published' : 'review';
      router.push(`/spaces/${encodeURIComponent(result.space.slug)}?built=${notice}&ai=${result.creativityApplied ? 1 : 0}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REQUEST_TIMEOUT') {
        // Even with the longer budget this can happen, and if it does the
        // space may well exist: the server does not stop building because
        // the browser stopped listening. Saying so is better than an error
        // that implies nothing happened.
        setError('ساخت بستر بیش از حد انتظار طول کشید. ممکن است بستر ساخته شده باشد - پیش از تلاش دوباره، فهرست بسترها را ببینید.');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'ساخت بستر ممکن نشد. دوباره تلاش کنید.');
    } finally {
      setBuilding(false);
    }
  }

  return (
    <div dir="rtl" className="p-6 text-right">
      <h1 className="mb-2 text-xl font-bold text-gray-900">ساخت بستر جدید</h1>
      <p className="mb-4 text-sm text-gray-500">
        با زبان خودتان بنویسید چه بستری می‌خواهید. عنوان، معرفی، نقش‌ها و کارت‌های نمونه بر پایهٔ چارچوب تعاون‌آفرینی ساخته
        می‌شوند و بعد از انتشار می‌توانید هر بخش را ویرایش کنید.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="space-prompt" className="mb-1 block text-sm font-medium text-gray-700">
            چه بستری می‌خواهید؟
          </label>
          <textarea
            id="space-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            maxLength={SPACE_BUILD_PROMPT_MAX_CHARS}
            disabled={building}
            className="w-full rounded-xl border border-gray-300 p-3 text-gray-900 disabled:bg-gray-50"
            placeholder="مثلاً: می‌خواهم همسایه‌ها وسایلی مثل نردبان و دریل را به هم امانت بدهند."
          />
        </div>

        <SimilarSpaces title="" purpose={prompt} />

        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {blocked && (
          <div role="alert" className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p>{blocked.reason}</p>
            {blocked.matchedPolicyRules.length > 0 && (
              <ul className="list-inside list-disc text-xs">
                {blocked.matchedPolicyRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {building && (
          <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            در حال ساخت بستر... ممکن است چند ثانیه طول بکشد.
          </p>
        )}

        <button
          type="submit"
          disabled={building}
          className="w-full rounded-xl bg-blue-600 p-3 font-medium text-white disabled:opacity-50"
        >
          {building ? 'در حال ساخت...' : 'ساخت بستر'}
        </button>
      </form>
    </div>
  );
}
