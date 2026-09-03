import { describe, expect, it } from "vitest";
import { inclusiveCalendarDays } from "../shared/analytics";

describe("promedio diario por período calendario", () => {
  it("divide S/ 393,855 entre los dos días del intervalo inclusivo", () => {
    const days = inclusiveCalendarDays("2026-07-20", "2026-07-21");
    expect(393_855 / days).toBe(196_927.5);
  });

  it("mantiene el total cuando el intervalo contiene un solo día", () => {
    const days = inclusiveCalendarDays("2026-07-20", "2026-07-20");
    expect(198_479 / days).toBe(198_479);
  });
});
