import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { useId } from "react";

export const SALES_CHANNELS = ["Presencial", "eCommerce", "Rappi"] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

interface SalesChannelFilterProps {
  value: SalesChannel[];
  onChange: (channels: SalesChannel[]) => void;
  className?: string;
}

export function SalesChannelFilter({ value, onChange, className }: SalesChannelFilterProps) {
  const inputId = useId();
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
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent">
              <Checkbox
                id={`${inputId}-all`}
                checked={allSelected}
                onCheckedChange={() => onChange(SALES_CHANNELS.slice())}
                aria-label="Seleccionar todos los canales"
              />
              <label htmlFor={`${inputId}-all`} className="flex-1 cursor-pointer">Todos los canales</label>
            </div>
            <div className="my-1 border-t border-border" />
            {SALES_CHANNELS.map((channel) => (
              <div
                key={channel}
                className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  id={`${inputId}-${channel}`}
                  checked={value.includes(channel)}
                  onCheckedChange={() => toggleChannel(channel)}
                  aria-label={`Filtrar canal ${channel}`}
                />
                <label htmlFor={`${inputId}-${channel}`} className="flex-1 cursor-pointer">{channel}</label>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
