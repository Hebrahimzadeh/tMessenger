import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatMessage } from '@/hooks/useChats';
import { MessageBubble } from './MessageBubble';

const ME = '11111111-1111-4111-8111-111111111111';

function message(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderId: ME,
    senderKind: 'USER',
    status: 'VISIBLE',
    body: 'سلام',
    revisionCount: 1,
    edited: false,
    clientMessageId: null,
    proposedAction: null,
    proposalState: 'NONE',
    createdAt: '2026-09-13T08:00:00.000Z',
    updatedAt: '2026-09-13T08:00:00.000Z',
    ...over,
  };
}

function stateOf() {
  return screen.getByTestId('send-state').getAttribute('data-state');
}

describe('delivery state on my own messages', () => {
  it('shows pending while the message is in flight', () => {
    render(<MessageBubble message={message({ sendState: 'pending' })} mine />);
    expect(stateOf()).toBe('pending');
    expect(screen.getByLabelText('در حال ارسال')).toBeInTheDocument();
  });

  it('shows sent once the server has it', () => {
    render(<MessageBubble message={message()} mine />);
    expect(stateOf()).toBe('sent');
    expect(screen.getByLabelText('ارسال شد')).toBeInTheDocument();
  });

  it('shows read once the other side has read it', () => {
    render(<MessageBubble message={message()} mine readByPeer />);
    expect(stateOf()).toBe('read');
    expect(screen.getByLabelText('خوانده شد')).toBeInTheDocument();
  });

  it('shows failed and offers a retry, keeping the text on screen', async () => {
    const onRetry = vi.fn();
    render(<MessageBubble message={message({ sendState: 'failed' })} mine onRetry={onRetry} />);

    expect(stateOf()).toBe('failed');
    // The message a person typed is never quietly dropped.
    expect(screen.getByText('سلام')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /تلاش دوباره/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows no delivery state at all on the other person\'s messages', () => {
    render(<MessageBubble message={message({ senderId: 'someone-else' })} mine={false} />);
    expect(screen.queryByTestId('send-state')).not.toBeInTheDocument();
  });
});

describe('what a bubble shows', () => {
  it('marks an edited message', () => {
    render(<MessageBubble message={message({ edited: true, revisionCount: 2 })} mine />);
    expect(screen.getByText('ویرایش‌شده')).toBeInTheDocument();
  });

  it('replaces a deleted message\'s text rather than showing it', () => {
    render(<MessageBubble message={message({ status: 'DELETED', body: null })} mine />);
    expect(screen.getByText('این پیام حذف شد')).toBeInTheDocument();
    expect(screen.queryByText('سلام')).not.toBeInTheDocument();
  });

  it('shows what is being replied to', () => {
    render(<MessageBubble message={message()} mine replyTo={{ body: 'پیام قبلی', mine: false }} />);
    expect(screen.getByText('پیام قبلی')).toBeInTheDocument();
  });

  it('opens the actions menu on long press', async () => {
    const onLongPress = vi.fn();
    render(<MessageBubble message={message()} mine onLongPress={onLongPress} />);

    await userEvent.pointer({ keys: '[MouseRight]', target: screen.getByTestId('message').firstElementChild! });
    expect(onLongPress).toHaveBeenCalled();
  });
});

describe('an assistant message carrying a suggestion', () => {
  const proposal = { kind: 'CARD_DRAFT' as const, title: 'کارت پیشنهادی', summary: 'خلاصهٔ پیشنهاد', spaceId: null };

  it('shows it as a draft that has not happened, with all three choices', () => {
    render(
      <MessageBubble
        message={message({ senderId: null, senderKind: 'SYSTEM_ASSISTANT', proposedAction: proposal, proposalState: 'PENDING' })}
        mine={false}
      />
    );

    const card = screen.getByTestId('assistant-proposal');
    expect(card).toHaveAttribute('data-state', 'PENDING');
    expect(card).toHaveTextContent('هنوز ساخته نشده است');
    expect(screen.getByRole('button', { name: 'تأیید و ساخت' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ویرایش' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رد' })).toBeInTheDocument();
  });

  it('asks for a decision rather than acting, and reports the one that was made', async () => {
    const onDecideProposal = vi.fn();
    render(
      <MessageBubble
        message={message({ senderId: null, senderKind: 'SYSTEM_ASSISTANT', proposedAction: proposal, proposalState: 'PENDING' })}
        mine={false}
        onDecideProposal={onDecideProposal}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'تأیید و ساخت' }));
    expect(onDecideProposal).toHaveBeenCalledWith('CONFIRM');
  });

  it('lets the person reject it just as easily', async () => {
    const onDecideProposal = vi.fn();
    render(
      <MessageBubble
        message={message({ senderId: null, senderKind: 'SYSTEM_ASSISTANT', proposedAction: proposal, proposalState: 'PENDING' })}
        mine={false}
        onDecideProposal={onDecideProposal}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'رد' }));
    expect(onDecideProposal).toHaveBeenCalledWith('REJECT');
  });

  it('hands the draft to the composer when the person wants to change it', async () => {
    const onEditProposal = vi.fn();
    render(
      <MessageBubble
        message={message({ senderId: null, senderKind: 'SYSTEM_ASSISTANT', proposedAction: proposal, proposalState: 'PENDING' })}
        mine={false}
        onEditProposal={onEditProposal}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'ویرایش' }));
    expect(onEditProposal).toHaveBeenCalled();
  });

  it.each([
    ['CONFIRMED' as const, 'شما این پیشنهاد را تأیید کردید.'],
    ['REJECTED' as const, 'شما این پیشنهاد را رد کردید.'],
  ])('once %s it records the decision and offers no buttons', (state, text) => {
    render(
      <MessageBubble
        message={message({ senderId: null, senderKind: 'SYSTEM_ASSISTANT', proposedAction: proposal, proposalState: state })}
        mine={false}
      />
    );

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تأیید و ساخت' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'رد' })).not.toBeInTheDocument();
  });
});
