import { z } from 'zod';
import { router, protectedProcedure } from './_core/trpc';
import { TRPCError } from '@trpc/server';
import { getDb } from './db';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { sendPasswordResetEmail, sendActivationEmail } from './email';
import { pool } from './postgres';
import { createActivationToken } from './activationRouter';

// --- Tipos de rol ---
export type UserRole =
  | 'system_specialist'
  | 'operations_specialist'
  | 'cst_user'
  | 'commercial_specialist'
  | 'store_user'
  | 'supplier_user'
  | 'own_brand_user';

/**
 * Etiquetas legibles para los roles
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  system_specialist: 'Especialista de Sistemas',
  operations_specialist: 'Especialista de Operaciones',
  cst_user: 'Usuario CST',
  commercial_specialist: 'Especialista Comercial',
  store_user: 'Usuario Tienda',
  supplier_user: 'Usuario Proveedor',
  own_brand_user: 'Usuario Marca Propia',
};

/**
 * Roles que pueden gestionar usuarios (acceder a /admin/users)
 */
const MANAGER_ROLES: UserRole[] = ['system_specialist', 'operations_specialist', 'cst_user', 'commercial_specialist'];

// ─── Procedimientos con restricción de rol ────────────────────────────────────

/**
 * Solo roles con capacidad de gestionar usuarios pueden acceder.
 * Excluye store_user y supplier_user.
 */
const canManageUsersProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.user.role as UserRole;
  if (!MANAGER_ROLES.includes(role)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'No tienes permisos para gestionar usuarios',
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
   * Listar usuarios según el rol del solicitante:
   * - system_specialist: ve todos
   * - cst_user: solo ve store_user
   * - commercial_specialist: solo ve supplier_user
   */
  listUsers: canManageUsersProcedure.query(async ({ ctx }) => {
    try {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
      }

      const allUsers = await db.select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        role: users.role,
        assignedStoreCode: users.assignedStoreCode,
        assignedSupplierId: users.assignedSupplierId,
        loginMethod: users.loginMethod,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        lastSignedIn: users.lastSignedIn,
      }).from(users);

      const currentRole = ctx.user.role as UserRole;
      let filteredUsers = allUsers;
      if (currentRole === 'operations_specialist') {
        // Especialista de Operaciones: solo ve usuarios de tienda
        filteredUsers = allUsers.filter(u => u.role === 'store_user');
      } else if (currentRole === 'cst_user') {
        filteredUsers = allUsers.filter(u => u.role === 'store_user');
      } else if (currentRole === 'commercial_specialist') {
        filteredUsers = allUsers.filter(u => u.role === 'supplier_user');
      }

      // Enriquecer con nombre de proveedor para supplier_user.
      // Recopilamos los IDs únicos de proveedores asignados y hacemos una sola
      // consulta a PostgreSQL para evitar N+1 queries.
      const supplierIds = Array.from(
        new Set(
          filteredUsers
            .filter(u => u.role === 'supplier_user' && u.assignedSupplierId)
            .map(u => u.assignedSupplierId as string)
        )
      );

      let supplierMap: Record<string, { ruc: string; name: string }> = {};
      if (supplierIds.length > 0) {
        try {
          const placeholders = supplierIds.map((_, i) => `$${i + 1}`).join(', ');
          const result = await pool.query(
            `SELECT id::text, ruc, name FROM public.suppliers WHERE id::text IN (${placeholders})`,
            supplierIds
          );
          for (const row of result.rows) {
            supplierMap[String(row.id)] = { ruc: row.ruc, name: row.name };
          }
        } catch (pgErr) {
          // No bloquear el listado si falla el enriquecimiento
          console.warn('[User Management] Could not enrich supplier names:', pgErr);
        }
      }

      const enrichedUsers = filteredUsers.map(u => ({
        ...u,
        supplierName: u.assignedSupplierId && supplierMap[u.assignedSupplierId]
          ? `${supplierMap[u.assignedSupplierId].ruc} — ${supplierMap[u.assignedSupplierId].name}`
          : null,
      }));

      return { success: true, users: enrichedUsers };
    } catch (error) {
      console.error('[User Management] Error listing users:', error);
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al listar usuarios' });
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
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al obtener tiendas' });
    }
  }),

  /**
   * Obtener la lista de proveedores desde PostgreSQL para el selector de proveedor.
   * Busca por RUC, muestra RUC + nombre, guarda el id.
   */
  getSuppliers: canManageUsersProcedure
    .input(z.object({ search: z.string().optional() }))
    .query(async ({ input }) => {
      try {
        const search = input.search?.trim() ?? '';
        let query: string;
        let params: any[];

        if (search) {
          query = `
            SELECT id, ruc, name
            FROM public.suppliers
            WHERE ruc ILIKE $1
            ORDER BY ruc ASC
            LIMIT 50
          `;
          params = [`%${search}%`];
        } else {
          query = `
            SELECT id, ruc, name
            FROM public.suppliers
            ORDER BY ruc ASC
            LIMIT 100
          `;
          params = [];
        }

        const result = await pool.query(query, params);
        return {
          success: true,
          suppliers: result.rows.map((r: any) => ({
            id: String(r.id),
            ruc: r.ruc as string,
            name: r.name as string,
          })),
        };
      } catch (error) {
        console.error('[User Management] Error fetching suppliers:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al obtener proveedores' });
      }
    }),

  /**
   * Crear nuevo usuario.
   * Reglas:
   * - system_specialist: puede crear cualquier tipo
   * - cst_user: solo puede crear store_user
   * - commercial_specialist: solo puede crear supplier_user
   * - store_user / supplier_user: no pueden crear usuarios
   */
  createUser: canManageUsersProcedure
    .input(
      z.object({
        password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
        name: z.string().min(1, 'El nombre es requerido'),
        email: z.string().email('Email inválido'),
        username: z.string().optional(), // Mantenido por compatibilidad, ya no requerido
        role: z.enum(['system_specialist', 'operations_specialist', 'cst_user', 'commercial_specialist', 'store_user', 'supplier_user', 'own_brand_user']).default('store_user'),
        assignedStoreCode: z.string().optional(),
        assignedSupplierId: z.string().optional(),
        sendWelcomeEmail: z.boolean().default(true),
        initialSupplierStatus: z.enum(["pending_activation", "subscribed_active"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const currentRole = ctx.user.role as UserRole;

        // Validar permisos de creación por rol
        if (currentRole === 'operations_specialist' && input.role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes crear usuarios de tipo Usuario Tienda',
          });
        }
        if (currentRole === 'cst_user' && input.role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes crear usuarios de tipo Usuario Tienda',
          });
        }
        if (currentRole === 'commercial_specialist' && input.role !== 'supplier_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes crear usuarios de tipo Usuario Proveedor',
          });
        }

        // Validaciones de campos obligatorios según rol
        if (input.role === 'store_user' && !input.assignedStoreCode) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'El Usuario Tienda requiere una tienda asignada',
          });
        }
        if (input.role === 'supplier_user' && !input.assignedSupplierId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'El Usuario Proveedor requiere un proveedor asignado',
          });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
        }

        // Verificar si el email ya existe
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        if (existingUser.length > 0) {
          throw new TRPCError({ code: 'CONFLICT', message: 'El correo electrónico ya está registrado' });
        }

        // Hash de la contraseña
        const hashedPassword = await bcrypt.hash(input.password, 10);

        // Para supplier_user: determinar estado inicial
        const supplierInitialStatus =
          input.role === 'supplier_user'
            ? (input.initialSupplierStatus ?? 'pending_activation')
            : undefined;

        // Para subscribed_active: registrar subscriptionStartDate inmediatamente
        const subscriptionStart =
          supplierInitialStatus === 'subscribed_active' ? new Date() : undefined;

        // Crear usuario
        const insertValues: Parameters<typeof db.insert>[0] extends any ? any : never = {
          password: hashedPassword,
          name: input.name,
          email: input.email,
          role: input.role,
          assignedStoreCode: input.role === 'store_user' ? (input.assignedStoreCode || null) : null,
          assignedSupplierId: input.role === 'supplier_user' ? (input.assignedSupplierId || null) : null,
          loginMethod: 'local' as const,
          supplierStatus: supplierInitialStatus ?? null,
          subscriptionStartDate: subscriptionStart ?? null,
        };
        const [newUser] = await db.insert(users).values(insertValues);

        const userId = (newUser as any).insertId as number;

        // Enviar email de activación si se solicita
        let emailSent = false;
        if (input.sendWelcomeEmail) {
          const activationToken = await createActivationToken(userId, input.email);
          const appUrl = 'https://dashboard.florayfauna.pe';
          const activationUrl = `${appUrl}/activate/${activationToken}`;
          emailSent = await sendActivationEmail({
            name: input.name,
            email: input.email,
            username: input.email,
            activationUrl,
            role: input.role,
          });
        }

        return { success: true, message: 'Usuario creado exitosamente', userId, emailSent };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[User Management] Error creating user:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al crear usuario' });
      }
    }),

  /**
   * Actualizar información de usuario.
   * - system_specialist puede actualizar cualquier usuario
   * - cst_user solo puede actualizar store_user
   * - commercial_specialist solo puede actualizar supplier_user
   */
  updateUser: canManageUsersProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        username: z.string().optional(), // Mantenido por compatibilidad
        role: z.enum(['system_specialist', 'operations_specialist', 'cst_user', 'commercial_specialist', 'store_user', 'supplier_user', 'own_brand_user']).optional(),
        assignedStoreCode: z.string().nullable().optional(),
        assignedSupplierId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const currentRole = ctx.user.role as UserRole;
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
        }

        const { id, ...updateData } = input;

        const existingUser = await db.select().from(users).where(eq(users.id, id)).limit(1);
        if (existingUser.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
        }

        // Validar permisos de edición por rol
        if (currentRole === 'operations_specialist' && existingUser[0].role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes editar usuarios de tipo Usuario Tienda',
          });
        }
        if (currentRole === 'cst_user' && existingUser[0].role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes editar usuarios de tipo Usuario Tienda',
          });
        }
        if (currentRole === 'commercial_specialist' && existingUser[0].role !== 'supplier_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes editar usuarios de tipo Usuario Proveedor',
          });
        }

        // Verificar duplicado de email
        if (updateData.email) {
          const duplicateUser = await db
            .select()
            .from(users)
            .where(eq(users.email, updateData.email))
            .limit(1);
          if (duplicateUser.length > 0 && duplicateUser[0].id !== id) {
            throw new TRPCError({ code: 'CONFLICT', message: 'El correo electrónico ya está registrado' });
          }
        }

        // Validar campos obligatorios según nuevo rol
        const newRole = updateData.role ?? existingUser[0].role;
        const newStoreCode = updateData.assignedStoreCode !== undefined
          ? updateData.assignedStoreCode
          : existingUser[0].assignedStoreCode;
        const newSupplierId = updateData.assignedSupplierId !== undefined
          ? updateData.assignedSupplierId
          : existingUser[0].assignedSupplierId;

        if (newRole === 'store_user' && !newStoreCode) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'El Usuario Tienda requiere una tienda asignada' });
        }
        if (newRole === 'supplier_user' && !newSupplierId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'El Usuario Proveedor requiere un proveedor asignado' });
        }

        await db.update(users).set(updateData).where(eq(users.id, id));

        return { success: true, message: 'Usuario actualizado exitosamente' };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[User Management] Error updating user:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al actualizar usuario' });
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
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
        }

        const existingUser = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
        if (existingUser.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
        }

        // Validar permisos por rol
        if (currentRole === 'operations_specialist' && existingUser[0].role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes cambiar la contraseña de usuarios de tipo Usuario Tienda',
          });
        }
        if (currentRole === 'cst_user' && existingUser[0].role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes cambiar la contraseña de usuarios de tipo Usuario Tienda',
          });
        }
        if (currentRole === 'commercial_specialist' && existingUser[0].role !== 'supplier_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes cambiar la contraseña de usuarios de tipo Usuario Proveedor',
          });
        }

        const hashedPassword = await bcrypt.hash(input.newPassword, 10);
        await db.update(users).set({ password: hashedPassword }).where(eq(users.id, input.id));

        let emailSent = false;
        if (input.notifyUser && existingUser[0].email) {
          const appUrl = 'https://dashboard.florayfauna.pe';
          emailSent = await sendPasswordResetEmail({
            name: existingUser[0].name ?? existingUser[0].email ?? 'Usuario',
            email: existingUser[0].email,
            username: existingUser[0].email ?? '',
            newPassword: input.newPassword,
            appUrl,
            changedByAdmin: true,
          });
        }

        return { success: true, message: 'Contraseña actualizada exitosamente', emailSent };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[User Management] Error updating password:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al actualizar contraseña' });
      }
    }),

  /**
   * Eliminar usuario.
   * - system_specialist puede eliminar cualquier usuario
   * - cst_user solo puede eliminar store_user
   * - commercial_specialist solo puede eliminar supplier_user
   */
  /**
   * Reenvía el correo de activación generando un nuevo token.
   * Respeta la misma matriz de permisos que createUser:
   * - system_specialist: puede reenviar a cualquier usuario
   * - cst_user: solo puede reenviar a store_user
   * - commercial_specialist: solo puede reenviar a supplier_user
   */
  resendActivationEmail: canManageUsersProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const currentRole = ctx.user.role as UserRole;
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
        }

        const existingUser = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
        if (existingUser.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
        }

        const targetUser = existingUser[0];

        // Validar permisos según rol del solicitante
        if (currentRole === 'operations_specialist' && targetUser.role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes reenviar activación a usuarios de tipo Usuario Tienda',
          });
        }
        if (currentRole === 'cst_user' && targetUser.role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes reenviar activación a usuarios de tipo Usuario Tienda',
          });
        }
        if (currentRole === 'commercial_specialist' && targetUser.role !== 'supplier_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes reenviar activación a usuarios de tipo Usuario Proveedor',
          });
        }

        if (!targetUser.email) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'El usuario no tiene correo electrónico registrado',
          });
        }

        // Generar nuevo token y enviar correo
        const appUrl = 'https://dashboard.florayfauna.pe';        const activationToken = await createActivationToken(targetUser.id, targetUser.email ?? '');
        const activationUrl = `${appUrl}/activate/${activationToken}`;

        const emailSent = await sendActivationEmail({
  
          name: targetUser.name ?? targetUser.email ?? 'Usuario',
          email: targetUser.email,
          username: targetUser.email ?? '',
          activationUrl,
          role: targetUser.role ?? 'store_user',
        });

        if (!emailSent) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'No se pudo enviar el correo. Verifica la configuración de Brevo.',
          });
        }

        return { success: true, message: 'Correo de activación reenviado exitosamente' };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[User Management] Error resending activation email:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al reenviar correo de activación' });
      }
    }),

  deleteUser: canManageUsersProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const currentRole = ctx.user.role as UserRole;
        const db = await getDb();
        if (!db) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Base de datos no disponible' });
        }

        const existingUser = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
        if (existingUser.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Usuario no encontrado' });
        }

        if (currentRole === 'operations_specialist' && existingUser[0].role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes eliminar usuarios de tipo Usuario Tienda',
          });
        }
        if (currentRole === 'cst_user' && existingUser[0].role !== 'store_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes eliminar usuarios de tipo Usuario Tienda',
          });
        }
        if (currentRole === 'commercial_specialist' && existingUser[0].role !== 'supplier_user') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Solo puedes eliminar usuarios de tipo Usuario Proveedor',
          });
        }

        if (existingUser[0].id === ctx.user.id) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'No puedes eliminar tu propia cuenta' });
        }

        await db.delete(users).where(eq(users.id, input.id));

        return { success: true, message: 'Usuario eliminado exitosamente' };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[User Management] Error deleting user:', error);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Error al eliminar usuario' });
      }
    }),
});
