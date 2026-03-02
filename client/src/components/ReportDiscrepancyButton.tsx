import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import {
  ReportDiscrepancyModal,
  type DiscrepancyContext,
} from "./ReportDiscrepancyModal";

interface ReportDiscrepancyButtonProps {
  context: DiscrepancyContext;
  /** Optional className for positioning */
  className?: string;
  /** Variant: "button" (inline) or "fab" (floating action button) */
  variant?: "button" | "fab";
}

export function ReportDiscrepancyButton({
  context,
  className = "",
  variant = "button",
}: ReportDiscrepancyButtonProps) {
  const [open, setOpen] = useState(false);

  if (variant === "fab") {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#BC2C46] px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-[#842032] active:scale-95 transition-all ${className}`}
          title="Reportar discrepancia en los datos"
        >
          <AlertTriangle className="h-4 w-4" />
          Reportar Discrepancia
        </button>
        <ReportDiscrepancyModal
          open={open}
          onClose={() => setOpen(false)}
          context={context}
        />
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={`border-[#BC2C46]/40 text-[#BC2C46] hover:bg-[#BC2C46]/10 hover:border-[#BC2C46] ${className}`}
      >
        <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
        Reportar Discrepancia
      </Button>
      <ReportDiscrepancyModal
        open={open}
        onClose={() => setOpen(false)}
        context={context}
      />
    </>
  );
}
