import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CardInference } from '@taavon/contracts';
import { CardInferencePreview, type AcceptedInference } from './CardInferencePreview';

function inference(overrides: Partial<CardInference> = {}): CardInference {
  return {
    kind: 'REUSABLE_RESOURCE',
    confidence: 0.7,
    suggestedTitle: 'نردبان برای امانت',
    suggestedBody: 'یک نردبان دارم که می‌توانم قرض بدهم.',
    assumptions: ['پس از بسته‌شدن، این کارت دوباره فعال نمی‌شود؛ دفعهٔ بعد کارت تازه‌ای بسازید.'],
    creativityApplied: true,
    operationalPattern: { reservable: true, terminalCloseAfterUse: true },
    clarifyingQuestions: [
      {
        topic: 'RETURNABILITY',
        question: 'بعد از استفاده باید به شما برگردانده شود؟',
        behaviorAffected: 'اگر بله، کارت پس از بسته‌شدنِ امانت تمام می‌شود.',
      },
    ],
    ...overrides,
  };
}

function renderPreview(overrides: Partial<CardInference> = {}) {
  const onApply = vi.fn<(accepted: AcceptedInference) => void>();
  const onDismiss = vi.fn();
  render(<CardInferencePreview inference={inference(overrides)} onApply={onApply} onDismiss={onDismiss} />);
  return { onApply, onDismiss };
}

describe('nothing is applied without the person saying so', () => {
  it('calls nothing on render', () => {
    const { onApply, onDismiss } = renderPreview();
    expect(onApply).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismissing applies nothing at all', async () => {
    const user = userEvent.setup();
    const { onApply, onDismiss } = renderPreview();

    await user.click(screen.getByRole('button', { name: 'نادیده بگیر' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('applies everything when nothing is rejected', async () => {
    const user = userEvent.setup();
    const { onApply } = renderPreview();

    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    expect(onApply.mock.calls[0]![0]).toEqual({
      kind: 'REUSABLE_RESOURCE',
      title: 'نردبان برای امانت',
      body: 'یک نردبان دارم که می‌توانم قرض بدهم.',
      confirmedInference: { inferredKind: 'REUSABLE_RESOURCE', confidence: 0.7 },
    });
  });
});

describe('the kind, the title and the body are three separate decisions', () => {
  it('takes the kind while rejecting the wording', async () => {
    const user = userEvent.setup();
    const { onApply } = renderPreview();

    await user.click(screen.getByRole('checkbox', { name: 'این عنوان را بپذیر' }));
    await user.click(screen.getByRole('checkbox', { name: 'این متن را بپذیر' }));
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    const accepted = onApply.mock.calls[0]![0];
    expect(accepted.kind).toBe('REUSABLE_RESOURCE');
    expect(accepted.title).toBeUndefined();
    expect(accepted.body).toBeUndefined();
  });

  it('takes the wording while rejecting the kind', async () => {
    const user = userEvent.setup();
    const { onApply } = renderPreview();

    await user.click(screen.getByRole('checkbox', { name: 'این نوع را بپذیر' }));
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    const accepted = onApply.mock.calls[0]![0];
    expect(accepted.kind).toBeUndefined();
    // Nothing is recorded on the card's profile either, because they never
    // agreed to a classification.
    expect(accepted.confirmedInference).toBeUndefined();
    expect(accepted.title).toBe('نردبان برای امانت');
  });

  it('lets the suggested title be rewritten before it is taken', async () => {
    const user = userEvent.setup();
    const { onApply } = renderPreview();

    const field = screen.getByLabelText('عنوان پیشنهادی');
    await user.clear(field);
    await user.type(field, 'نردبان سه‌متری');
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    expect(onApply.mock.calls[0]![0].title).toBe('نردبان سه‌متری');
  });
});

describe('the kind can be corrected, not only taken or left', () => {
  it('sends the corrected kind', async () => {
    const user = userEvent.setup();
    const { onApply } = renderPreview();

    await user.selectOptions(screen.getByLabelText('نوع کارت'), 'SERVICE');
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    expect(onApply.mock.calls[0]![0].kind).toBe('SERVICE');
  });

  it('records full confidence when a person corrected it themselves', async () => {
    const user = userEvent.setup();
    const { onApply } = renderPreview({ confidence: 0.2 });

    await user.selectOptions(screen.getByLabelText('نوع کارت'), 'EVENT');
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    // A person saying so is a better signal than any classifier's own score.
    expect(onApply.mock.calls[0]![0].confirmedInference).toEqual({ inferredKind: 'EVENT', confidence: 1 });
  });

  it('shows the behaviour of the kind currently selected, not the one suggested', async () => {
    const user = userEvent.setup();
    renderPreview();

    expect(screen.getByText(/بستن آن نهایی است/)).toBeInTheDocument();

    // PARTICIPATION is not reservable, so there is nothing to close.
    await user.selectOptions(screen.getByLabelText('نوع کارت'), 'PARTICIPATION');

    expect(screen.getByText(/رزرو نمی‌شود/)).toBeInTheDocument();
    expect(screen.queryByText(/بستن آن نهایی است/)).not.toBeInTheDocument();
  });
});

describe('questions are offered, never demanded', () => {
  it('shows what answering would change', () => {
    renderPreview();

    expect(screen.getByText('بعد از استفاده باید به شما برگردانده شود؟')).toBeInTheDocument();
    expect(screen.getByText('اگر بله، کارت پس از بسته‌شدنِ امانت تمام می‌شود.')).toBeInTheDocument();
  });

  it('says out loud that answering is optional', () => {
    renderPreview();
    expect(screen.getByText(/پاسخ دادن اختیاری است/)).toBeInTheDocument();
  });

  it('applies fine with every question left unanswered', async () => {
    const user = userEvent.setup();
    const { onApply } = renderPreview();

    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    // There is no input to answer them in and no gate that checks: a
    // non-essential question is not allowed to stand in the way.
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('shows no question section when there is nothing worth asking', () => {
    renderPreview({ kind: 'AWARENESS', clarifyingQuestions: [], operationalPattern: { reservable: false, terminalCloseAfterUse: false } });
    expect(screen.queryByText(/پاسخ دادن اختیاری است/)).not.toBeInTheDocument();
  });
});

describe('the person is told which half wrote this', () => {
  it('says so when a model did', () => {
    renderPreview({ creativityApplied: true });
    expect(screen.getByText(/دستیار نوشته است/)).toBeInTheDocument();
  });

  it('says so when only rules did', () => {
    renderPreview({ creativityApplied: false });
    expect(screen.getByText(/دستیار در آن نقشی نداشته است/)).toBeInTheDocument();
  });

  it('states the assumptions rather than burying them', () => {
    renderPreview();
    expect(screen.getByText(/دوباره فعال نمی‌شود؛ دفعهٔ بعد کارت تازه‌ای بسازید/)).toBeInTheDocument();
  });
});
