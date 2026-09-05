import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from './routers';
import { getDb } from './db';
import { activationTokens, users } from '../drizzle/schema';
import { eq, or } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { vi } from 'vitest';
import { sendActivationEmail } from './email';
import { createActivationToken } from './activationRouter';

vi.mock('./email', () => ({
  sendActivationEmail: vi.fn().mockResolvedValue(true),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
  sendDomainChangeEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

/**
 * Tests de integración para userRouter.
 * Verifica la gestión de usuarios con los nuevos roles:
 * - system_specialist (antes admin): puede crear cualquier tipo de usuario
 * - cst_user (antes user): solo puede crear store_user
 * - store_user: no puede crear usuarios
 */

describe('User Management Router', () => {
  let specialistContext: any;
  let cstContext: any;
  let storeContext: any;
  let testUserId: number;

  const publishedRequest = {
    get(header: string) {
      if (header === 'x-forwarded-host') return 'portalventas.florayfauna.pe';
      if (header === 'x-forwarded-proto') return 'https';
      return undefined;
    },
    protocol: 'https',
  };

  beforeAll(async () => {
    const db = await getDb();
    if (!db) {
      throw new Error('Database not available for testing');
    }

    // Limpiar usuarios de prueba previos
    await db.delete(users).where(
      or(
        eq(users.username, 'test_specialist'),
        eq(users.username, 'test_cst'),
        eq(users.username, 'test_store'),
        eq(users.username, 'new_test_user'),
        eq(users.email, 'newuser@test.com'),
      )
    );

    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Crear system_specialist de prueba
    const [specResult] = await db.insert(users).values({
      username: 'test_specialist',
      password: hashedPassword,
      name: 'Test Specialist',
      email: 'specialist@test.com',
      role: 'system_specialist',
      loginMethod: 'local',
    });
    const [specialistUser] = await db.select().from(users).where(eq(users.id, specResult.insertId)).limit(1);

    // Crear cst_user de prueba
    const [cstResult] = await db.insert(users).values({
      username: 'test_cst',
      password: hashedPassword,
      name: 'Test CST',
      email: 'cst@test.com',
      role: 'cst_user',
      loginMethod: 'local',
    });
    const [cstUser] = await db.select().from(users).where(eq(users.id, cstResult.insertId)).limit(1);

    // Crear store_user de prueba
    const [storeResult] = await db.insert(users).values({
      username: 'test_store',
      password: hashedPassword,
      name: 'Test Store',
      email: 'store@test.com',
      role: 'store_user',
      assignedStoreCode: 'T001',
      loginMethod: 'local',
    });
    const [storeUser] = await db.select().from(users).where(eq(users.id, storeResult.insertId)).limit(1);

    specialistContext = { user: specialistUser, req: publishedRequest };
    cstContext = { user: cstUser, req: publishedRequest };
    storeContext = { user: storeUser, req: publishedRequest };
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;
    for (const userId of [specialistContext?.user?.id, cstContext?.user?.id, storeContext?.user?.id, testUserId]) {
      if (typeof userId === 'number') {
        await db.delete(activationTokens).where(eq(activationTokens.userId, userId));
      }
    }
    await db.delete(users).where(
      or(
        eq(users.username, 'test_specialist'),
        eq(users.username, 'test_cst'),
        eq(users.username, 'test_store'),
        eq(users.username, 'new_test_user'),
        eq(users.email, 'newuser@test.com'),
      )
    );
  });

  // ─── listUsers ──────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('system_specialist puede listar todos los usuarios', async () => {
      const caller = appRouter.createCaller(specialistContext);
      const result = await caller.users.listUsers();
      expect(result.success).toBe(true);
      expect(Array.isArray(result.users)).toBe(true);
      expect(result.users.length).toBeGreaterThan(0);
    });

    it('cst_user puede listar usuarios', async () => {
      const caller = appRouter.createCaller(cstContext);
      const result = await caller.users.listUsers();
      expect(result.success).toBe(true);
    });

    it('store_user no puede listar usuarios (FORBIDDEN)', async () => {
      const caller = appRouter.createCaller(storeContext);
      await expect(caller.users.listUsers()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── createUser ─────────────────────────────────────────────────────────────

  describe('createUser', () => {
    it('system_specialist puede crear un store_user', async () => {
      const caller = appRouter.createCaller(specialistContext);
      const result = await caller.users.createUser({
        username: 'new_test_user',
        password: 'password123',
        name: 'New Test User',
        email: 'newuser@test.com',
        role: 'store_user',
        assignedStoreCode: 'T099',
      });
      expect(result.success).toBe(true);
      expect(result.userId).toBeDefined();
      testUserId = result.userId;
    });

    it('cst_user puede crear un store_user', async () => {
      const db = await getDb();
      // Limpiar si existe
      await db?.delete(users).where(
        or(
          eq(users.username, 'cst_created_store'),
          eq(users.email, 'cst-created-store-domain-notice@test.com')
        )
      );
      const caller = appRouter.createCaller(cstContext);
      const result = await caller.users.createUser({
        username: 'cst_created_store',
        password: 'password123',
        name: 'CST Created Store',
        email: 'cst-created-store-domain-notice@test.com',
        role: 'store_user',
        assignedStoreCode: 'T010',
      });
      expect(result.success).toBe(true);
      // Limpiar
      await db?.delete(users).where(eq(users.username, 'cst_created_store'));
    });

    it('cst_user no puede crear system_specialist (FORBIDDEN)', async () => {
      const caller = appRouter.createCaller(cstContext);
      await expect(
        caller.users.createUser({
          username: 'forbidden_spec',
          password: 'password123',
          name: 'Forbidden Specialist',
          email: 'forbidden-specialist@test.com',
          role: 'system_specialist',
        })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('cst_user no puede crear cst_user (FORBIDDEN)', async () => {
      const caller = appRouter.createCaller(cstContext);
      await expect(
        caller.users.createUser({
          username: 'forbidden_cst',
          password: 'password123',
          name: 'Forbidden CST',
          email: 'forbidden-cst@test.com',
          role: 'cst_user',
        })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('store_user no puede crear usuarios (FORBIDDEN)', async () => {
      const caller = appRouter.createCaller(storeContext);
      await expect(
        caller.users.createUser({
          username: 'forbidden_user',
          password: 'password123',
          name: 'Forbidden User',
          email: 'forbidden-user@test.com',
          role: 'store_user',
        })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rechaza usernames duplicados', async () => {
      const caller = appRouter.createCaller(specialistContext);
      const unusedEmail = `duplicate-username-${Date.now()}@test.com`;
      await expect(
        caller.users.createUser({
          username: 'test_specialist',
          password: 'password123',
          name: 'Duplicate User',
          email: unusedEmail,
          role: 'cst_user',
        })
      ).rejects.toThrow('El nombre de usuario ya existe');
    });
  });

  describe('domain change notice', () => {
    it('rechaza la previsualización para roles que no son system_specialist', async () => {
      const caller = appRouter.createCaller(cstContext);
      await expect(caller.users.previewDomainChangeNotice()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── updateUser ─────────────────────────────────────────────────────────────

  describe('updateUser', () => {
    it('system_specialist puede actualizar información de usuario', async () => {
      const caller = appRouter.createCaller(specialistContext);
      const result = await caller.users.updateUser({
        id: testUserId,
        name: 'Updated Test User',
        email: 'updated@test.com',
      });
      expect(result.success).toBe(true);
    });

    it('rechaza actualización de usuario inexistente', async () => {
      const caller = appRouter.createCaller(specialistContext);
      await expect(
        caller.users.updateUser({ id: 999999, name: 'Non-existent' })
      ).rejects.toThrow('Usuario no encontrado');
    });
  });

  // ─── updatePassword ─────────────────────────────────────────────────────────

  describe('updatePassword', () => {
    it('system_specialist puede cambiar contraseña de otro usuario', async () => {
      const caller = appRouter.createCaller(specialistContext);
      const result = await caller.users.updatePassword({
        id: testUserId,
        newPassword: 'NewPassword123',
        confirmPassword: 'NewPassword123',
        notifyUser: false,
      });
      expect(result.success).toBe(true);
    });

    it('rechaza contraseñas sin confirmación coincidente', async () => {
      const caller = appRouter.createCaller(specialistContext);
      await expect(caller.users.updatePassword({
        id: testUserId,
        newPassword: 'NewPassword123',
        confirmPassword: 'OtraPassword123',
        notifyUser: false,
      })).rejects.toThrow('Las contraseñas no coinciden');
    });
  });

  // ─── resendActivationEmail ─────────────────────────────────────────────────

  describe('resendActivationEmail', () => {
    it('store_user no puede reenviar activación (FORBIDDEN)', async () => {
      const caller = appRouter.createCaller(storeContext);
      await expect(
        caller.users.resendActivationEmail({ id: cstContext.user.id })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('cst_user no puede reenviar activación a system_specialist (FORBIDDEN)', async () => {
      const caller = appRouter.createCaller(cstContext);
      await expect(
        caller.users.resendActivationEmail({ id: specialistContext.user.id })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('cst_user reenvía un enlace de reinicio por el dominio publicado y revoca los anteriores', async () => {
      const db = await getDb();
      const caller = appRouter.createCaller(cstContext);
      const previousToken = await createActivationToken(storeContext.user.id, 'store@test.com');
      const emailMock = vi.mocked(sendActivationEmail);
      emailMock.mockClear();
      emailMock.mockResolvedValueOnce(true);

      const result = await caller.users.resendActivationEmail({
        id: storeContext.user.id,
        resetPassword: true,
      });

      expect(result).toMatchObject({
        success: true,
        message: 'Enlace de reinicio de contraseña enviado exitosamente',
      });
      expect(emailMock).toHaveBeenLastCalledWith(expect.objectContaining({
        activationUrl: expect.stringMatching(/^https:\/\/portalventas\.florayfauna\.pe\/activate\//),
        requiresPasswordReset: true,
      }));

      const tokenRows = await db?.select().from(activationTokens).where(eq(activationTokens.userId, storeContext.user.id));
      const freshToken = tokenRows?.find((row) => row.token !== previousToken && row.used === 0);
      expect(freshToken?.requiresPasswordReset).toBe(1);
      expect(tokenRows?.find((row) => row.token === previousToken)?.used).toBe(1);
    });

    it('mantiene los enlaces anteriores si el correo no puede enviarse', async () => {
      const db = await getDb();
      const caller = appRouter.createCaller(cstContext);
      const previousToken = await createActivationToken(storeContext.user.id, 'store@test.com');
      const emailMock = vi.mocked(sendActivationEmail);
      emailMock.mockClear();
      emailMock.mockResolvedValueOnce(false);

      await expect(
        caller.users.resendActivationEmail({ id: storeContext.user.id, resetPassword: true })
      ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });

      const tokenRows = await db?.select().from(activationTokens).where(eq(activationTokens.userId, storeContext.user.id));
      expect(tokenRows?.find((row) => row.token === previousToken)?.used).toBe(0);
      expect(tokenRows?.some((row) => row.token !== previousToken && row.used === 1)).toBe(true);
    });

    it('rechaza usuario inexistente (NOT_FOUND)', async () => {
      const caller = appRouter.createCaller(specialistContext);
      await expect(
        caller.users.resendActivationEmail({ id: 999999 })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  // ─── deleteUser ─────────────────────────────────────────────────────────────

  describe('deleteUser', () => {
    it('no puede eliminar su propia cuenta', async () => {
      const caller = appRouter.createCaller(specialistContext);
      await expect(
        caller.users.deleteUser({ id: specialistContext.user.id })
      ).rejects.toThrow('No puedes eliminar tu propia cuenta');
    });

    it('store_user no puede eliminar usuarios (FORBIDDEN)', async () => {
      const caller = appRouter.createCaller(storeContext);
      await expect(
        caller.users.deleteUser({ id: testUserId })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('system_specialist puede eliminar otro usuario', async () => {
      const caller = appRouter.createCaller(specialistContext);
      const result = await caller.users.deleteUser({ id: testUserId });
      expect(result.success).toBe(true);
    });

    it('rechaza eliminación de usuario inexistente', async () => {
      const caller = appRouter.createCaller(specialistContext);
      await expect(
        caller.users.deleteUser({ id: 999999 })
      ).rejects.toThrow('Usuario no encontrado');
    });
  });
});
