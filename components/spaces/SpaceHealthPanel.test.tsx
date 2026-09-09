import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpaceHealthPanel } from './SpaceHealthPanel';

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function healthResponse(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ACTIVE',
    cardCount: 0,
    contributorCount: 3,
    meaningfulViewCount: 0,
    firstUseLatencySeconds: null,
    roleActivity: { totalRoleCount: 2, activeRoleCount: 2 },
    crossRoleCardRate: 0,
    appliedRate: 0,
    reservationClosedRate: 0,
    reportQuality: null,
    lastActivityAt: '2026-09-01T00:00:00.000Z',
    suggestions: [],
    computedAt: '2026-09-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('SpaceHealthPanel', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows every dimension as its own separate, labeled value - never a single combined score', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, healthResponse())) as unknown as typeof fetch;
    render(<SpaceHealthPanel spaceId={SPACE_ID} />);

    expect(await screen.findByText('فعال')).toBeInTheDocument(); // status label
    expect(screen.getByText('۳')).toBeInTheDocument(); // contributorCount, Persian digits
    expect(screen.queryByText(/امتیاز/)).not.toBeInTheDocument(); // no "score" label anywhere
    expect(screen.queryByText(/رتبه/)).not.toBeInTheDocument(); // no "ranking" label anywhere
  });

  it('shows each suggestion as its own plain-language line', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(200, healthResponse({ suggestions: [{ code: 'CREATE_FIRST_CARD' }, { code: 'IMPROVE_INTRO' }] }))
    ) as unknown as typeof fetch;
    render(<SpaceHealthPanel spaceId={SPACE_ID} />);

    expect(await screen.findByText(/اولین کارت واقعی/)).toBeInTheDocument();
    expect(screen.getByText(/بهبود معرفی/)).toBeInTheDocument();
  });

  it('shows a real empty state when there are no suggestions', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse(200, healthResponse({ suggestions: [] }))) as unknown as typeof fetch;
    render(<SpaceHealthPanel spaceId={SPACE_ID} />);
    expect(await screen.findByText(/پیشنهادی/)).toBeInTheDocument();
  });

  it('shows an error state on failure, without crashing the page', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'دسترسی کافی ندارید.', correlationId: 'r', details: [] } })
    ) as unknown as typeof fetch;
    render(<SpaceHealthPanel spaceId={SPACE_ID} />);
    expect(await screen.findByText('دسترسی کافی ندارید.')).toBeInTheDocument();
  });
});
