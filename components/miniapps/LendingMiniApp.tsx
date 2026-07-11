'use client';

import { useState } from 'react';
import { Layers, Sparkles, Wrench } from '@/components/icons';

const TOOLS = [
  { id: 'drill', name: 'دریل شارژی رونیکس', icon: Wrench, category: 'ابزار برقی' },
  { id: 'ladder', name: 'نردبان دوطرفه ۴ متری', icon: Layers, category: 'تجهیزات عمومی' },
  { id: 'welder', name: 'دستگاه جوش اینورتر', icon: Sparkles, category: 'ابزار برقی' },
  { id: 'saw', name: 'اره برقی درخت‌بری', icon: Wrench, category: 'ابزار باغبان' },
  { id: 'mower', name: 'چمن‌زن دستی حیاط', icon: Sparkles, category: 'ابزار باغبان' },
];

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

export function LendingMiniApp({ onTransfer }: { onTransfer: (form: NewCardForm) => void }) {
  const [selectedTool, setSelectedTool] = useState<(typeof TOOLS)[number] | null>(null);
  const [days, setDays] = useState(2);
  const [agreed, setAgreed] = useState(false);

  const transferToolToForm = () => {
    if (!selectedTool || !agreed) return;
    const text = `🔧 درخواست امانت ابزار: ${selectedTool.name} (${selectedTool.category})\n📅 مدت زمان نیاز: ${days} روز\n🤝 تعهدنامه امانتداری امضا شد: متعهد می‌شوم ابزار را سالم، تمیز و راس موعد بازگردانم.`;
    onTransfer({ title: `امانت ${selectedTool.name}`, desc: text, hasImage: false });
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-2xl text-[13px] leading-relaxed text-gray-700">
        دستگاه یا ابزار مورد نیاز خود را انتخاب کنید، مدت زمان و تعهدنامه را پر کنید تا کارت رزرو شما آماده شود.
      </div>
      <div>
        <label className="text-[12px] font-bold text-[#527DA3] block mb-2 mr-1">ابزارهای قابل رزرو محله:</label>
        <div className="grid grid-cols-2 gap-2.5">
          {TOOLS.map((t) => {
            const ToolIcon = t.icon;
            return (
              <div
                key={t.id}
                onClick={() => setSelectedTool(t)}
                className={`p-3 rounded-2xl border text-right cursor-pointer transition-all ${
                  selectedTool?.id === t.id ? 'border-[#527DA3] bg-blue-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                }`}
              >
                <div className="w-9 h-9 bg-white shadow-sm rounded-xl flex items-center justify-center text-[#527DA3] mb-2">
                  <ToolIcon size={18} />
                </div>
                <div className="text-[12px] font-bold text-gray-800">{t.name}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{t.category}</div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedTool && (
        <div className="space-y-3 animate-in fade-in">
          <div className="bg-gray-50 border border-gray-150 p-3.5 rounded-2xl flex items-center justify-between">
            <span className="text-[12px] font-bold text-gray-700">مدت زمان امانت (روز):</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setDays((d) => Math.max(1, d - 1))}
                className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 font-bold hover:bg-gray-100"
              >
                -
              </button>
              <span className="text-[14px] font-bold text-gray-800">{days} روز</span>
              <button
                onClick={() => setDays((d) => d + 1)}
                className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 font-bold hover:bg-gray-100"
              >
                +
              </button>
            </div>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-50/60 border border-amber-100/50 cursor-pointer select-none">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
            <span className="text-[11px] text-amber-800 leading-normal font-bold">
              تعهدنامه اخلاقی: متعهد می‌شوم ابزار را تمیز، بدون آسیب و در موعد مقرر به انبار امانات عودت دهم.
            </span>
          </label>

          <button
            onClick={transferToolToForm}
            disabled={!agreed}
            className={`w-full py-3.5 rounded-xl font-bold text-[15px] shadow-sm transition active:scale-[0.98] mt-3 ${
              agreed ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 pointer-events-none'
            }`}
          >
            انتقال به فرم ثبت کارت
          </button>
        </div>
      )}
    </div>
  );
}
