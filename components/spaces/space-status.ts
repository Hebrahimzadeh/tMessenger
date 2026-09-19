import type { SpaceStatus } from '@taavon/contracts';

/**
 * What a space's status is called in the interface.
 *
 * PUBLISHED is absent on purpose: a published space wears no badge, exactly
 * as a normal chat carries no label. Everything else is something the person
 * who owns it needs to see at a glance, which is why these read as states of
 * the space ("در انتظار بررسی") rather than as verdicts on the person.
 */
export const SPACE_STATUS_LABELS: Record<Exclude<SpaceStatus, 'PUBLISHED'>, string> = {
  DRAFT: 'پیش‌نویس',
  PRECHECK_REQUIRED: 'نیاز به بازبینی',
  HUMAN_REVIEW: 'در انتظار بررسی',
  TEMPORARILY_SUSPENDED: 'به‌طور موقت معلق',
  ARCHIVED: 'بایگانی‌شده',
  REMOVED: 'حذف‌شده',
};

export function spaceStatusLabel(status: SpaceStatus): string | null {
  return status === 'PUBLISHED' ? null : SPACE_STATUS_LABELS[status];
}
