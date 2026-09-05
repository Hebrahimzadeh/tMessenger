import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpaceHeader } from './SpaceHeader';

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('SpaceHeader', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('shows the title and purpose', () => {
    render(<SpaceHeader spaceId={SPACE_ID} title="باغ محله" purpose="نگهداری مشترک" status="PUBLISHED" isOwnerView={false} />);
    expect(screen.getByRole('heading', { name: 'باغ محله' })).toBeInTheDocument();
    expect(screen.getByText('نگهداری مشترک')).toBeInTheDocument();
  });

  it('shows a status badge for the owner view of a non-published space', () => {
    render(<SpaceHeader spaceId={SPACE_ID} title="باغ محله" purpose="x" status="PRECHECK_REQUIRED" isOwnerView={true} />);
    expect(screen.getByText('نیاز به بازبینی')).toBeInTheDocument();
  });

  it('shows no follow button for the owner\'s own view', () => {
    render(<SpaceHeader spaceId={SPACE_ID} title="باغ محله" purpose="x" status="PUBLISHED" isOwnerView={true} />);
    expect(screen.queryByRole('button', { name: /دنبال/ })).not.toBeInTheDocument();
  });

  it('shows no follow button for a space that is not published yet', () => {
    render(<SpaceHeader spaceId={SPACE_ID} title="باغ محله" purpose="x" status="DRAFT" isOwnerView={false} />);
    expect(screen.queryByRole('button', { name: /دنبال/ })).not.toBeInTheDocument();
  });

  it('follow/unfollow toggles and calls the right endpoint each time', async () => {
    global.fetch = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, { ok: true }))) as unknown as typeof fetch;
    const user = userEvent.setup();
    render(<SpaceHeader spaceId={SPACE_ID} title="باغ محله" purpose="x" status="PUBLISHED" isOwnerView={false} />);

    await user.click(screen.getByRole('button', { name: 'دنبال کردن' }));
    expect(await screen.findByRole('button', { name: 'دنبال می‌کنید' })).toBeInTheDocument();
    const [followUrl] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(followUrl).toContain(`/spaces/${SPACE_ID}/follow`);

    await user.click(screen.getByRole('button', { name: 'دنبال می‌کنید' }));
    expect(await screen.findByRole('button', { name: 'دنبال کردن' })).toBeInTheDocument();
    const [unfollowUrl] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [string];
    expect(unfollowUrl).toContain(`/spaces/${SPACE_ID}/unfollow`);
  });
});
