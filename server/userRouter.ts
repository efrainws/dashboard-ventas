import { z } from 'zod';
import { router, protectedProcedure } from './_core/trpc';
import { TRPCError } from '@trpc/server';
import { getDb } from './db';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { sendWelcomeEmail } from './email';

/**
 * Admin-only procedure
 * Verifica que el usuario actual tenga rol de admin
 */
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Solo los administradores pueden realizar esta acción',
    });
  }
  return next({ ctx });
});

export const userRouter = router({
  /**
   * Listar todos los usuarios
   * Solo accesible para administradores
   */
  listUsers: adminProcedure.query(async () => {
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
        loginMethod: users.loginMethod,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        lastSignedIn: users.lastSignedIn,
      }).from(users);

      return {
        success: true,
        users: allUsers,
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
   * Crear nuevo usuario
   * Solo accesible para administradores
   */
  createUser: adminProcedure
    .input(
      z.object({
        username: z.string().min(3, 'El nombre de usuario debe tener al menos 3 caracteres'),
        password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
        name: z.string().min(1, 'El nombre es requerido'),
        email: z.string().email('Email inválido').optional(),
        role: z.enum(['user', 'admin']).default('user'),
        sendWelcomeEmail: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
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
          loginMethod: 'local',
        });

        const userId = (newUser as any).insertId as number;

        // Send welcome email if requested and email is provided
        let emailSent = false;
        if (input.sendWelcomeEmail && input.email) {
          // Determine app URL from the request context
          const req = (ctx as any).req;
          const protocol = req?.protocol ?? 'https';
          const host = req?.get?.('host') ?? req?.headers?.host ?? 'ventasdash-ftg2qpku.manus.space';
          const appUrl = `${protocol}://${host}`;

          emailSent = await sendWelcomeEmail({
            name: input.name,
            email: input.email,
            username: input.username,
            password: input.password, // plain-text before hashing
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
   * Solo accesible para administradores
   */
  updateUser: adminProcedure
    .input(
      z.object({
        id: z.number(),
        username: z.string().min(3).optional(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        role: z.enum(['user', 'admin']).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
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
   * Solo accesible para administradores
   */
  updatePassword: adminProcedure
    .input(
      z.object({
        id: z.number(),
        newPassword: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
      })
    )
    .mutation(async ({ input }) => {
      try {
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

        // Hash de la nueva contraseña
        const hashedPassword = await bcrypt.hash(input.newPassword, 10);

        // Actualizar contraseña
        await db
          .update(users)
          .set({ password: hashedPassword })
          .where(eq(users.id, input.id));

        return {
          success: true,
          message: 'Contraseña actualizada exitosamente',
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
   * Solo accesible para administradores
   */
  deleteUser: adminProcedure
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
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

        // Prevenir que un admin se elimine a sí mismo
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
