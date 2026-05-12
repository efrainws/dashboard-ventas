/**
 * SalesEvolutionTable
 * Tabla de evolución temporal de ventas (día/semana/mes).
 * Reutilizable en SupplierPortal y OwnBrandPortal.
 *
 * Props:
 *  - data: filas devueltas por getSalesEvolution
 *  - isLoading: estado de carga
 *  - granularity / setGranularity: dropdown día/semana/mes
 *  - showProduct / showStore: visibilidad de columnas (sincronizadas con la tabla principal)
 *  - includeIgv: para mostrar la etiqueta correcta en el encabezado de monto
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
import { ArrowUpDown, ArrowUp, ArrowDown, TrendingUp } from "lucide-react";
// Formateador de moneda local (S/ PEN)
const formatCurrency = (v: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);


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

type SortDir = "asc" | "desc";
type Metric = "amount" | "quantity";

function formatPeriod(period: string | Date, granularity: Granularity): string {
  if (!period) return "—";
  // superjson puede deserializar la columna date de PostgreSQL como objeto Date
  const d = period instanceof Date ? period : new Date(String(period).length === 10 ? period + "T00:00:00" : period);
  if (isNaN(d.getTime())) return String(period);
  if (granularity === "day") {
    return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  }
  if (granularity === "week") {
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    return `${d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })} – ${end.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}`;
  }
  // month
  return d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
}

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
  const [sortCol, setSortCol] = useState<string>("period");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40 inline" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 h-3 w-3 inline" />
      : <ArrowDown className="ml-1 h-3 w-3 inline" />;
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const sorted = [...data].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortCol === "period") {
        va = a.period instanceof Date ? a.period.toISOString() : String(a.period);
        vb = b.period instanceof Date ? b.period.toISOString() : String(b.period);
      }
      else if (sortCol === "producto") { va = a.producto; vb = b.producto; }
      else if (sortCol === "sku") { va = a.sku; vb = b.sku; }
      else if (sortCol === "tienda") { va = a.tienda; vb = b.tienda; }
      else if (sortCol === "sap_id") { va = a.sap_id ?? ""; vb = b.sap_id ?? ""; }
      else if (sortCol === "amount") { va = parseFloat(a.amount); vb = parseFloat(b.amount); }
      else if (sortCol === "quantity") { va = parseFloat(a.quantity); vb = parseFloat(b.quantity); }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [data, sortCol, sortDir]);

  // Totales
  const totals = useMemo(() => {
    if (!data) return { amount: 0, quantity: 0 };
    return data.reduce((acc, r) => ({
      amount: acc.amount + parseFloat(r.amount || "0"),
      quantity: acc.quantity + parseFloat(r.quantity || "0"),
    }), { amount: 0, quantity: 0 });
  }, [data]);

  const amountLabel = includeIgv ? "Monto (S/ c/IGV)" : "Monto (S/ s/IGV)";

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
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-md border">
        <table className="ff-table w-full">
          <thead>
            <tr>
              <th
                className="cursor-pointer whitespace-nowrap"
                onClick={() => handleSort("period")}
              >
                Período <SortIcon col="period" />
              </th>
              {showProduct && (
                <>
                  <th className="cursor-pointer" onClick={() => handleSort("producto")}>
                    Producto <SortIcon col="producto" />
                  </th>
                  <th className="cursor-pointer" onClick={() => handleSort("sku")}>
                    SKU <SortIcon col="sku" />
                  </th>
                </>
              )}
              {showStore && (
                <>
                  <th className="cursor-pointer" onClick={() => handleSort("tienda")}>
                    Tienda <SortIcon col="tienda" />
                  </th>
                  <th className="cursor-pointer" onClick={() => handleSort("sap_id")}>
                    Cod. SAP <SortIcon col="sap_id" />
                  </th>
                </>
              )}
              {metric === "amount" ? (
                <th className="text-right cursor-pointer" onClick={() => handleSort("amount")}>
                  {amountLabel} <SortIcon col="amount" />
                </th>
              ) : (
                <th className="text-right cursor-pointer" onClick={() => handleSort("quantity")}>
                  Unidades <SortIcon col="quantity" />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td><Skeleton className="h-4 w-24" /></td>
                  {showProduct && <><td><Skeleton className="h-4 w-32" /></td><td><Skeleton className="h-4 w-16" /></td></>}
                  {showStore && <><td><Skeleton className="h-4 w-28" /></td><td><Skeleton className="h-4 w-12" /></td></>}
                  <td><Skeleton className="h-4 w-20 ml-auto" /></td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={1 + (showProduct ? 2 : 0) + (showStore ? 2 : 0) + 1}
                  className="text-center text-muted-foreground py-8"
                >
                  Sin datos para el período seleccionado
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i}>
                  <td className="whitespace-nowrap font-medium">
                    {formatPeriod(row.period, granularity)}
                  </td>
                  {showProduct && (
                    <>
                      <td>{row.producto}</td>
                      <td className="font-mono text-xs">{row.sku}</td>
                    </>
                  )}
                  {showStore && (
                    <>
                      <td>{row.tienda}</td>
                      <td className="font-mono text-xs">{row.sap_id ?? "—"}</td>
                    </>
                  )}
                  {metric === "amount" ? (
                    <td className="text-right tabular-nums">
                      {formatCurrency(parseFloat(row.amount || "0"))}
                    </td>
                  ) : (
                    <td className="text-right tabular-nums">
                      {parseFloat(row.quantity || "0").toLocaleString("es-PE")}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {!isLoading && rows.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-muted/30">
                <td
                  colSpan={1 + (showProduct ? 2 : 0) + (showStore ? 2 : 0)}
                  className="text-right pr-4"
                >
                  Total
                </td>
                {metric === "amount" ? (
                  <td className="text-right tabular-nums">
                    {formatCurrency(totals.amount)}
                  </td>
                ) : (
                  <td className="text-right tabular-nums">
                    {totals.quantity.toLocaleString("es-PE")}
                  </td>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
