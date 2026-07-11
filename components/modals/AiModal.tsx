'use client';

import { ArrowRight, CheckCheck, Sparkles, X } from '@/components/icons';
import { useUI } from '@/hooks/useUI';
import { useAiCopilot } from '@/hooks/useAiCopilot';

const processingMessages = [
  'دارم به دغدغه‌ات فکر می‌کنم...',
  'مسیر حل این مسئله رو تو ذهنم کشیدم...',
  'دارم می‌گردم ببینم کجاها می‌تونیم آدم‌ها رو به هم وصل کنیم تا کار دربیاد...',
];

export function AiModal() {
  const { showAiModal } = useUI();
  const {
    aiFlowState,
    aiInputText,
    setAiInputText,
    processingMessageIdx,
    selectedSuggestion,
    generatedSuggestions,
    beginProcessing,
    chooseSuggestion,
    createPlatform,
    activateMiniapp,
    closeModal,
  } = useAiCopilot();

  if (!showAiModal) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/60 animate-in fade-in duration-300"
        onClick={() => {
          if (aiFlowState === 'initial' || aiFlowState === 'suggestions') closeModal();
        }}
      />
      <div className="relative bg-white w-full h-[88vh] rounded-t-[24px] shadow-2xl flex flex-col animate-in slide-in-from-bottom-full duration-300 overflow-hidden">
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="text-[16px] font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="text-amber-500" size={20} /> همیار هوشمند تعاون
          </h3>
          <button onClick={closeModal} className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 pb-8 flex flex-col relative bg-[#f9fafb]">
          {aiFlowState === 'initial' && (
            <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="bg-white p-4 rounded-2xl rounded-tr-sm text-gray-800 text-[14px] font-medium leading-relaxed mb-6 shadow-sm border border-gray-100">
                سلام رفیق! چقدر خوب شد اومدی. بگو چه دغدغه‌ای داری یا چه گره‌ای تو کارِ محله و هیئت افتاده تا با هم یه جمعی رو برای باز
                کردنش پای کار بیاریم؟
              </div>
              <textarea
                value={aiInputText}
                onChange={(e) => setAiInputText(e.target.value)}
                placeholder="مثلاً بنویس: بچه‌های محل برای برپایی موکب فاطمیه، نیاز به داربست و پارچه مشکی دارن..."
                className="w-full flex-1 bg-white border border-gray-200 rounded-2xl p-4 text-[15px] font-medium focus:outline-none focus:border-[#527DA3] focus:ring-2 focus:ring-[#527DA3]/20 transition-all resize-none shadow-inner text-gray-800"
              />
              <button
                disabled={!aiInputText.trim()}
                onClick={beginProcessing}
                className={`mt-4 w-full py-4 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                  aiInputText.trim() ? 'bg-[#527DA3] text-white shadow-md' : 'bg-gray-200 text-gray-400 pointer-events-none'
                }`}
              >
                بریم برای شروع <ArrowRight size={18} className="rtl:-scale-x-100" />
              </button>
            </div>
          )}
          {aiFlowState === 'processing' && (
            <div className="flex flex-col items-center justify-center h-full text-center animate-in fade-in duration-300">
              <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-60"></div>
                <div className="absolute inset-0 bg-gradient-to-tr from-[#527DA3] to-blue-400 rounded-full flex items-center justify-center shadow-lg">
                  <Sparkles size={36} className="text-white animate-pulse" strokeWidth={1.5} />
                </div>
              </div>
              <div className="h-10 overflow-hidden flex items-center justify-center px-4">
                <p
                  key={processingMessageIdx}
                  className="text-[#527DA3] font-bold text-[15px] animate-in slide-in-from-bottom-5 fade-in duration-300 text-center leading-relaxed"
                >
                  {processingMessages[processingMessageIdx]}
                </p>
              </div>
            </div>
          )}
          {aiFlowState === 'suggestions' && (
            <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-10 duration-500">
              <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tr-sm text-gray-800 text-[14px] font-medium leading-relaxed mb-5 shadow-sm shrink-0">
                مسیر کار رو بررسی کردم. برای باز کردن این گره، تو این نقاط می‌تونیم یه جمع (بستر) راه بندازیم. خودت ببین الان کدومش
                بیشتر به کار میاد:
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 pb-4">
                {generatedSuggestions.map((sug) => (
                  <div key={sug.id} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-5 transition-all hover:border-[#527DA3]">
                    <h4 className="font-bold text-[16px] text-gray-900 mb-2.5">{sug.title}</h4>
                    <div className="bg-blue-50/70 text-[#527DA3] text-[12px] font-bold px-3 py-1.5 rounded-lg inline-block mb-3 border border-blue-100/50">
                      {sug.connects}
                    </div>
                    <p className="text-[13px] text-gray-600 font-medium leading-relaxed mb-5">{sug.desc}</p>
                    <button
                      onClick={() => chooseSuggestion(sug)}
                      className="w-full bg-gray-50 hover:bg-[#527DA3] hover:text-white text-[#527DA3] font-bold py-3 rounded-xl text-[14px] transition-colors border border-gray-200"
                    >
                      همینو می‌خوام
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {aiFlowState === 'confirmation' && (
            <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-300 justify-between">
              <div>
                <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-sm mx-auto">
                  <CheckCheck size={48} />
                </div>
                <div className="bg-white border border-gray-100 p-6 rounded-2xl text-gray-800 text-[15px] font-medium leading-relaxed mb-5 shadow-sm text-center">
                  ایول، انتخاب خیلی به‌جایی بود! بستر <strong className="text-[#527DA3]">«{selectedSuggestion?.title}»</strong> رو برات
                  آماده کردم.
                  <br />
                  <br />
                  فقط یادت باشه، تو الان موسس و خادم این جمعی؛ نیت کن و با این دکمه بریم برای مرحله بعد!
                </div>
              </div>
              <button
                onClick={createPlatform}
                className="w-full bg-gradient-to-r from-[#4CAF50] to-[#45a049] text-white py-4 rounded-xl font-bold text-[16px] flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
              >
                ساخت بستر و ادامه <ArrowRight size={20} className="rtl:-scale-x-100" />
              </button>
            </div>
          )}
          {aiFlowState === 'upgrade_offer' && (
            <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-300 justify-between">
              <div>
                <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6 shadow-sm mx-auto animate-bounce">
                  <Sparkles size={36} className="text-[#527DA3]" />
                </div>
                <div className="bg-white border border-gray-100 p-6 rounded-2xl text-gray-800 text-[14px] font-medium leading-relaxed mb-5 shadow-sm text-center">
                  بستر <strong className="text-[#527DA3]">«{selectedSuggestion?.title}»</strong> با موفقیت ساخته شد!
                  <br />
                  <br />
                  آیا مایلید برای ارتقای بستر، <strong>دستیار هوشمند تولید محتوای تخصصی (مینی‌اپ هوش مصنوعی متصل به جمینای)</strong>{' '}
                  متناسب با واحد ارزش این بستر برای آن ساخته شود؟
                </div>
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={activateMiniapp}
                  className="w-full bg-[#527DA3] hover:bg-blue-700 text-white py-3.5 rounded-xl font-bold text-[15px] shadow-md transition-all active:scale-[0.98]"
                >
                  🚀 بله، دستیار هوشمند فعال شود
                </button>
                <button
                  onClick={closeModal}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 py-3 rounded-xl font-medium text-[14px] transition-colors"
                >
                  خیر، ورود معمولی به بستر
                </button>
              </div>
            </div>
          )}
          {aiFlowState === 'upgrade_success' && (
            <div className="flex flex-col h-full animate-in fade-in zoom-in-95 duration-300 justify-between text-center">
              <div>
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-sm mx-auto">
                  <CheckCheck size={40} />
                </div>
                <div className="bg-white border border-gray-100 p-6 rounded-2xl text-gray-800 text-[14px] font-medium leading-relaxed mb-5 shadow-sm text-center">
                  تبریک! دستیار هوشمند با موفقیت ساخته شد و به بستر متصل گردید.
                  <br />
                  <br />
                  اکنون شما و کاربران بستر می‌توانید با کلیک روی آیکن سنجاق، از هوش مصنوعی جمینای برای ساخت کارتهای واحد ارزش استفاده
                  کنید.
                </div>
              </div>
              <button
                onClick={closeModal}
                className="w-full bg-gradient-to-r from-[#4CAF50] to-[#45a049] text-white py-4 rounded-xl font-bold text-[16px] flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 animate-pulse"
              >
                ورود به بستر هوشمند شده
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
