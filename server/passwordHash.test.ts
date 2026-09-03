import { describe, expect, it } from "vitest";
import { hashPassword, isLegacyBcryptHash, verifyPassword } from "./passwordHash";

describe("Hash de contraseñas", () => {
  it("crea hashes Argon2id y valida la contraseña correcta", async () => {
    const passwordHash = await hashPassword("ClaveRobusta123");
    expect(passwordHash.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword("ClaveRobusta123", passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("ClaveIncorrecta123", passwordHash)).resolves.toBe(false);
  });

  it("reconoce bcrypt heredado para migrarlo en el próximo cambio", () => {
    expect(isLegacyBcryptHash("$2b$10$abcdefghijklmnopqrstuuC2x9Tznx3u")).toBe(true);
    expect(isLegacyBcryptHash("$argon2id$v=19$m=65536,t=3,p=1$abc$def")).toBe(false);
  });
});
