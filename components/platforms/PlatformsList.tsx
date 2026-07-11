'use client';

import { useRouter } from 'next/navigation';
import { Layers, Settings } from '@/components/icons';
import { usePlatforms } from '@/hooks/usePlatforms';
import { CURRENT_USER } from '@/lib/data/seed';

export function PlatformsList() {
  const router = useRouter();
  const { platforms } = usePlatforms();

  return (
    <div className="bg-white min-h-full divide-y divide-gray-100">
      {platforms.map((platform) => {
        const amIOwner = platform.creator === CURRENT_USER.username;
        return (
          <div
            key={platform.id}
            className="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 cursor-pointer transition"
            onClick={() => router.push('/platforms/' + platform.id)}
          >
            <div className="w-14 h-14 bg-blue-50 text-[#527DA3] rounded-2xl flex items-center justify-center shrink-0">
              <Layers size={28} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-0.5">
                <h3 className="font-medium text-[15px] text-gray-900 truncate flex items-center">
                  {platform.name}
                  {amIOwner && <Settings size={18} strokeWidth={1.5} className="text-[#527DA3] mr-2 shrink-0" title="مدیریت بستر" />}
                </h3>
                {platform.unreadCount > 0 && (
                  <span className="bg-[#527DA3] text-white text-[10px] px-1.5 py-0.5 rounded-md shadow-sm whitespace-nowrap">
                    {platform.unreadCount}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-gray-500 truncate">{platform.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
