'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Card, Draft, MiniappConfig, Platform } from '@/lib/types';
import { INITIAL_PLATFORMS } from '@/lib/data/seed';
import { getTime } from '@/lib/utils';

interface NewCardForm {
  title: string;
  desc: string;
  hasImage: boolean;
}

interface PlatformsContextValue {
  platforms: Platform[];
  getPlatform: (id: number) => Platform | undefined;
  joinedPlatforms: number[];
  joinPlatform: (id: number) => void;
  drafts: Draft[];
  getDraft: (platformId: number) => Draft | undefined;
  saveDraft: (platformId: number, form: NewCardForm) => void;
  clearDraft: (platformId: number) => void;
  submitCard: (platformId: number, form: NewCardForm, authorName: string) => void;
  publishPlatform: (platformId: number) => void;
  sendComment: (
    platformId: number,
    cardId: number,
    text: string,
    sender: string,
    replyTo: { sender: string; text: string } | null
  ) => void;
  requestCard: (platformId: number, cardId: number, requesterName: string, actionLabel: string) => void;
  approveCard: (platformId: number, cardId: number, approverName: string) => void;
  cancelRequest: (platformId: number, cardId: number, requesterName: string) => void;
  addPlatform: (platform: Platform) => void;
  setMiniappConfig: (platformId: number, config: MiniappConfig) => void;
}

const PlatformsContext = createContext<PlatformsContextValue | null>(null);

export function PlatformsProvider({ children }: { children: ReactNode }) {
  const [platforms, setPlatforms] = useState<Platform[]>(INITIAL_PLATFORMS);
  const [joinedPlatforms, setJoinedPlatforms] = useState<number[]>([1, 4, 6]);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  const getPlatform = (id: number) => platforms.find((p) => p.id === id);
  const getDraft = (platformId: number) => drafts.find((d) => d.platformId === platformId);

  const joinPlatform = (id: number) => setJoinedPlatforms((prev) => [...prev, id]);

  const saveDraft = (platformId: number, form: NewCardForm) => {
    setDrafts((prev) => {
      const existing = prev.find((d) => d.platformId === platformId);
      if (existing) {
        return prev.map((d) => (d.platformId === platformId ? { ...d, ...form, timestamp: Date.now() } : d));
      }
      return [{ id: Date.now(), platformId, ...form, timestamp: Date.now() }, ...prev];
    });
  };

  const clearDraft = (platformId: number) => setDrafts((prev) => prev.filter((d) => d.platformId !== platformId));

  const submitCard = (platformId: number, form: NewCardForm, authorName: string) => {
    if (!form.desc.trim()) return;
    const platform = getPlatform(platformId);
    if (!platform) return;
    const derivedTitle = form.desc.split('\n')[0].trim().slice(0, 40) || 'کارت جدید';
    const newCard: Card = {
      id: Date.now(),
      title: derivedTitle,
      desc: form.desc,
      author: authorName,
      avatar: authorName.charAt(0),
      time: 'همین الان',
      hasImage: platform.formLabels.image ? form.hasImage : false,
      isCurated: false,
      comments: [],
    };
    setPlatforms((prev) => prev.map((p) => (p.id === platformId ? { ...p, cards: [newCard, ...p.cards] } : p)));
    clearDraft(platformId);
  };

  const publishPlatform = (platformId: number) => {
    setPlatforms((prev) => prev.map((p) => (p.id === platformId ? { ...p, isDraft: false } : p)));
  };

  const sendComment: PlatformsContextValue['sendComment'] = (platformId, cardId, text, sender, replyTo) => {
    if (!text.trim()) return;
    const newComment = { id: Date.now(), text, sender, time: getTime(), replyTo };
    setPlatforms((prev) =>
      prev.map((p) =>
        p.id !== platformId
          ? p
          : { ...p, cards: p.cards.map((c) => (c.id === cardId ? { ...c, comments: [...c.comments, newComment] } : c)) }
      )
    );
  };

  const requestCard = (platformId: number, cardId: number, requesterName: string, actionLabel: string) => {
    const newComment = { id: Date.now(), text: `${requesterName} درخواست ${actionLabel} ثبت کرد.`, isSystem: true };
    setPlatforms((prev) =>
      prev.map((p) =>
        p.id !== platformId
          ? p
          : {
              ...p,
              cards: p.cards.map((c) =>
                c.id === cardId ? { ...c, status: 'pending', requester: requesterName, comments: [...c.comments, newComment] } : c
              ),
            }
      )
    );
  };

  const approveCard = (platformId: number, cardId: number, approverName: string) => {
    const newComment = { id: Date.now(), text: `درخواست توسط ${approverName} تایید شد.`, isSystem: true };
    setPlatforms((prev) =>
      prev.map((p) =>
        p.id !== platformId
          ? p
          : { ...p, cards: p.cards.map((c) => (c.id === cardId ? { ...c, status: 'closed', comments: [...c.comments, newComment] } : c)) }
      )
    );
  };

  const cancelRequest = (platformId: number, cardId: number, requesterName: string) => {
    const newComment = { id: Date.now(), text: `${requesterName} درخواست خود را لغو کرد.`, isSystem: true };
    setPlatforms((prev) =>
      prev.map((p) =>
        p.id !== platformId
          ? p
          : {
              ...p,
              cards: p.cards.map((c) =>
                c.id === cardId ? { ...c, status: null, requester: null, comments: [...c.comments, newComment] } : c
              ),
            }
      )
    );
  };

  const addPlatform = (platform: Platform) => setPlatforms((prev) => [platform, ...prev]);

  const setMiniappConfig = (platformId: number, config: MiniappConfig) =>
    setPlatforms((prev) => prev.map((p) => (p.id === platformId ? { ...p, miniappConfig: config } : p)));

  return (
    <PlatformsContext.Provider
      value={{
        platforms,
        getPlatform,
        joinedPlatforms,
        joinPlatform,
        drafts,
        getDraft,
        saveDraft,
        clearDraft,
        submitCard,
        publishPlatform,
        sendComment,
        requestCard,
        approveCard,
        cancelRequest,
        addPlatform,
        setMiniappConfig,
      }}
    >
      {children}
    </PlatformsContext.Provider>
  );
}

export function usePlatforms() {
  const ctx = useContext(PlatformsContext);
  if (!ctx) throw new Error('usePlatforms must be used within a PlatformsProvider');
  return ctx;
}
