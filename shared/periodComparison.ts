/** Rango equivalente inmediatamente anterior, con la misma cantidad de días calendario. */
export function getEquivalentPreviousRange(from: string, to: string): { from: string; to: string } {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  const previousTo = new Date(fromDate.getTime() - 86_400_000);
  const previousFrom = new Date(previousTo.getTime() - (days - 1) * 86_400_000);
  return {
    from: previousFrom.toISOString().slice(0, 10),
    to: previousTo.toISOString().slice(0, 10),
  };
}

export function percentageVariation(current: number | string | null | undefined, previous: number | string | null | undefined): number | null {
  const currentNumber = Number(current ?? 0);
  const previousNumber = Number(previous ?? 0);
  if (!Number.isFinite(currentNumber) || !Number.isFinite(previousNumber) || previousNumber === 0) return null;
  return ((currentNumber - previousNumber) / Math.abs(previousNumber)) * 100;
}
