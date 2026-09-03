import { describe, expect, it } from 'vitest';
import { inclusiveCalendarDays, percentageVariation } from './analytics';

describe('métricas analíticas', () => {
  it('cuenta los días calendario de forma inclusiva', () => {
    expect(inclusiveCalendarDays('2026-07-20', '2026-08-03')).toBe(15);
    expect(inclusiveCalendarDays('2026-08-03', '2026-08-03')).toBe(1);
  });

  it('maneja la variación frente a un período anterior sin ventas', () => {
    expect(percentageVariation(120, 100)).toBe(20);
    expect(percentageVariation(0, 0)).toBe(0);
    expect(percentageVariation(120, 0)).toBeNull();
  });
});
