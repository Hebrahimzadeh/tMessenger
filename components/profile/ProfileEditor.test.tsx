import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileEditor } from './ProfileEditor';

const originalFetch = global.fetch;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('ProfileEditor', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows a loading state, then the form once GET /me resolves', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        userId: '11111111-1111-4111-8111-111111111111',
        hasProfile: false,
        username: null,
        displayName: null,
        bio: null,
        phoneVisibility: 'PRIVATE',
      })
    ) as unknown as typeof fetch;

    render(<ProfileEditor />);
    expect(screen.getByRole('status')).toBeInTheDocument();

    expect(await screen.findByLabelText('نام کاربری')).toBeInTheDocument();
  });

  it('shows an accessible error if GET /me fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(500, { error: { code: 'UNKNOWN_ERROR', message: 'خطای سرور.', correlationId: 'r1', details: [] } })
    ) as unknown as typeof fetch;

    render(<ProfileEditor />);
    expect(await screen.findByRole('alert')).toHaveTextContent('خطای سرور.');
  });
});
