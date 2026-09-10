import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardReactions } from './CardReactions';

const originalFetch = global.fetch;
const CARD_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const EMPTY = { counts: { SUPPORT: 0, USEFUL: 0, INTERESTED: 0, CELEBRATE: 0 }, mine: [] };

describe('CardReactions', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders counts for every reaction type with no combined score', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, { counts: { SUPPORT: 3, USEFUL: 1, INTERESTED: 0, CELEBRATE: 0 }, mine: ['SUPPORT'] })
    ) as unknown as typeof fetch;

    render(<CardReactions cardId={CARD_ID} currentUserId="user-1" />);

    await waitFor(() => expect(screen.getByRole('button', { name: /حمایت/ })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /حمایت/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/امتیاز/)).not.toBeInTheDocument();
  });

  it('toggles optimistically and reconciles with the server response', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, EMPTY))
      .mockResolvedValueOnce(jsonResponse(200, { counts: { SUPPORT: 1, USEFUL: 0, INTERESTED: 0, CELEBRATE: 0 }, mine: ['SUPPORT'] })) as unknown as typeof fetch;

    render(<CardReactions cardId={CARD_ID} currentUserId="user-1" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /حمایت/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /حمایت/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /حمایت/ })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('rolls back on a failed toggle', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, EMPTY))
      .mockResolvedValueOnce(
        jsonResponse(422, { error: { code: 'REACTIONS_NOT_ACCEPTED', message: 'این کارت پذیرای واکنش نیست.', correlationId: 'x' } })
      ) as unknown as typeof fetch;

    render(<CardReactions cardId={CARD_ID} currentUserId="user-1" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /حمایت/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /حمایت/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /حمایت/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables toggling for an anonymous visitor', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, EMPTY)) as unknown as typeof fetch;
    render(<CardReactions cardId={CARD_ID} currentUserId={null} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /حمایت/ })).toBeDisabled());
  });
});
