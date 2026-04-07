/**
 * MultiProductSelect.tsx
 * Selector múltiple de productos con checkboxes y búsqueda interna.
 * Reutilizable en SupplierPortal y OwnBrandPortal.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface ProductOption {
  id: string;
  name: string;
  sku: string;
}

interface MultiProductSelectProps {
  products: ProductOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
  placeholder?: string;
  className?: string;
}

export function MultiProductSelect({
  products,
  selectedIds,
  onChange,
  loading = false,
  placeholder = "Todos los productos",
  className = "",
}: MultiProductSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Enfocar búsqueda al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [products, search]);

  const allSelected = selectedIds.length === 0;
  const selectedCount = selectedIds.length;

  function toggleProduct(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function selectAll() {
    onChange([]);
  }

  function clearSelection() {
    onChange([]);
    setOpen(false);
  }

  // Texto del trigger
  const triggerLabel = useMemo(() => {
    if (loading) return "Cargando productos...";
    if (selectedCount === 0) return placeholder;
    if (selectedCount === 1) {
      const p = products.find((p) => p.id === selectedIds[0]);
      return p ? `${p.sku} – ${p.name}` : placeholder;
    }
    return `${selectedCount} productos seleccionados`;
  }, [loading, selectedCount, selectedIds, products, placeholder]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !loading && setOpen((v) => !v)}
        className={`
          flex items-center justify-between w-full h-8 px-3 text-sm rounded-md border
          border-input bg-background text-foreground shadow-sm
          hover:bg-accent/50 focus:outline-none focus:ring-1 focus:ring-ring
          transition-colors
          ${loading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        <span className="truncate text-left flex items-center gap-2">
          {selectedCount > 0 ? (
            <>
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[10px] font-semibold shrink-0"
              >
                {selectedCount}
              </Badge>
              <span className="truncate text-xs">{triggerLabel}</span>
            </>
          ) : (
            <span className="text-muted-foreground truncate">{triggerLabel}</span>
          )}
        </span>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {selectedCount > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); clearSelection(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); clearSelection(); } }}
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="
            absolute z-50 mt-1 w-full min-w-[280px] max-w-sm
            bg-popover border border-border rounded-md shadow-lg
            flex flex-col
          "
          style={{ maxHeight: "320px" }}
        >
          {/* Búsqueda */}
          <div className="px-2 py-2 border-b border-border sticky top-0 bg-popover z-10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Buscar producto o SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full pl-7 pr-2 py-1 text-xs border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Lista con scroll */}
          <div className="overflow-y-auto flex-1">
            {/* Opción "Todos" */}
            <button
              type="button"
              onClick={selectAll}
              className={`
                flex items-center gap-2 w-full px-3 py-2 text-sm text-left
                hover:bg-accent/60 transition-colors
                ${allSelected ? "font-medium text-foreground" : "text-muted-foreground"}
              `}
            >
              <span
                className={`
                  flex items-center justify-center h-4 w-4 rounded border shrink-0
                  ${allSelected
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-input bg-background"
                  }
                `}
              >
                {allSelected && <Check className="h-3 w-3" />}
              </span>
              Todos los productos
            </button>

            {/* Divisor */}
            {filteredProducts.length > 0 && (
              <div className="border-t border-border/50 my-0.5" />
            )}

            {/* Productos */}
            {filteredProducts.map((p) => {
              const checked = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleProduct(p.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-accent/60 transition-colors"
                >
                  <span
                    className={`
                      flex items-center justify-center h-4 w-4 rounded border shrink-0
                      ${checked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-input bg-background"
                      }
                    `}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate flex-1 min-w-0">
                    <span className="font-mono text-[10px] text-muted-foreground mr-1.5">{p.sku}</span>
                    <span className="text-xs">{p.name}</span>
                  </span>
                </button>
              );
            })}

            {filteredProducts.length === 0 && !loading && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                Sin resultados para "{search}"
              </div>
            )}
          </div>

          {/* Footer con acciones rápidas */}
          {selectedCount > 0 && (
            <div className="border-t border-border px-3 py-2 flex items-center justify-between bg-popover">
              <span className="text-xs text-muted-foreground">
                {selectedCount} de {products.length} seleccionados
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={clearSelection}
              >
                Limpiar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
