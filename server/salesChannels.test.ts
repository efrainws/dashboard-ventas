import { describe, expect, it } from "vitest";
import { SALES_CHANNELS, salesChannelCase } from "./salesChannels";

describe("clasificación canónica de canales", () => {
  it("declara exactamente los canales disponibles en los filtros", () => {
    expect(SALES_CHANNELS).toEqual(["Presencial", "eCommerce", "Rappi"]);
  });

  it("mantiene la prioridad Rappi, seguida de eCommerce y Presencial", () => {
    const expression = salesChannelCase();
    expect(expression.indexOf("THEN 'Rappi'")).toBeLessThan(expression.indexOf("THEN 'eCommerce'"));
    expect(expression).toContain("ELSE 'Presencial'");
    expect(expression).toContain("public.methods_payment");
  });
});
