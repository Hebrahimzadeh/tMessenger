'use client';

import { useState } from 'react';
import type { SpaceResponse, SpaceRoleContract } from '@taavon/contracts';
import { createSpaceInviteResponseSchema } from '@taavon/contracts';
import { apiFetch, ApiError } from '@/lib/api/client';
import { Copy, Layers, Link2, LogOut, Sparkles, X } from '@/components/icons';
import { toPersianDigits } from '@/lib/persian-digits';
import { SpaceEditForm } from './SpaceEditForm';
import { SpaceHealthPanel } from './SpaceHealthPanel';
import { spaceStatusLabel } from './space-status';

export type SpaceInfoTab = 'info' | 'manage';

export interface SpaceInfoSheetProps {
  space: SpaceResponse;
  initialTab: SpaceInfoTab;
  joinedRoleIds: Set<string>;
  onToggleRole: (role: SpaceRoleContract) => void;
  roleError: string | null;
  /** Present only while the caller follows the space - leaving is an action of the sheet, not of the conversation. */
  onLeave: (() => void) | null;
  onUpdated: (space: SpaceResponse) => void;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-[#527DA3]">{label}</p>
      {children}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-3 text-[13px] leading-relaxed text-gray-800 shadow-sm">{children}</div>;
}

/**
 * Everything about a space that is not the space itself.
 *
 * Modelled on `tmessenger-v1.html`'s `renderBioModal`: a full-height sheet
 * over the conversation, a plain information side and - for whoever runs the
 * space - a management side. This is where the long stack of sections that
 * used to *be* the space page now lives, which is what made the page a chat
 * instead of a form.
 */
export function SpaceInfoSheet({
  space,
  initialTab,
  joinedRoleIds,
  onToggleRole,
  roleError,
  onLeave,
  onUpdated,
  onClose,
}: SpaceInfoSheetProps) {
  const [tab, setTab] = useState<SpaceInfoTab>(space.canManage ? initialTab : 'info');
  const [editing, setEditing] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const statusLabel = spaceStatusLabel(space.status);
  const inviteUrl = inviteToken ? `${typeof window !== 'undefined' ? window.location.origin : ''}/spaces/invite/${inviteToken}` : null;

  async function createInvite() {
    setInviteError(null);
    try {
      const result = createSpaceInviteResponseSchema.parse(await apiFetch(`/spaces/${space.id}/invites`, { method: 'POST' }));
      setInviteToken(result.token);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'خطای غیرمنتظره‌ای رخ داد.');
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      // A browser that refuses the clipboard is not an error worth a banner:
      // the link is on screen and can be selected by hand.
    }
  }

