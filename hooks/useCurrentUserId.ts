'use client';

import { useEffect, useState } from 'react';
import { myProfileResponseSchema } from '@taavon/contracts';
import { apiFetch } from '@/lib/api/client';

export type CurrentUserIdState = { status: 'loading' } | { status: 'ready'; userId: string | null };

/**
 * Who the viewer is, for components that must compare against a card's
 * `authorId`/reservation's `ownerId`/`reserverId` to decide what to show
 * (owner-only actions, "is this my comment", etc.) - "state button بر
 * اساس actor از API می‌آید". A 401 (or any failure) resolves to
 * `userId: null`, the same as a genuinely anonymous visitor - never an
 * error state, since not being logged in is a completely normal case for
 * a page that is otherwise public to read.
 */
export function useCurrentUserId(): CurrentUserIdState {
  const [state, setState] = useState<CurrentUserIdState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = myProfileResponseSchema.parse(await apiFetch('/me'));
        if (!cancelled) setState({ status: 'ready', userId: me.userId });
      } catch {
        if (!cancelled) setState({ status: 'ready', userId: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
