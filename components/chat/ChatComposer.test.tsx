import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatComposer } from './ChatComposer';

describe('ChatComposer', () => {
  it('sends what was typed and clears itself', async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} />);

    await userEvent.type(screen.getByLabelText('پیام'), 'سلام');
    await userEvent.click(screen.getByLabelText('ارسال'));

    expect(onSend).toHaveBeenCalledWith('سلام');
    expect((screen.getByLabelText('پیام') as HTMLTextAreaElement).value).toBe('');
  });

  it('sends on Enter but adds a line on Shift+Enter', async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} />);
    const input = screen.getByLabelText('پیام');

    await userEvent.type(input, 'خط اول{Shift>}{Enter}{/Shift}خط دوم');
    expect(onSend).not.toHaveBeenCalled();

    await userEvent.type(input, '{Enter}');
    expect(onSend).toHaveBeenCalledWith('خط اول\nخط دوم');
  });

  it('will not send an empty or whitespace-only message', async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} />);

    expect(screen.getByLabelText('ارسال')).toBeDisabled();
    await userEvent.type(screen.getByLabelText('پیام'), '   ');
    await userEvent.type(screen.getByLabelText('پیام'), '{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  describe('the sensitive-data warning', () => {
    it('holds a phone number back once, and asks rather than refuses', async () => {
      const onSend = vi.fn();
      render(<ChatComposer onSend={onSend} />);

      await userEvent.type(screen.getByLabelText('پیام'), 'شمارم 09123456789');
      await userEvent.click(screen.getByLabelText('ارسال'));

      expect(screen.getByTestId('sensitive-warning')).toBeInTheDocument();
      expect(onSend).not.toHaveBeenCalled();
      // Both ways forward are offered; neither is hidden behind the other.
      expect(screen.getByRole('button', { name: /ویرایش می‌کنم/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /با آگاهی ارسال می‌کنم/ })).toBeInTheDocument();
    });

    it('sends it when the person says they mean to', async () => {
      const onSend = vi.fn();
      render(<ChatComposer onSend={onSend} />);

      await userEvent.type(screen.getByLabelText('پیام'), 'شمارم 09123456789');
      await userEvent.click(screen.getByLabelText('ارسال'));
      await userEvent.click(screen.getByRole('button', { name: /با آگاهی ارسال می‌کنم/ }));

      expect(onSend).toHaveBeenCalledWith('شمارم 09123456789');
      expect(screen.queryByTestId('sensitive-warning')).not.toBeInTheDocument();
    });

    it('goes back to the text when the person chooses to edit, without sending', async () => {
      const onSend = vi.fn();
      render(<ChatComposer onSend={onSend} />);

      await userEvent.type(screen.getByLabelText('پیام'), 'شمارم 09123456789');
      await userEvent.click(screen.getByLabelText('ارسال'));
      await userEvent.click(screen.getByRole('button', { name: /ویرایش می‌کنم/ }));

      expect(onSend).not.toHaveBeenCalled();
      expect(screen.queryByTestId('sensitive-warning')).not.toBeInTheDocument();
      expect((screen.getByLabelText('پیام') as HTMLTextAreaElement).value).toBe('شمارم 09123456789');
    });

    it('warns again if the person edits the number and tries once more', async () => {
      const onSend = vi.fn();
      render(<ChatComposer onSend={onSend} />);
      const input = screen.getByLabelText('پیام');

      await userEvent.type(input, 'شمارم 09123456789');
      await userEvent.click(screen.getByLabelText('ارسال'));
      await userEvent.click(screen.getByRole('button', { name: /ویرایش می‌کنم/ }));

      await userEvent.type(input, '!');
      await userEvent.click(screen.getByLabelText('ارسال'));
      expect(screen.getByTestId('sensitive-warning')).toBeInTheDocument();
      expect(onSend).not.toHaveBeenCalled();
    });

    it('never appears for an ordinary message', async () => {
      const onSend = vi.fn();
      render(<ChatComposer onSend={onSend} />);

      await userEvent.type(screen.getByLabelText('پیام'), 'فردا ساعت ۸ میام');
      await userEvent.click(screen.getByLabelText('ارسال'));

      expect(screen.queryByTestId('sensitive-warning')).not.toBeInTheDocument();
      expect(onSend).toHaveBeenCalled();
    });

    it('offers nothing that would fill in the person\'s own number for them', () => {
      render(<ChatComposer onSend={vi.fn()} />);
      // "هیچ contact خودکار": the only route to a phone number is typing one.
      expect(screen.queryByRole('button', { name: /شماره|مخاطب|contact/i })).not.toBeInTheDocument();
    });
  });

  describe('reply', () => {
    it('shows what is being replied to and can cancel it', async () => {
      const onCancelReply = vi.fn();
      render(
        <ChatComposer onSend={vi.fn()} replyingTo={{ id: 'm1', body: 'پیام اصلی' }} onCancelReply={onCancelReply} />
      );

      expect(screen.getByTestId('reply-preview')).toHaveTextContent('پیام اصلی');
      await userEvent.click(screen.getByLabelText('لغو پاسخ'));
      expect(onCancelReply).toHaveBeenCalled();
    });
  });

  describe('typing', () => {
    it('reports typing once it has content, and stops on send', async () => {
      const onTypingChange = vi.fn();
      render(<ChatComposer onSend={vi.fn()} onTypingChange={onTypingChange} />);

      await userEvent.type(screen.getByLabelText('پیام'), 'س');
      expect(onTypingChange).toHaveBeenCalledWith(true);

      onTypingChange.mockClear();
      await userEvent.click(screen.getByLabelText('ارسال'));
      expect(onTypingChange).toHaveBeenCalledWith(false);
    });
  });

  it('starts from a draft when one is given', () => {
    render(<ChatComposer onSend={vi.fn()} initialText="پیش‌نویس همیار" />);
    expect((screen.getByLabelText('پیام') as HTMLTextAreaElement).value).toBe('پیش‌نویس همیار');
  });
});
