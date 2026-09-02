import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (relativePath: string) =>
  readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("ChannelBreakdown y tokens visuales", () => {
  it("usa clases semánticas para sus superficies y canales", () => {
    const component = projectFile("client/src/components/ChannelBreakdown.tsx");

    expect(component).toContain("ff-channel-card");
    expect(component).toContain("ff-channel-chip");
    expect(component).toContain("ff-channel-projection");
    expect(component).toContain("ff-channel-meter-fill");
    expect(component).not.toContain('background: "var(--ff-card-header-bg)"');
  });

  it("define los tonos de canal desde la hoja global de tokens", () => {
    const styles = projectFile("client/src/index.css");

    expect(styles).toContain(".ff-channel-presencial");
    expect(styles).toContain(".ff-channel-ecommerce");
    expect(styles).toContain(".ff-channel-rappi");
    expect(styles).toContain("--channel-color: var(--ff-canal-presencial)");
  });
});
