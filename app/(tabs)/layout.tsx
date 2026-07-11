import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Drawer } from '@/components/layout/Drawer';
import { Pen } from '@/components/icons';

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full absolute inset-0 bg-[#f4f4f5]">
      <Drawer />
      <Header />
      <main className="flex-1 overflow-y-auto relative">{children}</main>
      <div className="absolute bottom-5 left-4 z-20">
        <Link
          href="/chats/bot"
          className="w-[56px] h-[56px] bg-[#527DA3] hover:bg-[#466a8a] text-white rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-95"
        >
          <Pen size={24} strokeWidth={2.5} />
        </Link>
      </div>
    </div>
  );
}
