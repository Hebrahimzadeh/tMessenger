'use client';

import { useState } from 'react';
import type { SpaceCreationGuidance } from '@taavon/contracts';

/**
 * What the person actually kept.
 *
 * Only accepted items appear here. The component never mutates the guidance
 * it was given, and nothing it shows is applied until the person says so -
 * "پذیرش پیشنهاد اختیاری باشد".
 */
export interface AcceptedGuidance {
  strengths: string[];
  risks: string[];
  revisions: SpaceCreationGuidance['suggestedRevisions'];
  participationRoles: SpaceCreationGuidance['participationRoles'];
  valueChainNodes: string[];
  exampleCardTemplates: SpaceCreationGuidance['exampleCardTemplates'];
  suggestedToolKeys: string[];
}

export interface CooperationGuidanceProps {
  guidance: SpaceCreationGuidance;
  /** Called with only what the person accepted. Never called on its own. */
  onApply: (accepted: AcceptedGuidance) => void;
  /** Take them back to the form. Offered on every decision except a published one. */
  onEdit: () => void;
  busy?: boolean;
}

const DECISION_TONE: Record<SpaceCreationGuidance['creationDecision'], string> = {
  ALLOW: 'border-green-200 bg-green-50 text-green-800',
  REVISE: 'border-amber-200 bg-amber-50 text-amber-800',
  HUMAN_REVIEW: 'border-gray-200 bg-gray-50 text-gray-700',
  BLOCK: 'border-red-200 bg-red-50 text-red-700',
};

const DECISION_HEADLINE: Record<SpaceCreationGuidance['creationDecision'], string> = {
  ALLOW: 'این بستر آمادهٔ انتشار است.',
  REVISE: 'چند مورد را کامل کنید تا آمادهٔ انتشار شود.',
  HUMAN_REVIEW: 'یک نفر این درخواست را بررسی می‌کند.',
  BLOCK: 'این درخواست با یک قاعدهٔ صریح مغایرت دارد.',
};

const DECISION_DETAIL: Record<SpaceCreationGuidance['creationDecision'], string> = {
  ALLOW: 'هر پیشنهادی را که می‌پسندید نگه دارید و بقیه را رد کنید.',
  REVISE: 'هیچ‌چیز رد نشده است. موارد زیر را کامل کنید تا بستر آمادهٔ انتشار شود.',
  HUMAN_REVIEW:
    'پیش‌نویس شما ذخیره شده و تا پایان بررسی به‌صورت عمومی منتشر نمی‌شود. این به معنای تخلف نیست؛ موضوع به تشخیص یک نفر نیاز دارد.',
  BLOCK: 'این بستر به این شکل منتشر نخواهد شد. قاعده‌ای که مطابقت دارد در پایین آمده است؛ می‌توانید متن را تغییر دهید و دوباره تلاش کنید.',
};

/** A row that can be kept or dropped, with the checkbox as the whole control. */
function Selectable({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-right ${
        checked ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0"
      />
      <span className="flex-1 text-sm text-gray-800">{children}</span>
    </label>
  );
}

function EditableList({
  legend,
  values,
  onChange,
  addLabel,
  itemLabel,
}: {
  legend: string;
  values: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
  itemLabel: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium text-gray-700">{legend}</legend>
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            type="text"
            aria-label={`${itemLabel} ${index + 1}`}
            value={value}
            onChange={(e) => onChange(values.map((v, i) => (i === index ? e.target.value : v)))}
            className="w-full rounded-xl border border-gray-300 p-2 text-sm text-gray-900"
          />
          <button
            type="button"
            aria-label={`حذف ${itemLabel} ${index + 1}`}
            onClick={() => onChange(values.filter((_, i) => i !== index))}
            className="shrink-0 rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600"
          >
            حذف
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...values, ''])} className="text-sm font-medium text-blue-600">
        {addLabel}
      </button>
    </fieldset>
  );
}

/** Every index selected, which is the starting state for each suggestion group. */
function allSelected(count: number): Set<number> {
  return new Set(Array.from({ length: count }, (_, i) => i));
}

function toggle(set: Set<number>, index: number, next: boolean): Set<number> {
  const copy = new Set(set);
  if (next) copy.add(index);
  else copy.delete(index);
  return copy;
}

/**
 * The guidance a person sees before their space exists.
 *
 * Two things shape the whole component. First, everything here is a
 * suggestion: the strengths and risks are editable text, and every proposed
 * role, chain node, example card and tool key is a separate checkbox, so
 * accepting the roles while rejecting the example cards is one click rather
 * than all-or-nothing - "پذیرش/رد هر بخش مستقل باشد".
 *
 * Second, it describes a proposal and never the person. There is no score, no
 * rating and no judgement of anyone's sincerity - "هیچ piety/person score".
 * The assumptions the guidance had to make are shown rather than buried,
 * because an assumption the person cannot see is one they cannot correct.
 */
