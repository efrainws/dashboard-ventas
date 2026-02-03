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
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { X } from "lucide-react";
import type { DateRange } from "react-day-picker";

export interface DashboardFiltersProps {
  // Rango de fechas
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;

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
  dateRange,
  onDateRangeChange,
  selectedBranch,
  branches,
  onBranchChange,
  selectedCategory,
  categories,
  onCategoryChange,
  onClearFilters,
}: DashboardFiltersProps) {
  const hasActiveFilters =
    dateRange !== undefined ||
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
        <div className="grid gap-6 md:grid-cols-3">
          {/* Rango de Fechas */}
          <div className="space-y-2">
            <Label>Rango de Fechas</Label>
            <DatePickerWithRange
              date={dateRange}
              onDateChange={onDateRangeChange}
            />
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
