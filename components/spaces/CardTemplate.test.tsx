import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardTemplate } from './CardTemplate';

const AWARENESS_CARD = {
  id: '11111111-1111-4111-8111-111111111111',
  authorId: '22222222-2222-4222-8222-222222222222',
  kind: 'AWARENESS' as const,
  publishedAt: '2026-09-10T00:00:00.000Z',
  title: 'اطلاعیهٔ عمومی محله',
  body: 'یک اطلاعیهٔ ساده بدون هیچ حالت خاصی.',
  attachmentCount: 0,
};

describe('CardTemplate: an AWARENESS card carries no reservation state at all', () => {
  it('renders the title and body with no expiry/terminal-status badge anywhere', () => {
    render(<CardTemplate variant="real" card={AWARENESS_CARD} />);
    expect(screen.getByText('اطلاعیهٔ عمومی محله')).toBeInTheDocument();
    expect(screen.getByText(AWARENESS_CARD.body)).toBeInTheDocument();
    // "در feed tag «منقضی» یا badge وضعیت terminal نشان نده" - the list
    // item never renders any reservation-lifecycle wording at all.
    expect(screen.queryByText(/منقضی/)).not.toBeInTheDocument();
    expect(screen.queryByText(/بسته شده/)).not.toBeInTheDocument();
    expect(screen.queryByText(/رزرو شده/)).not.toBeInTheDocument();
  });

  it('links to the real card detail page, not an inline stateful action', () => {
    render(<CardTemplate variant="real" card={AWARENESS_CARD} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', `/cards/${AWARENESS_CARD.id}`);
  });
});

describe('CardTemplate: a REUSABLE_RESOURCE ("نردبان") card renders the same way in the feed', () => {
  it('shows no reservation state in the list either - that only ever lives on the detail page', () => {
    const ladderCard = { ...AWARENESS_CARD, kind: 'REUSABLE_RESOURCE' as const, title: 'نردبان قابل امانت' };
    render(<CardTemplate variant="real" card={ladderCard} />);
    expect(screen.getByText('نردبان قابل امانت')).toBeInTheDocument();
    expect(screen.queryByText(/رزرو شده|بسته شده|منقضی/)).not.toBeInTheDocument();
  });
});

describe('CardTemplate: an example hint is permanently badged and fully inert', () => {
  it('has no link and no button - it cannot be clicked into or acted on at all', () => {
    render(<CardTemplate variant="example" hint={{ isExample: true, label: 'نمونه', title: 'کارت نمونه' }} />);
    expect(screen.getByText('کارت نمونه')).toBeInTheDocument();
    expect(screen.getByText(/نمونه — محتوای واقعی نیست/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
