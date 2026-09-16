import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EXAMPLE_CARD_NOTICE, type SpaceCreationGuidance } from '@taavon/contracts';
import { CooperationGuidance, type AcceptedGuidance } from './CooperationGuidance';

function guidance(overrides: Partial<SpaceCreationGuidance> = {}): SpaceCreationGuidance {
  return {
    title: 'امانات ابزار محله',
    purpose: 'اهالی محله ابزارهایی که کم استفاده می‌شوند را برای امانت در اختیار هم می‌گذارند.',
    assumptions: ['فرض شد این بستر برای اهالی یک محله است.'],
    strengths: ['از یک نیاز واقعی شروع شده است.'],
    risks: ['هنوز روشن نیست چه کسی هماهنگی را بر عهده می‌گیرد.'],
    questions: ['چه کسی اولین قدم را برمی‌دارد؟'],
    suggestedRevisions: [
      { field: 'purpose', value: 'متن پیشنهادی برای هدف', reason: 'توضیح هدف را کامل‌تر بنویسید.' },
      { field: 'participationMethods', value: 'حضوری', reason: 'حداقل یک روش مشارکت مشخص کنید.' },
    ],
    participationRoles: [
      { title: 'هماهنگ‌کننده', description: 'کارها را تقسیم می‌کند.', isPrimary: true },
      { title: 'مشارکت‌کننده', description: 'در انجام کار سهم می‌گیرد.', isPrimary: true },
    ],
    valueChainNodes: ['شناسایی نیاز', 'هماهنگی'],
    exampleCardTemplates: [
      { title: 'نمونه: اعلام آمادگی', body: 'من می‌توانم پنجشنبه‌ها کمک کنم.', isExample: true, notice: EXAMPLE_CARD_NOTICE },
    ],
    suggestedToolKeys: ['coordination', 'scheduling'],
    creationDecision: 'ALLOW',
    matchedPolicyRules: [],
    safetyLevel: 'NORMAL',
    policyVersionRef: 'baseline:v1:8rules',
    ...overrides,
  };
}

function renderGuidance(overrides: Partial<SpaceCreationGuidance> = {}) {
  const onApply = vi.fn<(accepted: AcceptedGuidance) => void>();
  const onEdit = vi.fn();
  render(<CooperationGuidance guidance={guidance(overrides)} onApply={onApply} onEdit={onEdit} />);
  return { onApply, onEdit };
}

describe('the four decisions', () => {
  it('ALLOW says so and still offers every suggestion as optional', () => {
    renderGuidance({ creationDecision: 'ALLOW' });

    expect(screen.getByRole('status')).toHaveTextContent('این بستر آمادهٔ انتشار است.');
    expect(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' })).toBeInTheDocument();
  });

  it('REVISE names what is missing, without calling it a refusal', () => {
    renderGuidance({ creationDecision: 'REVISE' });

    expect(screen.getByRole('status')).toHaveTextContent('چند مورد را کامل کنید');
    expect(screen.getByRole('status')).toHaveTextContent('هیچ‌چیز رد نشده است');
    expect(screen.getByText('توضیح هدف را کامل‌تر بنویسید.')).toBeInTheDocument();
  });

  it('HUMAN_REVIEW says a person is looking, and says it is not a violation', () => {
    renderGuidance({ creationDecision: 'HUMAN_REVIEW', safetyLevel: 'REVIEW' });

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('یک نفر این درخواست را بررسی می‌کند.');
    // The distinction this whole task turns on: needing a person is not a
    // finding against anybody.
    expect(banner).toHaveTextContent('این به معنای تخلف نیست');
  });

  it('BLOCK cites the rule and the law, and hides the suggestions there is nothing to apply to', () => {
    renderGuidance({
      creationDecision: 'BLOCK',
      safetyLevel: 'SEVERE',
      matchedPolicyRules: ['gambling@v1 — قانون مجازات اسلامی، مواد ۷۰۵ تا ۷۱۱'],
    });

    expect(screen.getByRole('status')).toHaveTextContent('منتشر نخواهد شد');
    expect(screen.getByText('gambling@v1 — قانون مجازات اسلامی، مواد ۷۰۵ تا ۷۱۱')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'اعمال موارد انتخاب‌شده' })).not.toBeInTheDocument();
    // A way back always exists.
    expect(screen.getByRole('button', { name: 'بازگشت و ویرایش' })).toBeInTheDocument();
  });
});

