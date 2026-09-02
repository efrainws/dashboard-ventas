import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (relativePath: string) =>
  readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("TopProducts y patrones visuales", () => {
  it("usa estados de cobertura y tabla semánticos en lugar de bordes locales", () => {
    const component = projectFile("client/src/pages/TopProducts.tsx");

    expect(component).toContain("ff-coverage-chip");
    expect(component).toContain("ff-top-products-alert");
    expect(component).toContain("ff-table ff-top-products-table");
    expect(component).toContain("radius={0}");
    expect(component).not.toContain("rounded-full text-[10px]");
  });

  it("centraliza alertas, iconos KPI y estados de cobertura en la hoja global", () => {
    const styles = projectFile("client/src/index.css");

    expect(styles).toContain(".ff-coverage-chip--critical");
    expect(styles).toContain(".ff-top-products-alert");
    expect(styles).toContain(".ff-top-products-kpi-icon");
    expect(styles).toContain(".ff-top-products-table");
  });
});
