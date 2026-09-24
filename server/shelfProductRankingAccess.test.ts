import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

function makeContext(role: User["role"]): TrpcContext {
  return {
    user: {
      id: 99,
      openId: null,
      username: "role-test",
      password: null,
      name: "Role Test",
      email: "role-test@example.com",
      loginMethod: "local",
      role,
      assignedStoreCode: null,
      assignedSupplierId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => {}, clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("getShelfProductRanking — acceso", () => {
  const input = {
    branch_sap_id: "FF11",
    shelf_id: "8e92a3c8-2232-4af2-a0d8-2a1d5d670983",
    fecha_min: "2026-09-01",
    fecha_max: "2026-09-15",
    include_igv: true,
    sort_by: "amount" as const,
    limit: 100,
  };

  it("bloquea perfiles sin acceso al análisis antes de consultar PostgreSQL", async () => {
    const caller = appRouter.createCaller(makeContext("supplier_user"));
    await expect(caller.sales.getShelfProductRanking(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
