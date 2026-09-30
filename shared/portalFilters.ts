/**
 * Utilidades puras para serializar y validar el estado aplicado de los filtros
 * de los portales. No mantienen estado ni modifican el historial del navegador.
 */

export function getPortalSearchParams(location: string): URLSearchParams {
  const queryIndex = location.indexOf("?");
  return new URLSearchParams(queryIndex >= 0 ? location.slice(queryIndex + 1) : "");
}

export function readOptionalString(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value || undefined;
}

export function readOptionalPositiveInteger(params: URLSearchParams, key: string): number | undefined {
  const value = readOptionalString(params, key);
  if (!value || !/^\d+$/.test(value)) return undefined;
  const numberValue = Number(value);
  return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

export function readBoolean(params: URLSearchParams, key: string, fallback: boolean): boolean {
  const value = params.get(key);
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

export function readStringList(params: URLSearchParams, key: string, allowed?: readonly string[]): string[] {
  const raw = readOptionalString(params, key);
  if (!raw) return [];

  const seen = new Set<string>();
  for (const item of raw.split(",")) {
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    if (allowed && !allowed.includes(value)) continue;
    seen.add(value);
  }
  return Array.from(seen);
}

/** Verifica un día ISO real, sin depender de la zona horaria del navegador. */
export function isValidIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function readDateRange(
  params: URLSearchParams,
  defaults: { from: string; to: string },
): { from: string; to: string } {
  const from = params.get("from") ?? defaults.from;
  const to = params.get("to") ?? defaults.to;

  if (!isValidIsoDate(from) || !isValidIsoDate(to) || from > to) {
    return defaults;
  }
  return { from, to };
}

export function buildPortalLocation(
  pathname: string,
  values: Record<string, string | number | boolean | string[] | undefined>,
): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(","));
      continue;
    }
    if (typeof value === "boolean") {
      params.set(key, value ? "1" : "0");
      continue;
    }
    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function equalStringArrays(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
