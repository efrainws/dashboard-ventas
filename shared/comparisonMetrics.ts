export type MetricComparison = {
  current: number;
  comparison: number;
  difference: number;
  percentage: number | null;
};

/**
 * Compares the same entity across two periods. A zero comparison value has no
 * percentage, avoiding infinite or misleading values in every visualization.
 */
export function compareMetric(current: number, comparison: number): MetricComparison {
  const difference = current - comparison;
  return {
    current,
    comparison,
    difference,
    percentage: comparison === 0 ? null : (difference / comparison) * 100,
  };
}

export function formatSignedNumber(value: number, fractionDigits = 0): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toLocaleString("es-PE", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}
