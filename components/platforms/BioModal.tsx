'use client';

import { useState } from 'react';
import { ArrowRight, Check, ChevronDown, Copy, Link2, LogOut, PlayCircle, Sparkles, User, X } from '@/components/icons';
import type { Platform } from '@/lib/types';

export function BioModal({
  isOpen,
  onClose,
  platform,
  isCreator,
  bioTab,
  onBioTabChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  platform: Platform;
  isCreator: boolean;
  bioTab: 'info' | 'dev';
  onBioTabChange: (tab: 'info' | 'dev') => void;
}) {
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const [copiedCard, setCopiedCard] = useState(false);

  if (!isOpen) return null;

  const PlatformIcon = platform.icon;

  const handleCopyCard = () => {
    try {
      const el = document.createElement('textarea');
      el.value = '6037998143218765';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    } catch {
      // clipboard copy is best-effort
    }
    setCopiedCard(true);
    setTimeout(() => setCopiedCard(false), 2000);
  };

  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex flex-col items-center justify-end sm:justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-white w-full h-[90vh] sm:h-[80vh] sm:rounded-2xl rounded-t-2xl overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-full">
        <div className="bg-[#527DA3] p-4 flex items-center justify-between shrink-0 text-white">
          <h2 className="font-medium text-[16px]">بیوگرافی بستر</h2>
          <button onClick={onClose} className="hover:bg-white/10 rounded-full p-1.5 transition">
            <X size={20} />
          </button>
        </div>

        {isCreator && (
          <div className="flex bg-white border-b border-gray-200 shrink-0">
            <button
              onClick={() => onBioTabChange('info')}
              className={`flex-1 py-3 text-[13px] font-medium transition-colors ${
                bioTab === 'info' ? 'text-[#527DA3] border-b-2 border-[#527DA3]' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              اطلاعات
            </button>
            <button
              onClick={() => onBioTabChange('dev')}
              className={`flex-1 py-3 text-[13px] font-medium transition-colors flex justify-center items-center gap-1.5 ${
                bioTab === 'dev' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Sparkles size={14} /> توسعه بستر
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto bg-gray-50">
          {(!isCreator || bioTab === 'info') && (
            <div className="p-5">
              <div className="flex flex-col items-center mb-6">
                <div className="w-20 h-20 bg-blue-50 text-[#527DA3] rounded-3xl flex items-center justify-center shadow-sm mb-3 border border-blue-100">
                  <PlatformIcon size={40} strokeWidth={1.5} />
                </div>
                <h2 className="text-xl font-bold text-gray-900">{platform.name}</h2>
                <p className="text-[13px] text-gray-500 mt-1">تاسیس توسط: {platform.creator}</p>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[12px] font-medium text-[#527DA3] mb-1.5">درباره این تعاون</p>
                  <p className="text-[13px] text-gray-800 leading-relaxed bg-white p-3 rounded-xl border border-gray-200 shadow-sm">{platform.description}</p>
                </div>
                <div className="space-y-2 pt-2">
                  <button className="w-full flex items-center gap-3 p-3 bg-white border border-gray-200 shadow-sm rounded-xl transition hover:bg-gray-50 text-[13px] text-gray-800">
                    <Link2 size={18} className="text-[#527DA3]" />
                    <span className="flex-1 text-right">لینک دعوت بستر</span>
                    <Copy size={16} className="text-gray-400" />
                  </button>
                  <button className="w-full flex items-center gap-3 p-3 bg-white border border-gray-200 shadow-sm rounded-xl transition hover:bg-gray-50 text-[13px] text-red-500">
                    <LogOut size={18} />
                    <span className="flex-1 text-right">خروج از بستر</span>
                  </button>
                </div>

                <div className="pt-5 space-y-5 border-t border-gray-200 mt-5">
                  <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-50">
                    <p className="text-[14px] text-gray-800 leading-relaxed mb-4 text-justify font-bold">{platform.heroText}</p>
                    <div className="flex items-center justify-center gap-2 text-[12px] font-bold text-[#527DA3] bg-white py-3 px-4 rounded-xl border border-gray-200 shadow-sm">
                      <span>{platform.leftSide}</span>
                      <span className="opacity-40 mx-2 text-lg">⟷</span>
                      <span>{platform.rightSide}</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[13px] font-bold text-gray-600 mb-2.5 flex items-center gap-1.5">
                      <Sparkles size={16} /> تسهیل‌گرهای بستر
                    </h3>
                    <div className="space-y-2.5">
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition">
                        <button
                          onClick={() => setOpenAccordion(openAccordion === 'card' ? null : 'card')}
                          className="w-full p-3 flex items-center justify-between text-[13px] font-bold text-gray-800"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg">
                              <Copy size={16} />
                            </div>{' '}
                            شماره کارت صندوق تعاون
                          </div>
                          <ChevronDown size={18} className={`transform transition text-gray-400 ${openAccordion === 'card' ? 'rotate-180' : ''}`} />
                        </button>
                        {openAccordion === 'card' && (
                          <div className="p-3 bg-gray-50 border-t border-gray-200 flex flex-col gap-2.5 text-[12px] animate-in fade-in slide-in-from-top-2">
                            <div className="flex justify-between items-center bg-white border border-gray-200 p-2.5 rounded-xl shadow-sm">
                              <span className="font-mono text-[15px] text-gray-800 tracking-widest font-bold pl-2" dir="ltr">
                                ۶۰۳۷-۹۹۸۱-۴۳۲۱-۸۷۶۵
                              </span>
                              <button
                                onClick={handleCopyCard}
                                className={`p-2 rounded-lg transition flex items-center gap-1.5 ${
                                  copiedCard ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-[#527DA3] hover:bg-blue-100'
                                }`}
                              >
                                {copiedCard ? <Check size={16} /> : <Copy size={16} />}
                                {copiedCard && <span className="text-[10px] font-bold">کپی شد</span>}
                              </button>
                            </div>
                            <div className="text-gray-600 px-1 font-medium flex items-center gap-1.5">
                              <User size={14} className="text-gray-400" /> صاحب حساب: {platform.creator.replace('@', '')} (خادم بستر)
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition">
                        <button
                          onClick={() => setOpenAccordion(openAccordion === 'tut' ? null : 'tut')}
                          className="w-full p-3 flex items-center justify-between text-[13px] font-bold text-gray-800"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="bg-green-100 text-green-600 p-1.5 rounded-lg">
                              <PlayCircle size={16} />
                            </div>{' '}
                            راهنمای مشارکت امن
                          </div>
                          <ChevronDown size={18} className={`transform transition text-gray-400 ${openAccordion === 'tut' ? 'rotate-180' : ''}`} />
                        </button>
                        {openAccordion === 'tut' && (
                          <div className="p-3 bg-gray-50 border-t border-gray-200 text-[12px] text-gray-700 leading-relaxed font-medium animate-in fade-in slide-in-from-top-2">
                            برای امانت دادن یا تحویل وسایل، حتماً شماره تماس دریافت کنید و قرار را در محل‌های عمومی مثل مسجد محله بگذارید.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#1f2937] text-gray-300 p-5 rounded-2xl border-t-[4px] border-[#527DA3] shadow-md mt-2">
                    <h4 className="text-[14px] font-bold text-white mb-3">میثاق‌نامه بستر</h4>
                    <ul className="text-[12px] leading-loose opacity-90 space-y-1.5 list-disc list-inside">
                      <li>حفظ آبروی مومن خط قرمز ماست.</li>
                      <li>پیام‌های تبلیغاتی و نامرتبط ارسال نشود.</li>
                      <li>مبنای کار اخوت و برادری است.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isCreator && bioTab === 'dev' && (
            <div className="p-4 space-y-5 animate-in fade-in flex flex-col h-full pb-[100px]">
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 shrink-0">
                <h4 className="text-[14px] font-bold text-[#527DA3] mb-3 flex items-center gap-1.5">
                  <Sparkles size={16} /> موتور تعاون (بروزرسانی بستر)
                </h4>
                <div className="relative shadow-sm">
                  <input
                    type="text"
                    placeholder="به هوش مصنوعی بگویید چه چیزی را تغییر دهد..."
                    className="w-full bg-gray-50 border border-gray-300 rounded-xl py-3 pr-4 pl-12 text-[13px] focus:outline-none focus:border-[#527DA3] focus:bg-white transition"
                  />
                  <button className="absolute left-2 top-1/2 -translate-y-1/2 bg-[#527DA3] hover:bg-blue-700 text-white p-2 rounded-lg transition">
                    <ArrowRight size={16} className="rotate-180" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <h4 className="text-[13px] font-bold text-gray-500 mb-3 px-1">تایم‌لاین نسخه‌ها</h4>
                <div className="space-y-4 relative before:absolute before:right-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-200">
                  <div className="relative pr-8">
                    <div className="absolute right-1.5 top-1.5 w-3.5 h-3.5 bg-green-500 rounded-full border-[3px] border-gray-50 shadow-sm z-10" />
                    <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[13px] font-bold text-gray-800">نسخه {platform.isDraft ? 'پیشنویس' : '۱.۱'} (فعلی)</span>
                        <span className="text-[10px] text-gray-400">همین الان</span>
                      </div>
                      <p className="text-[12px] text-gray-600 mb-2">شکل‌گیری ساختار اولیه بستر</p>
                    </div>
                  </div>
                  {!platform.isDraft && (
                    <div className="relative pr-8">
                      <div className="absolute right-1.5 top-1.5 w-3.5 h-3.5 bg-gray-300 rounded-full border-[3px] border-gray-50 z-10" />
                      <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm opacity-80">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[13px] font-bold text-gray-800">نسخه ۱.۰ (پیشنویس اولیه)</span>
                          <span className="text-[10px] text-gray-400">دیروز</span>
                        </div>
                        <p className="text-[12px] text-gray-600 mb-3">ساخت توسط موتور تعاون</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
