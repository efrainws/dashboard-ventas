export type HeatmapCellValue = number | null;

/** Suma las franjas horarias de cada fecha sin modificar la matriz original. */
export function calculateRowTotals(matrix: readonly (readonly HeatmapCellValue[])[]): number[] {
  return matrix.map((row) => row.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

/** Calcula el promedio solo de períodos que registran actividad, como los tooltips por hora. */
export function calculatePositiveAverage(values: readonly number[]): number | null {
  const valuesWithActivity = values.filter((value) => value > 0);
  if (valuesWithActivity.length === 0) return null;
  return valuesWithActivity.reduce((sum, value) => sum + value, 0) / valuesWithActivity.length;
}