describe('every section is accepted or rejected on its own', () => {
  it('keeps the roles while dropping the example cards', async () => {
    const user = userEvent.setup();
    const { onApply } = renderGuidance();

    await user.click(screen.getByRole('checkbox', { name: /نمونه: اعلام آمادگی/ }));
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    const accepted = onApply.mock.calls[0]![0];
    expect(accepted.participationRoles).toHaveLength(2);
    expect(accepted.exampleCardTemplates).toEqual([]);
    // Dropping the cards changed nothing else.
    expect(accepted.valueChainNodes).toHaveLength(2);
    expect(accepted.suggestedToolKeys).toEqual(['coordination', 'scheduling']);
  });

  it('keeps one tool key while dropping the other', async () => {
    const user = userEvent.setup();
    const { onApply } = renderGuidance();

    await user.click(screen.getByRole('checkbox', { name: 'scheduling' }));
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    expect(onApply.mock.calls[0]![0].suggestedToolKeys).toEqual(['coordination']);
  });

  it('drops a single chain node without touching the rest', async () => {
    const user = userEvent.setup();
    const { onApply } = renderGuidance();

    await user.click(screen.getByRole('checkbox', { name: 'هماهنگی' }));
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    expect(onApply.mock.calls[0]![0].valueChainNodes).toEqual(['شناسایی نیاز']);
  });

  it('rejects every suggestion and applies nothing', async () => {
    const user = userEvent.setup();
    const { onApply } = renderGuidance();

    for (const checkbox of screen.getAllByRole('checkbox')) {
      await user.click(checkbox);
    }
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    const accepted = onApply.mock.calls[0]![0];
    expect(accepted.revisions).toEqual([]);
    expect(accepted.participationRoles).toEqual([]);
    expect(accepted.valueChainNodes).toEqual([]);
    expect(accepted.exampleCardTemplates).toEqual([]);
    expect(accepted.suggestedToolKeys).toEqual([]);
  });
});

describe('the strengths, risks and revisions are the person\'s to edit', () => {
  it('lets a strength be rewritten', async () => {
    const user = userEvent.setup();
    const { onApply } = renderGuidance();

    const field = screen.getByLabelText('نقطهٔ قوت 1');
    await user.clear(field);
    await user.type(field, 'اهالی از قبل همدیگر را می‌شناسند.');
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    expect(onApply.mock.calls[0]![0].strengths).toEqual(['اهالی از قبل همدیگر را می‌شناسند.']);
  });

  it('lets a risk be removed and another added', async () => {
    const user = userEvent.setup();
    const { onApply } = renderGuidance();

    await user.click(screen.getByRole('button', { name: 'حذف ریسک 1' }));
    await user.click(screen.getByRole('button', { name: '+ افزودن ریسک' }));
    await user.type(screen.getByLabelText('ریسک 1'), 'ابزار ممکن است برنگردد.');
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    expect(onApply.mock.calls[0]![0].risks).toEqual(['ابزار ممکن است برنگردد.']);
  });

  it('lets a suggested revision be edited before it is accepted', async () => {
    const user = userEvent.setup();
    const { onApply } = renderGuidance();

    const field = screen.getByLabelText('متن پیشنهادی 1');
    await user.clear(field);
    await user.type(field, 'هدف واقعی من این است.');
    await user.click(screen.getByRole('button', { name: 'اعمال موارد انتخاب‌شده' }));

    const revisions = onApply.mock.calls[0]![0].revisions;
    expect(revisions[0]).toMatchObject({ field: 'purpose', value: 'هدف واقعی من این است.' });
  });

  it('applies nothing on its own - onApply is the only way anything leaves', () => {
    const { onApply } = renderGuidance();
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe('what it shows, and what it never shows', () => {
  it('states the assumptions it had to make', () => {
    renderGuidance();
    expect(screen.getByText('فرض شد این بستر برای اهالی یک محله است.')).toBeInTheDocument();
  });

  it('marks every example card with the notice from the schema', () => {
    renderGuidance();
    expect(screen.getByText(EXAMPLE_CARD_NOTICE)).toBeInTheDocument();
  });

  it('names the baseline that produced the decision', () => {
    renderGuidance();
    expect(screen.getByText(/baseline:v1:8rules/)).toBeInTheDocument();
  });

  it('carries no score or rating for the person', () => {
    const { container } = render(
      <CooperationGuidance guidance={guidance()} onApply={vi.fn()} onEdit={vi.fn()} />
    );
    // "هیچ piety/person score" - the output describes a proposal; nothing
    // here ranks a human being.
    expect(container.textContent).not.toMatch(/امتیاز|تقوا|رتبه|نمره/);
  });
});
