import { describe, expect, it } from "vitest";
import {
  buildTrialAlertDeliveryKey,
  getTrialExpiryWarningWindow,
  TRIAL_EXPIRY_ALERT_CRON,
} from "./trialAlertJob";

describe("Aviso diario de vencimiento de trial", () => {
  it("se programa diariamente a las 09:00 de Lima en UTC", () => {
    expect(TRIAL_EXPIRY_ALERT_CRON).toBe("0 0 14 * * *");
  });

  it("selecciona exactamente el día calendario que vence en dos días", () => {
    const { start, end } = getTrialExpiryWarningWindow(new Date("2026-09-03T14:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-09-05T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-05T23:59:59.999Z");
  });

  it("genera una clave determinista por proveedor y vencimiento", () => {
    expect(buildTrialAlertDeliveryKey(42, new Date("2026-09-05T12:00:00.000Z")))
      .toBe("trial-expiry-warning:42:2026-09-05");
  });
});
