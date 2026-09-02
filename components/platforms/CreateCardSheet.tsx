'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ImageIcon, X } from '@/components/icons';
import { usePlatforms } from '@/hooks/usePlatforms';
import { CURRENT_USER } from '@/lib/data/seed';
import type { Platform } from '@/lib/types';

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

const EMPTY_FORM: NewCardForm = { title: '', desc: '', hasImage: false };

export function CreateCardSheet({ isOpen, platform, onClose }: { isOpen: boolean; platform: Platform; onClose: () => void }) {
  const { getDraft, saveDraft, clearDraft, submitCard } = usePlatforms();
  const [form, setForm] = useState<NewCardForm>(EMPTY_FORM);

  useEffect(() => {
    if (!isOpen) return;
    const draft = getDraft(platform.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing form state to the sheet's open/platform transition; CreateCardSheet is rewritten in Task 17.
    setForm(draft ? { title: draft.title, desc: draft.desc, hasImage: draft.hasImage } : EMPTY_FORM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, platform.id]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (form.desc.trim()) {
      saveDraft(platform.id, form);
    } else {
      clearDraft(platform.id);
    }
    onClose();
  };

  const handleSubmit = () => {
    submitCard(platform.id, form, CURRENT_USER.name);
    onClose();
  };

  return (
    <>
      <div className="absolute inset-0 bg-black/60 z-40 animate-in fade-in duration-200" onClick={handleClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-full duration-300">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h3 className="font-medium text-[16px] text-gray-900">ثبت کارت جدید</h3>
          <button onClick={handleClose} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition">
            <X size={18} />
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-[12px] font-medium text-[#527DA3] mb-1.5">{platform.formLabels.desc}</label>
            <textarea
              value={form.desc}
              onChange={(e) => setForm({ ...form, desc: e.target.value })}
              placeholder={platform.formLabels?.descPlaceholder || 'جزئیات بیشتری که باید بدانند...'}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] min-h-[100px] resize-none focus:outline-none focus:border-[#527DA3] transition"
            />
          </div>
          {platform.formLabels.image && (
            <div>
              <label className="block text-[12px] font-medium text-[#527DA3] mb-1.5">{platform.formLabels.image}</label>
              <button
                onClick={() => setForm({ ...form, hasImage: !form.hasImage })}
                className={`w-full border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition ${
                  form.hasImage ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                {form.hasImage ? (
                  <>
                    <CheckCircle2 size={24} className="text-green-500" />
                    <span className="text-[12px] text-green-600 font-medium">تصویر پیوست شد</span>
                  </>
                ) : (
                  <>
                    <ImageIcon size={24} className="text-gray-400" />
                    <span className="text-[12px] text-gray-500 font-medium">برای انتخاب فایل ضربه بزنید (اختیاری)</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
        <div className="p-4 pt-2 border-t border-gray-100 bg-white">
          <button
            onClick={handleSubmit}
            disabled={!form.desc.trim()}
            className={`w-full py-3 rounded-xl font-medium text-[15px] transition-all transform active:scale-[0.98] ${
              form.desc.trim() ? 'bg-[#527DA3] text-white shadow-md' : 'bg-gray-100 text-gray-400 pointer-events-none'
            }`}
          >
            یاعلی، ثبت و ارسال
          </button>
        </div>
      </div>
    </>
  );
}
