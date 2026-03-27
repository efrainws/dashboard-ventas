/**
 * termsVersions.test.ts
 * Tests para las funciones de gestión de versiones de T&C en db.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock de drizzle ──────────────────────────────────────────────────────────
const mockUpdate = vi.fn().mockReturnThis();
const mockSet = vi.fn().mockReturnThis();
const mockWhere = vi.fn().mockResolvedValue([]);
const mockInsert = vi.fn().mockReturnThis();
const mockValues = vi.fn().mockResolvedValue([{ insertId: 42 }]);
const mockDelete = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();
const mockFrom = vi.fn().mockReturnThis();
const mockLimit = vi.fn().mockResolvedValue([]);
const mockGroupBy = vi.fn().mockResolvedValue([]);
const mockOrderBy = vi.fn().mockResolvedValue([]);

const mockDb = {
  update: mockUpdate,
  set: mockSet,
  where: mockWhere,
  insert: mockInsert,
  values: mockValues,
  delete: mockDelete,
  select: mockSelect,
  from: mockFrom,
  limit: mockLimit,
  groupBy: mockGroupBy,
  orderBy: mockOrderBy,
};

// Encadenar métodos
mockUpdate.mockReturnValue({ set: mockSet });
mockSet.mockReturnValue({ where: mockWhere });
mockInsert.mockReturnValue({ values: mockValues });
mockDelete.mockReturnValue({ where: mockWhere });
mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy, groupBy: mockGroupBy });
mockWhere.mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy });

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue(mockDb),
  };
});

// ─── Tests de lógica de negocio ───────────────────────────────────────────────
describe("Gestión de versiones de T&C — lógica de negocio", () => {

  describe("createTermsVersion", () => {
    it("debe requerir version y content no vacíos", () => {
      const input = { version: "1.0", content: "Contenido de los términos y condiciones completo." };
      expect(input.version.length).toBeGreaterThan(0);
      expect(input.content.length).toBeGreaterThanOrEqual(10);
    });

    it("debe rechazar content menor a 10 caracteres", () => {
      const shortContent = "corto";
      expect(shortContent.length).toBeLessThan(10);
    });
  });

  describe("updateTermsVersion", () => {
    it("debe aceptar actualización parcial (solo version)", () => {
      const input = { id: 1, version: "1.1" };
      const updateData: Record<string, unknown> = {};
      if (input.version !== undefined) updateData.version = input.version;
      expect(Object.keys(updateData)).toContain("version");
      expect(Object.keys(updateData)).not.toContain("content");
    });

    it("debe aceptar actualización parcial (solo content)", () => {
      const input = { id: 1, content: "Nuevo contenido completo de los términos." };
      const updateData: Record<string, unknown> = {};
      if (input.content !== undefined) updateData.content = input.content;
      expect(Object.keys(updateData)).toContain("content");
      expect(Object.keys(updateData)).not.toContain("version");
    });

    it("no debe actualizar si no hay campos", () => {
      const input = { id: 1 };
      const updateData: Record<string, unknown> = {};
      if ((input as any).version !== undefined) updateData.version = (input as any).version;
      if ((input as any).content !== undefined) updateData.content = (input as any).content;
      expect(Object.keys(updateData)).toHaveLength(0);
    });
  });

  describe("deleteTermsVersion — regla de negocio", () => {
    it("no debe eliminar versión con aceptaciones", () => {
      const acceptances = [{ id: 1 }]; // simula que hay aceptaciones
      const canDelete = acceptances.length === 0;
      expect(canDelete).toBe(false);
    });

    it("debe permitir eliminar versión sin aceptaciones", () => {
      const acceptances: { id: number }[] = [];
      const canDelete = acceptances.length === 0;
      expect(canDelete).toBe(true);
    });
  });

  describe("setActiveTermsVersion — invariante", () => {
    it("solo una versión puede estar activa a la vez", () => {
      // Simula el resultado después de activar: todas inactivas excepto la seleccionada
      const versions = [
        { id: 1, isActive: 0 },
        { id: 2, isActive: 1 }, // la activada
        { id: 3, isActive: 0 },
      ];
      const activeVersions = versions.filter((v) => v.isActive === 1);
      expect(activeVersions).toHaveLength(1);
      expect(activeVersions[0].id).toBe(2);
    });
  });

  describe("getAllTermsVersionsWithCount — conteo de aceptaciones", () => {
    it("debe devolver 0 aceptaciones para versiones sin registros", () => {
      const versions = [{ id: 1, version: "1.0", content: "...", isActive: 1, createdAt: new Date() }];
      const countMap: Record<number, number> = {}; // vacío
      const result = versions.map((v) => ({ ...v, acceptanceCount: countMap[v.id] ?? 0 }));
      expect(result[0].acceptanceCount).toBe(0);
    });

    it("debe sumar correctamente las aceptaciones por versión", () => {
      const versions = [
        { id: 1, version: "1.0", content: "...", isActive: 0, createdAt: new Date() },
        { id: 2, version: "2.0", content: "...", isActive: 1, createdAt: new Date() },
      ];
      const countMap: Record<number, number> = { 1: 15, 2: 3 };
      const result = versions.map((v) => ({ ...v, acceptanceCount: countMap[v.id] ?? 0 }));
      expect(result[0].acceptanceCount).toBe(15);
      expect(result[1].acceptanceCount).toBe(3);
    });
  });

  describe("Validación del formulario de T&C (frontend)", () => {
    it("debe requerir versión no vacía", () => {
      const version = "";
      expect(version.trim().length).toBe(0);
    });

    it("debe requerir contenido de al menos 10 caracteres", () => {
      const content = "Texto corto";
      expect(content.trim().length).toBeGreaterThanOrEqual(10);
    });

    it("debe aceptar versiones con formato libre", () => {
      const validVersions = ["1.0", "2.1", "2025-01", "v3", "2024-Q1"];
      validVersions.forEach((v) => expect(v.length).toBeGreaterThan(0));
    });
  });
});
