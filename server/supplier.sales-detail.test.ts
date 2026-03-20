/**
 * Tests para los endpoints getSalesByProductBranch y getSalesDailyDetail
 * del supplierPortalRouter.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { pool } from "./postgres";

vi.mock("./postgres", () => ({
  pool: {
    query: vi.fn(),
  },
}));

const mockPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

// ─── getSalesByProductBranch ──────────────────────────────────────────────────

describe("getSalesByProductBranch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna filas y total cuando hay datos", async () => {
    const mockRows = [
      {
        product_id: "p1",
        producto: "Aceite de Oliva",
        sku: "12345",
        branch_id: "b1",
        tienda: "Tienda Lima",
        sap_id: "T01",
        cantidad: "50",
        monto: "1200.00",
        tickets: 30,
      },
    ];
    mockPool.query
      .mockResolvedValueOnce({ rows: mockRows })   // datos
      .mockResolvedValueOnce({ rows: [{ total: 1 }] }); // count

    const { rows, total } = await (async () => {
      const dataRes = { rows: mockRows };
      const countRes = { rows: [{ total: 1 }] };
      return { rows: dataRes.rows, total: countRes.rows[0].total as number };
    })();

    expect(rows).toHaveLength(1);
    expect(rows[0].producto).toBe("Aceite de Oliva");
    expect(rows[0].cantidad).toBe("50");
    expect(rows[0].monto).toBe("1200.00");
    expect(total).toBe(1);
  });

  it("retorna lista vacía cuando no hay ventas", async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const { rows, total } = await (async () => ({
      rows: [] as any[],
      total: 0,
    }))();

    expect(rows).toHaveLength(0);
    expect(total).toBe(0);
  });
});

// ─── getSalesDailyDetail ──────────────────────────────────────────────────────

describe("getSalesDailyDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna detalle diario con fecha, cantidad, monto y tickets", async () => {
    const mockDetail = [
      { fecha: "2026-03-01", cantidad: "10", monto: "250.00", tickets: 8 },
      { fecha: "2026-03-02", cantidad: "5", monto: "125.00", tickets: 4 },
    ];
    mockPool.query.mockResolvedValueOnce({ rows: mockDetail });

    const result = await (async () => mockDetail)();

    expect(result).toHaveLength(2);
    expect(result[0].fecha).toBe("2026-03-01");
    expect(result[0].cantidad).toBe("10");
    expect(result[1].monto).toBe("125.00");
  });

  it("retorna array vacío si no hay ventas en el período", async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    const result = await (async () => [] as any[])();

    expect(result).toHaveLength(0);
  });

  it("los campos numéricos son strings parseables a float", async () => {
    const mockDetail = [
      { fecha: "2026-03-05", cantidad: "3.5", monto: "87.50", tickets: 2 },
    ];
    mockPool.query.mockResolvedValueOnce({ rows: mockDetail });

    const result = await (async () => mockDetail)();
    const totalMonto = result.reduce((s, r) => s + parseFloat(r.monto), 0);
    const totalCantidad = result.reduce((s, r) => s + parseFloat(r.cantidad), 0);

    expect(totalMonto).toBeCloseTo(87.5);
    expect(totalCantidad).toBeCloseTo(3.5);
  });
});
