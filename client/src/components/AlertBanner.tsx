/**
 * AlertBanner.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Componente reutilizable de alertas/banners siguiendo el design system
 * Flora & Fauna. Reemplaza cualquier uso de clases amber/yellow de Tailwind.
 *
 * Variantes:
 *   success  → Esmeralda  #008064
 *   warning  → Mostaza    #C49705
 *   error    → Granate    #BC2C46
 *   info     → Cobalto    #1A6894
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { ReactNode } from "react";

const VARIANTS = {
  success: { color: "#008064", Icon: CheckCircle2 },
  warning: { color: "#C49705", Icon: AlertTriangle },
  error:   { color: "#BC2C46", Icon: XCircle },
  info:    { color: "#1A6894", Icon: Info },
} as const;

type Variant = keyof typeof VARIANTS;

interface AlertBannerProps {
  variant?: Variant;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function AlertBanner({
  variant = "warning",
  title,
  children,
  className = "",
}: AlertBannerProps) {
  const { color, Icon } = VARIANTS[variant];

  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed ${className}`}
      style={{
        borderColor: `${color}40`,
        backgroundColor: `${color}10`,
      }}
    >
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ color }}
      />
      <div className="space-y-0.5">
        {title && (
          <p className="font-semibold" style={{ color }}>
            {title}
          </p>
        )}
        <div style={{ color: `${color}CC` }}>{children}</div>
      </div>
    </div>
  );
}
