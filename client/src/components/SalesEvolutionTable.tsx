/**
 * SalesEvolutionTable — formato PIVOTADO
 * Filas: combinaciones únicas de (producto × tienda) según los toggles activos.
 * Columnas: un período por columna (día / semana / mes) + columna Total.
 * Reutilizable en SupplierPortal y OwnBrandPortal.
 */

import { useState, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v);

const fmtQty = (v: number) => v.toLocaleString("es-PE");

export type Granularity = "day" | "week" | "month";

export interface EvolutionRow {
  period: string | Date;
  product_id: string | null;
  producto: string;
  sku: string;
  branch_id: string | null;
  tienda: string;
  sap_id: string | null;
  amount: string;
  quantity: string;
}

interface SalesEvolutionTableProps {
  data: EvolutionRow[] | undefined;
  isLoading: boolean;
  granularity: Granularity;
  setGranularity: (g: Granularity) => void;
  showProduct: boolean;
  showStore: boolean;
  includeIgv: boolean;
}

type Metric = "amount" | "quantity";

// ─── Period helpers ──────────────────────────────────────────────────────────

/** Normaliza period (Date | string) a un string ISO "YYYY-MM-DD" para usar como key */
function periodKey(period: string | Date): string {
  if (period instanceof Date) {
    return period.toISOString().slice(0, 10);
  }
  return String(period).slice(0, 10);
}

/** Formatea la cabecera de columna según la granularidad */
function formatPeriodHeader(key: string, granularity: Granularity): string {
  const d = new Date(key + "T00:00:00");
  if (isNaN(d.getTime())) return key;
  if (granularity === "day") {
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
  }
  if (granularity === "week") {
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return `${d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })} – ${end.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}`;
  }
  // month
  return d.toLocaleDateString("es-PE", { month: "short", year: "2-digit" });
}

