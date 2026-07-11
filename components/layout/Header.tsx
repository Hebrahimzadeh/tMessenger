'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search, MessageCircle, Layers, MessageSquare } from '@/components/icons';
import { useUI } from '@/hooks/useUI';
import { useChats } from '@/hooks/useChats';
import { usePlatforms } from '@/hooks/usePlatforms';
import { INITIAL_GLOBAL_COMMENTS } from '@/lib/data/seed';

export function Header() {
  const pathname = usePathname();
  const { openDrawer } = useUI();
  const { chats } = useChats();
  const { platforms } = usePlatforms();

  const activeTab =
    pathname === '/' ? 'platforms' : pathname.startsWith('/chats') ? 'chats' : pathname.startsWith('/comments') ? 'comments' : null;

  const tabs = [
    { id: 'chats', href: '/chats', label: 'گفتگوها', icon: MessageCircle, count: chats.reduce((a, c) => a + c.unread, 0) },
    { id: 'platforms', href: '/', label: 'بسترها', icon: Layers, count: platforms.reduce((a, c) => a + c.unreadCount, 0) },
    {
      id: 'comments',
      href: '/comments',
      label: 'مشارکت‌ها',
      icon: MessageSquare,
      count: INITIAL_GLOBAL_COMMENTS.reduce((a, c) => a + c.unread, 0),
    },
  ];

  return (
    <div className="bg-[#527DA3] text-white shadow-sm z-10 flex flex-col shrink-0">
      <div className="flex items-center justify-between p-3 h-[52px]">
        <div className="flex items-center gap-4">
          <button onClick={openDrawer} className="p-1 hover:bg-white/10 rounded-full transition">
            <Menu size={22} />
          </button>
          <h1 className="text-[17px] font-medium tracking-wide">تعاون</h1>
        </div>
        <button className="p-1 hover:bg-white/10 rounded-full transition">
          <Search size={20} />
        </button>
      </div>
      <div className="flex text-[13px] font-medium px-2 overflow-x-auto hide-scrollbar [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={`relative flex items-center gap-1.5 px-4 py-2.5 whitespace-nowrap transition-colors ${
              activeTab === tab.id ? 'text-white' : 'text-[#B0CBE1] hover:text-white'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-white text-[#527DA3]' : 'bg-[#B0CBE1] text-[#527DA3]'
                }`}
              >
                {tab.count}
              </span>
            )}
            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white rounded-t-md" />}
          </Link>
        ))}
      </div>
    </div>
  );
}
