import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardComposer } from './CardComposer';

const originalFetch = global.fetch;
const SPACE_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('CardComposer ("تک‌ورودی و preview-first"، انتخاب kind اجباری نیست)', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('has no kind selector anywhere in the form', () => {
    render(<CardComposer spaceId={SPACE_ID} onCreated={vi.fn()} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText(/گونه|kind/i)).not.toBeInTheDocument();
  });

  it('shows a live preview as soon as there is body text - plain generic text is always submittable', () => {
    render(<CardComposer spaceId={SPACE_ID} onCreated={vi.fn()} />);
    expect(screen.queryByText('پیش‌نمایش کارت')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('متن کارت'), { target: { value: 'یک متن کاملاً کلی و بدون ساختار خاص' } });

    expect(screen.getByText('پیش‌نمایش کارت')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت کارت' })).not.toBeDisabled();
  });

  it('submits body-only and reports the created card', async () => {
    const onCreated = vi.fn();
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        id: '22222222-2222-4222-8222-222222222222',
        spaceId: SPACE_ID,
        authorId: '33333333-3333-4333-8333-333333333333',
        kind: 'AWARENESS',
        status: 'ACTIVE',
        publishedAt: '2026-09-10T00:00:00.000Z',
        revision: { revisionNumber: 1, title: 'یک کارت متنی', body: 'یک کارت متنی' },
        inferredKind: 'AWARENESS',
        attachments: [],
      })
    ) as unknown as typeof fetch;

    render(<CardComposer spaceId={SPACE_ID} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText('متن کارت'), { target: { value: 'یک کارت متنی' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت کارت' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it('keeps the submit button disabled with no body and no attachment', () => {
    render(<CardComposer spaceId={SPACE_ID} onCreated={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'ثبت کارت' })).toBeDisabled();
  });
});
