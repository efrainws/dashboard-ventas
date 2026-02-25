import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { pool } from "./postgres";
import { z } from "zod";
import { getDb } from "./db";
import { storeMonthlyTargets } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const targetsRouter = router({
  /**
   * Obtiene ventas por tienda vs meta prorrateada para un rango de fechas
   */
  getSalesVsTarget: publicProcedure
    .input(
      z.object({
        fecha_min: z.string().datetime(),
        fecha_max: z.string().datetime(),
        store_ids: z.array(z.string()).optional(), // Filtro multi-select de tiendas
      })
    )
    .query(async ({ input }) => {
      const { fecha_min, fecha_max, store_ids } = input;

      // Construir filtro de tiendas
      const storeFilter = store_ids && store_ids.length > 0
        ? `AND sh.branch_id = ANY($3::uuid[])`
        : '';
      const queryParams: any[] = [fecha_min, fecha_max];
      if (store_ids && store_ids.length > 0) {
        queryParams.push(store_ids);
      }

      // Consultar ventas por tienda en el rango de fechas
      const salesQuery = `
        SELECT
          sh.branch_id AS store_id,
          INITCAP(LOWER(COALESCE(b.name, ''))) AS store_name,
          SUM(sd.total) AS total_sales
        FROM sales_header sh
        JOIN sales_detail sd ON sd.header_id = sh.id
        LEFT JOIN branches b ON b.id = sh.branch_id
        WHERE sh.doc_date >= $1 AND sh.doc_date < $2
          ${storeFilter}
        GROUP BY sh.branch_id, b.name
        ORDER BY store_name;
      `;

      try {
        const salesResult = await pool.query(salesQuery, queryParams);

        // Calcular metas prorrateadas para cada tienda
        const startDate = new Date(fecha_min);
        const endDate = new Date(fecha_max);
        
        // Obtener todos los meses que abarca el rango
        const monthsInRange = getMonthsInRange(startDate, endDate);
        
        // Obtener metas de la BD local para los meses relevantes
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Base de datos no disponible',
          });
        }
        
        const targets = await db.select().from(storeMonthlyTargets)
          .where(
            and(
              // Filtrar por meses relevantes (usando OR para cada mes)
              // Nota: Drizzle no tiene un operador IN directo para arrays, usamos múltiples OR
            )
          );

        // Calcular meta prorrateada para cada tienda
        const storesWithTargets = salesResult.rows.map((row: any) => {
          const storeId = row.store_id;
          const totalSales = parseFloat(row.total_sales || 0);

          // Calcular meta prorrateada
          const proratedTarget = calculateProratedTarget(
            storeId,
            startDate,
            endDate,
            targets,
            monthsInRange
          );

          const completionPercentage = proratedTarget > 0
            ? (totalSales / proratedTarget) * 100
            : 0;

          return {
            store_id: storeId,
            store_name: row.store_name,
            total_sales: totalSales,
            prorated_target: proratedTarget,
            completion_percentage: completionPercentage,
            has_target: proratedTarget > 0,
          };
        });

        // Ordenar por % de cumplimiento descendente
        storesWithTargets.sort((a, b) => b.completion_percentage - a.completion_percentage);

        return {
          success: true,
          stores: storesWithTargets,
          metadata: {
            date_range: { start: fecha_min, end: fecha_max },
            months_in_range: monthsInRange,
          },
        };
      } catch (error) {
        console.error('[PostgreSQL] Error executing sales vs target query:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al consultar ventas vs meta',
        });
      }
    }),

  /**
   * Obtiene todas las metas configuradas (para visualización/edición)
   */
  getStoreTargets: publicProcedure
    .input(
      z.object({
        month: z.string().optional(), // Filtrar por mes específico (YYYY-MM)
        store_id: z.string().optional(), // Filtrar por tienda específica
      })
    )
    .query(async ({ input }) => {
      const { month, store_id } = input;

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Base de datos no disponible',
          });
        }
        
        let query = db.select().from(storeMonthlyTargets);

        // Aplicar filtros si existen
        const conditions: any[] = [];
        if (month) {
          conditions.push(eq(storeMonthlyTargets.month, month));
        }
        if (store_id) {
          conditions.push(eq(storeMonthlyTargets.storeId, store_id));
        }

        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }

        const targets = await query;

        return {
          success: true,
          targets,
        };
      } catch (error) {
        console.error('[DB] Error fetching store targets:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al obtener metas',
        });
      }
    }),

  /**
   * Crea o actualiza una meta mensual para una tienda
   * Solo accesible para admin/manager
   */
  upsertStoreTarget: protectedProcedure
    .input(
      z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/, 'Formato de mes inválido (debe ser YYYY-MM)'),
        store_id: z.string().min(1, 'Store ID requerido'),
        monthly_target_amount: z.number().positive('La meta debe ser mayor a 0'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { month, store_id, monthly_target_amount } = input;

      // Verificar permisos (solo admin puede editar metas)
      // Nota: Si se implementa rol "manager", agregar aquí
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'No tienes permisos para editar metas',
        });
      }

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Base de datos no disponible',
          });
        }
        
        // Buscar si ya existe un registro para este mes y tienda
        const existing = await db.select().from(storeMonthlyTargets)
          .where(
            and(
              eq(storeMonthlyTargets.month, month),
              eq(storeMonthlyTargets.storeId, store_id)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Actualizar existente
          await db.update(storeMonthlyTargets)
            .set({
              monthlyTargetAmount: monthly_target_amount,
              updatedAt: new Date(),
            })
            .where(eq(storeMonthlyTargets.id, existing[0].id));

          return {
            success: true,
            action: 'updated',
            target: { ...existing[0], monthlyTargetAmount: monthly_target_amount },
          };
        } else {
          // Crear nuevo
          const result = await db.insert(storeMonthlyTargets).values({
            month,
            storeId: store_id,
            monthlyTargetAmount: monthly_target_amount,
          });

          return {
            success: true,
            action: 'created',
            target: { id: result[0].insertId, month, storeId: store_id, monthlyTargetAmount: monthly_target_amount },
          };
        }
      } catch (error) {
        console.error('[DB] Error upserting store target:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al guardar meta',
        });
      }
    }),

  /**
   * Elimina una meta mensual
   * Solo accesible para admin
   */
  deleteStoreTarget: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id } = input;

      // Verificar permisos
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'No tienes permisos para eliminar metas',
        });
      }

      try {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Base de datos no disponible',
          });
        }
        
        await db.delete(storeMonthlyTargets).where(eq(storeMonthlyTargets.id, id));

        return {
          success: true,
          message: 'Meta eliminada correctamente',
        };
      } catch (error) {
        console.error('[DB] Error deleting store target:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al eliminar meta',
        });
      }
    }),
});

