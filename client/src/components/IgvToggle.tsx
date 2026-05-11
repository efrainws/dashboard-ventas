/**
 * IgvToggle — Componente reutilizable para alternar entre Con IGV / Sin IGV
 *
 * Usa el IgvContext global. Puede colocarse en cualquier barra de filtros.
 * Variante compacta: solo muestra el badge de estado y un botón de toggle.
 */
import { useIgv } from "@/contexts/IgvContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Percent } from "lucide-react";

interface IgvToggleProps {
  /** Variante de presentación: "badge" muestra solo el badge, "button" muestra botón completo */
  variant?: "badge" | "button";
  className?: string;
}

export function IgvToggle({ variant = "button", className = "" }: IgvToggleProps) {
  const { includeIgv, toggleIgv, igvLabel } = useIgv();

  if (variant === "badge") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggleIgv}
            className={`inline-flex items-center gap-1 cursor-pointer select-none ${className}`}
            aria-label={`Cambiar a ${includeIgv ? "Sin IGV" : "Con IGV"}`}
          >
            <Badge
              variant={includeIgv ? "default" : "secondary"}
              className="text-[10px] px-2 py-0.5 font-medium"
            >
              <Percent className="h-2.5 w-2.5 mr-0.5" />
              {igvLabel}
            </Badge>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">Clic para cambiar a {includeIgv ? "Sin IGV" : "Con IGV"}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={includeIgv ? "default" : "outline"}
          size="sm"
          onClick={toggleIgv}
          className={`h-8 gap-1.5 text-xs font-medium ${className}`}
          aria-label={`Actualmente mostrando precios ${igvLabel}. Clic para cambiar.`}
        >
          <Percent className="h-3.5 w-3.5" />
          {igvLabel}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">
          {includeIgv
            ? "Mostrando precios con IGV (18%). Clic para ver sin IGV."
            : "Mostrando precios sin IGV (subtotal). Clic para ver con IGV."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
