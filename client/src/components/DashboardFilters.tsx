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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Lock, X } from "lucide-react";
import type { DateRange } from "react-day-picker";

const ALL_CHANNELS = ["Presencial", "eCommerce", "Rappi"] as const;
type Channel = typeof ALL_CHANNELS[number];

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

  // Canal de ventas (opcional)
  selectedChannels?: string[];
  onChannelsChange?: (channels: string[]) => void;

  // Limpiar filtros
  onClearFilters: () => void;

  // RLS: bloquear selector de sucursal para store_user
  branchLocked?: boolean;
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
  selectedChannels,
  onChannelsChange,
  onClearFilters,
  branchLocked = false,
}: DashboardFiltersProps) {
  const showChannelFilter = selectedChannels !== undefined && onChannelsChange !== undefined;
  const hasActiveFilters =
    dateRange !== undefined ||
    selectedBranch !== "all" ||
    selectedCategory !== "all" ||
    (showChannelFilter && selectedChannels!.length < ALL_CHANNELS.length);

  const lockedBranchName = branchLocked
    ? branches.find(b => b.sap_id === selectedBranch)?.name ?? selectedBranch
    : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-heading uppercase text-base tracking-wide">
              Filtros
            </CardTitle>
            <CardDescription>
              Selecciona rangos de fechas, sucursales y departamentos para explorar los datos
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            <X className="mr-2 h-4 w-4" />
            Limpiar Filtros
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className={`grid gap-6 ${showChannelFilter ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
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
            <Label htmlFor="branch">
              Sucursal
              {branchLocked && <Lock className="inline ml-1 h-3 w-3 text-muted-foreground" />}
            </Label>
            {branchLocked ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/50 text-sm text-muted-foreground">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>{lockedBranchName ?? 'Tu tienda asignada'}</span>
              </div>
            ) : (
              <Select value={selectedBranch} onValueChange={onBranchChange}>
                <SelectTrigger id="branch">
                  <SelectValue placeholder="Todas las sucursales" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all"><span>Todas las sucursales</span></SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.sap_id}>
                      <span>{branch.name} ({branch.sap_id})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Departamento */}
          <div className="space-y-2">
            <Label htmlFor="category">Departamento</Label>
            <Select value={selectedCategory} onValueChange={onCategoryChange}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Todos los departamentos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><span>Todos los departamentos</span></SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <span>{category.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Canal de Ventas — solo si se pasa la prop */}
          {showChannelFilter && (
            <div className="space-y-2">
              <Label>Canal de Ventas</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between font-normal h-9 px-3"
                  >
                    <span className="truncate text-sm">
                      {selectedChannels!.length === 0
                        ? "Sin canales"
                        : selectedChannels!.length === ALL_CHANNELS.length
                        ? "Todos los canales"
                        : selectedChannels!.join(", ")}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedChannels!.length > 0 && selectedChannels!.length < ALL_CHANNELS.length && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                          {selectedChannels!.length}
                        </Badge>
                      )}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </div>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2" align="start">
                  <div className="space-y-1">
                    <div
                      className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent"
                      onClick={() => onChannelsChange!(ALL_CHANNELS as unknown as string[])}
                    >
                      <Checkbox
                        checked={selectedChannels!.length === ALL_CHANNELS.length}
                        onCheckedChange={() => onChannelsChange!(ALL_CHANNELS as unknown as string[])}
                      />
                      <span className="text-sm">Todos los canales</span>
                    </div>
                    <div className="border-t my-1" />
                    {ALL_CHANNELS.map((channel) => (
                      <div
                        key={channel}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent"
                        onClick={() => {
                          onChannelsChange!(
                            selectedChannels!.includes(channel)
                              ? selectedChannels!.filter(c => c !== channel)
                              : [...selectedChannels!, channel]
                          );
                        }}
                      >
                        <Checkbox
                          checked={selectedChannels!.includes(channel)}
                          onCheckedChange={() => {
                            onChannelsChange!(
                              selectedChannels!.includes(channel)
                                ? selectedChannels!.filter(c => c !== channel)
                                : [...selectedChannels!, channel]
                            );
                          }}
                        />
                        <span className="text-sm">{channel}</span>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