/** Clave de fila según las dimensiones activas */
function rowKey(row: EvolutionRow, showProduct: boolean, showStore: boolean): string {
  const p = showProduct ? (row.product_id ?? row.producto) : "__ALL__";
  const s = showStore ? (row.branch_id ?? row.tienda) : "__ALL__";
  return `${p}||${s}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SalesEvolutionTable({
  data,
  isLoading,
  granularity,
  setGranularity,
  showProduct,
  showStore,
  includeIgv,
}: SalesEvolutionTableProps) {
  const [metric, setMetric] = useState<Metric>("amount");

  // ── Pivot ────────────────────────────────────────────────────────────────
  const { periods, pivotRows, grandTotal } = useMemo(() => {
    if (!data || data.length === 0) {
      return { periods: [] as string[], pivotRows: [] as PivotRow[], grandTotal: {} as Record<string, number> };
    }

    // 1. Recoger todos los períodos únicos ordenados
    const periodSet = new Set<string>();
    data.forEach(r => periodSet.add(periodKey(r.period)));
    const periods = Array.from(periodSet).sort();

    // 2. Construir mapa de filas
    type PivotRow = {
      key: string;
      producto: string;
      sku: string;
      tienda: string;
      sap_id: string | null;
      cells: Record<string, number>; // periodKey → valor
    };

    const rowMap = new Map<string, PivotRow>();

    data.forEach(r => {
      const rk = rowKey(r, showProduct, showStore);
      if (!rowMap.has(rk)) {
        rowMap.set(rk, {
          key: rk,
          producto: r.producto,
          sku: r.sku,
          tienda: r.tienda,
          sap_id: r.sap_id,
          cells: {},
        });
      }
      const entry = rowMap.get(rk)!;
      const pk = periodKey(r.period);
      const val = parseFloat(metric === "amount" ? r.amount : r.quantity) || 0;
      entry.cells[pk] = (entry.cells[pk] ?? 0) + val;
    });

    // 3. Grand total por período
    const grandTotal: Record<string, number> = {};
    periods.forEach(p => { grandTotal[p] = 0; });
    rowMap.forEach(row => {
      periods.forEach(p => {
        grandTotal[p] = (grandTotal[p] ?? 0) + (row.cells[p] ?? 0);
      });
    });

    const pivotRows = Array.from(rowMap.values());
    return { periods, pivotRows, grandTotal };
  }, [data, metric, showProduct, showStore]);

  type PivotRow = {
    key: string;
    producto: string;
    sku: string;
    tienda: string;
    sap_id: string | null;
    cells: Record<string, number>;
  };

  const amountLabel = includeIgv ? "Monto (S/ c/IGV)" : "Monto (S/ s/IGV)";
  const metricLabel = metric === "amount" ? amountLabel : "Unidades";

  const fmt = (v: number) => metric === "amount" ? fmtCurrency(v) : fmtQty(v);

  const rowTotal = (row: PivotRow) =>
    periods.reduce((s, p) => s + (row.cells[p] ?? 0), 0);

  const grandTotalSum = periods.reduce((s, p) => s + (grandTotal[p] ?? 0), 0);

  // Columnas fijas (dimensiones)
  const dimCols = (showProduct ? 2 : 0) + (showStore ? 2 : 0);
  const totalCols = dimCols + periods.length + 1; // +1 = columna Total

  return (
    <div className="space-y-3">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Evolución por:</span>
          <Select value={granularity} onValueChange={v => setGranularity(v as Granularity)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Día</SelectItem>
              <SelectItem value="week">Semana</SelectItem>
              <SelectItem value="month">Mes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 border rounded-md overflow-hidden">
          <Button
            variant={metric === "amount" ? "default" : "ghost"}
            size="sm"
            className="h-8 rounded-none text-xs px-3"
            onClick={() => setMetric("amount")}
          >
            S/ Monto
          </Button>
          <Button
            variant={metric === "quantity" ? "default" : "ghost"}
            size="sm"
            className="h-8 rounded-none text-xs px-3"
            onClick={() => setMetric("quantity")}
          >
            # Unidades
          </Button>
        </div>
        {periods.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {periods.length} {granularity === "day" ? "días" : granularity === "week" ? "semanas" : "meses"}
          </span>
        )}
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-md border">
        <table className="ff-table w-full" style={{ minWidth: `${dimCols * 120 + periods.length * 90 + 90}px` }}>
          <thead>
            <tr>
              {/* Columnas de dimensión */}
              {showProduct && (
                <>
                  <th className="whitespace-nowrap sticky left-0 bg-background z-10">Producto</th>
                  <th className="whitespace-nowrap">SKU</th>
                </>
              )}
              {showStore && (
                <>
                  <th className="whitespace-nowrap">Tienda</th>
                  <th className="whitespace-nowrap">Cód. SAP</th>
                </>
              )}
              {/* Una columna por período */}
              {periods.map(p => (
                <th key={p} className="text-right whitespace-nowrap">
                  {formatPeriodHeader(p, granularity)}
                </th>
              ))}
              {/* Total */}
              <th className="text-right whitespace-nowrap font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: totalCols }).map((_, j) => (
                    <td key={j}><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : pivotRows.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="text-center text-muted-foreground py-8">
                  Sin datos para el período seleccionado
                </td>
              </tr>
            ) : (
              pivotRows.map(row => (
                <tr key={row.key}>
                  {showProduct && (
                    <>
                      <td className="whitespace-nowrap sticky left-0 bg-background z-10">{row.producto}</td>
                      <td className="font-mono text-xs">{row.sku}</td>
                    </>
                  )}
                  {showStore && (
                    <>
                      <td className="whitespace-nowrap">{row.tienda}</td>
                      <td className="font-mono text-xs">{row.sap_id ?? "—"}</td>
                    </>
                  )}
                  {periods.map(p => (
                    <td key={p} className="text-right tabular-nums">
                      {row.cells[p] != null ? fmt(row.cells[p]) : "—"}
                    </td>
                  ))}
                  <td className="text-right tabular-nums font-semibold">
                    {fmt(rowTotal(row))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!isLoading && pivotRows.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-muted/30">
                {dimCols > 0 && (
                  <td colSpan={dimCols} className="text-right pr-4">Total</td>
                )}
                {dimCols === 0 && <td className="text-right pr-4">Total</td>}
                {periods.map(p => (
                  <td key={p} className="text-right tabular-nums">
                    {fmt(grandTotal[p] ?? 0)}
                  </td>
                ))}
                <td className="text-right tabular-nums">{fmt(grandTotalSum)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
