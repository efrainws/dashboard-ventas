import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppliedFilterActionsProps {
  onApply: () => void;
  onReset: () => void;
  isPending?: boolean;
  isApplying?: boolean;
}

export function AppliedFilterActions({
  onApply,
  onReset,
  isPending = false,
  isApplying = false,
}: AppliedFilterActionsProps) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
      <Button type="button" variant="outline" onClick={onReset} disabled={isApplying}>
        <RotateCcw className="mr-2 h-4 w-4" />
        Restablecer filtros
      </Button>
      <Button type="button" onClick={onApply} disabled={isApplying || !isPending}>
        <Check className="mr-2 h-4 w-4" />
        {isApplying ? "Aplicando…" : "Aplicar filtros"}
      </Button>
    </div>
  );
}
