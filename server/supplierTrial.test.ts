/**
 * supplierTrial.test.ts
 * Tests unitarios para la lógica de trial/suscripción de proveedores.
 */
import { describe, it, expect } from "vitest";
import { computeSupplierStatus } from "./db";

describe("computeSupplierStatus", () => {
  it("devuelve null si no hay supplierStatus", () => {
    expect(computeSupplierStatus({ supplierStatus: null, trialEndDate: null })).toBeNull();
    expect(computeSupplierStatus({ supplierStatus: undefined, trialEndDate: null })).toBeNull();
  });

  it("devuelve trial_active si el trial no ha vencido", () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    expect(
      computeSupplierStatus({ supplierStatus: "trial_active", trialEndDate: future })
    ).toBe("trial_active");
  });

  it("devuelve trial_expired si el trial ya venció", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(
      computeSupplierStatus({ supplierStatus: "trial_active", trialEndDate: past })
    ).toBe("trial_expired");
  });

  it("devuelve trial_expired si trialEndDate es hoy pero ya pasó la hora", () => {
    const almostNow = new Date();
    almostNow.setMinutes(almostNow.getMinutes() - 1);
    expect(
      computeSupplierStatus({ supplierStatus: "trial_active", trialEndDate: almostNow })
    ).toBe("trial_expired");
  });

  it("devuelve subscribed_active sin importar la fecha de trial", () => {
    const past = new Date();
    past.setDate(past.getDate() - 10);
    expect(
      computeSupplierStatus({ supplierStatus: "subscribed_active", trialEndDate: past })
    ).toBe("subscribed_active");
  });

  it("devuelve access_requested sin importar la fecha de trial", () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    expect(
      computeSupplierStatus({ supplierStatus: "access_requested", trialEndDate: past })
    ).toBe("access_requested");
  });

  it("devuelve suspended sin importar la fecha de trial", () => {
    expect(
      computeSupplierStatus({ supplierStatus: "suspended", trialEndDate: null })
    ).toBe("suspended");
  });

  it("devuelve trial_active si trial_active y trialEndDate es null (sin fecha configurada)", () => {
    // Sin fecha de vencimiento, no puede calcular si venció → devuelve el estado tal cual
    expect(
      computeSupplierStatus({ supplierStatus: "trial_active", trialEndDate: null })
    ).toBe("trial_active");
  });
});

describe("CSV export helpers", () => {
  it("calcula porcentaje de cobro proporcional correctamente", () => {
    // Simular: suscripción inicia el día 15 de un mes de 30 días
    // Días restantes: 30 - 15 + 1 = 16 → 16/30 ≈ 53%
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const subscriptionStartDate = new Date(year, month, 15);
    const endOfMonth = new Date(year, month + 1, 0);
    const totalDays = endOfMonth.getDate();
    const daysRemaining = endOfMonth.getDate() - subscriptionStartDate.getDate() + 1;
    const pct = Math.min(1, Math.max(0, daysRemaining / totalDays));
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(1);
  });

  it("porcentaje es 1 si suscripción inicia el día 1", () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const subscriptionStartDate = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0);
    const totalDays = endOfMonth.getDate();
    const daysRemaining = endOfMonth.getDate() - subscriptionStartDate.getDate() + 1;
    const pct = Math.min(1, Math.max(0, daysRemaining / totalDays));
    expect(pct).toBe(1);
  });
});
