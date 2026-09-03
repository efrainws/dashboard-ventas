import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const userManagementSource = fs.readFileSync(
  path.resolve(process.cwd(), "client/src/pages/UserManagement.tsx"),
  "utf8"
);
const globalStyles = fs.readFileSync(
  path.resolve(process.cwd(), "client/src/index.css"),
  "utf8"
);

describe("modal de aviso de dominio", () => {
  it("mantiene encabezado y acciones fuera del cuerpo desplazable", () => {
    expect(userManagementSource).toContain("ff-dialog-fixed-header");
    expect(userManagementSource).toContain("ff-dialog-scroll-body");
    expect(userManagementSource).toContain("ff-dialog-fixed-footer");
    expect(userManagementSource).toContain("!max-w-6xl");
  });

  it("define el desplazamiento del cuerpo y limita el modal al viewport", () => {
    expect(globalStyles).toContain(".ff-dialog-viewport");
    expect(globalStyles).toContain("max-height: calc(100dvh - var(--space-4))");
    expect(globalStyles).toContain(".ff-dialog-scroll-body");
    expect(globalStyles).toContain("overflow-y: auto");
    expect(globalStyles).toContain(".ff-dialog-fixed-footer");
  });
});
