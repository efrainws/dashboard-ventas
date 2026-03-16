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
        fecha_min: z.string(), // Formato YYYY-MM-DD en hora local de Lima
        fecha_max: z.string(), // Formato YYYY-MM-DD en hora local de Lima
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
          COALESCE(b.sap_id, '') AS store_sap_id,
          SUM(sd.total) AS total_sales
        FROM sales_header sh
        JOIN sales_detail sd ON sd.header_id = sh.id
        LEFT JOIN branches b ON b.id = sh.branch_id
        WHERE sh.doc_date::date >= $1::date AND sh.doc_date::date <= $2::date
          ${storeFilter}
        GROUP BY sh.branch_id, b.name, b.sap_id
        ORDER BY b.sap_id;
      `;

      try {
        const salesResult = await pool.query(salesQuery, queryParams);

        // Calcular metas prorrateadas para cada tienda
        // Parsear YYYY-MM-DD como fecha local (no UTC) para evitar desfase de zona horaria
        const [startYear, startMonth, startDay] = fecha_min.split('-').map(Number);
        const [endYear, endMonth, endDay] = fecha_max.split('-').map(Number);
        const startDate = new Date(startYear, startMonth - 1, startDay);
        const endDate = new Date(endYear, endMonth - 1, endDay);
        
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
            store_sap_id: row.store_sap_id || '',
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

      // Verificar permisos (solo system_specialist puede editar metas)
      if (ctx.user.role !== 'system_specialist') {
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
      if (ctx.user.role !== 'system_specialist') {
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

  /**
   * Carga masiva de metas desde CSV
   * Acepta un array de filas ya parseadas en el cliente
   * Solo accesible para admin
   */
  bulkUpsertFromCSV: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            month: z.string().regex(/^\d{4}-\d{2}$/, 'Formato de mes inválido (YYYY-MM)'),
            store_sap_id: z.string().min(1, 'Código SAP requerido'),
            monthly_target_amount: z.number().positive('La meta debe ser mayor a 0'),
          })
        ).min(1, 'El CSV debe tener al menos una fila de datos'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Solo system_specialist puede cargar metas masivamente
      if (ctx.user.role !== 'system_specialist') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'No tienes permisos para cargar metas',
        });
      }

      const { rows } = input;

      try {
        // Obtener el mapeo de sap_id → store_id desde PostgreSQL
        const storesResult = await pool.query(
          `SELECT id AS store_id, sap_id AS store_sap_id FROM branches WHERE sap_id IS NOT NULL`
        );
        const storeMap = new Map<string, string>(
          storesResult.rows.map((r: any) => [r.store_sap_id.trim().toUpperCase(), r.store_id])
        );

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Base de datos no disponible',
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
            errors.push({ row: i + 2, message: `Código SAP '${row.store_sap_id}' no encontrado` });
            continue;
          }

          try {
            const existing = await db.select().from(storeMonthlyTargets)
              .where(
                and(
                  eq(storeMonthlyTargets.month, row.month),
                  eq(storeMonthlyTargets.storeId, storeId)
                )
              )
              .limit(1);

            if (existing.length > 0) {
              await db.update(storeMonthlyTargets)
                .set({
                  monthlyTargetAmount: row.monthly_target_amount,
                  updatedAt: new Date(),
                })
                .where(eq(storeMonthlyTargets.id, existing[0].id));
              updated++;
            } else {
              await db.insert(storeMonthlyTargets).values({
                month: row.month,
                storeId,
                monthlyTargetAmount: row.monthly_target_amount,
              });
              inserted++;
            }
          } catch (rowError) {
            errors.push({ row: i + 2, message: `Error al procesar fila: ${rowError}` });
          }
        }

        return {
          success: true,
          inserted,
          updated,
          errors,
          total: rows.length,
        };
      } catch (error) {
        console.error('[DB] Error in bulkUpsertFromCSV:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al procesar la carga masiva',
        });
      }
    }),

  /**
   * Obtiene todas las tiendas desde la tabla branches de PostgreSQL
   * Para uso en el modal de edición de metas
   */
  getAllStores: publicProcedure
    .query(async () => {
      try {
        const query = `
          SELECT
            id AS store_id,
            INITCAP(LOWER(COALESCE(name, ''))) AS store_name,
            COALESCE(sap_id, '') AS store_sap_id
          FROM branches
          ORDER BY sap_id;
        `;

        const result = await pool.query(query);

        return {
          success: true,
          stores: result.rows.map((row: any) => ({
            store_id: row.store_id,
            store_name: row.store_name,
            store_sap_id: row.store_sap_id,
          })),
        };
      } catch (error) {
        console.error('[PostgreSQL] Error fetching all stores:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al obtener lista de tiendas',
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
