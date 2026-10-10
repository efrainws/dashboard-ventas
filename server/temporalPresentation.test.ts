import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (relativePath: string) => readFileSync(resolve(root, relativePath), "utf8");

describe("presentación de tooltips y controles comparativos", () => {
  it("usa superficies semánticas para los tooltips Radix y Recharts", () => {
    const radixTooltip = read("client/src/components/ui/tooltip.tsx");
    const styles = read("client/src/index.css");

    expect(radixTooltip).toContain("bg-popover text-popover-foreground");
    expect(radixTooltip).toContain("fill-popover");
    expect(styles).toContain(".recharts-default-tooltip");
    expect(styles).toContain("background: var(--surface-card) !important");
  });

  it("mantiene dos selectores de fecha y un fin comparativo sugerido", () => {
    const controls = read("client/src/components/ComparisonPeriodControls.tsx");
    const shelfControls = read("client/src/pages/ShelfPeriodControls.tsx");

    expect(controls).toContain('updateComparisonDate("start", date)');
    expect(controls).toContain('updateComparisonDate("end", date)');
    expect(controls).toContain("suggestedExactDaysComparisonEnd");
    expect(controls).toContain('role="status"');
    expect(shelfControls).toContain("<DatePicker");
    expect(shelfControls).not.toContain('mode="range"');
  });

  it("formatea los inputs mensuales con la variante corporativa", () => {
    const controls = read("client/src/components/ComparisonPeriodControls.tsx");
    const styles = read("client/src/index.css");

    expect(controls).toContain('className="ff-month-input"');
    expect(styles).toContain(".ff-month-input");
    expect(styles).toContain("color-scheme: dark");
  });
});
