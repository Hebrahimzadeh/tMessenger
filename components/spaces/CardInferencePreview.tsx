'use client';

import { useState } from 'react';
import { PATTERN_BY_KIND, type CardInference, type CardKindContract } from '@taavon/contracts';

/** What the person kept. Any field they rejected is simply absent. */
export interface AcceptedInference {
  kind?: CardKindContract;
  title?: string;
  body?: string;
  /** The classification to record, present only when they kept the kind. */
  confirmedInference?: { inferredKind: CardKindContract; confidence: number };
}

export interface CardInferencePreviewProps {
  inference: CardInference;
  /** Called only when the person applies. Nothing here reaches the card otherwise. */
  onApply: (accepted: AcceptedInference) => void;
  onDismiss: () => void;
}

export const KIND_LABELS: Record<CardKindContract, string> = {
  AWARENESS: 'اطلاع‌رسانی',
  OBSERVATION: 'مشاهده',
  REUSABLE_RESOURCE: 'چیزی برای امانت',
  CONSUMABLE_RESOURCE: 'چیزی برای برداشتن',
  REQUEST: 'درخواست',
  SERVICE: 'خدمت',
  PARTICIPATION: 'دعوت به مشارکت',
  EVENT: 'رویداد',
};

const KIND_ORDER: CardKindContract[] = [
  'AWARENESS',
  'OBSERVATION',
  'REUSABLE_RESOURCE',
  'CONSUMABLE_RESOURCE',
  'REQUEST',
  'SERVICE',
  'PARTICIPATION',
  'EVENT',
];

/**
 * How a card of this kind behaves, in plain sentences.
 *
 * Derived from `PATTERN_BY_KIND` rather than from the inference, so changing
 * the kind in the selector immediately shows the behaviour that kind actually
 * has. The pattern is a fact about the platform, not a setting - which is why
 * it is shown and not offered as a choice.
 */
function patternSentences(kind: CardKindContract): string[] {
  const pattern = PATTERN_BY_KIND[kind];
  if (!pattern.reservable) {
    return ['این کارت رزرو نمی‌شود و باز می‌ماند تا خودتان ببندیدش.'];
  }
  // Worded differently from the assumptions the API sends, which say the same
  // thing: the same sentence printed twice on one screen reads as a glitch.
  return [
    'این کارت رزروپذیر است: کسی می‌تواند آن را برای خودش نگه دارد.',
    'بستن آن نهایی است؛ کارت پس از آن در فهرست فعال نمی‌ماند.',
  ];
}

/**
 * The suggestion, before it is anybody's card.
 *
 * Three separate decisions, not one: the kind, the title and the body are
 * each accepted or rejected on their own, and the kind can be corrected to
 * any of the eight rather than only taken or left - "user بتواند kind/pattern
 * را اصلاح یا نادیده بگیرد". Dismissing the whole thing publishes exactly
 * what they typed.
 *
 * The clarifying questions are shown and never enforced. Each one says what
 * answering it would change, so the person can tell at a glance whether it is
 * worth their time - and publishing without answering any of them is a normal
 * outcome, not a skipped step.
 */
export function CardInferencePreview({ inference, onApply, onDismiss }: CardInferencePreviewProps) {
  const [kind, setKind] = useState<CardKindContract>(inference.kind);
  const [title, setTitle] = useState(inference.suggestedTitle);
  const [body, setBody] = useState(inference.suggestedBody);
  const [takeKind, setTakeKind] = useState(true);
  const [takeTitle, setTakeTitle] = useState(true);
  const [takeBody, setTakeBody] = useState(true);

  const corrected = kind !== inference.kind;

  function handleApply() {
    onApply({
      ...(takeKind ? { kind } : {}),
      ...(takeTitle ? { title: title.trim() } : {}),
      ...(takeBody ? { body: body.trim() } : {}),
      ...(takeKind
        ? {
            confirmedInference: {
              inferredKind: kind,
              // Correcting the kind is a person saying so, which is a better
              // signal than any classifier's own score.
              confidence: corrected ? 1 : inference.confidence,
            },
          }
        : {}),
    });
  }

  return (
    <section dir="rtl" aria-labelledby="inference-heading" className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4 text-right">
      <div>
        <h2 id="inference-heading" className="text-sm font-semibold text-gray-800">
          پیشنهاد برای این کارت
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          {inference.creativityApplied
            ? 'عنوان و متن پیشنهادی را دستیار نوشته است. هرچه را نمی‌پسندید رد کنید.'
            : 'این پیشنهاد فقط بر پایهٔ قاعده‌هاست و دستیار در آن نقشی نداشته است.'}
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={takeKind} onChange={(e) => setTakeKind(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>این نوع را بپذیر</span>
        </label>
        <select
          aria-label="نوع کارت"
          value={kind}
          onChange={(e) => setKind(e.target.value as CardKindContract)}
          className="w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900"
        >
          {KIND_ORDER.map((option) => (
            <option key={option} value={option}>
              {KIND_LABELS[option]}
            </option>
          ))}
        </select>

        <ul className="list-inside list-disc space-y-1 text-xs text-gray-600">
          {patternSentences(kind).map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={takeTitle} onChange={(e) => setTakeTitle(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>این عنوان را بپذیر</span>
        </label>
        <input
          type="text"
          aria-label="عنوان پیشنهادی"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900"
        />
      </div>

      <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
        <label className="flex items-start gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={takeBody} onChange={(e) => setTakeBody(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>این متن را بپذیر</span>
        </label>
        <textarea
          aria-label="متن پیشنهادی"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900"
        />
      </div>

      {inference.assumptions.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-700">چیزهایی که فرض شد</h3>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-gray-600">
            {inference.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
      )}

      {inference.clarifyingQuestions.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-700">اگر دوست داشتید، به این‌ها هم اشاره کنید</h3>
          <p className="mt-1 text-xs text-gray-400">پاسخ دادن اختیاری است و نبودنش مانع ثبت کارت نمی‌شود.</p>
          <ul className="mt-2 space-y-2">
            {inference.clarifyingQuestions.map((question) => (
              <li key={question.question} className="rounded-lg border border-gray-200 bg-white p-2">
                <p className="text-sm text-gray-800">{question.question}</p>
                {/* Why it is worth answering, so nobody is asked to fill in a
                    field whose purpose they cannot see. */}
                <p className="mt-1 text-xs text-gray-500">{question.behaviorAffected}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleApply}
          className="flex-1 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          اعمال موارد انتخاب‌شده
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm text-gray-700"
        >
          نادیده بگیر
        </button>
      </div>
    </section>
  );
}
