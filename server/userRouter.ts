import { z } from 'zod';
import { router, protectedProcedure } from './_core/trpc';
import { TRPCError } from '@trpc/server';
import { getDb } from './db';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { sendWelcomeEmail, sendPasswordResetEmail } from './email';
import { pool } from './postgres';

// ─── Tipos de rol ─────────────────────────────────────────────────────────────
export type UserRole = 'system_specialist' | 'cst_user' | 'store_user';

/**
 * Etiquetas legibles para los roles
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  system_specialist: 'Especialista de Sistemas',
  cst_user: 'Usuario CST',
  store_user: 'Usuario Tienda',
};

// ─── Procedimientos con restricción de rol ────────────────────────────────────

/**
 * Solo Especialista de Sistemas o Usuario CST pueden acceder.
 * (Excluye a Usuario Tienda que no puede gestionar usuarios)
 */
const canManageUsersProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.user.role as UserRole;
  if (role === 'store_user') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Los usuarios de tienda no pueden gestionar usuarios',
    });
  }
  return next({ ctx });
});

/**
 * Solo Especialista de Sistemas puede acceder.
 */
const systemSpecialistProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'system_specialist') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Solo el Especialista de Sistemas puede realizar esta acción',
    });
  }
  return next({ ctx });
});

