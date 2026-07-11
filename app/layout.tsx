import type { Metadata } from 'next';
import './globals.css';
import { ChatsProvider } from '@/hooks/useChats';
import { PlatformsProvider } from '@/hooks/usePlatforms';
import { UIProvider } from '@/hooks/useUI';
import { AiCopilotProvider } from '@/hooks/useAiCopilot';
import { AppShell } from '@/components/layout/AppShell';
import { AiModal } from '@/components/modals/AiModal';
import { PublishToast } from '@/components/modals/PublishToast';

export const metadata: Metadata = {
  title: 'تعاون',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <ChatsProvider>
          <PlatformsProvider>
            <UIProvider>
              <AiCopilotProvider>
                <AppShell>
                  {children}
                  <AiModal />
                  <PublishToast />
                </AppShell>
              </AiCopilotProvider>
            </UIProvider>
          </PlatformsProvider>
        </ChatsProvider>
      </body>
    </html>
  );
}
