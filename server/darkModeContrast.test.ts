import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("contraste en modo oscuro", () => {
  it("redefine las superficies y textos semánticos compartidos", () => {
    const css = source("client/src/index.css");
    const darkBlock = css.slice(css.indexOf(".dark {"), css.indexOf("@layer base"));

    [
      "--surface-page: #1A1A1A",
      "--surface-card: #242424",
      "--surface-cream: #2A2A2A",
      "--text-strong: #F3EEE1",
      "--text-muted: #CFC7B8",
      "--muted-foreground: #CFC7B8",
    ].forEach((token) => expect(darkBlock).toContain(token));
  });

  it("usa tokens semánticos en los encabezados y pestañas compartidas", () => {
    const css = source("client/src/index.css");

    expect(css).toContain(".ff-view-tab[aria-pressed=\"true\"]");
    expect(css).toContain("background: var(--primary);");
    expect(css).toContain(".ff-card-title");
    expect(css).toContain("color: var(--text-strong);");
    expect(css).toContain(".ff-section-label");
    expect(css).toContain("color: var(--text-muted);");
  });

  it("evita los fondos y textos de carbón fijos en los selectores de vistas", () => {
    ["client/src/pages/SupplierPortal.tsx", "client/src/pages/OwnBrandPortal.tsx", "client/src/pages/SalesByShelf.tsx"].forEach((file) => {
      const page = source(file);
      expect(page).toContain("ff-view-tab");
      expect(page).toContain("aria-pressed");
    });
  });

  it("hace que los modales administrativos dependan de superficies semánticas", () => {
    ["client/src/pages/DatabaseConnections.tsx", "client/src/components/ReportDiscrepancyModal.tsx"].forEach((file) => {
      const component = source(file);
      expect(component).toMatch(/carbon:\s*"var\(--text-strong\)"/);
      expect(component).toMatch(/blanco:\s*"var\(--surface-card\)"/);
      expect(component).toMatch(/hueso:\s*"var\(--surface-cream\)"/);
    });
  });
});
