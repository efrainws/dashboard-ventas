import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { inclusiveCalendarDays, percentageVariation } from '../shared/analytics';

const salesRouter = readFileSync(new URL('./salesRouter.ts', import.meta.url), 'utf8');
const hourlyAnalysis = readFileSync(new URL('../client/src/pages/HourlyAnalysis.tsx', import.meta.url), 'utf8');

describe('contrato de promedios y comparaciones analíticas', () => {
  it('calcula promedios con días calendario inclusivos', () => {
    expect(inclusiveCalendarDays('2026-07-20', '2026-08-03')).toBe(15);
    expect(inclusiveCalendarDays('2026-08-03', '2026-08-03')).toBe(1);
  });

  it('evita porcentajes engañosos cuando el período anterior es cero', () => {
    expect(percentageVariation(120, 100)).toBe(20);
    expect(percentageVariation(0, 0)).toBe(0);
    expect(percentageVariation(120, 0)).toBeNull();
  });

  it('mantiene los canales del análisis en la consulta comparativa', () => {
    expect(salesRouter).toContain('sales_channels: z.array');
    expect(salesRouter).toContain('sales_channel = ANY');
    expect(hourlyAnalysis).toContain('sales_channels: selectedChannels.length === 3');
    expect(hourlyAnalysis).toContain('selectedChannels as ("Presencial" | "eCommerce" | "Rappi")[]');
  });
});
