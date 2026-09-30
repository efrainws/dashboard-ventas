import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PortalFilterActionsProps {
  hasPendingChanges: boolean;
  onApply: () => void;
  onReset: () => void;
  className?: string;
}

/**
 * Acciones visuales reutilizadas en los dos portales. El estado y la URL siguen
 * siendo responsabilidad de cada ruta.
 */
export function PortalFilterActions({
  hasPendingChanges,
  onApply,
  onReset,
  className = "",
}: PortalFilterActionsProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {hasPendingChanges && (
        <Badge variant="secondary" className="h-8 px-2 text-xs font-medium">
          Cambios pendientes
        </Badge>
      )}
      <Button
        type="button"
        variant={hasPendingChanges ? "default" : "outline"}
        size="sm"
        onClick={onApply}
        disabled={!hasPendingChanges}
        className="h-8 disabled:opacity-60"
      >
        Aplicar filtros
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onReset}
        className="h-8 gap-1.5"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Restablecer filtros
      </Button>
    </div>
  );
}
