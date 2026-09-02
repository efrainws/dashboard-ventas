import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("alineación del menú de usuario", () => {
  it("centra verticalmente el disparador dentro de la barra superior", () => {
    const component = readFileSync(
      path.resolve(process.cwd(), "client/src/components/NavigationMenu.tsx"),
      "utf8"
    );

    expect(component).toContain("h-9 self-center items-center justify-center");
    expect(component).toContain("border-l border-border");
  });
});
