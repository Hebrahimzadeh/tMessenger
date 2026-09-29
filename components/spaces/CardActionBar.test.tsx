import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CardActionBar } from './CardActionBar';

const originalFetch = global.fetch;
const CARD_ID = '11111111-1111-4111-8111-111111111111';
const VIEWER = '22222222-2222-4222-8222-222222222222';
const QUIET = { likeCount: 0, commentCount: 0, likedByMe: false, bookmarkedByMe: false };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('CardActionBar: پسند، گفت‌وگو، هم‌رسانی، نشان', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('likes a card through the LIKE reaction and shows the count the server returns', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { counts: { LIKE: 5, SUPPORT: 0, USEFUL: 0, INTERESTED: 0, CELEBRATE: 0 }, mine: ['LIKE'] })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<CardActionBar cardId={CARD_ID} engagement={QUIET} currentUserId={VIEWER} />);
    await userEvent.click(screen.getByRole('button', { name: 'پسند' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'پسند' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: 'پسند' })).toHaveTextContent('۵');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ type: 'LIKE' });
  });

  it('puts the previous state back when a like fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(500, {})) as unknown as typeof fetch;

    render(<CardActionBar cardId={CARD_ID} engagement={{ ...QUIET, likeCount: 3 }} currentUserId={VIEWER} />);
    await userEvent.click(screen.getByRole('button', { name: 'پسند' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'پسند' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'پسند' })).toHaveTextContent('۳');
  });

  it('toggles a bookmark and never shows a count for it', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, { bookmarked: true })) as unknown as typeof fetch;

    render(<CardActionBar cardId={CARD_ID} engagement={QUIET} currentUserId={VIEWER} />);
    const bookmark = screen.getByRole('button', { name: 'نشان‌کردن' });
    await userEvent.click(bookmark);

    await waitFor(() => expect(bookmark).toHaveAttribute('aria-pressed', 'true'));
    // A bookmark is private: no number to compare yourself against anybody by.
    expect(bookmark).toHaveTextContent('');
  });

  it('copies the card\'s address when the device has no share sheet, and tells no server', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });

    render(<CardActionBar cardId={CARD_ID} engagement={QUIET} currentUserId={VIEWER} />);
    await userEvent.click(screen.getByRole('button', { name: 'هم‌رسانی' }));

    await waitFor(() => expect(screen.getByText('کپی شد')).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/cards/${CARD_ID}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves the two writing actions disabled for a reader with no session', () => {
    render(<CardActionBar cardId={CARD_ID} engagement={{ ...QUIET, likeCount: 2 }} currentUserId={null} />);
    expect(screen.getByRole('button', { name: 'پسند' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'نشان‌کردن' })).toBeDisabled();
    // Reading is still public - the count is there to be read.
    expect(screen.getByRole('button', { name: 'پسند' })).toHaveTextContent('۲');
    expect(screen.getByRole('button', { name: 'هم‌رسانی' })).toBeEnabled();
  });
});
