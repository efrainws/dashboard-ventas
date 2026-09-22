import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const filterSource = () => readFileSync(
  path.resolve(process.cwd(), "client/src/components/SalesChannelFilter.tsx"),
  "utf8",
);

describe("SalesChannelFilter", () => {
  it("no coloca la casilla de Radix dentro de un botón", () => {
    const source = filterSource();

    expect(source).toContain('import { useId } from "react";');
    expect(source).toContain('onCheckedChange={() => onChange(SALES_CHANNELS.slice())}');
    expect(source).toContain('onCheckedChange={() => toggleChannel(channel)}');
    expect(source).toContain('htmlFor={`${inputId}-all`}');
    expect(source).toContain('htmlFor={`${inputId}-${channel}`}');
    expect(source).not.toMatch(/<button[\s\S]{0,500}<Checkbox\b/);
  });

  it("mantiene una casilla accesible por cada filtro de canal", () => {
    const source = filterSource();

    expect(source).toContain('aria-label="Seleccionar todos los canales"');
    expect(source).toContain('aria-label={`Filtrar canal ${channel}`}');
    expect(source).toContain("SALES_CHANNELS.map((channel)");
  });
});
