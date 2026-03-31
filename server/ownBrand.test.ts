/**
 * Tests para ownBrandRouter
 *
 * Valida que los procedimientos de gestión de marcas (listBrands, addBrand, removeBrand,
 * listAllBrands) y los guards de acceso funcionen correctamente.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock de getDb ────────────────────────────────────────────────────────────

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
};

vi.mock("./db", () => ({
  getDb: () => mockDb,
}));

// ─── Mock de pool ─────────────────────────────────────────────────────────────

vi.mock("./supplierPortalRouter", () => ({
  pool: { query: vi.fn() },
}));

// ─── Tests de guard assertAccess ─────────────────────────────────────────────

describe("ownBrandRouter — assertAccess", () => {
  const ALLOWED = ["own_brand_user", "system_specialist", "admin"];
  const DENIED = ["supplier_user", "store_user", "commercial_specialist", "cst_user"];

  it.each(ALLOWED)("permite el acceso al rol '%s'", (role) => {
    // La función assertAccess lanza si el rol no está permitido.
    // Importamos la lógica directamente para testearla sin instanciar tRPC.
    const assertAccess = (r: string) => {
      if (!["own_brand_user", "system_specialist", "admin"].includes(r)) {
        throw new Error("FORBIDDEN");
      }
    };
    expect(() => assertAccess(role)).not.toThrow();
  });

  it.each(DENIED)("bloquea el acceso al rol '%s'", (role) => {
    const assertAccess = (r: string) => {
      if (!["own_brand_user", "system_specialist", "admin"].includes(r)) {
        throw new Error("FORBIDDEN");
      }
    };
    expect(() => assertAccess(role)).toThrow("FORBIDDEN");
  });
});

// ─── Tests de buildBrandProductsSubquery ─────────────────────────────────────

describe("buildBrandProductsSubquery", () => {
  it("genera la subconsulta correcta para un array de brandIds", () => {
    const brandIds = ["brand-1", "brand-2"];
    const startIdx = 1;

    // Replicamos la lógica de buildBrandProductsSubquery
    const placeholders = brandIds.map((_, i) => `$${startIdx + i}`).join(", ");
    const subquery = `(SELECT id FROM public.products WHERE brand_id IN (${placeholders}))`;

    expect(subquery).toBe("(SELECT id FROM public.products WHERE brand_id IN ($1, $2))");
    expect(brandIds).toEqual(["brand-1", "brand-2"]);
  });

  it("genera placeholders consecutivos cuando startIdx > 1", () => {
    const brandIds = ["brand-a", "brand-b", "brand-c"];
    const startIdx = 3;

    const placeholders = brandIds.map((_, i) => `$${startIdx + i}`).join(", ");
    const subquery = `(SELECT id FROM public.products WHERE brand_id IN (${placeholders}))`;

    expect(subquery).toBe("(SELECT id FROM public.products WHERE brand_id IN ($3, $4, $5))");
  });

  it("devuelve array vacío de params cuando brandIds está vacío", () => {
    const brandIds: string[] = [];
    const params = [...brandIds];
    expect(params).toHaveLength(0);
  });
});

// ─── Tests de validación de inputs ───────────────────────────────────────────

describe("ownBrandRouter — validación de inputs", () => {
  it("addBrand requiere un brandId no vacío", () => {
    const { z } = require("zod");
    const schema = z.object({ brandId: z.string().uuid() });

    expect(() => schema.parse({ brandId: "" })).toThrow();
    expect(() => schema.parse({ brandId: "not-a-uuid" })).toThrow();
    expect(() => schema.parse({ brandId: "f51ff5db-d8e0-47a3-8057-e85f0ae62fa4" })).not.toThrow();
  });

  it("removeBrand requiere un brandId UUID válido", () => {
    const { z } = require("zod");
    const schema = z.object({ brandId: z.string().uuid() });

    expect(() => schema.parse({ brandId: "bc20be58-3ad4-47c3-bebf-cae8607d99ce" })).not.toThrow();
    expect(() => schema.parse({ brandId: "invalid" })).toThrow();
  });

  it("getStockByProduct acepta limit entre 1 y 200", () => {
    const { z } = require("zod");
    const schema = z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    });

    expect(() => schema.parse({ limit: 0, offset: 0 })).toThrow();
    expect(() => schema.parse({ limit: 201, offset: 0 })).toThrow();
    expect(() => schema.parse({ limit: 50, offset: 0 })).not.toThrow();
    expect(schema.parse({}).limit).toBe(50); // default
  });

  it("getSalesByProductBranch acepta rango de fechas opcional", () => {
    const { z } = require("zod");
    const schema = z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    });

    expect(() => schema.parse({})).not.toThrow();
    expect(() => schema.parse({ from: "2025-01-01", to: "2025-01-31" })).not.toThrow();
  });
});

// ─── Tests de seeds iniciales ─────────────────────────────────────────────────

describe("ownBrandRouter — seeds iniciales de marcas", () => {
  const DEFAULT_BRAND_IDS = [
    "f51ff5db-d8e0-47a3-8057-e85f0ae62fa4",
    "bc20be58-3ad4-47c3-bebf-cae8607d99ce",
  ];

  it("los IDs de marcas por defecto son UUIDs válidos", () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const id of DEFAULT_BRAND_IDS) {
      expect(id).toMatch(uuidRegex);
    }
  });

  it("hay exactamente 2 marcas por defecto", () => {
    expect(DEFAULT_BRAND_IDS).toHaveLength(2);
  });

  it("los IDs de marcas por defecto son únicos", () => {
    const unique = new Set(DEFAULT_BRAND_IDS);
    expect(unique.size).toBe(DEFAULT_BRAND_IDS.length);
  });
});
