import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ConversationView } from '@taavon/contracts';
import { ChatsList } from './ChatsList';

const ME = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const chatsValue = {
  conversations: [] as ConversationView[],
  loading: false,
  error: null as string | null,
  meId: ME as string | null,
};

vi.mock('@/hooks/useChats', () => ({ useChats: () => chatsValue }));

function conversation(over: Partial<ConversationView> = {}): ConversationView {
  return {
    id: 'c1',
    kind: 'DIRECT',
    members: [{ userId: ME }, { userId: PEER }],
    createdAt: '2026-09-13T08:00:00.000Z',
    lastMessageAt: '2026-09-13T09:00:00.000Z',
    unreadCount: 0,
    muted: false,
    hidden: false,
    ...over,
  };
}

function renderList(conversations: ConversationView[], over: Partial<typeof chatsValue> = {}) {
  Object.assign(chatsValue, { conversations, loading: false, error: null, meId: ME }, over);
  return render(<ChatsList />);
}

describe('the conversations list', () => {
  it('tells someone with no conversations where one comes from', () => {
    renderList([]);
    expect(screen.getByText(/هنوز گفت‌وگویی ندارید/)).toBeInTheDocument();
    expect(screen.getByText(/از پروفایل یک نفر یا از رزرو یک کارت/)).toBeInTheDocument();
  });

  it('shows a loading state and an error state', () => {
    const { unmount } = renderList([], { loading: true });
    expect(screen.getByText(/در حال بارگذاری/)).toBeInTheDocument();
    unmount();

    renderList([], { error: 'خطا' });
    expect(screen.getByRole('alert')).toHaveTextContent('خطا');
  });

  it('shows an unread count', () => {
    renderList([conversation({ unreadCount: 3 })]);
    expect(screen.getByTestId('unread-badge')).toHaveTextContent('3');
  });

  // The list is a screen people glance at in public. A timestamp says a
  // message arrived; a preview would put private text on it.
  it('never puts message text in the list', () => {
    renderList([conversation()]);
    expect(screen.getByText('پیام جدید دارید')).toBeInTheDocument();
  });

  describe('the assistant', () => {
    it('is marked as a system account, distinctly from a person', () => {
      renderList([conversation({ id: 'a1', kind: 'SYSTEM_ASSISTANT', members: [{ userId: ME }] })]);

      const row = screen.getByTestId('conversation-row');
      expect(row).toHaveAttribute('data-kind', 'SYSTEM_ASSISTANT');
      expect(screen.getByText('همیار تعاون')).toBeInTheDocument();
      expect(screen.getByText('حساب سیستمی')).toBeInTheDocument();
    });

    it('is never presented as a manager or a person', () => {
      renderList([conversation({ id: 'a1', kind: 'SYSTEM_ASSISTANT', members: [{ userId: ME }] })]);
      const row = screen.getByTestId('conversation-row');

      for (const word of ['مدیر', 'ادمین', 'پشتیبان', 'آنلاین']) {
        expect(row.textContent).not.toContain(word);
      }
    });

    it('carries no system badge on an ordinary conversation', () => {
      renderList([conversation()]);
      expect(screen.queryByText('حساب سیستمی')).not.toBeInTheDocument();
    });
  });

  describe('muting', () => {
    it('marks a muted thread and dims its badge rather than hiding the count', () => {
      renderList([conversation({ muted: true, unreadCount: 2 })]);

      expect(screen.getByLabelText('بی‌صدا')).toBeInTheDocument();
      // Still counted - muted means quiet, not unread-blind.
      expect(screen.getByTestId('unread-badge')).toHaveTextContent('2');
    });

    it('leaves an unmuted thread unmarked', () => {
      renderList([conversation()]);
      expect(screen.queryByLabelText('بی‌صدا')).not.toBeInTheDocument();
    });
  });
});
