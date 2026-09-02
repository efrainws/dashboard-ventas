import { describe, expect, it } from "vitest";
import { buttonVariants } from "../client/src/components/ui/button";

describe("primitivas visuales de Flora & Fauna", () => {
  it("mantiene acciones rectangulares con jerarquía tipográfica de marca", () => {
    const classes = buttonVariants();

    expect(classes).toContain("rounded-none");
    expect(classes).toContain("font-heading");
    expect(classes).toContain("uppercase");
  });

  it("distingue la acción alternativa con borde ink y contraste al interactuar", () => {
    const classes = buttonVariants({ variant: "outline" });

    expect(classes).toContain("border-primary");
    expect(classes).toContain("hover:bg-primary");
    expect(classes).toContain("hover:text-primary-foreground");
  });
});
