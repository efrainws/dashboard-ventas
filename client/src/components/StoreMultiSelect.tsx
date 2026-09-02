import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Lock } from "lucide-react";

export interface StoreOption {
  id: string;
  name: string;
}

interface StoreMultiSelectProps {
  stores: StoreOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Si está bloqueado (store_user), muestra el nombre fijo y deshabilita el selector */
  locked?: boolean;
  lockedLabel?: string;
  placeholder?: string;
  className?: string;
}

/**
 * Multi-select de tiendas usando Popover + Checkbox.
 * Mantiene el panel abierto mientras el usuario selecciona múltiples tiendas.
 */
export function StoreMultiSelect({
  stores,
  selectedIds,
  onChange,
  locked = false,
  lockedLabel,
  placeholder = "Todas las tiendas",
  className,
}: StoreMultiSelectProps) {
  if (locked) {
    return (
      <div className={`flex items-center gap-2 border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground ${className ?? ""}`}>
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span>{lockedLabel ?? placeholder}</span>
      </div>
    );
  }

  const allSelected = selectedIds.length === 0;

  const label = allSelected
    ? placeholder
    : selectedIds.length === 1
      ? (stores.find((s) => s.id === selectedIds[0])?.name ?? `1 tienda`)
      : `${selectedIds.length} tiendas seleccionadas`;

  const handleToggleAll = () => {
    onChange([]);
  };

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      const next = selectedIds.filter((s) => s !== id);
      onChange(next);
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-between font-normal h-9 px-3 ${className ?? ""}`}
        >
          <span className="truncate text-sm">{label}</span>
          <div className="flex items-center gap-1 shrink-0">
            {!allSelected && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {selectedIds.length}
              </Badge>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 max-h-72 overflow-y-auto" align="start">
        <div className="space-y-1">
          {/* Opción "Todas las tiendas" */}
          <div
            className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-accent"
            onClick={handleToggleAll}
          >
            <Checkbox
              checked={allSelected}
              onCheckedChange={handleToggleAll}
            />
            <span className="text-sm font-medium">{placeholder}</span>
          </div>
          <div className="border-t my-1" />
          {stores.map((store) => (
            <div
              key={store.id}
              className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-accent"
              onClick={() => handleToggle(store.id)}
            >
              <Checkbox
                checked={selectedIds.includes(store.id)}
                onCheckedChange={() => handleToggle(store.id)}
              />
              <span className="text-sm">{store.name}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
