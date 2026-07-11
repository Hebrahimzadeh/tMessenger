'use client';

import { notFound } from 'next/navigation';
import { usePlatforms } from '@/hooks/usePlatforms';
import { PlatformInternal } from '@/components/platforms/PlatformInternal';

export default function PlatformPage({ params }: { params: { platformId: string } }) {
  const { getPlatform } = usePlatforms();
  const platform = getPlatform(Number(params.platformId));
  if (!platform) return notFound();
  return <PlatformInternal key={platform.id} platform={platform} />;
}
