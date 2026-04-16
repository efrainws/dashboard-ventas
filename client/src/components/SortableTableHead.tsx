/**
 * SortableTableHead.tsx
 * Header de tabla con soporte de ordenamiento ascendente/descendente.
 * Muestra ↑ / ↓ cuando la columna está activa, y ↕ cuando no lo está.
 */

import { TableHead } from "@/components/ui/table";

interface SortableTableHeadProps<T extends string = string> {
  label: string;
  col: T;
  sortCol: T | null;
  sortDir: "asc" | "desc";
  onSort: (col: T) => void;
  className?: string;
  align?: "left" | "right";
}

export function SortableTableHead<T extends string>({
  label,
  col,
  sortCol,
  sortDir,
  onSort,
  className = "",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  align = "left",
}: SortableTableHeadProps<T>) {
  const isActive = sortCol === col;
  const icon = isActive ? (sortDir === "asc" ? "↑" : "↓") : "↕";

  return (
    <TableHead
      className={`text-xs font-semibold uppercase tracking-wide cursor-pointer select-none transition-colors hover:bg-muted/50 ${
        align === "right" ? "text-right" : ""
      } ${className}`}
      onClick={() => onSort(col)}
    >
      <span
        className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end w-full" : ""}`}
      >
        {label}
        <span
          className={`text-[10px] leading-none ${
            isActive ? "text-foreground font-bold" : "text-muted-foreground/50"
          }`}
        >
          {icon}
        </span>
      </span>
    </TableHead>
  );
}
