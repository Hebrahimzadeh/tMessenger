import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DuplicateCardAction } from './DuplicateCardAction';

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('DuplicateCardAction', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    pushMock.mockClear();
  });

  it('is invisible to anyone but the card author', () => {
    const { container: strangerView } = render(
      <DuplicateCardAction spaceId={SPACE_ID} cardAuthorId={OWNER} currentUserId={STRANGER} originalBody="متن قدیمی" />
    );
    expect(strangerView).toBeEmptyDOMElement();

    const { container: anonymousView } = render(
      <DuplicateCardAction spaceId={SPACE_ID} cardAuthorId={OWNER} currentUserId={null} originalBody="متن قدیمی" />
    );
    expect(anonymousView).toBeEmptyDOMElement();
  });

  it("prefills the new draft with the old card's body and creates a genuinely new card id via the normal create endpoint", async () => {
    const NEW_CARD_ID = '99999999-9999-4999-8999-999999999999';
    global.fetch = vi.fn().mockImplementation(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if ((init?.method ?? 'GET').toUpperCase() === 'POST' && url.pathname.endsWith('/cards')) {
        const body = JSON.parse(String(init?.body)) as { body: string };
        expect(body.body).toBe('متن قدیمی');
        return jsonResponse(201, {
          id: NEW_CARD_ID,
          spaceId: SPACE_ID,
          authorId: OWNER,
          kind: 'AWARENESS',
          status: 'ACTIVE',
          publishedAt: '2026-09-10T00:00:00.000Z',
          revision: { revisionNumber: 1, title: 'متن قدیمی', body: 'متن قدیمی' },
          inferredKind: 'AWARENESS',
          attachments: [],
        });
      }
      return jsonResponse(500, {});
    }) as unknown as typeof fetch;

    render(<DuplicateCardAction spaceId={SPACE_ID} cardAuthorId={OWNER} currentUserId={OWNER} originalBody="متن قدیمی" />);
    fireEvent.click(screen.getByRole('button', { name: 'ساخت کارت مشابه' }));

    const textarea = await screen.findByLabelText('متن کارت');
    expect(textarea).toHaveValue('متن قدیمی');

    fireEvent.click(screen.getByRole('button', { name: 'ثبت کارت' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/cards/${NEW_CARD_ID}`));
  });
});
