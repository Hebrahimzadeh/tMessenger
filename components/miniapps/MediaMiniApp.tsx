'use client';

import { useState } from 'react';

const PROJ_TYPES = ['تدوین ویدیو کوتاه', 'طراحی کاور و گرافیک', 'نویسندگی و سناریو', 'تولید پادکست تربیتی'];

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

export function MediaMiniApp({ onTransfer }: { onTransfer: (form: NewCardForm) => void }) {
  const [projType, setProjType] = useState(PROJ_TYPES[0]);
  const [projDesc, setProjDesc] = useState('');
  const [projDeadline, setProjDeadline] = useState('۳ روز آینده');
  const [projReward, setProjReward] = useState('دعای خیر و کار داوطلبانه متقابل');

  const transferMediaToForm = () => {
    if (!projDesc.trim()) return;
    const text = `🎬 بریف پروژه رسانه‌ای مادران:\n🔹 نوع کار: ${projType}\n🎯 شرح کار و اهداف: ${projDesc}\n⏳ مهلت تحویل پروژه: ${projDeadline}\n🎁 نحوه جبران زحمات همیاران: ${projReward}`;
    onTransfer({ title: `پروژه ${projType}`, desc: text, hasImage: false });
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-2xl text-[13px] leading-relaxed text-gray-700">
        با وارد کردن مشخصات زیر، بریف پروژه خود را جهت جذب تدوین‌گر یا طراح رسانه‌ای در بستر منتشر کنید.
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[12px] font-bold text-[#527DA3] block mb-1.5 mr-1">نوع تخصص مورد نیاز:</label>
          <div className="grid grid-cols-2 gap-2">
            {PROJ_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setProjType(t)}
                className={`py-2 px-3 text-[12px] font-bold rounded-xl border transition ${
                  projType === t ? 'border-[#527DA3] bg-blue-50 text-[#527DA3]' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[12px] font-bold text-[#527DA3] mr-1">شرح کار، موضوع و سناریو:</label>
          <textarea
            value={projDesc}
            onChange={(e) => setProjDesc(e.target.value)}
            placeholder="مثلاً: راش‌های ویدیویی کلاس استاد را در ۵ دقیقه تدوین و زیرنویس کنید..."
            className="w-full bg-gray-50 border border-gray-205 rounded-xl px-3 py-2 text-[13px] min-h-[80px] focus:outline-none focus:border-[#527DA3] focus:bg-white transition leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-bold text-[#527DA3] mr-1">مهلت تحویل پروژه:</label>
            <input
              type="text"
              value={projDeadline}
              onChange={(e) => setProjDeadline(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#527DA3] focus:bg-white transition"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-bold text-[#527DA3] mr-1">نحوه جبران زحمات:</label>
            <input
              type="text"
              value={projReward}
              onChange={(e) => setProjReward(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-[#527DA3] focus:bg-white transition"
            />
          </div>
        </div>

        <button
          onClick={transferMediaToForm}
          disabled={!projDesc.trim()}
          className={`w-full py-3.5 rounded-xl font-bold text-[15px] shadow-md transition active:scale-[0.98] mt-3 ${
            projDesc.trim() ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-400 pointer-events-none'
          }`}
        >
          ایجاد بریف پروژه و انتقال
        </button>
      </div>
    </div>
  );
}
