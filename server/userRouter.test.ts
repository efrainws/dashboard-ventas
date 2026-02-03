import { describe, it, expect, beforeAll } from 'vitest';
import { appRouter } from './routers';
import { getDb } from './db';
import { users } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

/**
 * Tests para userRouter
 * Verifica la funcionalidad de administración de usuarios
 */

describe('User Management Router', () => {
  let adminContext: any;
  let userContext: any;
  let testUserId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) {
      throw new Error('Database not available for testing');
    }

    // Crear usuario admin de prueba
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const [adminResult] = await db.insert(users).values({
      username: 'test_admin',
      password: hashedPassword,
      name: 'Test Admin',
      email: 'admin@test.com',
      role: 'admin',
      loginMethod: 'local',
    });

    const adminId = adminResult.insertId;
    const [adminUser] = await db.select().from(users).where(eq(users.id, adminId)).limit(1);

    // Crear usuario regular de prueba
    const [userResult] = await db.insert(users).values({
      username: 'test_user',
      password: hashedPassword,
      name: 'Test User',
      email: 'user@test.com',
      role: 'user',
      loginMethod: 'local',
    });

    const userId = userResult.insertId;
    const [regularUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    // Crear contextos de prueba
    adminContext = {
      user: adminUser,
    };

    userContext = {
      user: regularUser,
    };
  });

  describe('listUsers', () => {
    it('should allow admin to list all users', async () => {
      const caller = appRouter.createCaller(adminContext);
      const result = await caller.users.listUsers();

      expect(result.success).toBe(true);
      expect(result.users).toBeDefined();
      expect(Array.isArray(result.users)).toBe(true);
      expect(result.users.length).toBeGreaterThan(0);
    });

    it('should deny non-admin users from listing users', async () => {
      const caller = appRouter.createCaller(userContext);
      
      await expect(caller.users.listUsers()).rejects.toThrow('Solo los administradores pueden realizar esta acción');
    });
  });

  describe('createUser', () => {
    it('should allow admin to create a new user', async () => {
      const caller = appRouter.createCaller(adminContext);
      const result = await caller.users.createUser({
        username: 'new_test_user',
        password: 'password123',
        name: 'New Test User',
        email: 'newuser@test.com',
        role: 'user',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Usuario creado exitosamente');
      expect(result.userId).toBeDefined();

      testUserId = result.userId;
    });

    it('should reject duplicate usernames', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      await expect(
        caller.users.createUser({
          username: 'test_admin', // Ya existe
          password: 'password123',
          name: 'Duplicate User',
          role: 'user',
        })
      ).rejects.toThrow('El nombre de usuario ya existe');
    });

    it('should deny non-admin users from creating users', async () => {
      const caller = appRouter.createCaller(userContext);
      
      await expect(
        caller.users.createUser({
          username: 'another_user',
          password: 'password123',
          name: 'Another User',
          role: 'user',
        })
      ).rejects.toThrow('Solo los administradores pueden realizar esta acción');
    });
  });

  describe('updateUser', () => {
    it('should allow admin to update user information', async () => {
      const caller = appRouter.createCaller(adminContext);
      const result = await caller.users.updateUser({
        id: testUserId,
        name: 'Updated Test User',
        email: 'updated@test.com',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Usuario actualizado exitosamente');
    });

    it('should reject updates to non-existent users', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      await expect(
        caller.users.updateUser({
          id: 999999, // ID que no existe
          name: 'Non-existent User',
        })
      ).rejects.toThrow('Usuario no encontrado');
    });
  });

  describe('updatePassword', () => {
    it('should allow admin to update user password', async () => {
      const caller = appRouter.createCaller(adminContext);
      const result = await caller.users.updatePassword({
        id: testUserId,
        newPassword: 'newpassword123',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Contraseña actualizada exitosamente');
    });

    it('should reject password updates for non-existent users', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      await expect(
        caller.users.updatePassword({
          id: 999999,
          newPassword: 'newpassword123',
        })
      ).rejects.toThrow('Usuario no encontrado');
    });
  });

  describe('deleteUser', () => {
    it('should prevent admin from deleting themselves', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      await expect(
        caller.users.deleteUser({
          id: adminContext.user.id,
        })
      ).rejects.toThrow('No puedes eliminar tu propia cuenta');
    });

    it('should allow admin to delete other users', async () => {
      const caller = appRouter.createCaller(adminContext);
      const result = await caller.users.deleteUser({
        id: testUserId,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Usuario eliminado exitosamente');
    });

    it('should reject deletion of non-existent users', async () => {
      const caller = appRouter.createCaller(adminContext);
      
      await expect(
        caller.users.deleteUser({
          id: 999999,
        })
      ).rejects.toThrow('Usuario no encontrado');
    });

    it('should deny non-admin users from deleting users', async () => {
      const caller = appRouter.createCaller(userContext);
      
      await expect(
        caller.users.deleteUser({
          id: testUserId,
        })
      ).rejects.toThrow('Solo los administradores pueden realizar esta acción');
    });
  });
});
