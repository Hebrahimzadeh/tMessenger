'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buildSpaceResponseSchema, SPACE_BUILD_PROMPT_MAX_CHARS, type BuildSpaceResponse } from '@taavon/contracts';
import { apiFetch, ApiError, LONG_REQUEST_TIMEOUT_MS } from '@/lib/api/client';
import { ArrowRight, Sparkles, X } from '@/components/icons';
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
 * The shape is `tmessenger-v1.html`'s `renderAiModal`, which is the
 * reference design for every place this app asks a person for something: the
 * assistant speaks first in a chat bubble, the box below it fills the sheet,
 * and one button sits along the bottom. Only its first two states exist here
 * - the sample proposes a menu of spaces to pick from, and this does not,
 * because picking from a menu is the fields this flow replaced.
 */
const WORKING_MESSAGES = [
  'دارم به آنچه نوشتی فکر می‌کنم...',
  'دارم بستر را بر پایهٔ چارچوب تعاون‌آفرینی می‌نویسم...',
  'دارم می‌بینم چه کسانی در این بستر به هم وصل می‌شوند...',
];

export function SpaceComposer() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<BuildSpaceResponse | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!building) return;
    // Building takes a model eleven to twenty seconds. A person waiting that
    // long deserves to be told what is happening rather than watching a
    // spinner decide whether it froze.
    const interval = setInterval(() => setMessageIndex((i) => Math.min(i + 1, WORKING_MESSAGES.length - 1)), 2_000);
    return () => clearInterval(interval);
  }, [building]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBlocked(null);
    if (prompt.trim().length === 0) {
      setError('بنویسید چه بستری می‌خواهید.');
      return;
    }

    setMessageIndex(0);
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
    <div dir="rtl" className="flex h-full flex-col overflow-hidden bg-white text-right">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
        <h1 className="flex items-center gap-2 text-[16px] font-bold text-gray-900">
          <Sparkles size={20} className="text-amber-500" aria-hidden />
          همیار هوشمند تعاون
        </h1>
        <Link href="/" aria-label="بستن" className="rounded-full bg-gray-100 p-1.5 text-gray-500 transition hover:bg-gray-200">
          <X size={18} />
        </Link>
      </div>

      {building ? (
        <div role="status" className="flex flex-1 flex-col items-center justify-center bg-[#f9fafb] p-8 text-center">
          <div className="relative mb-8 h-24 w-24">
            <div className="absolute inset-0 animate-ping rounded-full bg-blue-100 opacity-60" />
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-tr from-[#527DA3] to-blue-400 shadow-lg">
              <Sparkles size={36} strokeWidth={1.5} className="animate-pulse text-white" />
            </div>
          </div>
          <p className="text-[15px] font-bold leading-relaxed text-[#527DA3]">در حال ساخت بستر</p>
          <p className="mt-2 text-[13px] text-gray-500">{WORKING_MESSAGES[messageIndex]}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto bg-[#f9fafb] p-5" noValidate>
          <p className="mb-5 rounded-2xl rounded-tr-sm border border-gray-100 bg-white p-4 text-[14px] font-medium leading-relaxed text-gray-800 shadow-sm">
            سلام رفیق! بگو چه بستری می‌خواهی و چه گرهی قرار است باز شود. عنوان، معرفی، نقش‌ها و کارت‌های نمونه را خودم بر پایهٔ
            چارچوب تعاون‌آفرینی می‌نویسم، و بعد از انتشار می‌توانی هر بخش را ویرایش کنی.
          </p>

          <label htmlFor="space-prompt" className="sr-only">
            چه بستری می‌خواهید؟
          </label>
          <textarea
            id="space-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={SPACE_BUILD_PROMPT_MAX_CHARS}
            className="min-h-[160px] w-full flex-1 resize-none rounded-2xl border border-gray-200 bg-white p-4 text-[15px] font-medium text-gray-800 shadow-inner transition-all focus:border-[#527DA3] focus:outline-none focus:ring-2 focus:ring-[#527DA3]/20"
            placeholder="مثلاً بنویس: همسایه‌ها وسایلی مثل نردبان و دریل را به هم امانت بدهند..."
          />

          {/* Still here: knowing a space like this already exists is worth
              more before it is built than after. */}
          <SimilarSpaces title="" purpose={prompt} />

          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              {error}
            </p>
          )}

          {blocked && (
            <div role="alert" className="mt-4 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              <p>{blocked.reason}</p>
              {blocked.matchedPolicyRules.length > 0 && (
                <ul className="list-inside list-disc text-[12px]">
                  {blocked.matchedPolicyRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="submit"
            className={`mt-4 flex w-full shrink-0 items-center justify-center gap-2 rounded-xl py-4 text-[15px] font-bold transition-all active:scale-95 ${
              prompt.trim() ? 'bg-[#527DA3] text-white shadow-md' : 'bg-gray-200 text-gray-400'
            }`}
          >
            ساخت بستر
            <ArrowRight size={18} className="-scale-x-100" aria-hidden />
          </button>
        </form>
      )}
    </div>
  );
}
