'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface UIContextValue {
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  showAiModal: boolean;
  openAiModal: () => void;
  closeAiModal: () => void;
  showPublishToast: boolean;
  triggerPublishToast: () => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showPublishToast, setShowPublishToast] = useState(false);

  const triggerPublishToast = () => {
    setShowPublishToast(true);
    setTimeout(() => setShowPublishToast(false), 4000);
  };

  return (
    <UIContext.Provider
      value={{
        isDrawerOpen,
        openDrawer: () => setIsDrawerOpen(true),
        closeDrawer: () => setIsDrawerOpen(false),
        showAiModal,
        openAiModal: () => setShowAiModal(true),
        closeAiModal: () => setShowAiModal(false),
        showPublishToast,
        triggerPublishToast,
      }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within a UIProvider');
  return ctx;
}
