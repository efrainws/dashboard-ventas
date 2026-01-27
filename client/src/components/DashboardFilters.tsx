import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filters } from "@/hooks/useSalesData";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";

interface DashboardFiltersProps {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  branches: string[];
  paymentMethods: string[];
}

export function DashboardFilters({
  filters,
  setFilters,
  branches,
  paymentMethods,
}: DashboardFiltersProps) {
  const handleReset = () => {
    setFilters({
      branch: 'all',
      paymentMethod: 'all',
      dateRange: { from: undefined, to: undefined }
    });
  };

  return (
    <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-lg border shadow-sm">
      {/* Filtro de Sucursal */}
      <div className="space-y-2 min-w-[200px]">
        <label className="text-sm font-medium text-muted-foreground">Sucursal</label>
        <Select
          value={filters.branch}
          onValueChange={(value) => setFilters({ ...filters, branch: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Todas las sucursales" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sucursales</SelectItem>
            {branches.map((branch) => (
              <SelectItem key={branch} value={branch}>
                {branch}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filtro de Método de Pago */}
      <div className="space-y-2 min-w-[200px]">
        <label className="text-sm font-medium text-muted-foreground">Método de Pago</label>
        <Select
          value={filters.paymentMethod}
          onValueChange={(value) => setFilters({ ...filters, paymentMethod: value })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Todos los métodos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los métodos</SelectItem>
            {paymentMethods.map((method) => (
              <SelectItem key={method} value={method}>
                {method}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filtro de Fecha */}
      <div className="space-y-2 min-w-[240px]">
        <label className="text-sm font-medium text-muted-foreground">Rango de Fechas</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn(
                "w-full justify-start text-left font-normal",
                !filters.dateRange.from && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {filters.dateRange.from ? (
                filters.dateRange.to ? (
                  <>
                    {format(filters.dateRange.from, "dd/MM/yyyy")} -{" "}
                    {format(filters.dateRange.to, "dd/MM/yyyy")}
                  </>
                ) : (
                  format(filters.dateRange.from, "dd/MM/yyyy")
                )
              ) : (
                <span>Seleccionar fechas</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={filters.dateRange.from}
              selected={filters.dateRange}
              onSelect={(range) => 
                setFilters({ 
                  ...filters, 
                  dateRange: { 
                    from: range?.from, 
                    to: range?.to 
                  } 
                })
              }
              numberOfMonths={2}
              locale={es}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Botón Reset */}
      <Button 
        variant="ghost" 
        size="icon"
        onClick={handleReset}
        className="text-muted-foreground hover:text-foreground"
        title="Limpiar filtros"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
