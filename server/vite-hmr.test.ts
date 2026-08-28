import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createViteDevServerOptions } from "./_core/vite";

describe("configuración HMR de Vite", () => {
  it("usa WebSocket seguro en el puerto público del proxy", () => {
    const httpServer = createServer();
    const options = createViteDevServerOptions(httpServer);

    expect(options.middlewareMode).toBe(true);
    expect(options.hmr.server).toBe(httpServer);
    expect(options.hmr.protocol).toBe("wss");
    expect(options.hmr.clientPort).toBe(443);
    expect(options.allowedHosts).toBe(true);
  });
});
