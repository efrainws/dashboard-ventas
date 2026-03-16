import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import {
  createDiscrepancyTicket,
  getDiscrepancyTickets,
  getDiscrepancyTicketById,
  updateDiscrepancyTicketStatus,
  countDiscrepancyTickets,
  getAdminEmails,
} from "./db";
import { sendTicketNotificationEmail } from "./email";

export const ticketsRouter = router({
  /**
   * Create a new discrepancy ticket.
   * Any authenticated user (analyst) can report a discrepancy.
   */
  create: protectedProcedure
    .input(
      z.object({
        module: z.string().min(1),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        storeId: z.string().default("all"),
        storeName: z.string().default("Todas las tiendas"),
        dashboardAmount: z.number().optional(),
        analystAmount: z.number().optional(),
        description: z.string().min(10, "La descripción debe tener al menos 10 caracteres"),
        dataSource: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const difference =
        input.analystAmount !== undefined && input.dashboardAmount !== undefined
          ? input.analystAmount - input.dashboardAmount
          : undefined;

      const ticket = await createDiscrepancyTicket({
        module: input.module,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        storeId: input.storeId,
        storeName: input.storeName,
        dashboardAmount: input.dashboardAmount ?? null,
        analystAmount: input.analystAmount ?? null,
        difference: difference ?? null,
        description: input.description,
        dataSource: input.dataSource ?? null,
        priority: input.priority,
        status: "open",
        reportedById: ctx.user.id,
        reportedByName: ctx.user.name ?? ctx.user.username ?? "Usuario",
      });

      // Notify owner/admins about the new ticket
      const moduleLabels: Record<string, string> = {
        "sales-by-category": "Análisis por Categorías",
        "hourly-analysis": "Análisis por Horas",
        "sales-vs-target": "Ventas vs Meta",
      };
      const moduleLabel = moduleLabels[input.module] ?? input.module;
      const priorityLabels: Record<string, string> = {
        low: "Baja",
        medium: "Media",
        high: "Alta",
      };

      const amountInfo =
        input.dashboardAmount !== undefined && input.analystAmount !== undefined
          ? `\n- Monto dashboard: S/ ${input.dashboardAmount.toLocaleString("es-PE")}\n- Monto analista: S/ ${input.analystAmount.toLocaleString("es-PE")}\n- Diferencia: S/ ${(difference ?? 0).toLocaleString("es-PE")}`
          : "";

      await notifyOwner({
        title: `🚨 Nueva discrepancia reportada en ${moduleLabel}`,
        content: `**Ticket #${ticket.id}** reportado por **${ctx.user.name ?? ctx.user.username}**\n\n**Módulo:** ${moduleLabel}\n**Período:** ${input.dateFrom} → ${input.dateTo}\n**Tienda:** ${input.storeName}\n**Prioridad:** ${priorityLabels[input.priority]}${amountInfo}\n\n**Descripción:**\n${input.description}${input.dataSource ? `\n\n**Fuente del analista:** ${input.dataSource}` : ""}`,
      });

      // Send Brevo email notification to all admin users with email
      try {
        const req = (ctx as any).req;
        const protocol = req?.protocol ?? "https";
        const host = req?.get?.("host") ?? req?.headers?.host ?? "ventasdash-ftg2qpku.manus.space";
        const appUrl = `${protocol}://${host}`;

        const adminRecipients = await getAdminEmails();

        if (adminRecipients.length > 0) {
          await sendTicketNotificationEmail({
            ticketId: ticket.id,
            module: input.module,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            storeName: input.storeName,
            reportedByName: ctx.user.name ?? ctx.user.username ?? "Usuario",
            priority: input.priority,
            description: input.description,
            dashboardAmount: input.dashboardAmount ?? null,
            analystAmount: input.analystAmount ?? null,
            difference: difference ?? null,
            dataSource: input.dataSource ?? null,
            appUrl,
            recipients: adminRecipients,
          });
        }
      } catch (emailError) {
        // Email failure must not block ticket creation
        console.error("[Tickets] Failed to send email notification:", emailError);
      }

      return { success: true, ticketId: ticket.id };
    }),

  /**
   * List all tickets. Admins see all; regular users see only their own.
   */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["open", "in_review", "resolved", "closed"]).optional(),
        module: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const tickets = await getDiscrepancyTickets({
        status: input.status,
        module: input.module,
        limit: input.limit,
        offset: input.offset,
      });

      // system_specialist ve todos los tickets; cst_user y store_user solo los suyos
      const filtered =
        ctx.user.role === "system_specialist"
          ? tickets
          : tickets.filter((t) => t.reportedById === ctx.user.id);

      return filtered;
    }),

  /**
   * Get a single ticket by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const ticket = await getDiscrepancyTicketById(input.id);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });

      // Solo system_specialist puede ver tickets de otros usuarios
      if (ctx.user.role !== "system_specialist" && ticket.reportedById !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return ticket;
    }),

  /**
   * Update ticket status. Only admins can change status.
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["open", "in_review", "resolved", "closed"]),
        resolutionNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "system_specialist") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Solo el Especialista de Sistemas puede actualizar el estado de los tickets" });
      }

      const ticket = await getDiscrepancyTicketById(input.id);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });

      await updateDiscrepancyTicketStatus(
        input.id,
        input.status,
        ctx.user.id,
        ctx.user.name ?? ctx.user.username ?? "Admin",
        input.resolutionNotes
      );

      return { success: true };
    }),

  /**
   * Count open tickets (for badge in navigation).
   */
  countOpen: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "system_specialist") return 0;
    return countDiscrepancyTickets({ status: "open" });
  }),
});
