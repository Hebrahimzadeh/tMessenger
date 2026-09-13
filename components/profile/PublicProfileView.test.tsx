import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicProfileView } from './PublicProfileView';
import type { PublicProfileResponse } from '@taavon/contracts';

describe('PublicProfileView', () => {
  it('renders displayName, username, and bio', () => {
    const profile: PublicProfileResponse = {
      userId: '00000000-0000-4000-8000-000000000009',
      username: 'ali_2000',
      displayName: 'علی رضایی',
      bio: 'سلام دنیا',
      phoneE164: null,
    };
    render(<PublicProfileView profile={profile} />);
    expect(screen.getByRole('heading', { name: 'علی رضایی' })).toBeInTheDocument();
    expect(screen.getByText('@ali_2000')).toBeInTheDocument();
    expect(screen.getByText('سلام دنیا')).toBeInTheDocument();
  });

  it('shows the phone number when phoneE164 is present (PUBLIC)', () => {
    const profile: PublicProfileResponse = {
      userId: '00000000-0000-4000-8000-000000000009',
      username: 'ali_2000',
      displayName: 'علی',
      bio: null,
      phoneE164: '+989121234567',
    };
    render(<PublicProfileView profile={profile} />);
    expect(screen.getByText('+989121234567')).toBeInTheDocument();
  });

  it('never shows a phone section when phoneE164 is null (PRIVATE)', () => {
    const profile: PublicProfileResponse = { userId: '00000000-0000-4000-8000-000000000009', username: 'ali_2000', displayName: 'علی', bio: null, phoneE164: null };
    render(<PublicProfileView profile={profile} />);
    expect(screen.queryByText(/شماره/)).not.toBeInTheDocument();
  });

  it('renders an XSS-shaped bio as literal text', () => {
    const profile: PublicProfileResponse = {
      userId: '00000000-0000-4000-8000-000000000009',
      username: 'ali_2000',
      displayName: 'علی',
      bio: '<script>alert(1)</script>',
      phoneE164: null,
    };
    render(<PublicProfileView profile={profile} />);
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('sets a right-to-left direction', () => {
    const profile: PublicProfileResponse = { userId: '00000000-0000-4000-8000-000000000009', username: 'ali_2000', displayName: 'علی', bio: null, phoneE164: null };
    const { container } = render(<PublicProfileView profile={profile} />);
    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl');
  });
});