  return (
    <div dir="rtl" className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60">
      <div className="flex h-[92%] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sheet-in">
        <div className="flex shrink-0 items-center justify-between bg-[#527DA3] p-4 text-white">
          <h2 className="text-[16px] font-medium">مشخصات بستر</h2>
          <button type="button" onClick={onClose} aria-label="بستن" className="rounded-full p-1.5 transition hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        {space.canManage && (
          <div className="flex shrink-0 border-b border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setTab('info')}
              className={`flex-1 py-3 text-[13px] font-medium transition-colors ${
                tab === 'info' ? 'border-b-2 border-[#527DA3] text-[#527DA3]' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              اطلاعات
            </button>
            <button
              type="button"
              onClick={() => setTab('manage')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-[13px] font-medium transition-colors ${
                tab === 'manage' ? 'border-b-2 border-amber-600 text-amber-600' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Sparkles size={14} />
              مدیریت بستر
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-gray-50">
          {tab === 'info' && (
            <div className="space-y-4 p-5">
              <div className="mb-2 flex flex-col items-center">
                <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-3xl border border-blue-100 bg-blue-50 text-[#527DA3] shadow-sm">
                  <Layers size={40} strokeWidth={1.5} />
                </div>
                <h3 className="text-xl font-bold text-gray-900">{space.definition.title}</h3>
                <p className="mt-1 text-[13px] text-gray-500">
                  {toPersianDigits(String(space.followerCount))} مشارکت‌کننده
                  {statusLabel && ` · ${statusLabel}`}
                </p>
              </div>

              <Field label="درباره این بستر">
                <Panel>
                  <p className="whitespace-pre-wrap">{space.definition.purpose}</p>
                </Panel>
              </Field>

              {space.definition.participationMethods.length > 0 && (
                <Field label="روش‌های مشارکت">
                  <div className="flex flex-wrap gap-2">
                    {space.definition.participationMethods.map((method) => (
                      <span key={method} className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[12px] text-gray-700 shadow-sm">
                        {method}
                      </span>
                    ))}
                  </div>
                </Field>
              )}

              <Field label="نقش‌ها">
                {space.definition.roles.length === 0 ? (
                  <Panel>هنوز نقشی تعریف نشده است.</Panel>
                ) : (
                  <ul className="space-y-2">
                    {space.definition.roles.map((role) => (
                      <li key={role.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-[13px] text-gray-800">
                            {role.title}
                            {role.isPrimary && (
                              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">اصلی</span>
                            )}
                          </span>
                          {role.description && <span className="mt-0.5 block text-[12px] text-gray-500">{role.description}</span>}
                        </span>
                        <button
                          type="button"
                          onClick={() => onToggleRole(role)}
                          className="shrink-0 rounded-xl border border-gray-300 px-3 py-1.5 text-[12px] font-medium text-gray-700"
                        >
                          {joinedRoleIds.has(role.id) ? 'خروج از نقش' : 'پیوستن به نقش'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {roleError && (
                  <p role="alert" className="mt-2 text-[12px] text-red-700">
                    {roleError}
                  </p>
                )}
              </Field>

              <Field label="قواعد و مخاطب">
                <Panel>{space.definition.audience ?? 'قاعدهٔ ویژه‌ای برای این بستر ثبت نشده است.'}</Panel>
              </Field>

              {onLeave && (
                <button
                  type="button"
                  onClick={onLeave}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-[13px] text-red-500 shadow-sm transition hover:bg-gray-50"
                >
                  <LogOut size={18} />
                  <span className="flex-1 text-right">خروج از بستر</span>
                </button>
              )}
            </div>
          )}

          {space.canManage && tab === 'manage' && (
            <div className="space-y-5 p-5">
              <Field label="پیوند دعوت">
                {inviteUrl ? (
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                    <span dir="ltr" className="min-w-0 flex-1 truncate text-[12px] text-gray-700">
                      {inviteUrl}
                    </span>
                    <button type="button" onClick={copyInvite} aria-label="کپی پیوند دعوت" className="rounded-lg bg-blue-50 p-2 text-[#527DA3]">
                      <Copy size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={createInvite}
                    className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-[13px] text-gray-800 shadow-sm transition hover:bg-gray-50"
                  >
                    <Link2 size={18} className="text-[#527DA3]" />
                    <span className="flex-1 text-right">ساخت پیوند دعوت</span>
                  </button>
                )}
                {copied && <p className="mt-1.5 text-[12px] text-green-700">پیوند کپی شد.</p>}
                {inviteError && (
                  <p role="alert" className="mt-1.5 text-[12px] text-red-700">
                    {inviteError}
                  </p>
                )}
              </Field>

              <Field label="ویرایش بستر">
                {/* Published spaces only: editing one still waiting for review
                    goes through the draft path and would leave it with no way
                    to be published. */}
                {space.status !== 'PUBLISHED' ? (
                  <Panel>این بستر هنوز منتشر نشده است. پس از انتشار می‌توانید هر بخش آن را ویرایش کنید.</Panel>
                ) : editing ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                    <SpaceEditForm
                      space={space}
                      onSaved={(updated) => {
                        onUpdated(updated);
                        setEditing(false);
                      }}
                      onCancel={() => setEditing(false)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="w-full rounded-xl border border-gray-300 bg-white p-3 text-[13px] font-medium text-gray-700 shadow-sm"
                  >
                    ویرایش بستر
                  </button>
                )}
              </Field>

              <Field label="سلامت بستر">
                <SpaceHealthPanel spaceId={space.id} />
              </Field>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
