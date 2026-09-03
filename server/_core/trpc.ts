import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

type SalesScopeUser = {
  role: string | null;
  assignedStoreCode: string | null;
};

const SALES_DASHBOARD_ROLES = new Set([
  'system_specialist',
  'operations_specialist',
  'cst_user',
  'commercial_specialist',
  'store_user',
  'own_brand_user',
  'admin',
]);

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

/**
 * Fuerza la tienda de sesión para `store_user` antes de que el esquema Zod
 * procese la entrada. Así se protege el backend incluso si un cliente modifica
 * manualmente `branch_id`, `branch_sap_id` o `store_ids`.
 */
export function applySalesStoreScope(input: unknown, user: SalesScopeUser) {
  if (user.role !== 'store_user') return input;

  if (!user.assignedStoreCode) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'El usuario de tienda no tiene una sucursal asignada.',
    });
  }

  const baseInput = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};

  return {
    ...baseInput,
    branch_id: user.assignedStoreCode,
    branch_sap_id: user.assignedStoreCode,
    branchSapId: user.assignedStoreCode,
    store_ids: [user.assignedStoreCode],
  };
}

const requireSalesDashboardAccess = t.middleware(async ({ ctx, input, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: UNAUTHED_ERR_MSG });
  }

  if (!SALES_DASHBOARD_ROLES.has(ctx.user.role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'No tienes acceso a los datos del dashboard de ventas.',
    });
  }

  return next({
    ctx: { ...ctx, user: ctx.user },
    input: applySalesStoreScope(input, ctx.user),
  });
});

/** Procedimiento para lecturas y operaciones del dashboard de ventas. */
export const salesDataProcedure = protectedProcedure.use(requireSalesDashboardAccess);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'system_specialist') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
