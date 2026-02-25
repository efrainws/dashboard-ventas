import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressRing } from "./ProgressRing";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        {/* Progress Ring - Solo mostrar si hay meta configurada */}
        {hasTarget && (
          <div className="flex justify-center">
            <ProgressRing percentage={completionPercentage} />
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

          {/* Cumplimiento */}
          {hasTarget && (
            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground" style={{ fontFamily: 'Sailec, sans-serif' }}>
                Cumplimiento
              </p>
              <p
                className="text-xl font-bold"
                style={{
                  fontFamily: 'Sailec, sans-serif',
                  color: completionPercentage >= 100 ? '#008064' : '#BC2C46',
                }}
              >
                {completionPercentage.toFixed(1)}%
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