export function CooperationGuidance({ guidance, onApply, onEdit, busy = false }: CooperationGuidanceProps) {
  const [strengths, setStrengths] = useState<string[]>(guidance.strengths);
  const [risks, setRisks] = useState<string[]>(guidance.risks);
  const [revisions, setRevisions] = useState(guidance.suggestedRevisions.map((r) => r.value));
  const [acceptedRevisions, setAcceptedRevisions] = useState(() => allSelected(guidance.suggestedRevisions.length));
  const [acceptedRoles, setAcceptedRoles] = useState(() => allSelected(guidance.participationRoles.length));
  const [acceptedNodes, setAcceptedNodes] = useState(() => allSelected(guidance.valueChainNodes.length));
  const [acceptedCards, setAcceptedCards] = useState(() => allSelected(guidance.exampleCardTemplates.length));
  const [acceptedTools, setAcceptedTools] = useState(() => allSelected(guidance.suggestedToolKeys.length));

  const blocked = guidance.creationDecision === 'BLOCK';
  const needsRevision = guidance.creationDecision === 'REVISE';

  function handleApply() {
    onApply({
      strengths: strengths.map((s) => s.trim()).filter((s) => s.length > 0),
      risks: risks.map((s) => s.trim()).filter((s) => s.length > 0),
      revisions: guidance.suggestedRevisions
        .map((revision, index) => ({ ...revision, value: revisions[index] ?? revision.value }))
        .filter((_, index) => acceptedRevisions.has(index)),
      participationRoles: guidance.participationRoles.filter((_, index) => acceptedRoles.has(index)),
      valueChainNodes: guidance.valueChainNodes.filter((_, index) => acceptedNodes.has(index)),
      exampleCardTemplates: guidance.exampleCardTemplates.filter((_, index) => acceptedCards.has(index)),
      suggestedToolKeys: guidance.suggestedToolKeys.filter((_, index) => acceptedTools.has(index)),
    });
  }

  return (
    <div dir="rtl" className="space-y-6 text-right">
      <div role="status" className={`rounded-xl border p-3 text-sm ${DECISION_TONE[guidance.creationDecision]}`}>
        <p className="font-medium">{DECISION_HEADLINE[guidance.creationDecision]}</p>
        <p className="mt-1 text-xs opacity-90">{DECISION_DETAIL[guidance.creationDecision]}</p>
      </div>

      {guidance.matchedPolicyRules.length > 0 && (
        <section aria-labelledby="guidance-rules" className="space-y-2">
          <h2 id="guidance-rules" className="text-sm font-medium text-gray-700">
            قواعدی که مطابقت داشت
          </h2>
          {/* A refusal nobody can trace to a rule and a law is a refusal
              without a reason, so the citation is shown to the person it
              affects rather than kept in a log. */}
          <ul className="space-y-1 text-sm text-gray-700">
            {guidance.matchedPolicyRules.map((rule) => (
              <li key={rule} className="rounded-lg border border-gray-200 bg-white p-2">
                {rule}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* First, deliberately. On a REVISE this is the only section that
          stands between the person and a published space, and it used to
          sit below the assumptions, strengths, risks and questions - four
          blocks of commentary before the one actionable thing. Somebody
          reading top-down on a phone saw "complete a few things" and had
          no idea which, which is exactly how you get stuck on a page that
          is telling you nothing is wrong. */}
      {!blocked && guidance.suggestedRevisions.length > 0 && (
        <section aria-labelledby="guidance-revisions" className="space-y-2">
          <h2 id="guidance-revisions" className="text-sm font-medium text-gray-700">
            {needsRevision ? 'برای انتشار، این‌ها را کامل کنید' : 'تغییرهای پیشنهادی'}
          </h2>
          {guidance.suggestedRevisions.map((revision, index) => (
            <div key={`${revision.field}-${index}`} className="space-y-2 rounded-xl border border-gray-200 p-3">
              <Selectable
                id={`revision-${index}`}
                checked={acceptedRevisions.has(index)}
                onChange={(next) => setAcceptedRevisions((s) => toggle(s, index, next))}
              >
                {revision.reason}
              </Selectable>
              <textarea
                aria-label={`متن پیشنهادی ${index + 1}`}
                value={revisions[index] ?? revision.value}
                onChange={(e) => setRevisions((values) => values.map((v, i) => (i === index ? e.target.value : v)))}
                rows={3}
                className="w-full rounded-xl border border-gray-300 p-2 text-sm text-gray-900"
              />
            </div>
          ))}
        </section>
      )}

      {guidance.assumptions.length > 0 && (
        <section aria-labelledby="guidance-assumptions" className="space-y-2">
          <h2 id="guidance-assumptions" className="text-sm font-medium text-gray-700">
            چیزهایی که فرض شد
          </h2>
          <p className="text-xs text-gray-500">اینها از متن شما استنباط نشده‌اند. هرکدام درست نیست، در متن اصلاحش کنید.</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
            {guidance.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </section>
      )}

      {!blocked && (
        <>
          <EditableList
            legend="نقاط قوت"
            values={strengths}
            onChange={setStrengths}
            addLabel="+ افزودن نقطهٔ قوت"
            itemLabel="نقطهٔ قوت"
          />

          <EditableList legend="ریسک‌ها" values={risks} onChange={setRisks} addLabel="+ افزودن ریسک" itemLabel="ریسک" />

          {guidance.questions.length > 0 && (
            <section aria-labelledby="guidance-questions" className="space-y-2">
              <h2 id="guidance-questions" className="text-sm font-medium text-gray-700">
                پرسش‌هایی که بهتر است پاسخ دهید
              </h2>
              <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
                {guidance.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </section>
          )}

          {guidance.participationRoles.length > 0 && (
            <section aria-labelledby="guidance-roles" className="space-y-2">
              <h2 id="guidance-roles" className="text-sm font-medium text-gray-700">
                نقش‌های پیشنهادی
              </h2>
              {guidance.participationRoles.map((role, index) => (
                <Selectable
                  key={role.title}
                  id={`role-${index}`}
                  checked={acceptedRoles.has(index)}
                  onChange={(next) => setAcceptedRoles((s) => toggle(s, index, next))}
                >
                  <span className="font-medium">{role.title}</span>
                  {role.isPrimary && <span className="mr-2 text-xs text-blue-700">نقش اصلی</span>}
                  <span className="mt-1 block text-xs text-gray-600">{role.description}</span>
                </Selectable>
              ))}
            </section>
          )}

          {guidance.valueChainNodes.length > 0 && (
            <section aria-labelledby="guidance-chain" className="space-y-2">
              <h2 id="guidance-chain" className="text-sm font-medium text-gray-700">
                مراحل زنجیرهٔ کار
              </h2>
              {guidance.valueChainNodes.map((node, index) => (
                <Selectable
                  key={node}
                  id={`node-${index}`}
                  checked={acceptedNodes.has(index)}
                  onChange={(next) => setAcceptedNodes((s) => toggle(s, index, next))}
                >
                  {node}
                </Selectable>
              ))}
            </section>
          )}

          {guidance.exampleCardTemplates.length > 0 && (
            <section aria-labelledby="guidance-cards" className="space-y-2">
              <h2 id="guidance-cards" className="text-sm font-medium text-gray-700">
                کارت‌های نمونه
              </h2>
              {guidance.exampleCardTemplates.map((template, index) => (
                <Selectable
                  key={template.title}
                  id={`card-${index}`}
                  checked={acceptedCards.has(index)}
                  onChange={(next) => setAcceptedCards((s) => toggle(s, index, next))}
                >
                  {/* The notice comes from the schema, not from here: an
                      example that can be mistaken for real content is worse
                      than no example at all. */}
                  <span className="mb-1 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                    {template.notice}
                  </span>
                  <span className="block font-medium">{template.title}</span>
                  <span className="mt-1 block text-xs text-gray-600">{template.body}</span>
                </Selectable>
              ))}
            </section>
          )}

          {guidance.suggestedToolKeys.length > 0 && (
            <section aria-labelledby="guidance-tools" className="space-y-2">
              <h2 id="guidance-tools" className="text-sm font-medium text-gray-700">
                ابزارهای پیشنهادی
              </h2>
              {guidance.suggestedToolKeys.map((key, index) => (
                <Selectable
                  key={key}
                  id={`tool-${index}`}
                  checked={acceptedTools.has(index)}
                  onChange={(next) => setAcceptedTools((s) => toggle(s, index, next))}
                >
                  {key}
                </Selectable>
              ))}
            </section>
          )}
        </>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 rounded-xl border border-gray-300 p-3 text-sm font-medium text-gray-700"
        >
          بازگشت و ویرایش
        </button>
        {!blocked && (
          <button
            type="button"
            onClick={handleApply}
            disabled={busy}
            className="flex-1 rounded-xl bg-blue-600 p-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {needsRevision ? 'اعمال و بازگشت برای تکمیل' : 'اعمال موارد انتخاب‌شده'}
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400">مبنای بررسی: {guidance.policyVersionRef}</p>
    </div>
  );
}
