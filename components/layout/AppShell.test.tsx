import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('gives whatever it renders a scrollable track', () => {
    // The shell is a fixed-height frame with overflow-hidden. Without a track
    // of its own, every route outside the tab group - a built space, its edit
    // form, card details, settings - was clipped at the bottom of a phone
    // screen with no way to reach the rest of it.
    const { container } = render(
      <AppShell>
        <p>محتوای بلند</p>
      </AppShell>
    );

    const track = screen.getByText('محتوای بلند').parentElement!;
    expect(track.className).toContain('overflow-y-auto');
    // Without min-h-0 a flex child refuses to shrink below its content, so the
    // track overflows the frame instead of scrolling inside it.
    expect(track.className).toContain('min-h-0');
    expect(container.firstElementChild!.className).toContain('overflow-hidden');
  });
});
