'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pen, Plus } from '@/components/icons';

/**
 * The one floating action in the corner, the way a messenger has exactly
 * one: it composes whatever the tab in front of you is made of.
 *
 * On the spaces tab that is a new space, which is why it is a plus there
 * and a pen everywhere else.
 */
export function ComposeFab() {
  const pathname = usePathname();
  const onSpaces = pathname === '/';

  return (
    <Link
      href={onSpaces ? '/spaces/new' : '/chats/bot'}
      aria-label={onSpaces ? 'ساخت بستر جدید' : 'گفتگوی جدید'}
      className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-[#527DA3] text-white shadow-lg transition-transform hover:bg-[#466a8a] active:scale-95"
    >
      {onSpaces ? <Plus size={26} strokeWidth={2.5} /> : <Pen size={24} strokeWidth={2.5} />}
    </Link>
  );
}
