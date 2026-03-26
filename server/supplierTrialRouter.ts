/**
 * supplierTrialRouter.ts
 * Procedimientos tRPC para gestión del ciclo de vida trial/suscripción
 * de usuarios proveedor.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import {
  getSupplierUsers,
  activateSupplierTrial,
  acceptTerms,
  requestPaidAccess,
  approveAccessRequest,
  setSupplierStatus,
  getActiveTermsVersion,
  getAllTermsVersions,
  getUserTermsAcceptance,
  getAffiliationReport,
  computeSupplierStatus,
  createTermsVersion,
} from "./db";
import { getUserById } from "./db";
import { notifyOwner } from "./_core/notification";
import { sendTrialExpiryWarning, sendTermsAcceptedEmail, sendAccessRequestedEmail, sendAccessApprovedEmail } from "./email";

// ─── Guard: solo especialistas ────────────────────────────────────────────────
const specialistProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.user.role;
  if (role !== "system_specialist" && role !== "commercial_specialist") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo especialistas pueden acceder a esta función" });
  }
  return next({ ctx });
});

// ─── Guard: solo el propio supplier_user ─────────────────────────────────────
const supplierProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "supplier_user") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo usuarios proveedor pueden acceder a esta función" });
  }
  return next({ ctx });
});

export const supplierTrialRouter = router({

  // ── Estado actual del proveedor autenticado ──────────────────────────────
  getMyStatus: supplierProcedure.query(async ({ ctx }) => {
    const user = await getUserById(String(ctx.user.id));
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });

    const effectiveStatus = computeSupplierStatus(user);

    // Auto-sincronizar si el status cambió (trial_active → trial_expired)
    if (effectiveStatus !== user.supplierStatus && effectiveStatus) {
      await setSupplierStatus(user.id, effectiveStatus);
    }

    const activeTerms = await getActiveTermsVersion();

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      supplierStatus: effectiveStatus,
      activationDate: user.activationDate,
      trialEndDate: user.trialEndDate,
      subscriptionStartDate: user.subscriptionStartDate,
      termsAcceptedAt: user.termsAcceptedAt,
      termsVersionId: user.termsVersionId,
      activeTermsVersionId: activeTerms?.id ?? null,
    };
  }),

  // ── Obtener términos activos ──────────────────────────────────────────────
  getActiveTerms: protectedProcedure.query(async () => {
    const terms = await getActiveTermsVersion();
    if (!terms) throw new TRPCError({ code: "NOT_FOUND", message: "No hay términos activos configurados" });
    return terms;
  }),

  // ── Aceptar términos (durante trial → subscribed_active) ─────────────────
  acceptTerms: supplierProcedure
    .input(z.object({ termsVersionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const ip = (ctx as any).req?.ip ?? "unknown";
      await acceptTerms({
        userId: ctx.user.id,
        termsVersionId: input.termsVersionId,
        ip,
      });

      // Notificar al usuario
      const user = await getUserById(String(ctx.user.id));
      if (user?.email) {
        try {
          await sendTermsAcceptedEmail({ to: user.email, name: user.name ?? "Proveedor" });
        } catch (e) {
          console.error("[supplierTrialRouter] Error enviando email de aceptación:", e);
        }
      }

      return { success: true };
    }),

  // ── Solicitar acceso facturado (trial_expired → access_requested) ─────────
  requestPaidAccess: supplierProcedure
    .input(z.object({ termsVersionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const user = await getUserById(String(ctx.user.id));
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const effectiveStatus = computeSupplierStatus(user);
      if (effectiveStatus !== "trial_expired") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solo usuarios con trial vencido pueden solicitar acceso facturado" });
      }

      const ip = (ctx as any).req?.ip ?? "unknown";
      await requestPaidAccess({
        userId: ctx.user.id,
        termsVersionId: input.termsVersionId,
        ip,
      });

      // Notificar a especialistas
      try {
        await sendAccessRequestedEmail({ userName: user.name ?? "Proveedor", userEmail: user.email ?? "" });
      } catch (e) {
        console.error("[supplierTrialRouter] Error enviando notificación a especialistas:", e);
      }

      return { success: true };
    }),

  // ── Listar usuarios proveedor (solo especialistas) ────────────────────────
  listSupplierUsers: specialistProcedure
    .input(z.object({ status: z.enum(["trial_active", "trial_expired", "subscribed_active", "access_requested", "suspended"]).optional() }))
    .query(async ({ input }) => {
      return getSupplierUsers(input.status ? { status: input.status } : undefined);
    }),

  // ── Aprobar solicitud de acceso facturado ─────────────────────────────────
  approveAccessRequest: specialistProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const targetUser = await getUserById(String(input.userId));
      if (!targetUser) throw new TRPCError({ code: "NOT_FOUND" });

      const effectiveStatus = computeSupplierStatus(targetUser);
      if (effectiveStatus !== "access_requested") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "El usuario no tiene una solicitud pendiente" });
      }

      await approveAccessRequest({ userId: input.userId, approvedById: ctx.user.id });

      // Notificar al usuario
      if (targetUser.email) {
        try {
          await sendAccessApprovedEmail({ to: targetUser.email, name: targetUser.name ?? "Proveedor" });
        } catch (e) {
          console.error("[supplierTrialRouter] Error enviando email de aprobación:", e);
        }
      }

      return { success: true };
    }),

  // ── Cambiar estado manualmente ────────────────────────────────────────────
  setStatus: specialistProcedure
    .input(z.object({
      userId: z.number(),
      status: z.enum(["trial_active", "trial_expired", "subscribed_active", "access_requested", "suspended"]),
    }))
    .mutation(async ({ input }) => {
      await setSupplierStatus(input.userId, input.status);
      return { success: true };
    }),

  // ── Activar trial de un usuario ───────────────────────────────────────────
  activateTrial: specialistProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      await activateSupplierTrial(input.userId);
      return { success: true };
    }),

  // ── Ver detalle de aceptación de términos ─────────────────────────────────
  getTermsAcceptance: specialistProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      return getUserTermsAcceptance(input.userId);
    }),

  // ── Reporte de afiliación ─────────────────────────────────────────────────
  getAffiliationReport: specialistProcedure.query(async () => {
    return getAffiliationReport();
  }),

  // ── Gestión de versiones de términos ─────────────────────────────────────
  getAllTermsVersions: specialistProcedure.query(async () => {
    return getAllTermsVersions();
  }),

  createTermsVersion: specialistProcedure
    .input(z.object({ version: z.string().min(1), content: z.string().min(10) }))
    .mutation(async ({ input }) => {
      return createTermsVersion(input);
    }),
});
