import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CreateCardSheet } from './CreateCardSheet';

describe('CreateCardSheet', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <CreateCardSheet isOpen={false} spaceId="11111111-1111-4111-8111-111111111111" onClose={vi.fn()} onCreated={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('hosts the composer and closes via the cancel action', () => {
    const onClose = vi.fn();
    render(<CreateCardSheet isOpen spaceId="11111111-1111-4111-8111-111111111111" onClose={onClose} onCreated={vi.fn()} />);
    expect(screen.getByLabelText('متن کارت')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));
    expect(onClose).toHaveBeenCalled();
  });
});
