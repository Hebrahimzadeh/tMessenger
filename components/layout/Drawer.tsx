'use client';

import { User, Bookmark, Info } from '@/components/icons';
import { useUI } from '@/hooks/useUI';
import { CURRENT_USER } from '@/lib/data/seed';

export function Drawer() {
  const { isDrawerOpen, closeDrawer } = useUI();
  return (
    <>
      <div
        className={`absolute inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          isDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeDrawer}
      />
      <div
        className={`absolute top-0 right-0 h-full w-[280px] bg-white z-50 transform transition-transform duration-300 ease-out shadow-2xl flex flex-col ${
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="bg-[#527DA3] text-white p-5 pb-4 shrink-0">
          <div className="w-14 h-14 bg-[#6490B1] rounded-full flex items-center justify-center text-xl font-medium mb-3 shadow-sm border border-white/20">
            {CURRENT_USER.name.charAt(0)}
          </div>
          <h2 className="text-base font-medium leading-tight">{CURRENT_USER.name}</h2>
          <p className="text-[#B0CBE1] text-[13px] mt-0.5" dir="ltr">
            {CURRENT_USER.phone}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-2 text-[#333] font-medium text-[14px]">
          <button className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
            <User size={20} className="text-gray-500" />
            <span>پروفایل من</span>
          </button>
          <button className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
            <Bookmark size={20} className="text-gray-500" />
            <span>نشان‌شده‌ها</span>
          </button>
          <div className="h-px bg-gray-200 my-1 mx-5" />
          <button className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition">
            <Info size={20} className="text-gray-500" />
            <span>درباره سیستم تعاون</span>
          </button>
        </div>
      </div>
    </>
  );
}
