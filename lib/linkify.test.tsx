import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderPlainTextWithLinks } from './linkify';

describe('renderPlainTextWithLinks', () => {
  it('renders plain text with no links untouched', () => {
    render(<p>{renderPlainTextWithLinks('یک متن ساده بدون لینک')}</p>);
    expect(screen.getByText('یک متن ساده بدون لینک')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('turns a bare URL into a real link with a safe rel and target', () => {
    render(<p>{renderPlainTextWithLinks('ببینید https://example.org/info برای جزئیات')}</p>);
    const link = screen.getByRole('link', { name: 'https://example.org/info' });
    expect(link).toHaveAttribute('href', 'https://example.org/info');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('handles multiple links and keeps the surrounding text as text', () => {
    render(<p>{renderPlainTextWithLinks('اول https://a.example دوم https://b.example پایان')}</p>);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText(/پایان/)).toBeInTheDocument();
  });

  it('never interprets angle brackets as HTML - a script-like string stays literal text', () => {
    render(<p>{renderPlainTextWithLinks('<script>alert(1)</script>')}</p>);
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});
