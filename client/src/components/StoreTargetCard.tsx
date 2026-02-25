import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface StoreTargetCardProps {
  storeName: string;
  totalSales: number;
  proratedTarget: number;
  completionPercentage: number;
  hasTarget: boolean;
  onEditClick?: () => void;
  canEdit: boolean;
}

export function StoreTargetCard({
  storeName,
  totalSales,
  proratedTarget,
  completionPercentage,
  hasTarget,
  onEditClick,
  canEdit,
}: StoreTargetCardProps) {
  return (
    <Card className="relative hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg font-semibold" style={{ fontFamily: 'Sailec, sans-serif' }}>
            {storeName}
          </CardTitle>
          {canEdit && onEditClick && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onEditClick}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Barra de Progreso - Solo mostrar si hay meta configurada */}
        {hasTarget && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm" style={{ fontFamily: 'Sailec, sans-serif' }}>
              <span className="text-muted-foreground">Cumplimiento</span>
              <span
                className="font-semibold"
                style={{
                  color: completionPercentage >= 100 ? '#008064' : completionPercentage >= 90 ? '#1A6894' : completionPercentage >= 75 ? '#C49705' : '#BC2C46',
                }}
              >
                {completionPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.min(completionPercentage, 100)}%`,
                  backgroundColor: completionPercentage >= 100 ? '#008064' : completionPercentage >= 90 ? '#1A6894' : completionPercentage >= 75 ? '#C49705' : '#BC2C46',
                }}
              />
            </div>
          </div>
        )}

        {/* Métricas */}
        <div className="space-y-2">
          {/* Venta del período */}
          <div>
            <p className="text-sm text-muted-foreground" style={{ fontFamily: 'Sailec, sans-serif' }}>
              Venta del período
            </p>
            <p className="text-2xl font-bold" style={{ fontFamily: 'Sailec, sans-serif' }}>
              S/ {totalSales.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>

          {/* Meta del período */}
          <div>
            <p className="text-sm text-muted-foreground" style={{ fontFamily: 'Sailec, sans-serif' }}>
              Meta del período
            </p>
            {hasTarget ? (
              <p className="text-lg font-semibold" style={{ fontFamily: 'Sailec, sans-serif' }}>
                S/ {proratedTarget.toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Meta no configurada
              </p>
            )}
          </div>


        </div>
      </CardContent>
    </Card>
  );
}
