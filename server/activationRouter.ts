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
import { router, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { activationTokens, users } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcrypt";
import crypto from "crypto";

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
  username: string
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  const token = generateToken();
  const expiresAt = expiresIn48h();

  await db.insert(activationTokens).values({
    token,
    userId,
    username,
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

      return {
        valid: true,
        username: record.username,
        expiresAt: record.expiresAt,
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
      })
    )
    .mutation(async ({ input }) => {
      const { token, temporaryPassword, newPassword, confirmPassword } = input;

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
        .where(
          and(
            eq(users.id, record.userId),
            eq(users.username, record.username)
          )
        )
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

      const tempPasswordValid = await bcrypt.compare(temporaryPassword, user.password);
      if (!tempPasswordValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "La contraseña temporal es incorrecta",
        });
      }

      // 5. New password must differ from the temporary one
      const sameAsTemp = await bcrypt.compare(newPassword, user.password);
      if (sameAsTemp) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "La nueva contraseña no puede ser igual a la contraseña temporal",
        });
      }

      // 6. Hash and save the new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);

      await db
        .update(users)
        .set({ password: hashedNewPassword, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      // 7. Mark token as used
      await db
        .update(activationTokens)
        .set({ used: 1 })
        .where(eq(activationTokens.id, record.id));

      return {
        success: true,
        message: "Cuenta activada correctamente. Ya puedes iniciar sesión con tu nueva contraseña.",
        username: user.username,
      };
    }),
});
