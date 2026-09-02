import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from '@/components/layout/AppShell';

describe('AppShell', () => {
  it('renders its children', () => {
    render(
      <AppShell>
        <div>محتوای تست</div>
      </AppShell>
    );

    expect(screen.getByText('محتوای تست')).toBeInTheDocument();
  });

  it('sets a right-to-left direction on the shell', () => {
    const { container } = render(
      <AppShell>
        <span>child</span>
      </AppShell>
    );

    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl');
  });

  it('constrains the shell to a mobile-width viewport', () => {
    const { container } = render(
      <AppShell>
        <span>child</span>
      </AppShell>
    );

    expect(container.firstElementChild).toHaveClass('max-w-[430px]');
  });
});
