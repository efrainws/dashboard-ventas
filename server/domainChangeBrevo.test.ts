import { afterEach, describe, expect, it, vi } from "vitest";
import { sendDomainChangeEmail } from "./email";

describe("Aviso de dominio mediante Brevo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envía el payload al endpoint REST transaccional de Brevo y conserva su messageId", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messageId: "<brevo-domain-change-123>" }), { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendDomainChangeEmail({
      recipientName: "María López",
      recipientEmail: "maria.lopez@example.com",
      publicUrl: "https://portalventas.florayfauna.pe",
      isTest: true,
    });

    expect(result).toEqual({ ok: true, messageId: "<brevo-domain-change-123>" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "api-key": expect.any(String),
          "content-type": "application/json",
        }),
      })
    );

    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(requestBody).toMatchObject({
      sender: { email: "notificaciones@florayfauna.pe" },
      to: [{ email: "maria.lopez@example.com", name: "María López" }],
      tags: ["domain-change-notice", "test"],
    });
  });

  it("no marca la entrega como exitosa si Brevo devuelve un error HTTP", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })));

    const result = await sendDomainChangeEmail({
      recipientName: null,
      recipientEmail: "usuario@example.com",
      publicUrl: "https://portalventas.florayfauna.pe",
    });

    expect(result).toEqual({ ok: false, errorCode: "SEND_FAILED" });
  });
});
