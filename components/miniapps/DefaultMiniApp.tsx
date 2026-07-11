'use client';

import { useState } from 'react';
import { ArrowRight, Sparkles } from '@/components/icons';
import { useGemini } from '@/hooks/useGemini';
import type { Platform } from '@/lib/types';

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

export function DefaultMiniApp({ platform, onTransfer }: { platform: Platform; onTransfer: (form: NewCardForm) => void }) {
  const { generate } = useGemini();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setOutput('');
    try {
      const systemPrompt = platform.miniappConfig?.systemInstruction || 'متن ورودی کاربر را ویرایش و به شکل زیبایی فرمت کن.';
      const resultText = await generate(input, systemPrompt);
      setOutput(resultText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در برقراری ارتباط با جمینای.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50/50 border border-blue-100/50 p-3.5 rounded-2xl text-[13px] leading-relaxed text-gray-700 shadow-sm flex items-start gap-2.5">
        <Sparkles size={18} className="text-[#527DA3] shrink-0 mt-0.5" />
        <span>
          به دستیار هوش مصنوعی بستر <strong>«{platform.name}»</strong> خوش آمدید. ایده یا نیازمندی خود را بنویسید تا هوش مصنوعی متن کارت
          شما را به صورت حرفه‌ای تنظیم کند.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-bold text-[#527DA3] mr-1">توضیح کوتاه یا ایده شما:</label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={platform.miniappConfig?.placeholder || 'ایده خود را بنویسید...'}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] min-h-[90px] resize-none focus:outline-none focus:border-[#527DA3] focus:bg-white transition"
          rows={3}
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !input.trim()}
        className={`w-full py-3 rounded-xl font-bold text-[14px] transition-all flex items-center justify-center gap-2 ${
          input.trim() && !loading ? 'bg-[#527DA3] text-white shadow-md active:scale-[0.98]' : 'bg-gray-100 text-gray-400 pointer-events-none'
        }`}
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span>در حال تولید محتوا توسط جمینای...</span>
          </>
        ) : (
          <>
            <Sparkles size={16} />
            <span>تولید هوشمند محتوا</span>
          </>
        )}
      </button>

      {error && <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-[12px] font-bold">⚠️ {error}</div>}

      {output && (
        <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
          <label className="text-[12px] font-bold text-green-700 mr-1">پیش‌نویس تولید شده (قابل ویرایش):</label>
          <textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            className="w-full bg-green-50/20 border border-green-200 rounded-xl px-3 py-2.5 text-[14px] min-h-[160px] resize-none focus:outline-none focus:border-green-500 focus:bg-white transition leading-relaxed text-gray-800"
            rows={6}
          />
        </div>
      )}

      <button
        onClick={() => {
          if (output.trim()) onTransfer({ title: '', desc: output, hasImage: false });
        }}
        disabled={!output.trim()}
        className={`w-full py-3.5 rounded-xl font-bold text-[15px] shadow-md transition-transform active:scale-[0.98] flex items-center justify-center gap-2 mt-auto ${
          output.trim() ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 pointer-events-none'
        }`}
      >
        <span>انتقال به فرم ثبت کارت</span>
        <ArrowRight size={18} className="rtl:-scale-x-100" />
      </button>
    </div>
  );
}
