import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReservationActions } from './ReservationActions';

const originalFetch = global.fetch;
const CARD_ID = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const RESERVER = '33333333-3333-4333-8333-333333333333';
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const CONVERSATION_ID = '55555555-5555-4555-8555-555555555555';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Routes by method + endpoint shape (reservation-state GET vs a reservation action POST). */
function mockFetchRouter(routes: { getState?: unknown[]; post?: unknown[] }) {
  const getQueue = [...(routes.getState ?? [])];
  const postQueue = [...(routes.post ?? [])];
  return vi.fn(async (_input: string | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') return getQueue.shift() ?? jsonResponse(500, {});
    return postQueue.shift() ?? jsonResponse(500, {});
  });
}

describe('ReservationActions: the reservation "ladder" - REUSABLE_RESOURCE-style card', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    pushMock.mockClear();
  });

  it('shows a reserve button when ACTIVE and not the owner', async () => {
    global.fetch = mockFetchRouter({
      getState: [jsonResponse(200, { cardId: CARD_ID, state: 'ACTIVE', reservationId: null, reserverId: null, closeReason: null })],
    }) as unknown as typeof fetch;

    render(<ReservationActions cardId={CARD_ID} cardAuthorId={OWNER} currentUserId={RESERVER} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'رزرو' })).toBeInTheDocument());
  });

  it('renders nothing for the owner when ACTIVE (cannot reserve own card)', async () => {
    global.fetch = mockFetchRouter({
      getState: [jsonResponse(200, { cardId: CARD_ID, state: 'ACTIVE', reservationId: null, reserverId: null, closeReason: null })],
    }) as unknown as typeof fetch;

    const { container } = render(<ReservationActions cardId={CARD_ID} cardAuthorId={OWNER} currentUserId={OWNER} />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('reserving redirects immediately to /chats/:conversationId - no accept step', async () => {
    global.fetch = mockFetchRouter({
      getState: [jsonResponse(200, { cardId: CARD_ID, state: 'ACTIVE', reservationId: null, reserverId: null, closeReason: null })],
      post: [jsonResponse(201, { reservationId: RESERVATION_ID, conversationId: CONVERSATION_ID })],
    }) as unknown as typeof fetch;

    render(<ReservationActions cardId={CARD_ID} cardAuthorId={OWNER} currentUserId={RESERVER} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'رزرو' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'رزرو' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/chats/${CONVERSATION_ID}`));
  });

  it('shows cancel for the reserver once RESERVED', async () => {
    global.fetch = mockFetchRouter({
      getState: [jsonResponse(200, { cardId: CARD_ID, state: 'RESERVED', reservationId: RESERVATION_ID, reserverId: RESERVER, closeReason: null })],
    }) as unknown as typeof fetch;

    render(<ReservationActions cardId={CARD_ID} cardAuthorId={OWNER} currentUserId={RESERVER} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'لغو رزرو' })).toBeInTheDocument());
  });

  it('shows mark-in-use and release for the owner once RESERVED', async () => {
    global.fetch = mockFetchRouter({
      getState: [jsonResponse(200, { cardId: CARD_ID, state: 'RESERVED', reservationId: RESERVATION_ID, reserverId: RESERVER, closeReason: null })],
    }) as unknown as typeof fetch;

    render(<ReservationActions cardId={CARD_ID} cardAuthorId={OWNER} currentUserId={OWNER} />);
    await waitFor(() => expect(screen.getByText('علامت‌گذاری به‌عنوان در حال استفاده')).toBeInTheDocument());
    expect(screen.getByText('رهاسازی این رزرو')).toBeInTheDocument();
  });

  it('shows a close-reason picker for the owner once IN_USE', async () => {
    global.fetch = mockFetchRouter({
      getState: [jsonResponse(200, { cardId: CARD_ID, state: 'IN_USE', reservationId: RESERVATION_ID, reserverId: RESERVER, closeReason: null })],
    }) as unknown as typeof fetch;

    render(<ReservationActions cardId={CARD_ID} cardAuthorId={OWNER} currentUserId={OWNER} />);
    await waitFor(() => expect(screen.getByText('بستن رزرو')).toBeInTheDocument());
    expect(screen.getByText('دلیل بسته‌شدن')).toBeInTheDocument();
  });

  it('once RESERVATION_CLOSED, shows a disabled button and the exact required phrase', async () => {
    global.fetch = mockFetchRouter({
      getState: [
        jsonResponse(200, { cardId: CARD_ID, state: 'RESERVATION_CLOSED', reservationId: RESERVATION_ID, reserverId: RESERVER, closeReason: 'RETURNED' }),
      ],
    }) as unknown as typeof fetch;

    render(<ReservationActions cardId={CARD_ID} cardAuthorId={OWNER} currentUserId={RESERVER} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'رزرو' })).toBeDisabled());
    expect(screen.getByText('رزرو این کارت بسته شده است.')).toBeInTheDocument();
  });
});
