import { describe, expect, it } from "vitest";
import {
  buildDomainChangeNoticeHtml,
  buildDomainChangeNoticeText,
  createDomainChangeIdempotencyKey,
  DOMAIN_CHANGE_NOTICE_SENDER,
  resolvePublishedDashboardUrl,
} from "./domainChangeAnnouncement";

function requestFrom(headers: Record<string, string | undefined>, protocol = "https") {
  return {
    protocol,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

describe("domainChangeAnnouncement", () => {
  it("resuelve únicamente la URL HTTPS del dominio publicado recibido por el proxy", () => {
    const url = resolvePublishedDashboardUrl(
      requestFrom({ "x-forwarded-host": "portalventas.florayfauna.pe", "x-forwarded-proto": "https" })
    );

    expect(url).toBe("https://portalventas.florayfauna.pe");
  });

  it("bloquea hosts de desarrollo para impedir que lleguen al correo", () => {
    expect(() =>
      resolvePublishedDashboardUrl(
        requestFrom({ host: "3000-example.manus.computer", "x-forwarded-proto": "https" })
      )
    ).toThrow("dominio público HTTPS publicado");
  });

  it("construye un correo con la URL oficial y una clave idempotente estable", () => {
    const publicUrl = "https://portalventas.florayfauna.pe";
    const html = buildDomainChangeNoticeHtml({ recipientName: "Ana", publicUrl });
    const text = buildDomainChangeNoticeText({ recipientName: "Ana", publicUrl });

    expect(DOMAIN_CHANGE_NOTICE_SENDER.email).toBe("notificaciones@florayfauna.pe");
    expect(html).toContain(publicUrl);
    expect(text).toContain(publicUrl);
    expect(createDomainChangeIdempotencyKey(publicUrl)).toBe(createDomainChangeIdempotencyKey(publicUrl));
    expect(createDomainChangeIdempotencyKey(publicUrl)).not.toBe(
      createDomainChangeIdempotencyKey("https://otro-dominio.example")
    );
  });
});
