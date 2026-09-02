import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
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

  it("fuerza mayúsculas para toda variante de Italian Plate", () => {
    const styles = readFileSync(path.resolve(process.cwd(), "client/src/index.css"), "utf8");

    expect(styles).toContain(".font-heading,");
    expect(styles).toContain('[style*="Italian Plate"]');
    expect(styles).toContain("h1, h2, h3");
    expect(styles).toContain("text-transform: uppercase !important;");
  });
});
