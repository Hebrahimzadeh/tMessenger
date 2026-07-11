'use client';

import { useState } from 'react';

interface Diagnosis {
  name: string;
  severity: number;
  region: string;
  detail: string;
}

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

const DIAGNOSES: Diagnosis[] = [
  { name: 'کبد چرب', severity: 75, region: 'بخش میانی (طحال و معده)', detail: 'غلبه شدید صفرا و بلغم، تجمع سموم در کبد' },
  { name: 'سنگ کلیه چپ', severity: 15, region: 'بخش انتهایی (کلیه چپ)', detail: 'مستعد رسوب سودا در کلیه' },
  { name: 'غلبه سردی و تری (بلغم)', severity: 60, region: 'کل زبان (پوشش سفید)', detail: 'غلبه رطوبت بدنی و سردی گوارش' },
];

export function TebMiniApp({ onTransfer }: { onTransfer: (form: NewCardForm) => void }) {
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleStartScan = () => {
    setScanState('scanning');
    setTimeout(() => setScanState('done'), 3000);
  };

  const transferTebToForm = () => {
    if (selectedIndex === null) return;
    const diag = DIAGNOSES[selectedIndex];
    const text = `📋 گزارش غربالگری زبان طب سنتی:\n⚠️ عارضه بررسی شده: ${diag.name} با شدت ${diag.severity}٪\n🎯 موقعیت زبان: ${diag.region}\n💬 تحلیل اولیه: ${diag.detail}\n\n❓ درخواست مشاوره: از اساتید، طبیبان و اطباء گرامی طب سنتی تقاضا دارم جهت برطرف نمودن این عارضه، اصلاح تغذیه، دستور پخت یا نسخه‌های سنتی بنده را راهنمایی فرمایند.`;
    onTransfer({ title: `مشاوره عارضه ${diag.name}`, desc: text, hasImage: false });
  };

  return (
    <div className="space-y-4">
      {scanState === 'idle' && (
        <div className="flex flex-col items-center justify-center p-6 bg-gray-50 border border-dashed border-gray-300 rounded-2xl gap-4">
          <div className="w-24 h-24 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-16 h-16 fill-red-400 opacity-60">
              <path d="M50,10 C20,10 10,40 10,70 C10,90 30,95 50,95 C70,95 90,90 90,70 C90,40 80,10 50,10 Z M50,90 C35,90 20,85 20,70 C20,45 35,20 50,20 C65,20 80,45 80,70 C80,85 65,90 50,90 Z" />
            </svg>
          </div>
          <div className="text-center">
            <h4 className="font-bold text-gray-800 text-[14px]">بارگذاری عکس زبان</h4>
            <p className="text-[11px] text-gray-500 mt-1 leading-normal max-w-[240px]">
              تصویر زبان را در نور طبیعی اتاق و بدون زردی دوربین بگیرید تا چارت‌های تشخیصی مشخص شوند.
            </p>
          </div>
          <button
            onClick={handleStartScan}
            className="bg-[#527DA3] hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl text-[13px] shadow transition active:scale-[0.98]"
          >
            شروع اسکن هوشمند زبان
          </button>
        </div>
      )}

      {scanState === 'scanning' && (
        <div className="flex flex-col items-center justify-center p-8 bg-blue-50/30 border border-blue-100 rounded-2xl gap-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#527DA3]/10 to-transparent animate-[pulse_1.5s_infinite] pointer-events-none" />
          <div className="w-24 h-24 rounded-full bg-red-100 border-2 border-red-300 flex items-center justify-center relative overflow-hidden">
            <svg viewBox="0 0 100 100" className="w-16 h-16 fill-red-400">
              <path d="M50,10 C20,10 10,40 10,70 C10,90 30,95 50,95 C70,95 90,90 90,70 C90,40 80,10 50,10 Z M50,90 C35,90 20,85 20,70 C20,45 35,20 50,20 C65,20 80,45 80,70 C80,85 65,90 50,90 Z" />
            </svg>
            <div className="absolute left-0 right-0 h-1 bg-blue-500 top-0 animate-[bounce_2s_infinite]" />
          </div>
          <div className="text-center z-10">
            <h4 className="font-bold text-blue-900 text-[14px]">در حال تجزیه و تحلیل عکس زبان توسط هوش مصنوعی...</h4>
            <p className="text-[11px] text-blue-600 mt-1">بررسی بار زبان، رنگ لبه‌ها، علائم سودا و بلغم اندام‌ها</p>
          </div>
          <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
            <div className="bg-[#527DA3] h-full w-[70%]" />
          </div>
        </div>
      )}

      {scanState === 'done' && (
        <div className="space-y-4 animate-in fade-in">
          <div className="bg-green-50 border border-green-100 p-3 rounded-2xl text-[12px] text-green-800 font-medium leading-relaxed">
            🎉 <strong>اسکن با موفقیت به پایان رسید.</strong> عارضه‌های تشخیص داده شده در زیر آمده است. برای ارسال به بستر،{' '}
            <strong>روی یکی از موارد ضربه بزنید</strong> تا جزئیات و درمان آن را با اساتید به اشتراک بگذارید.
          </div>

          <div className="space-y-2.5">
            {DIAGNOSES.map((d, index) => (
              <div
                key={index}
                onClick={() => setSelectedIndex(index)}
                className={`p-3.5 rounded-2xl border text-right transition cursor-pointer ${
                  selectedIndex === index ? 'border-green-500 bg-green-50/50 shadow-sm' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-gray-800 text-[13px]">{d.name}</span>
                  <span className="text-[12px] font-bold text-red-600">{d.severity}٪ احتمال</span>
                </div>
                <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden mb-2">
                  <div className="bg-red-500 h-full rounded-full" style={{ width: `${d.severity}%` }} />
                </div>
                <div className="text-[11px] text-gray-500 flex justify-between">
                  <span>موقعیت: {d.region}</span>
                  <span className="underline text-green-700">کلیک برای انتخاب عارضه</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-amber-50 border border-amber-100 p-3.5 rounded-2xl text-[11px] leading-relaxed text-amber-800">
            ⚠️ <strong>سلب مسئولیت پزشکی:</strong> این اسکن صرفاً یک شبیه‌سازی آموزشی بر اساس کانتکست طب سنتی است و نباید برای خوددرمانی
            استفاده شود. حتماً عارضه را در بستر با اطباء مطرح کنید و حضوری به طبیب مراجعه نمایید.
          </div>

          <button
            onClick={transferTebToForm}
            disabled={selectedIndex === null}
            className={`w-full py-3.5 rounded-xl font-bold text-[15px] shadow-sm transition active:scale-[0.98] ${
              selectedIndex !== null ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 pointer-events-none'
            }`}
          >
            {selectedIndex !== null ? `اشتراک‌گذاری و مشورت درباره «${DIAGNOSES[selectedIndex].name}»` : 'یک عارضه را برای مشورت کلیک کنید'}
          </button>
        </div>
      )}
    </div>
  );
}
