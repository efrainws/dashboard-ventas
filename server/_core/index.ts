import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { runTrialAlertJob } from "../trialAlertJob";
import { initPool } from "../postgres";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Trust the first proxy (reverse proxy / load balancer) so that
  // req.protocol and x-forwarded-proto are read correctly in production.
  // This is required for the session cookie's `secure` flag to be set
  // correctly when the app runs behind HTTPS termination.
  app.set("trust proxy", 1);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Callback exclusivo de la tarea diaria de aviso de vencimiento de trial.
  // El UID de cron autenticado se valida contra la configuración persistida.
  app.post("/api/scheduled/supplier-trial-expiry-alert", async (req, res) => {
    try {
      const cronUser = await sdk.authenticateRequest(req);
      if (!cronUser.isCron || !cronUser.taskUid) {
        return res.status(403).json({ error: "cron-only" });
      }
      const result = await runTrialAlertJob(cronUser.taskUid);
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[TrialAlertJob] Scheduled callback failed:", error instanceof Error ? error.message : "unknown_error");
      return res.status(500).json({
        error: "supplier-trial-expiry-alert-failed",
        timestamp: new Date().toISOString(),
      });
    }
  });
  // ── Error handler global: garantiza que /api/* siempre devuelva JSON ──────
  // Esto evita que Express devuelva HTML cuando un middleware lanza una excepción
  // no capturada (p.ej. durante el warm-up del pool de PostgreSQL al reiniciar).
  // Express requiere 4 argumentos para reconocer un error handler.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use('/api', (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Express] Unhandled API error:', err?.message ?? err);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err?.message ?? 'Internal server error', code: -32603 } });
    }
  });

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Inicializar pool de PostgreSQL con warm-up y keep-alive del caché
    initPool().catch(console.error);
  });
}

startServer().catch(console.error);
