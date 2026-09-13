import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MessageView } from '@taavon/contracts';
import type { RealtimeConnection, RealtimeHandlers } from '@/lib/realtime/client';
import { ChatsProvider, useChats, SEND_TIMEOUT_MS } from './useChats';

const ME = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';
const CONVO = '33333333-3333-4333-8333-333333333333';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function conversation(over: Record<string, unknown> = {}) {
  return {
    id: CONVO,
    kind: 'DIRECT',
    members: [{ userId: ME }, { userId: PEER }],
    createdAt: '2026-09-13T08:00:00.000Z',
    lastMessageAt: null,
    unreadCount: 0,
    muted: false,
    hidden: false,
    ...over,
  };
}

function serverMessage(over: Partial<MessageView> = {}): MessageView {
  return {
    id: 'server-id-1',
    conversationId: CONVO,
    senderId: ME,
    senderKind: 'USER',
    status: 'VISIBLE',
    body: 'سلام',
    revisionCount: 1,
    edited: false,
    clientMessageId: null,
    proposedAction: null,
    proposalState: 'NONE',
    createdAt: '2026-09-13T08:01:00.000Z',
    updatedAt: '2026-09-13T08:01:00.000Z',
    ...over,
  };
}

/** A stand-in socket whose emitted sends the test can inspect and answer. */
function fakeRealtime() {
  const sent: { conversationId: string; body: string; clientMessageId: string }[] = [];
  let handlers: RealtimeHandlers | null = null;

  const connect = (h: RealtimeHandlers): RealtimeConnection => {
    handlers = h;
    return {
      join: vi.fn(),
      send: vi.fn(() => 'unused'),
      sendWithId: (conversationId, body, clientMessageId) => {
        sent.push({ conversationId, body, clientMessageId });
      },
      markRead: vi.fn(),
      setTyping: vi.fn(),
      disconnect: vi.fn(),
      socket: {} as never,
    };
  };

  return {
    connect,
    sent,
    /** Delivers any message as though it arrived over the socket. */
    push(message: MessageView) {
      handlers?.onMessage(message);
    },
    /** What the server would echo back for the nth send. */
    echo(index: number, over: Partial<MessageView> = {}) {
      const attempt = sent[index]!;
      handlers?.onMessage(
        serverMessage({ clientMessageId: attempt.clientMessageId, body: attempt.body, ...over })
      );
    },
  };
}

function Probe() {
  const { messagesFor, send, retry } = useChats();
  const messages = messagesFor(CONVO) ?? [];

  return (
    <div>
      <button onClick={() => send(CONVO, 'سلام')}>send</button>
      <ul>
        {messages.map((m) => (
          <li key={m.clientMessageId ?? m.id} data-testid="msg" data-id={m.id} data-state={m.sendState ?? 'sent'}>
            {m.body}
            {m.sendState === 'failed' && (
              <button onClick={() => retry(CONVO, m.clientMessageId!)}>retry</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderWith(realtime: ReturnType<typeof fakeRealtime>) {
  return render(
    <ChatsProvider meId={ME} connect={realtime.connect}>
      <Opener />
      <Probe />
    </ChatsProvider>
  );
}

function Opener() {
  const { open } = useChats();
  return <button onClick={() => open(CONVO)}>open</button>;
}

beforeEach(() => {
  global.fetch = vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('/conversations/') && url.includes('/messages')) {
      return jsonResponse(200, { items: [], nextCursor: null });
    }
    if (url.includes('/conversations')) return jsonResponse(200, { items: [conversation()], nextCursor: null });
    return jsonResponse(200, {});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('sending optimistically', () => {
  it('shows the message immediately, before the server has answered', async () => {
    const realtime = fakeRealtime();
    renderWith(realtime);

    await userEvent.click(await screen.findByText('send'));

    const drawn = screen.getByTestId('msg');
    expect(drawn).toHaveTextContent('سلام');
    expect(drawn).toHaveAttribute('data-state', 'pending');
    expect(realtime.sent).toHaveLength(1);
  });

  it('replaces the optimistic copy with the server\'s, rather than showing both', async () => {
    const realtime = fakeRealtime();
    renderWith(realtime);

    await userEvent.click(await screen.findByText('send'));
    act(() => realtime.echo(0));

    await waitFor(() => expect(screen.getAllByTestId('msg')).toHaveLength(1));
    const settled = screen.getByTestId('msg');
    // Reconciled by clientMessageId: same row, now carrying the server's id.
    expect(settled).toHaveAttribute('data-id', 'server-id-1');
    expect(settled).toHaveAttribute('data-state', 'sent');
  });

  it('does not duplicate when the server echo arrives twice', async () => {
    const realtime = fakeRealtime();
    renderWith(realtime);

    await userEvent.click(await screen.findByText('send'));
    act(() => realtime.echo(0));
    act(() => realtime.echo(0));

    await waitFor(() => expect(screen.getAllByTestId('msg')).toHaveLength(1));
  });

  it('appends a message from the other side without disturbing mine', async () => {
    const realtime = fakeRealtime();
    renderWith(realtime);

    await userEvent.click(await screen.findByText('send'));
    act(() => realtime.echo(0));
    await waitFor(() => expect(screen.getAllByTestId('msg')).toHaveLength(1));

    // A message from the peer carries no clientMessageId of ours, so it can
    // never be mistaken for the echo of something we sent.
    act(() =>
      realtime.push(
        serverMessage({ id: 'peer-1', senderId: PEER, body: 'سلام به تو', clientMessageId: null })
      )
    );

    await waitFor(() => expect(screen.getAllByTestId('msg')).toHaveLength(2));
    expect(screen.getAllByTestId('msg')[0]).toHaveAttribute('data-id', 'server-id-1');
    expect(screen.getAllByTestId('msg')[1]).toHaveTextContent('سلام به تو');
  });
});

describe('when a send does not land', () => {
  it('marks it failed once the wait runs out, keeping the text', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const realtime = fakeRealtime();
    renderWith(realtime);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByText('send'));
    expect(screen.getByTestId('msg')).toHaveAttribute('data-state', 'pending');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS + 100);
    });

    const failed = screen.getByTestId('msg');
    expect(failed).toHaveAttribute('data-state', 'failed');
    expect(failed).toHaveTextContent('سلام');
  });

  it('retries under the same clientMessageId, so a message that did land is not written twice', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const realtime = fakeRealtime();
    renderWith(realtime);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByText('send'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS + 100);
    });

    await user.click(screen.getByText('retry'));

    expect(realtime.sent).toHaveLength(2);
    // The same id both times - that is what lets the server collapse the retry.
    expect(realtime.sent[1]!.clientMessageId).toBe(realtime.sent[0]!.clientMessageId);
    expect(screen.getByTestId('msg')).toHaveAttribute('data-state', 'pending');
  });

  it('settles to sent when the retry is answered', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const realtime = fakeRealtime();
    renderWith(realtime);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(await screen.findByText('send'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS + 100);
    });
    await user.click(screen.getByText('retry'));
    act(() => realtime.echo(1));

    await waitFor(() => expect(screen.getByTestId('msg')).toHaveAttribute('data-state', 'sent'));
    expect(screen.getAllByTestId('msg')).toHaveLength(1);
  });
});
