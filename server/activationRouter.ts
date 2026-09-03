/**
 * activationRouter.ts
 * Handles account activation flow for newly created users.
 *
 * Flow:
 * 1. When a user is created, `generateActivationToken` is called to create a
 *    one-time token stored in `activation_tokens`.
 * 2. The token is embedded in an activation link sent via email.
 * 3. The user visits /activate/:token, enters their temporary credentials
 *    (username + temp password), and chooses a new password.
 * 4. `activateAccount` verifies the token, validates the temp credentials,
 *    updates the password, and marks the token as used.
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { acceptTerms, recordTermsAcceptanceOnly, getActiveTermsVersion } from "./db";
import { activationTokens, users } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { notifyOwner } from "./_core/notification";
import { sendActivationEmail } from "./email";
import { hashPassword, verifyPassword } from "./passwordHash";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically secure random token (hex string).
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Returns a Date 48 hours from now (token expiration).
 */
function expiresIn48h(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 48);
  return d;
}

// ─── Exported helper: create a token for a newly created user ─────────────────

/**
 * Creates an activation token for a user and stores it in the DB.
 * Called from userRouter after creating a new user.
 * Returns the plain token string to be embedded in the activation URL.
 */
export async function createActivationToken(
  userId: number,
  email: string
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const token = generateToken();
  const expiresAt = expiresIn48h();

  await db.insert(activationTokens).values({
    token,
    userId,
    email,
    expiresAt,
    used: 0,
  });

  return token;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const activationRouter = router({
  /**
   * Validates a token and returns minimal info (username) so the activation
   * page can pre-fill the username field and confirm the token is valid.
   * Does NOT require authentication.
   */
  validateToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible",
        });
      }

      const rows = await db
        .select()
        .from(activationTokens)
        .where(eq(activationTokens.token, input.token))
        .limit(1);

      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "El enlace de activación no es válido",
        });
      }

      const record = rows[0];

      if (record.used === 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este enlace ya fue utilizado. Si necesitas acceso, contacta al administrador.",
        });
      }

      if (new Date() > record.expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El enlace de activación ha expirado (válido por 48 horas). Contacta al administrador para obtener uno nuevo.",
        });
      }

      // Fetch user's supplierStatus so the frontend knows whether to show T&C
      const userRows = await db
        .select({ supplierStatus: users.supplierStatus, role: users.role })
        .from(users)
        .where(eq(users.id, record.userId))
        .limit(1);

      const userInfo = userRows[0];

      // Fetch active terms version id
      const activeTerms = await getActiveTermsVersion();

      return {
        valid: true,
        email: record.email,
        expiresAt: record.expiresAt,
        supplierStatus: userInfo?.supplierStatus ?? null,
        role: userInfo?.role ?? null,
        activeTermsVersionId: activeTerms?.id ?? null,
        activeTermsContent: activeTerms?.content ?? null,
        activeTermsVersion: activeTerms?.version ?? null,
      };
    }),

  /**
   * Activates the account:
   * 1. Validates the token (not used, not expired).
   * 2. Verifies the user's temporary password.
   * 3. Sets the new password (must differ from the temporary one).
   * 4. Marks the token as used.
   * Does NOT require authentication.
   */
  activateAccount: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        temporaryPassword: z.string().min(1, "La contraseña temporal es requerida"),
        newPassword: z
          .string()
          .min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
        confirmPassword: z.string().min(1, "Confirma tu nueva contraseña"),
        // Para supplier_user con subscribed_active: aceptación obligatoria de T&C
        termsVersionId: z.number().optional(),
        termsAccepted: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { token, temporaryPassword, newPassword, confirmPassword, termsVersionId, termsAccepted } = input;

      // 1. Passwords must match
      if (newPassword !== confirmPassword) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Las contraseñas no coinciden",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible",
        });
      }

      // 2. Validate token
      const tokenRows = await db
        .select()
        .from(activationTokens)
        .where(eq(activationTokens.token, token))
        .limit(1);

      if (tokenRows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "El enlace de activación no es válido",
        });
      }

      const record = tokenRows[0];

      if (record.used === 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Este enlace ya fue utilizado",
        });
      }

      if (new Date() > record.expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El enlace de activación ha expirado",
        });
      }

      // 3. Find the user
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.id, record.userId))
        .limit(1);

      if (userRows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Usuario no encontrado",
        });
      }

      const user = userRows[0];

      // 4. Verify the temporary password
      if (!user.password) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "El usuario no tiene contraseña configurada",
        });
      }

      const tempPasswordValid = await verifyPassword(temporaryPassword, user.password);
      if (!tempPasswordValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "La contraseña temporal es incorrecta",
        });
      }

      // 5. New password must differ from the temporary one
      const sameAsTemp = await verifyPassword(newPassword, user.password);
      if (sameAsTemp) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "La nueva contraseña no puede ser igual a la contraseña temporal",
        });
      }

      // 6. Hash and save the new password
      const hashedNewPassword = await hashPassword(newPassword);

      const now = new Date();

      // Para supplier_user con estado pending_activation → activar trial automáticamente
      const isSupplierPendingActivation =
        user.role === "supplier_user" && user.supplierStatus === "pending_activation";

      // Para supplier_user con subscribed_active → solo registrar activationDate si no tiene
      const isSupplierSubscribedNoActivation =
        user.role === "supplier_user" &&
        user.supplierStatus === "subscribed_active" &&
        !user.activationDate;

      // Validar que subscribed_active haya aceptado los T&C
      if (isSupplierSubscribedNoActivation) {
        if (!termsAccepted || !termsVersionId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Debes aceptar los términos y condiciones para activar tu cuenta",
          });
        }
      }

      if (isSupplierPendingActivation) {
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + 7);
        await db
          .update(users)
          .set({
            password: hashedNewPassword,
            updatedAt: now,
            supplierStatus: "trial_active",
            activationDate: now,
            trialEndDate: trialEnd,
          })
          .where(eq(users.id, user.id));
      } else if (isSupplierSubscribedNoActivation) {
        await db
          .update(users)
          .set({
            password: hashedNewPassword,
            updatedAt: now,
            activationDate: now,
            subscriptionStartDate: now,
          })
          .where(eq(users.id, user.id));

        // Registrar aceptación de T&C (sin cambiar supplierStatus, ya es subscribed_active)
        if (termsVersionId) {
          const ip = (ctx as any)?.req?.ip ?? (ctx as any)?.req?.headers?.["x-forwarded-for"] ?? "unknown";
          await recordTermsAcceptanceOnly({
            userId: user.id,
            termsVersionId,
            ip: Array.isArray(ip) ? ip[0] : String(ip),
          });
        }

        // Notificar activación exitosa
        try {
          await notifyOwner({
            title: "Proveedor activó su cuenta",
            content: `El usuario ${user.name ?? user.email} (${user.email ?? ""}) activó su cuenta con suscripción activa.`,
          });
        } catch (e) {
          console.error("[activationRouter] Error enviando notificación:", e);
        }
      } else {
        await db
          .update(users)
          .set({ password: hashedNewPassword, updatedAt: now })
          .where(eq(users.id, user.id));
      }

      // 7. Mark token as used
      await db
        .update(activationTokens)
        .set({ used: 1 })
        .where(eq(activationTokens.id, record.id));

      return {
        success: true,
        message: "Cuenta activada correctamente. Ya puedes iniciar sesión con tu nueva contraseña.",
        email: user.email,
      };
    }),

  /**
   * Resends the activation email to a supplier_user in pending_activation status.
   * Invalidates any existing unused tokens and creates a fresh 48-hour token.
   * Only accessible by system_specialist or commercial_specialist.
   */
  resendActivation: protectedProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const callerRole = ctx.user.role;
      if (callerRole !== "system_specialist" && callerRole !== "commercial_specialist") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Solo los especialistas pueden reenviar correos de activación",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Base de datos no disponible",
        });
      }

      // Fetch the target user
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (userRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado" });
      }

      const user = userRows[0];

      if (user.role !== "supplier_user") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Solo se puede reenviar la activación a usuarios proveedor",
        });
      }

      if (user.supplierStatus !== "pending_activation") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El usuario ya activó su cuenta o no está en estado pendiente de activación",
        });
      }

      if (!user.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El usuario no tiene correo electrónico registrado",
        });
      }

      // Invalidate all existing unused tokens for this user
      await db
        .update(activationTokens)
        .set({ used: 1 })
        .where(and(eq(activationTokens.userId, user.id), eq(activationTokens.used, 0)));

      // Create a fresh token
      const newToken = generateToken();
      const expiresAt = expiresIn48h();

      await db.insert(activationTokens).values({
        token: newToken,
        userId: user.id,
        email: user.email ?? "",
        expiresAt,
        used: 0,
      });

      // Send the activation email
      const appUrl = "https://dashboard.florayfauna.pe";
      const activationUrl = `${appUrl}/activate/${newToken}`;

      await sendActivationEmail({
        name: user.name ?? user.email ?? "",
        email: user.email ?? "",
        username: user.email ?? "",
        activationUrl,
        role: user.role ?? "supplier_user",
      });

      return {
        success: true,
        message: `Correo de activación reenviado a ${user.email}`,
      };
    }),
});
