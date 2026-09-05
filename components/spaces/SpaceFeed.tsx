import type { SpaceCardHint } from '@taavon/contracts';

export interface SpaceFeedProps {
  cardHints: SpaceCardHint[] | null;
}

/**
 * "کارت‌های نمونه همیشه badge «نمونه — محتوای واقعی نیست» داشته باشند و CTA
 * تعامل/رزرو/پسند روی آن‌ها غیرفعال باشد" - real cards (Task 14) don't
 * exist yet, so this is the only content the feed can show before then;
 * every affordance below is disabled, not just visually muted, so it can
 * never be mistaken for something a visitor can actually act on.
 */
export function SpaceFeed({ cardHints }: SpaceFeedProps) {
  if (!cardHints || cardHints.length === 0) {
    return (
      <div dir="rtl" className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
        هنوز کارتی در این بستر ثبت نشده است.
      </div>
    );
  }

  return (
    <ul dir="rtl" className="space-y-3">
      {cardHints.map((hint, index) => (
        <li key={index} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-medium text-gray-900">{hint.title}</h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              نمونه — محتوای واقعی نیست
            </span>
          </div>
          {hint.description && <p className="mb-3 text-sm text-gray-600">{hint.description}</p>}
          <div className="flex gap-2">
            <button type="button" disabled className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-400">
              پسندیدن
            </button>
            <button type="button" disabled className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-400">
              رزرو
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
