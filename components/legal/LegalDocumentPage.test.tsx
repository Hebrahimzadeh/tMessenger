import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LegalDocumentPage } from './LegalDocumentPage';

describe('LegalDocumentPage', () => {
  it('renders the title and current version number', () => {
    render(<LegalDocumentPage title="قوانین و مقررات" version={3} />);
    expect(screen.getByRole('heading', { name: 'قوانین و مقررات' })).toBeInTheDocument();
    expect(screen.getByText('نسخهٔ فعلی: 3')).toBeInTheDocument();
  });

  it('sets a right-to-left direction', () => {
    const { container } = render(<LegalDocumentPage title="حریم خصوصی" version={1} />);
    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl');
  });

  it('shows the placeholder-content notice, so nobody mistakes it for real legal text', () => {
    render(<LegalDocumentPage title="قوانین و مقررات" version={1} />);
    expect(screen.getByText(/نمونه/)).toBeInTheDocument();
  });

  it('shows a fallback notice instead of crashing when unavailable', () => {
    render(<LegalDocumentPage title="قوانین و مقررات" version={null} />);
    expect(screen.getByText(/در دسترس نیست/)).toBeInTheDocument();
  });
});
