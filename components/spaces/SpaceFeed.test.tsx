import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpaceFeed } from './SpaceFeed';

describe('SpaceFeed', () => {
  it('shows a real empty state when there are no cards and no example hints yet', () => {
    render(<SpaceFeed cardHints={null} />);
    expect(screen.getByText(/هنوز کارتی/)).toBeInTheDocument();
  });

  it('renders each example card hint with the fixed "not real content" badge', () => {
    render(
      <SpaceFeed
        cardHints={[{ isExample: true, label: 'نمونه', title: 'کمک به آبیاری آخر هفته', description: 'یک کارت نمونه' }]}
      />
    );
    expect(screen.getByText('کمک به آبیاری آخر هفته')).toBeInTheDocument();
    expect(screen.getByText('نمونه — محتوای واقعی نیست')).toBeInTheDocument();
  });

  it('disables interaction affordances on an example card', () => {
    render(<SpaceFeed cardHints={[{ isExample: true, label: 'نمونه', title: 'کمک به آبیاری' }]} />);
    expect(screen.getByRole('button', { name: 'پسندیدن' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'رزرو' })).toBeDisabled();
  });
});
