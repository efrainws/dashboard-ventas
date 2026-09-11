import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";

export const SALES_CHANNELS = ["Presencial", "eCommerce", "Rappi"] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

interface SalesChannelFilterProps {
  value: SalesChannel[];
  onChange: (channels: SalesChannel[]) => void;
  className?: string;
}

export function SalesChannelFilter({ value, onChange, className }: SalesChannelFilterProps) {
  const allSelected = value.length === SALES_CHANNELS.length;
  const label = value.length === 0
    ? "Sin canales"
    : allSelected
      ? "Todos los canales"
      : value.join(", ");

  const toggleChannel = (channel: SalesChannel) => {
    onChange(value.includes(channel)
      ? value.filter((item) => item !== channel)
      : [...value, channel]);
  };

  return (
    <div className={className}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-8 w-52 justify-between px-3 text-sm font-normal"
            aria-label="Filtrar por canal de venta"
          >
            <span className="truncate">{label}</span>
            <span className="flex shrink-0 items-center gap-1">
              {!allSelected && value.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">{value.length}</Badge>
              )}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="space-y-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onChange(SALES_CHANNELS.slice())}
            >
              <Checkbox checked={allSelected} aria-label="Seleccionar todos los canales" />
              Todos los canales
            </button>
            <div className="my-1 border-t border-border" />
            {SALES_CHANNELS.map((channel) => (
              <button
                key={channel}
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => toggleChannel(channel)}
              >
                <Checkbox checked={value.includes(channel)} aria-label={`Filtrar canal ${channel}`} />
                {channel}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
