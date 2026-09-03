import { protectedProcedure, router, salesDataProcedure } from "./_core/trpc";
import { pool } from "./postgres";
import { z } from "zod";
import { getDb } from "./db";
import { storeMonthlyTargets } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * Canales de venta reconocidos en el sistema.
 *
 * El canal se determina por el valor de `methods_payment.payment_type_name`
 * vinculado al `sales_header` a través de `methods_payment.header_id`.
 *
 * - "rappi":      payment_type_name = 'RAPPI'
 * - "ecommerce":  payment_type_name = 'ECOMMERCE'
 * - "presencial": payment_type_name NOT IN ('RAPPI', 'ECOMMERCE')
 * - "all":        Todos los canales sin filtro
 */
export type SalesChannel = "all" | "presencial" | "ecommerce" | "rappi";

export const targetsRouter = router({
  /**
   * Obtiene ventas por tienda vs meta prorrateada para un rango de fechas.
   * Soporta filtro de canal: all | presencial | ecommerce | rappi | ecommerce+rappi
   */
  getSalesVsTarget: salesDataProcedure
    .input(
      z.object({
        fecha_min: z.string(),
        fecha_max: z.string(),
        store_ids: z.array(z.string()).optional(),
        /** Canal a filtrar. "all" = sin filtro. Puede ser un array para multi-canal. */
        channels: z.array(z.enum(["all", "presencial", "ecommerce", "rappi"])).optional(),
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, store_ids, channels } = input;

      const activeChannels = channels && channels.length > 0 && !channels.includes("all")
        ? channels
        : ["all"];

      // ── Construir filtro de tiendas ────────────────────────────────────────
      const storeFilter =
        store_ids && store_ids.length > 0 ? `AND b.sap_id = ANY($3::text[])` : "";
      const queryParams: any[] = [fecha_min, fecha_max];
      if (store_ids && store_ids.length > 0) queryParams.push(store_ids);
      // ── Construir filtro de canal ──────────────────────────────────────────────
      // El canal se determina por methods_payment.payment_type_name:
      //   'RAPPI'     → canal Rappi
      //   'ECOMMERCE' → canal eCommerce
      //   cualquier otro valor → canal Presencial
      //
      // La consulta agrega un JOIN a methods_payment cuando se filtra por canal.
      // Para evitar duplicar totales (una venta puede tener múltiples métodos de pago),
      // usamos EXISTS en lugar de JOIN directo.
      let channelJoin = "";
      let channelFilter = "";

      if (!activeChannels.includes("all")) {
        const conditions: string[] = [];

        if (activeChannels.includes("rappi")) {
          conditions.push(`EXISTS (
            SELECT 1 FROM methods_payment mp_ch
            WHERE mp_ch.header_id = sh.id
              AND mp_ch.payment_type_name = 'RAPPI'
          )`);
        }
        if (activeChannels.includes("ecommerce")) {
          conditions.push(`EXISTS (
            SELECT 1 FROM methods_payment mp_ch
            WHERE mp_ch.header_id = sh.id
              AND mp_ch.payment_type_name = 'ECOMMERCE'
          )`);
        }
        if (activeChannels.includes("presencial")) {
          // Presencial = NO tiene ningún método de pago de canal digital
          conditions.push(`NOT EXISTS (
            SELECT 1 FROM methods_payment mp_ch
            WHERE mp_ch.header_id = sh.id
              AND mp_ch.payment_type_name IN ('RAPPI', 'ECOMMERCE')
          )`);
        }

        if (conditions.length > 0) {
          channelFilter = `AND (${conditions.join(" OR ")})`;
        }
      }

      const salesQuery = `
        SELECT
          sh.branch_id AS store_id,
          INITCAP(LOWER(COALESCE(b.name, ''))) AS store_name,
          COALESCE(b.sap_id, '') AS store_sap_id,
          SUM(sd.total) AS total_sales
        FROM sales_header sh
        JOIN sales_detail sd ON sd.header_id = sh.id
        LEFT JOIN branches b ON b.id = sh.branch_id
        WHERE sh.doc_date >= $1::date AND sh.doc_date < ($2::date + INTERVAL '1 day')
          ${storeFilter}
          ${channelFilter}
        GROUP BY sh.branch_id, b.name, b.sap_id
        ORDER BY b.sap_id;
      `;

      try {
        const salesResult = await pool.query(salesQuery, queryParams);

        const [startYear, startMonth, startDay] = fecha_min.split("-").map(Number);
        const [endYear, endMonth, endDay] = fecha_max.split("-").map(Number);
        const startDate = new Date(startYear, startMonth - 1, startDay);
        const endDate = new Date(endYear, endMonth - 1, endDay);

        const monthsInRange = getMonthsInRange(startDate, endDate);

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Base de datos no disponible",
          });
        }

        const targets = await db.select().from(storeMonthlyTargets);

        // ── Calcular factor de ajuste por canal ───────────────────────────────
        // Si se filtra por canal(es) no-presencial, la meta se multiplica por
        // la suma de los porcentajes de los canales seleccionados / 100.
        // Si se filtra solo por presencial, el factor es (1 - ecommercePct - rappiPct).
        // Si es "all", factor = 1.

        const storesWithTargets = salesResult.rows.map((row: any) => {
          const storeId = row.store_id;
          const totalSales = parseFloat(row.total_sales || 0);

          const { proratedTarget, monthlyTarget } = calculateProratedTarget(
            storeId,
            startDate,
            endDate,
            targets,
            monthsInRange,
            activeChannels as SalesChannel[]
          );

          const completionPercentage =
            proratedTarget > 0 ? (totalSales / proratedTarget) * 100 : 0;

          return {
            store_id: storeId,
            store_name: row.store_name,
            store_sap_id: row.store_sap_id || "",
            total_sales: totalSales,
            prorated_target: proratedTarget,
            monthly_target: monthlyTarget,
            completion_percentage: completionPercentage,
            has_target: proratedTarget > 0,
          };
        });

        storesWithTargets.sort(
          (a, b) => b.completion_percentage - a.completion_percentage
        );

        return {
          success: true,
          stores: storesWithTargets,
          metadata: {
            date_range: { start: fecha_min, end: fecha_max },
            months_in_range: monthsInRange,
            active_channels: activeChannels,
          },
        };
      } catch (error) {
        console.error("[PostgreSQL] Error executing sales vs target query:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al consultar ventas vs meta",
        });
      }
    }),

  /**
   * Obtiene todas las metas configuradas (para visualización/edición)
   */
  getStoreTargets: salesDataProcedure
    .input(
      z.object({
        month: z.string().optional(),
        store_id: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { month, store_id } = input;

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Base de datos no disponible",
          });
        }

        let query = db.select().from(storeMonthlyTargets);

        const conditions: any[] = [];
        if (month) conditions.push(eq(storeMonthlyTargets.month, month));
        if (ctx.user.role === 'store_user') {
          const assignedStore = await pool.query(
            'SELECT id FROM branches WHERE sap_id = $1 LIMIT 1',
            [ctx.user.assignedStoreCode]
          );
          const assignedStoreId = assignedStore.rows[0]?.id;
          if (!assignedStoreId) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'La sucursal asignada no es válida.',
            });
          }
          conditions.push(eq(storeMonthlyTargets.storeId, assignedStoreId));
        } else if (store_id) {
          conditions.push(eq(storeMonthlyTargets.storeId, store_id));
        }

        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }

        const targets = await query;

        return { success: true, targets };
      } catch (error) {
        console.error("[DB] Error fetching store targets:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al obtener metas",
        });
      }
    }),

  /**
   * Crea o actualiza una meta mensual para una tienda.
   * Ahora incluye los porcentajes de canal eCommerce y Rappi.
   */
  upsertStoreTarget: protectedProcedure
    .input(
      z.object({
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/, "Formato de mes inválido (debe ser YYYY-MM)"),
        store_id: z.string().min(1, "Store ID requerido"),
        monthly_target_amount: z
          .number()
          .positive("La meta debe ser mayor a 0"),
        ecommerce_target_pct: z
          .number()
          .min(0)
          .max(100)
          .default(0),
        rappi_target_pct: z
          .number()
          .min(0)
          .max(100)
          .default(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const {
        month,
        store_id,
        monthly_target_amount,
        ecommerce_target_pct,
        rappi_target_pct,
      } = input;

      if (
        ctx.user.role !== "system_specialist" &&
        ctx.user.role !== "cst_user"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No tienes permisos para editar metas",
        });
      }

      // Validar que la suma de porcentajes no supere 100
      if (ecommerce_target_pct + rappi_target_pct > 100) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "La suma de los porcentajes de eCommerce y Rappi no puede superar 100%",
        });
      }

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Base de datos no disponible",
          });
        }

        const existing = await db
          .select()
          .from(storeMonthlyTargets)
          .where(
            and(
              eq(storeMonthlyTargets.month, month),
              eq(storeMonthlyTargets.storeId, store_id)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(storeMonthlyTargets)
            .set({
              monthlyTargetAmount: monthly_target_amount,
              ecommerceTargetPct: String(ecommerce_target_pct),
              rappiTargetPct: String(rappi_target_pct),
              updatedAt: new Date(),
            })
            .where(eq(storeMonthlyTargets.id, existing[0].id));

          return { success: true, action: "updated" };
        } else {
          await db.insert(storeMonthlyTargets).values({
            month,
            storeId: store_id,
            monthlyTargetAmount: monthly_target_amount,
            ecommerceTargetPct: String(ecommerce_target_pct),
            rappiTargetPct: String(rappi_target_pct),
          });

          return { success: true, action: "created" };
        }
      } catch (error) {
        console.error("[DB] Error upserting store target:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al guardar meta",
        });
      }
    }),

  /**
   * Elimina una meta mensual
   */
  deleteStoreTarget: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (
        ctx.user.role !== "system_specialist" &&
        ctx.user.role !== "cst_user"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No tienes permisos para eliminar metas",
        });
      }

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Base de datos no disponible",
          });
        }

        await db
          .delete(storeMonthlyTargets)
          .where(eq(storeMonthlyTargets.id, input.id));

        return { success: true, message: "Meta eliminada correctamente" };
      } catch (error) {
        console.error("[DB] Error deleting store target:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al eliminar meta",
        });
      }
    }),

  /**
   * Carga masiva de metas desde CSV.
   * Ahora acepta ecommerce_target_pct y rappi_target_pct opcionales.
   */
  bulkUpsertFromCSV: protectedProcedure
    .input(
      z.object({
        rows: z
          .array(
            z.object({
              month: z
                .string()
                .regex(
                  /^\d{4}-\d{2}$/,
                  "Formato de mes inválido (debe ser YYYY-MM)"
                ),
              store_sap_id: z.string().min(1, "Código SAP requerido"),
              monthly_target_amount: z
                .number()
                .positive("La meta debe ser mayor a 0"),
              ecommerce_target_pct: z.number().min(0).max(100).default(0),
              rappi_target_pct: z.number().min(0).max(100).default(0),
            })
          )
          .min(1, "El CSV debe tener al menos una fila de datos"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (
        ctx.user.role !== "system_specialist" &&
        ctx.user.role !== "cst_user"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "No tienes permisos para cargar metas",
        });
      }

      const { rows } = input;

      try {
        const storesResult = await pool.query(
          `SELECT id AS store_id, sap_id AS store_sap_id FROM branches WHERE sap_id IS NOT NULL`
        );
        const storeMap = new Map<string, string>(
          storesResult.rows.map((r: any) => [
            r.store_sap_id.trim().toUpperCase(),
            r.store_id,
          ])
        );

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Base de datos no disponible",
          });
        }

        let inserted = 0;
        let updated = 0;
        const errors: { row: number; message: string }[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const sapKey = row.store_sap_id.trim().toUpperCase();
          const storeId = storeMap.get(sapKey);

          if (!storeId) {
            errors.push({
              row: i + 2,
              message: `Código SAP '${row.store_sap_id}' no encontrado`,
            });
            continue;
          }

          // Validar suma de porcentajes
          if (row.ecommerce_target_pct + row.rappi_target_pct > 100) {
            errors.push({
              row: i + 2,
              message: `La suma de porcentajes eCommerce (${row.ecommerce_target_pct}%) + Rappi (${row.rappi_target_pct}%) supera 100%`,
            });
            continue;
          }

          try {
            const existing = await db
              .select()
              .from(storeMonthlyTargets)
              .where(
                and(
                  eq(storeMonthlyTargets.month, row.month),
                  eq(storeMonthlyTargets.storeId, storeId)
                )
              )
              .limit(1);

            if (existing.length > 0) {
              await db
                .update(storeMonthlyTargets)
                .set({
                  monthlyTargetAmount: row.monthly_target_amount,
                  ecommerceTargetPct: String(row.ecommerce_target_pct),
                  rappiTargetPct: String(row.rappi_target_pct),
                  updatedAt: new Date(),
                })
                .where(eq(storeMonthlyTargets.id, existing[0].id));
              updated++;
            } else {
              await db.insert(storeMonthlyTargets).values({
                month: row.month,
                storeId,
                monthlyTargetAmount: row.monthly_target_amount,
                ecommerceTargetPct: String(row.ecommerce_target_pct),
                rappiTargetPct: String(row.rappi_target_pct),
              });
              inserted++;
            }
          } catch (rowError) {
            errors.push({
              row: i + 2,
              message: `Error al procesar fila: ${rowError}`,
            });
          }
        }

        return { success: true, inserted, updated, errors, total: rows.length };
      } catch (error) {
        console.error("[DB] Error in bulkUpsertFromCSV:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al procesar la carga masiva",
        });
      }
    }),

  /**
   * Obtiene todas las tiendas desde la tabla branches de PostgreSQL
   */
  getAllStores: salesDataProcedure.query(async ({ ctx }) => {
    try {
      const query = `
        SELECT
          id AS store_id,
          INITCAP(LOWER(COALESCE(name, ''))) AS store_name,
          COALESCE(sap_id, '') AS store_sap_id
        FROM branches
        WHERE $1::text IS NULL OR sap_id = $1
        ORDER BY sap_id;
      `;

      const result = await pool.query(query, [
        ctx.user.role === 'store_user' ? ctx.user.assignedStoreCode : null,
      ]);

      return {
        success: true,
        stores: result.rows.map((row: any) => ({
          store_id: row.store_id,
          store_name: row.store_name,
          store_sap_id: row.store_sap_id,
        })),
      };
    } catch (error) {
      console.error("[PostgreSQL] Error fetching all stores:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Error al obtener lista de tiendas",
      });
    }
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getMonthsInRange(startDate: Date, endDate: Date): string[] {
  const months: string[] = [];
  const current = new Date(startDate);
  current.setDate(1);

  while (current <= endDate) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, "0");
    months.push(`${year}-${month}`);
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/**
 * Calcula la meta prorrateada para una tienda en un rango de fechas,
 * aplicando el factor de ajuste por canal si corresponde.
 *
 * Factor de ajuste:
 * - "all"        → 1.0 (sin ajuste)
 * - "ecommerce"  → ecommerceTargetPct / 100
 * - "rappi"      → rappiTargetPct / 100
 * - ["ecommerce","rappi"] → (ecommerceTargetPct + rappiTargetPct) / 100
 * - "presencial" → (100 - ecommerceTargetPct - rappiTargetPct) / 100
 */
function calculateProratedTarget(
  storeId: string,
  startDate: Date,
  endDate: Date,
  targets: any[],
  monthsInRange: string[],
  activeChannels: SalesChannel[]
): { proratedTarget: number; monthlyTarget: number } {
  let totalProratedTarget = 0;
  let totalMonthlyTarget = 0;

  const isAll = activeChannels.includes("all") || activeChannels.length === 0;

  for (const month of monthsInRange) {
    const target = targets.find(
      (t) => t.month === month && t.storeId === storeId
    );
    if (!target) continue;

    const monthlyTargetAmount = Number(target.monthlyTargetAmount);
    const ecommercePct = parseFloat(target.ecommerceTargetPct ?? "0");
    const rappiPct = parseFloat(target.rappiTargetPct ?? "0");

    // Factor de ajuste según canal(es) activos
    let factor = 1.0;
    if (!isAll) {
      let pctSum = 0;
      if (activeChannels.includes("ecommerce")) pctSum += ecommercePct;
      if (activeChannels.includes("rappi")) pctSum += rappiPct;
      if (activeChannels.includes("presencial")) {
        pctSum += Math.max(0, 100 - ecommercePct - rappiPct);
      }
      factor = pctSum / 100;
    }

    const adjustedMonthlyTarget = monthlyTargetAmount * factor;

    // Prorratear por días del período dentro del mes
    const [year, monthNum] = month.split("-").map(Number);
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0);

    const totalDaysInMonth = monthEnd.getDate();
    const rangeStart = startDate > monthStart ? startDate : monthStart;
    const rangeEnd = endDate < monthEnd ? endDate : monthEnd;

    if (rangeStart > rangeEnd) continue;

    const daysInRange =
      Math.floor(
        (rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;

    const proratedAmount =
      (adjustedMonthlyTarget / totalDaysInMonth) * daysInRange;
    totalProratedTarget += proratedAmount;
    totalMonthlyTarget += adjustedMonthlyTarget;
  }

  return {
    proratedTarget: Math.round(totalProratedTarget),
    monthlyTarget: Math.round(totalMonthlyTarget),
  };
}
