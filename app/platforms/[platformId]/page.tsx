'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { usePlatforms } from '@/hooks/usePlatforms';
import { PlatformInternal } from '@/components/platforms/PlatformInternal';

export default function PlatformPage({ params }: { params: Promise<{ platformId: string }> }) {
  const { platformId } = use(params);
  const { getPlatform } = usePlatforms();
  const platform = getPlatform(Number(platformId));
  if (!platform) return notFound();
  return <PlatformInternal key={platform.id} platform={platform} />;
}
