import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders the initials derived from displayName', () => {
    render(<Avatar displayName="علی رضایی" seed="user-1" />);
    expect(screen.getByText('عر')).toBeInTheDocument();
  });

  it('applies a deterministic background color for the same seed', () => {
    const { container: a } = render(<Avatar displayName="علی" seed="user-1" />);
    const { container: b } = render(<Avatar displayName="علی" seed="user-1" />);
    const styleA = (a.firstElementChild as HTMLElement).style.backgroundColor;
    const styleB = (b.firstElementChild as HTMLElement).style.backgroundColor;
    expect(styleA).toBe(styleB);
    expect(styleA).not.toBe('');
  });

  it('has an accessible label naming the person, not just decorative initials', () => {
    render(<Avatar displayName="علی رضایی" seed="user-1" />);
    expect(screen.getByLabelText('تصویر پروفایل علی رضایی')).toBeInTheDocument();
  });
});
