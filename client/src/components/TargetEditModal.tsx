import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TargetEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId?: string;
  storeName?: string;
  month?: string;
  onSuccess: () => void;
}

export function TargetEditModal({
  open,
  onOpenChange,
  storeId: initialStoreId,
  storeName: initialStoreName,
  month: initialMonth,
  onSuccess,
}: TargetEditModalProps) {

  const [month, setMonth] = useState(initialMonth || getCurrentMonth());
  const [storeId, setStoreId] = useState(initialStoreId || "");
  const [targetAmount, setTargetAmount] = useState("");

  const upsertMutation = trpc.targets.upsertStoreTarget.useMutation({
    onSuccess: () => {
      toast.success("La meta se ha guardado correctamente");
      onSuccess();
      onOpenChange(false);
      // Reset form
      setMonth(getCurrentMonth());
      setStoreId("");
      setTargetAmount("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Reset form when modal opens with new data
  useEffect(() => {
    if (open) {
      setMonth(initialMonth || getCurrentMonth());
      setStoreId(initialStoreId || "");
      setTargetAmount("");
    }
  }, [open, initialMonth, initialStoreId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!month || !storeId || !targetAmount) {
      toast.error("Todos los campos son requeridos");
      return;
    }

    const amount = parseFloat(targetAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("La meta debe ser un número mayor a 0");
      return;
    }

    upsertMutation.mutate({
      month,
      store_id: storeId,
      monthly_target_amount: Math.round(amount),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Italian Plate, serif' }}>
              {initialStoreId ? "Editar Meta" : "Crear Meta"}
            </DialogTitle>
            <DialogDescription style={{ fontFamily: 'Sailec, sans-serif' }}>
              {initialStoreName
                ? `Configurar meta mensual para ${initialStoreName}`
                : "Configurar meta mensual para una tienda"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Mes */}
            <div className="grid gap-2">
              <Label htmlFor="month" style={{ fontFamily: 'Sailec, sans-serif' }}>
                Mes
              </Label>
              <Input
                id="month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                required
              />
            </div>

            {/* Tienda (solo si no viene pre-seleccionada) */}
            {!initialStoreId && (
              <div className="grid gap-2">
                <Label htmlFor="store" style={{ fontFamily: 'Sailec, sans-serif' }}>
                  Tienda
                </Label>
                <Input
                  id="store"
                  placeholder="ID de la tienda"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  required
                />
              </div>
            )}

            {initialStoreId && (
              <div className="grid gap-2">
                <Label style={{ fontFamily: 'Sailec, sans-serif' }}>Tienda</Label>
                <p className="text-sm text-muted-foreground">{initialStoreName}</p>
              </div>
            )}

            {/* Meta mensual */}
            <div className="grid gap-2">
              <Label htmlFor="target" style={{ fontFamily: 'Sailec, sans-serif' }}>
                Meta Mensual (S/)
              </Label>
              <Input
                id="target"
                type="number"
                placeholder="Ej: 50000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                min="1"
                step="1"
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={upsertMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={upsertMutation.isPending}>
              {upsertMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
