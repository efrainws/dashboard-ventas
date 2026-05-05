import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getUserByEmail, updateUserLastSignIn } from "./db";
import bcrypt from "bcrypt";
import { z } from "zod";
import { SignJWT } from "jose";
import { ENV } from "./_core/env";
import { salesRouter } from "./salesRouter";
import { userRouter } from "./userRouter";
import { targetsRouter } from "./targetsRouter";
import { ticketsRouter } from "./ticketsRouter";
import { activationRouter } from "./activationRouter";
import { supplierPortalRouter } from "./supplierPortalRouter";
import { supplierTrialRouter } from "./supplierTrialRouter";
import { ownBrandRouter } from "./ownBrandRouter";
import { ownBrandCategoriesRouter } from "./ownBrandCategoriesRouter";
import { dbConnectionsRouter } from "./dbConnectionsRouter";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  sales: salesRouter,
  users: userRouter,
  targets: targetsRouter,
  tickets: ticketsRouter,
  activation: activationRouter,
  supplierPortal: supplierPortalRouter,
  supplierTrial: supplierTrialRouter,
  ownBrand: ownBrandRouter,
  ownBrandCategories: ownBrandCategoriesRouter,
  dbConnections: dbConnectionsRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      const user = opts.ctx.user;
      if (!user) return null;
      // No devolver el password en la respuesta
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    }),
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email("Email inválido"),
          password: z.string().min(1, "Contraseña requerida"),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { email, password } = input;

        // Buscar usuario por email
        const user = await getUserByEmail(email);

        if (!user || !user.password) {
          throw new Error("Credenciales inválidas");
        }

        // Verificar contraseña
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
          throw new Error("Credenciales inválidas");
        }

        // Actualizar última fecha de inicio de sesión
        await updateUserLastSignIn(user.id);

        // Crear JWT token
        const secret = new TextEncoder().encode(ENV.cookieSecret);
        const token = await new SignJWT({
          userId: user.id,
          email: user.email,
          role: user.role,
        })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt()
          .setExpirationTime("7d")
          .sign(secret);

        // Establecer cookie de sesión
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, {
          ...cookieOptions,
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
        });

        // No devolver el password en la respuesta
        const { password: _, ...userWithoutPassword } = user;
        
        return {
          success: true,
          user: userWithoutPassword,
        };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
