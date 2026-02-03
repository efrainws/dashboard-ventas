import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface DashboardFiltersProps {
  // Rango de fechas
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  onDateFromChange: (date: Date | undefined) => void;
  onDateToChange: (date: Date | undefined) => void;

  // Sucursal
  selectedBranch: string;
  branches: Array<{ id: string; name: string; sap_id: string }>;
  onBranchChange: (branchId: string) => void;

  // Categoría
  selectedCategory: string;
  categories: Array<{ id: string; name: string }>;
  onCategoryChange: (categoryId: string) => void;

  // Limpiar filtros
  onClearFilters: () => void;
}

export function DashboardFilters({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  selectedBranch,
  branches,
  onBranchChange,
  selectedCategory,
  categories,
  onCategoryChange,
  onClearFilters,
}: DashboardFiltersProps) {
  const hasActiveFilters =
    dateFrom !== undefined ||
    dateTo !== undefined ||
    selectedBranch !== "all" ||
    selectedCategory !== "all";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>
              Selecciona rangos de fechas, sucursales y departamentos para explorar los datos
            </CardDescription>
          </div>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              <X className="mr-2 h-4 w-4" />
              Limpiar Filtros
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Fecha Desde */}
          <div className="space-y-2">
            <Label htmlFor="date-from">Fecha Desde</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date-from"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "PPP", { locale: es }) : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={onDateFromChange}
                  initialFocus
                  locale={es}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Fecha Hasta */}
          <div className="space-y-2">
            <Label htmlFor="date-to">Fecha Hasta</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date-to"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "PPP", { locale: es }) : "Seleccionar fecha"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={onDateToChange}
                  initialFocus
                  locale={es}
                  disabled={(date) => {
                    // Deshabilitar fechas anteriores a dateFrom
                    return dateFrom ? date < dateFrom : false;
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Sucursal */}
          <div className="space-y-2">
            <Label htmlFor="branch">Sucursal</Label>
            <Select value={selectedBranch} onValueChange={onBranchChange}>
              <SelectTrigger id="branch">
                <SelectValue placeholder="Todas las sucursales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sucursales</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name} ({branch.sap_id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Departamento */}
          <div className="space-y-2">
            <Label htmlFor="category">Departamento</Label>
            <Select value={selectedCategory} onValueChange={onCategoryChange}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Todos los departamentos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los departamentos</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