export const userRouter = router({
  /**
   * Listar todos los usuarios
   * Accesible para system_specialist y cst_user
   */
  listUsers: canManageUsersProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Base de datos no disponible',
        });
      }

      const allUsers = await db.select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        role: users.role,
        assignedStoreCode: users.assignedStoreCode,
        loginMethod: users.loginMethod,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        lastSignedIn: users.lastSignedIn,
      }).from(users);

      // cst_user solo ve usuarios de tipo store_user
      const currentRole = ctx.user.role as UserRole;
      const filteredUsers = currentRole === 'cst_user'
        ? allUsers.filter(u => u.role === 'store_user')
        : allUsers;

      return {
        success: true,
        users: filteredUsers,
      };
    } catch (error) {
      console.error('[User Management] Error listing users:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Error al listar usuarios',
      });
    }
  }),

  /**
   * Obtener la lista de tiendas desde PostgreSQL para el selector de tienda
   */
  getBranches: canManageUsersProcedure.query(async () => {
    try {
      const result = await pool.query(`
        SELECT sap_id, INITCAP(LOWER(COALESCE(name, ''))) AS name
        FROM branches
        WHERE sap_id IS NOT NULL AND sap_id <> ''
        ORDER BY CAST(SUBSTRING(sap_id FROM '[0-9]+') AS INTEGER) ASC
      `);
      return {
        success: true,
        branches: result.rows.map((r: any) => ({
          sap_id: r.sap_id as string,
          name: r.name as string,
        })),
      };
    } catch (error) {
      console.error('[User Management] Error fetching branches:', error);
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Error al obtener tiendas',
      });
    }
  }),

  /**
   * Crear nuevo usuario
   * - system_specialist puede crear cualquier tipo
   * - cst_user solo puede crear store_user
   */
  createUser: canManageUsersProcedure
    .input(
      z.object({
        username: z.string().min(3, 'El nombre de usuario debe tener al menos 3 caracteres'),
        password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
        name: z.string().min(1, 'El nombre es requerido'),
        email: z.string().email('Email inválido').optional(),
        role: z.enum(['system_specialist', 'cst_user', 'store_user']).default('cst_user'),
        assignedStoreCode: z.string().optional(),
        sendWelcomeEmail: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const currentRole = ctx.user.role as UserRole;

        // cst_user solo puede crear store_user
        if (currentRole === 'cst_user' && input.role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes crear usuarios de tipo Usuario Tienda',
          });
        }

        // store_user requiere tienda asignada
        if (input.role === 'store_user' && !input.assignedStoreCode) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'El Usuario Tienda requiere una tienda asignada',
          });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Base de datos no disponible',
          });
        }

        // Verificar si el usuario ya existe
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.username, input.username))
          .limit(1);

        if (existingUser.length > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'El nombre de usuario ya existe',
          });
        }

        // Hash de la contraseña
        const hashedPassword = await bcrypt.hash(input.password, 10);

        // Crear usuario
        const [newUser] = await db.insert(users).values({
          username: input.username,
          password: hashedPassword,
          name: input.name,
          email: input.email || null,
          role: input.role,
          assignedStoreCode: input.role === 'store_user' ? (input.assignedStoreCode || null) : null,
          loginMethod: 'local',
        });

        const userId = (newUser as any).insertId as number;

        // Send welcome email if requested and email is provided
        let emailSent = false;
        if (input.sendWelcomeEmail && input.email) {
          const req = (ctx as any).req;
          const protocol = req?.protocol ?? 'https';
          const host = req?.get?.('host') ?? req?.headers?.host ?? 'ventasdash-ftg2qpku.manus.space';
          const appUrl = `${protocol}://${host}`;

          emailSent = await sendWelcomeEmail({
            name: input.name,
            email: input.email,
            username: input.username,
            password: input.password,
            appUrl,
            role: input.role,
          });
        }

        return {
          success: true,
          message: 'Usuario creado exitosamente',
          userId,
          emailSent,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[User Management] Error creating user:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al crear usuario',
        });
      }
    }),

  /**
   * Actualizar información de usuario
   * - system_specialist puede actualizar cualquier usuario
   * - cst_user solo puede actualizar store_user
   */
  updateUser: canManageUsersProcedure
    .input(
      z.object({
        id: z.number(),
        username: z.string().min(3).optional(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        role: z.enum(['system_specialist', 'cst_user', 'store_user']).optional(),
        assignedStoreCode: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const currentRole = ctx.user.role as UserRole;
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Base de datos no disponible',
          });
        }

        const { id, ...updateData } = input;

        // Verificar que el usuario existe
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.id, id))
          .limit(1);

        if (existingUser.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Usuario no encontrado',
          });
        }

        // cst_user solo puede editar store_user
        if (currentRole === 'cst_user' && existingUser[0].role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes editar usuarios de tipo Usuario Tienda',
          });
        }

        // Si se está actualizando el username, verificar que no exista
        if (updateData.username) {
          const duplicateUser = await db
            .select()
            .from(users)
            .where(eq(users.username, updateData.username))
            .limit(1);

          if (duplicateUser.length > 0 && duplicateUser[0].id !== id) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'El nombre de usuario ya existe',
            });
          }
        }

        // Validar que store_user tenga tienda asignada
        const newRole = updateData.role ?? existingUser[0].role;
        const newStoreCode = updateData.assignedStoreCode !== undefined
          ? updateData.assignedStoreCode
          : existingUser[0].assignedStoreCode;

        if (newRole === 'store_user' && !newStoreCode) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'El Usuario Tienda requiere una tienda asignada',
          });
        }

        // Actualizar usuario
        await db.update(users).set(updateData).where(eq(users.id, id));

        return {
          success: true,
          message: 'Usuario actualizado exitosamente',
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[User Management] Error updating user:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al actualizar usuario',
        });
      }
    }),

  /**
   * Cambiar contraseña de usuario
   */
  updatePassword: canManageUsersProcedure
    .input(
      z.object({
        id: z.number(),
        newPassword: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
        notifyUser: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const currentRole = ctx.user.role as UserRole;
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Base de datos no disponible',
          });
        }

        // Verificar que el usuario existe
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.id, input.id))
          .limit(1);

        if (existingUser.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Usuario no encontrado',
          });
        }

        // cst_user solo puede cambiar contraseña de store_user
        if (currentRole === 'cst_user' && existingUser[0].role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes cambiar la contraseña de usuarios de tipo Usuario Tienda',
          });
        }

        // Hash de la nueva contraseña
        const hashedPassword = await bcrypt.hash(input.newPassword, 10);

        // Actualizar contraseña
        await db
          .update(users)
          .set({ password: hashedPassword })
          .where(eq(users.id, input.id));

        // Enviar correo de notificación si se solicita y el usuario tiene email
        let emailSent = false;
        if (input.notifyUser && existingUser[0].email) {
          const req = (ctx as any).req;
          const protocol = req?.protocol ?? 'https';
          const host = req?.get?.('host') ?? req?.headers?.host ?? 'ventasdash-ftg2qpku.manus.space';
          const appUrl = `${protocol}://${host}`;

          emailSent = await sendPasswordResetEmail({
            name: existingUser[0].name ?? existingUser[0].username ?? 'Usuario',
            email: existingUser[0].email,
            username: existingUser[0].username ?? '',
            newPassword: input.newPassword,
            appUrl,
            changedByAdmin: true,
          });
        }

        return {
          success: true,
          message: 'Contraseña actualizada exitosamente',
          emailSent,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[User Management] Error updating password:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al actualizar contraseña',
        });
      }
    }),

  /**
   * Eliminar usuario
   * - system_specialist puede eliminar cualquier usuario
   * - cst_user solo puede eliminar store_user
   */
  deleteUser: canManageUsersProcedure
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const currentRole = ctx.user.role as UserRole;
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Base de datos no disponible',
          });
        }

        // Verificar que el usuario existe
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.id, input.id))
          .limit(1);

        if (existingUser.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Usuario no encontrado',
          });
        }

        // cst_user solo puede eliminar store_user
        if (currentRole === 'cst_user' && existingUser[0].role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes eliminar usuarios de tipo Usuario Tienda',
          });
        }

        // Prevenir que un usuario se elimine a sí mismo
        if (existingUser[0].id === ctx.user.id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No puedes eliminar tu propia cuenta',
          });
        }

        // Eliminar usuario
        await db.delete(users).where(eq(users.id, input.id));

        return {
          success: true,
          message: 'Usuario eliminado exitosamente',
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[User Management] Error deleting user:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Error al eliminar usuario',
        });
      }
    }),
});
