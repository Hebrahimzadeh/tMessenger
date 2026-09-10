import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommentComposer } from './CommentComposer';

describe('CommentComposer', () => {
  it('uses the exact public-first CTA phrase by default', () => {
    render(<CommentComposer onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'پرسش یا مشارکت عمومی' })).toBeInTheDocument();
  });

  it('disables submit until there is non-whitespace text', () => {
    render(<CommentComposer onSubmit={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'پرسش یا مشارکت عمومی' });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText('متن نظر'), { target: { value: '   ' } });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText('متن نظر'), { target: { value: 'سلام' } });
    expect(button).not.toBeDisabled();
  });

  it('calls onSubmit with the trimmed body and clears the field on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CommentComposer onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('متن نظر'), { target: { value: '  سلام دنیا  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'پرسش یا مشارکت عمومی' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('سلام دنیا'));
    await waitFor(() => expect(screen.getByLabelText('متن نظر')).toHaveValue(''));
  });

  it('shows an error and keeps the text when onSubmit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('failed'));
    render(<CommentComposer onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('متن نظر'), { target: { value: 'متن من' } });
    fireEvent.click(screen.getByRole('button', { name: 'پرسش یا مشارکت عمومی' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByLabelText('متن نظر')).toHaveValue('متن من');
  });
});
