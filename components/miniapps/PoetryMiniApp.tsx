'use client';

import { useState } from 'react';
import { Sparkles } from '@/components/icons';
import { useGemini } from '@/hooks/useGemini';

const POETRY_STYLES = ['غزل', 'قصیده', 'مثنوی', 'دوبیتی'];

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

export function PoetryMiniApp({ onTransfer }: { onTransfer: (form: NewCardForm) => void }) {
  const { generate } = useGemini();
  const [hemistichs, setHemistichs] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState(POETRY_STYLES[0]);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGeneratePoem = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    try {
      const sysPrompt = `تو استاد شعر و غزل‌سرای بزرگ فارسی هستی. کاربر یک موضوع و قالب از تو می‌خواهد.
باید دقیقا یک شعر با ۴ مصرع (۲ بیت) به زبان فارسی بسرایی.
بین هر مصرع باید علامت پایپ (|) قرار دهی.
خروجی فقط و فقط باید به این صورت باشد و هیچ توضیح، سلام، خداحافظی یا حاشیه‌ای نداشته باشد.
مثال:
توانا بود هر که دانا بود|ز دانش دل پیر برنا بود|به دانش فزای و به یزدان گرای|که او باد جان تو را رهنمای`;
      const userPrompt = `شعر در قالب ${style} با موضوع: ${prompt}`;
      const rawText = await generate(userPrompt, sysPrompt);

      const parts = rawText.split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        setHemistichs(parts);
      } else {
        const splitLines = rawText.split('\n').map((s) => s.trim()).filter((s) => s.length > 3);
        setHemistichs(splitLines);
      }
    } catch {
      setError('سرودن شعر با خطا مواجه شد. دوباره تلاش کنید.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateHemistich = async (index: number) => {
    setLoadingIndex(index);
    try {
      const context = hemistichs.map((h, i) => (i === index ? '[مصرع مورد نظر برای بازسازی]' : h)).join('\n');
      const sysPrompt = `تو استاد شعر هستی. در شعر زیر (قالب: ${style}، موضوع: ${prompt})، مصرع شماره ${index + 1} را دوباره بساز به گونه‌ای که با مصرع‌های دیگر از نظر وزن و قافیه کاملاً هماهنگ باشد.
فقط و فقط مصرع جدید را بنویس، بدون هیچ بخش یا متن اضافی. هیچ علامتی مانند دونقطه یا پرانتز در جواب اضافه نکن.`;
      const userPrompt = `شعر فعلی:\n${context}\n\nلطفاً فقط مصرع شماره ${index + 1} را بازسازی کن و آن را بفرست.`;
      const result = await generate(userPrompt, sysPrompt);
      const newHemistichs = [...hemistichs];
      newHemistichs[index] = result.trim().replace(/"/g, '').replace(/مصرع \d+:/g, '').trim();
      setHemistichs(newHemistichs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingIndex(null);
    }
  };

  const handleHemistichChange = (index: number, value: string) => {
    const newHemistichs = [...hemistichs];
    newHemistichs[index] = value;
    setHemistichs(newHemistichs);
  };

  const transferPoemToForm = () => {
    if (hemistichs.length === 0) return;
    let formattedPoem = `📜 سروده جدید در قالب ${style} با موضوع ${prompt}:\n\n`;
    for (let i = 0; i < hemistichs.length; i += 2) {
      const m1 = hemistichs[i] || '...';
      const m2 = hemistichs[i + 1] || '...';
      formattedPoem += `🔸 ${m1}  /  ${m2}\n`;
    }
    formattedPoem += `\n✍️ اثری مشترک از شاعر و همیار هوشمند شعر محله.`;
    onTransfer({ title: `سروده ${style} در وصف ${prompt.substring(0, 15)}`, desc: formattedPoem, hasImage: false });
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-2xl text-[13px] leading-relaxed text-gray-700">
        موضوع یا بیت اول را بنویسید تا همیار شعر، ابیاتی موزون بسازد. سپس می‌توانید مصرع‌ها را دستی ویرایش کرده یا هر مصرع را جداگانه ریجنریت کنید.
      </div>

      {hemistichs.length === 0 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {POETRY_STYLES.map((s) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={`py-2 text-[12px] font-bold rounded-xl border transition ${
                  style === s ? 'border-[#527DA3] bg-blue-50 text-[#527DA3]' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-bold text-[#527DA3] mr-1">موضوع شعر یا مصرع اول برای الهام:</label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="مثلاً: در وصف فداکاری آتش‌نشانان یا یا امام رضا..."
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-[14px] focus:outline-none focus:border-[#527DA3] focus:bg-white transition"
            />
          </div>

          <button
            onClick={handleGeneratePoem}
            disabled={loading || !prompt.trim()}
            className={`w-full py-3 rounded-xl font-bold text-[14px] transition flex items-center justify-center gap-2 ${
              prompt.trim() && !loading ? 'bg-[#527DA3] text-white shadow active:scale-[0.98]' : 'bg-gray-100 text-gray-400 pointer-events-none'
            }`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                <span>در حال سرودن شعر هوشمند...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>سرودن ابیات</span>
              </>
            )}
          </button>
          {error && <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-[12px] font-bold">⚠️ {error}</div>}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3.5 max-h-[300px] overflow-y-auto">
            {hemistichs.map((h, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-[#527DA3] w-6 text-center">{index + 1}.</span>
                <input
                  type="text"
                  value={h}
                  onChange={(e) => handleHemistichChange(index, e.target.value)}
                  className="flex-1 bg-white border border-gray-150 rounded-xl px-2.5 py-1.5 text-[13px] text-gray-800 focus:outline-none focus:border-[#527DA3]"
                />
                <button
                  onClick={() => handleRegenerateHemistich(index)}
                  disabled={loadingIndex !== null}
                  className={`p-1.5 rounded-full hover:bg-blue-50 border border-gray-200 transition ${
                    loadingIndex === index ? 'bg-blue-100' : 'bg-white text-gray-500'
                  }`}
                  title="بازسازی این مصرع با هوش مصنوعی"
                >
                  {loadingIndex === index ? (
                    <div className="w-4 h-4 border-2 border-[#527DA3] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2">
                      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l.56-.56" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setHemistichs([])}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3.5 rounded-xl text-[14px] transition active:scale-[0.98]"
            >
              شعر جدید
            </button>
            <button
              onClick={transferPoemToForm}
              className="flex-[2] bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl text-[14px] shadow-sm transition active:scale-[0.98]"
            >
              تایید و انتقال شعر
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
