'use client';

import { useUI } from '@/hooks/useUI';

export function PublishToast() {
  const { showPublishToast } = useUI();
  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2.5 rounded-xl shadow-2xl z-50 transition-all duration-300 flex items-center gap-2 text-[13px] ${
        showPublishToast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
      }`}
    >
      بستر منتشر شد! حالا لینک دعوت را بفرستید.
    </div>
  );
}
