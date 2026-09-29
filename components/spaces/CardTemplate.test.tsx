import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardTemplate } from './CardTemplate';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const CAPTION_CARD = {
  id: '11111111-1111-4111-8111-111111111111',
  authorId: '22222222-2222-4222-8222-222222222222',
  kind: 'AWARENESS' as const,
  publishedAt: '2026-09-10T00:00:00.000Z',
  body: 'یک اطلاعیهٔ ساده بدون هیچ حالت خاصی.',
  attachmentCount: 0,
  imageUrl: null,
  engagement: { likeCount: 0, commentCount: 0, likedByMe: false, bookmarkedByMe: false },
};

const VIEWER = '44444444-4444-4444-8444-444444444444';

describe('CardTemplate: a card is an image and a caption, with no name of its own', () => {
  it('renders the caption and no heading at all', () => {
    render(<CardTemplate card={CAPTION_CARD} currentUserId={VIEWER} />);
    expect(screen.getByText(CAPTION_CARD.body)).toBeInTheDocument();
    // "کارت نام و عنوان ندارد" - nothing in a card is a heading, because
    // there is no title for one to hold.
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('renders a caption-only card - an image is never required', () => {
    render(<CardTemplate card={CAPTION_CARD} currentUserId={VIEWER} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(CAPTION_CARD.body)).toBeInTheDocument();
  });

  it('renders an image-only card - a caption is never required either', () => {
    render(
      <CardTemplate
        card={{ ...CAPTION_CARD, body: '', attachmentCount: 1, imageUrl: 'https://storage.example/signed/one.jpg' }}
        currentUserId={VIEWER}
      />
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://storage.example/signed/one.jpg');
    // The image is the card; nothing tells the reader it "only has an attachment".
    expect(screen.queryByText(/فقط پیوست/)).not.toBeInTheDocument();
  });

  it('shows no reservation state in the feed - that only ever lives on the detail page', () => {
    render(<CardTemplate card={{ ...CAPTION_CARD, kind: 'REUSABLE_RESOURCE' }} currentUserId={VIEWER} />);
    expect(screen.queryByText(/رزرو شده|بسته شده|منقضی/)).not.toBeInTheDocument();
  });

  it('links the image and caption to the card, and keeps the four actions out of that link', () => {
    render(<CardTemplate card={CAPTION_CARD} currentUserId={VIEWER} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', `/cards/${CAPTION_CARD.id}`);
    for (const label of ['پسند', 'گفت‌وگو', 'هم‌رسانی', 'نشان‌کردن']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('carries no "نمونه" badge, because a feed row is always a real card', () => {
    render(<CardTemplate card={CAPTION_CARD} currentUserId={VIEWER} />);
    expect(screen.queryByText(/نمونه/)).not.toBeInTheDocument();
    expect(screen.queryByText(/محتوای واقعی نیست/)).not.toBeInTheDocument();
  });
});