/**
 * Obtiene todos los meses (YYYY-MM) que abarca un rango de fechas
 */
function getMonthsInRange(startDate: Date, endDate: Date): string[] {
  const months: string[] = [];
  const current = new Date(startDate);
  current.setDate(1); // Normalizar al primer día del mes

  while (current <= endDate) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/**
 * Calcula la meta prorrateada para una tienda en un rango de fechas
 * Soporta rangos que cruzan múltiples meses
 */
function calculateProratedTarget(
  storeId: string,
  startDate: Date,
  endDate: Date,
  targets: any[],
  monthsInRange: string[]
): number {
  let totalProratedTarget = 0;

  for (const month of monthsInRange) {
    // Buscar meta para este mes y tienda
    const target = targets.find(t => t.month === month && t.storeId === storeId);
    if (!target) continue;

    const monthlyTarget = target.monthlyTargetAmount;

    // Calcular días del mes que están dentro del rango
    const [year, monthNum] = month.split('-').map(Number);
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 0); // Último día del mes

    // Días totales del mes
    const totalDaysInMonth = monthEnd.getDate();

    // Días del mes que están dentro del rango seleccionado
    const rangeStart = startDate > monthStart ? startDate : monthStart;
    const rangeEnd = endDate < monthEnd ? endDate : monthEnd;

    if (rangeStart > rangeEnd) continue;

    // Calcular días en el rango (inclusive)
    const daysInRange = Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Prorratear meta
    const proratedAmount = (monthlyTarget / totalDaysInMonth) * daysInRange;
    totalProratedTarget += proratedAmount;
  }

  return Math.round(totalProratedTarget);
}
