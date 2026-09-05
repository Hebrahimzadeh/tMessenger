import Link from 'next/link';
import { SpaceDiscoveryList } from '@/components/spaces/SpaceDiscoveryList';

export default function HomePage() {
  return (
    <div dir="rtl" className="text-right">
      <div className="flex items-center justify-between p-4 pb-0">
        <h1 className="text-lg font-bold text-gray-900">بسترها</h1>
        <Link href="/spaces/new" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          ساخت بستر جدید
        </Link>
      </div>
      <SpaceDiscoveryList />
    </div>
  );
}
