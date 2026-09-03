import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/UserManagement.tsx"), "utf8");

describe("Aviso de cambio de dominio en Usuarios", () => {
  it("solo expone la acción al especialista de sistemas y exige previsualización", () => {
    expect(source).toContain("currentRole === 'system_specialist'");
    expect(source).toContain("previewDomainChangeNotice.useQuery");
    expect(source).toContain("Previsualizar aviso de cambio de dominio");
    expect(source).toContain("testDomainNoticeMutation.mutate()");
    expect(source).toContain("Enviar prueba");
    expect(source).toContain('sandbox=""');
    expect(source).toContain('srcDoc={domainNoticePreview.data.htmlContent}');
    expect(source).toContain("domainNoticeViewport");
    expect(source).toContain("domainNoticeCampaignId");
    expect(source).toContain("ff-dialog-viewport");
    expect(source).toContain("ff-dialog-scroll-body");
    expect(source).toContain("ff-dialog-fixed-footer");
    expect(source).toContain("Continuar a confirmación");
  });

  it("solicita confirmación explícita antes de invocar el envío", () => {
    expect(source).toContain("¿Enviar aviso a todos los usuarios con correo válido?");
    expect(source).toContain("domainNoticeTested");
    expect(source).toContain("sendDomainNoticeMutation.mutate({ campaignId: domainNoticeCampaignId })");
    expect(source).toContain("Puedes crear otra campaña para el mismo dominio");
    expect(source).not.toContain("una sola vez para este dominio");
    expect(source).not.toContain("no se podrá repetir para el mismo dominio");
  });
});
