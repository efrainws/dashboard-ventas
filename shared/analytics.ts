const DAY_MS = 86_400_000;

/** Calcula días calendario inclusivos a partir de fechas ISO sin depender de UTC. */
export function inclusiveCalendarDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate.slice(0, 10)}T12:00:00`);
  const end = new Date(`${endDate.slice(0, 10)}T12:00:00`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
}

/** Devuelve null cuando la variación porcentual no es matemáticamente comparable. */
export function percentageVariation(currentValue: number, previousValue: number): number | null {
  if (previousValue === 0) return currentValue === 0 ? 0 : null;
  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}
