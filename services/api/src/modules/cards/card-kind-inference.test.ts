import { describe, expect, it } from 'vitest';
import { inferCardKind } from './card-kind-inference';

describe('inferCardKind', () => {
  it('defaults to AWARENESS with low confidence when nothing matches', () => {
    const result = inferCardKind('یک اطلاعیهٔ کلی برای همسایه‌ها');
    expect(result.inferredKind).toBe('AWARENESS');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('infers REQUEST from asking language', () => {
    const result = inferCardKind('به کمک نیاز دارم برای جابه‌جایی وسایل، لطفاً');
    expect(result.inferredKind).toBe('REQUEST');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('infers EVENT from scheduling language', () => {
    expect(inferCardKind('جلسهٔ هماهنگی روز جمعه ساعت ۱۰ صبح').inferredKind).toBe('EVENT');
  });

  it('infers SERVICE from offering language', () => {
    expect(inferCardKind('خدمات تعمیر دوچرخه را رایگان ارائه می‌دهم').inferredKind).toBe('SERVICE');
  });

  it('infers OBSERVATION from reporting-what-was-seen language', () => {
    expect(inferCardKind('امروز دیدم که شیر آب پارک نشتی دارد و گزارش می‌دهم').inferredKind).toBe('OBSERVATION');
  });

  it('infers PARTICIPATION from call-to-join language', () => {
    expect(inferCardKind('بیایید با هم داوطلبانه در پاک‌سازی محله مشارکت کنیم').inferredKind).toBe('PARTICIPATION');
  });

  it('is a pure function - same input, same output', () => {
    const text = 'به کمک نیاز دارم';
    expect(inferCardKind(text)).toEqual(inferCardKind(text));
  });

  it('never returns a confidence outside [0, 1]', () => {
    for (const text of ['', 'کمک نیاز دارم درخواست لطفاً می‌خواهم', 'اطلاعیه']) {
      const { confidence } = inferCardKind(text);
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    }
  });
});
