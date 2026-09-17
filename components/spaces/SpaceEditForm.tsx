'use client';

import { useState } from 'react';
import { spaceResponseSchema, type SpaceResponse } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';

export interface SpaceEditFormProps {
  space: SpaceResponse;
  onSaved: (space: SpaceResponse) => void;
  onCancel: () => void;
}

interface RoleDraft {
  key: string;
  title: string;
  description: string;
  isPrimary: boolean;
}

function splitMethods(raw: string): string[] {
  return raw
    .split(/[،,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** A key no existing role uses, in the same shape the builder assigns. */
function nextSupportingKey(roles: RoleDraft[]): string {
  const taken = new Set(roles.map((role) => role.key));
  let n = roles.filter((role) => !role.isPrimary).length + 1;
  while (taken.has(`supporting-${n}`)) n += 1;
  return `supporting-${n}`;
}

/**
 * Editing a space after it is published - the only place a person meets
 * fields at all, and only because they chose to change something.
 *
 * Every save is checked against the policy baseline on the server before it
 * becomes visible. A refused edit leaves the published space exactly as it
 * was and says why, citing any rule that matched.
 *
 * Role keys are carried through untouched so an edit updates the existing
 * roles in place rather than orphaning the memberships people already hold.
 */
export function SpaceEditForm({ space, onSaved, onCancel }: SpaceEditFormProps) {
  const definition = space.definition;
  const [title, setTitle] = useState(definition.title);
  const [purpose, setPurpose] = useState(definition.purpose);
  const [audience, setAudience] = useState(definition.audience ?? '');
  const [methods, setMethods] = useState(definition.participationMethods.join('، '));
  const [roles, setRoles] = useState<RoleDraft[]>(
    definition.roles.map((role) => ({
      key: role.key,
      title: role.title,
      description: role.description ?? '',
      isPrimary: role.isPrimary,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; rules: string[] } | null>(null);

  function updateRole(index: number, change: Partial<RoleDraft>) {
    setRoles((current) => current.map((role, i) => (i === index ? { ...role, ...change } : role)));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = spaceResponseSchema.parse(
        await apiFetch(`/spaces/${space.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: title.trim(),
            purpose: purpose.trim(),
            ...(audience.trim() ? { audience: audience.trim() } : {}),
            participationMethods: splitMethods(methods),
            // Sample cards are not edited here; they are sent back as they are.
            ...(definition.cardHints ? { cardHints: definition.cardHints } : {}),
            roles: roles
              .filter((role) => role.title.trim().length > 0)
              .map((role) => ({
                key: role.key,
                title: role.title.trim(),
                ...(role.description.trim() ? { description: role.description.trim() } : {}),
                isPrimary: role.isPrimary,
              })),
            policyVersion: definition.policyVersion,
          }),
        })
      );
      onSaved(updated);
    } catch (err) {
      if (err instanceof ApiError) {
        const rules = err.details.filter((detail): detail is string => typeof detail === 'string');
        setError({ message: err.message, rules: err.code === 'SPACE_EDIT_REFUSED' ? rules : [] });
      } else {
        setError({ message: 'ذخیرهٔ تغییرات ممکن نشد.', rules: [] });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form dir="rtl" onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 p-4 text-right" noValidate>
      <h2 className="text-sm font-semibold text-gray-800">ویرایش بستر</h2>

      <div>
        <label htmlFor="edit-space-title" className="mb-1 block text-sm font-medium text-gray-700">
          عنوان
        </label>
        <input
          id="edit-space-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl border border-gray-300 p-2 text-sm text-gray-900"
        />
      </div>

      <div>
        <label htmlFor="edit-space-purpose" className="mb-1 block text-sm font-medium text-gray-700">
          معرفی بستر
        </label>
        <textarea
          id="edit-space-purpose"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={6}
          className="w-full rounded-xl border border-gray-300 p-2 text-sm text-gray-900"
        />
      </div>

      <div>
        <label htmlFor="edit-space-audience" className="mb-1 block text-sm font-medium text-gray-700">
          مخاطب
        </label>
        <input
          id="edit-space-audience"
          type="text"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          className="w-full rounded-xl border border-gray-300 p-2 text-sm text-gray-900"
        />
      </div>

      <div>
        <label htmlFor="edit-space-methods" className="mb-1 block text-sm font-medium text-gray-700">
          روش‌های مشارکت (با ویرگول جدا کنید)
        </label>
        <input
          id="edit-space-methods"
          type="text"
          value={methods}
          onChange={(e) => setMethods(e.target.value)}
          className="w-full rounded-xl border border-gray-300 p-2 text-sm text-gray-900"
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-medium text-gray-700">نقش‌ها</legend>
        <p className="text-xs text-gray-500">دقیقاً دو نقش باید «اصلی» باشند. نقشی را که عنوانش را پاک کنید حذف می‌شود.</p>
        {roles.map((role, index) => (
          <div key={role.key} className="space-y-2 rounded-xl border border-gray-200 p-3">
            <input
              type="text"
              aria-label={`عنوان نقش ${index + 1}`}
              value={role.title}
              onChange={(e) => updateRole(index, { title: e.target.value })}
              className="w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900"
            />
            <input
              type="text"
              aria-label={`توضیح نقش ${index + 1}`}
              value={role.description}
              onChange={(e) => updateRole(index, { description: e.target.value })}
              className="w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900"
            />
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={role.isPrimary}
                onChange={(e) => updateRole(index, { isPrimary: e.target.checked })}
              />
              نقش اصلی
            </label>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRoles((current) => [...current, { key: nextSupportingKey(current), title: '', description: '', isPrimary: false }])}
          className="text-sm font-medium text-blue-600"
        >
          + افزودن نقش
        </button>
      </fieldset>

      {error && (
        <div role="alert" className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{error.message}</p>
          {error.rules.length > 0 && (
            <ul className="list-inside list-disc text-xs">
              {error.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-xl bg-blue-600 p-3 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? 'در حال ذخیره...' : 'ذخیرهٔ تغییرات'}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-gray-300 p-3 text-sm text-gray-700">
          انصراف
        </button>
      </div>
    </form>
  );
}
