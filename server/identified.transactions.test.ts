/**
 * Tests para el procedimiento sales.getIdentifiedTransactions
 * Verifica la lógica de transformación de datos y el manejo de filtros
 */
import { describe, it, expect } from "vitest";

// ─── Helpers replicados del procedimiento ────────────────────────────────────

function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function percentColor(pct: number): string {
  if (pct < 75) return "#BC2C46";
  if (pct < 90) return "#C49705";
  if (pct < 100) return "#1A6894";
  return "#008064";
}

interface StoreRow {
  nombre: string;
  codigo_tienda: string;
  total_transactions: number;
  identified_transactions: number;
  identified_percentage: number;
}

function aggregateByStore(rows: Array<{
  sale_day: string;
  nombre: string;
  codigo_tienda: string;
  total_transactions: number;
  identified_transactions: number;
  identified_percentage: number;
}>): StoreRow[] {
  const map = new Map<string, StoreRow>();

  for (const row of rows) {
    const key = row.codigo_tienda || row.nombre;
    const existing = map.get(key);
    if (existing) {
      existing.total_transactions += row.total_transactions;
      existing.identified_transactions += row.identified_transactions;
    } else {
      map.set(key, {
        nombre: row.nombre,
        codigo_tienda: row.codigo_tienda,
        total_transactions: row.total_transactions,
        identified_transactions: row.identified_transactions,
        identified_percentage: 0,
      });
    }
  }

  const result = Array.from(map.values()).map((r) => ({
    ...r,
    identified_percentage:
      r.total_transactions > 0
        ? Math.round((r.identified_transactions / r.total_transactions) * 10000) / 100
        : 0,
  }));

  result.sort((a, b) => {
    const na = parseInt(a.codigo_tienda?.replace(/\D/g, "") || "0", 10);
    const nb = parseInt(b.codigo_tienda?.replace(/\D/g, "") || "0", 10);
    return na - nb;
  });

  return result;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("identified-transactions: toLocalDate helper", () => {
  it("formatea la fecha en YYYY-MM-DD sin desfase UTC", () => {
    const d = new Date(2026, 2, 11); // 11 de marzo 2026 (local)
    expect(toLocalDate(d)).toBe("2026-03-11");
  });

  it("rellena con cero los meses y días de un dígito", () => {
    const d = new Date(2026, 0, 5); // 5 de enero 2026
    expect(toLocalDate(d)).toBe("2026-01-05");
  });
});

describe("identified-transactions: percentColor helper", () => {
  it("devuelve Granate para porcentajes menores a 75", () => {
    expect(percentColor(50)).toBe("#BC2C46");
    expect(percentColor(74.9)).toBe("#BC2C46");
  });

  it("devuelve Mostaza para porcentajes entre 75 y 89.9", () => {
    expect(percentColor(75)).toBe("#C49705");
    expect(percentColor(89.9)).toBe("#C49705");
  });

  it("devuelve Cobalto para porcentajes entre 90 y 99.9", () => {
    expect(percentColor(90)).toBe("#1A6894");
    expect(percentColor(99.9)).toBe("#1A6894");
  });

  it("devuelve Esmeralda para porcentaje igual a 100", () => {
    expect(percentColor(100)).toBe("#008064");
  });
});

describe("identified-transactions: aggregateByStore", () => {
  const mockRows = [
    // Tienda 001 — 2 días
    { sale_day: "2026-03-10", nombre: "Tienda Lima", codigo_tienda: "001", total_transactions: 100, identified_transactions: 80, identified_percentage: 80 },
    { sale_day: "2026-03-11", nombre: "Tienda Lima", codigo_tienda: "001", total_transactions: 200, identified_transactions: 160, identified_percentage: 80 },
    // Tienda 002 — 1 día
    { sale_day: "2026-03-10", nombre: "Tienda Miraflores", codigo_tienda: "002", total_transactions: 50, identified_transactions: 30, identified_percentage: 60 },
    // Tienda 010 — 1 día
    { sale_day: "2026-03-10", nombre: "Tienda San Isidro", codigo_tienda: "010", total_transactions: 75, identified_transactions: 75, identified_percentage: 100 },
  ];

  it("agrupa filas por tienda sumando transacciones", () => {
    const result = aggregateByStore(mockRows);
    const lima = result.find((r) => r.codigo_tienda === "001")!;
    expect(lima.total_transactions).toBe(300);
    expect(lima.identified_transactions).toBe(240);
  });

  it("recalcula el porcentaje correctamente", () => {
    const result = aggregateByStore(mockRows);
    const lima = result.find((r) => r.codigo_tienda === "001")!;
    expect(lima.identified_percentage).toBe(80);
  });

  it("ordena las tiendas por codigo_tienda numérico ascendente", () => {
    const result = aggregateByStore(mockRows);
    const codes = result.map((r) => r.codigo_tienda);
    expect(codes).toEqual(["001", "002", "010"]);
  });

  it("devuelve 0% para tiendas sin transacciones", () => {
    const emptyRows = [
      { sale_day: "2026-03-10", nombre: "Tienda Vacía", codigo_tienda: "099", total_transactions: 0, identified_transactions: 0, identified_percentage: 0 },
    ];
    const result = aggregateByStore(emptyRows);
    expect(result[0].identified_percentage).toBe(0);
  });

  it("calcula el resumen consolidado correctamente", () => {
    const result = aggregateByStore(mockRows);
    const total = result.reduce((s, r) => s + r.total_transactions, 0);
    const identified = result.reduce((s, r) => s + r.identified_transactions, 0);
    const pct = total > 0 ? Math.round((identified / total) * 10000) / 100 : 0;
    expect(total).toBe(425);
    expect(identified).toBe(345);
    expect(pct).toBeCloseTo(81.18, 1);
  });

  it("maneja correctamente tiendas sin codigo_tienda (usa nombre como clave)", () => {
    const noCodeRows = [
      { sale_day: "2026-03-10", nombre: "Tienda Sin Código", codigo_tienda: "", total_transactions: 10, identified_transactions: 8, identified_percentage: 80 },
    ];
    const result = aggregateByStore(noCodeRows);
    expect(result).toHaveLength(1);
    expect(result[0].identified_percentage).toBe(80);
  });
});
