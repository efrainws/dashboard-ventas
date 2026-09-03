import { Algorithm, hash, verify } from "@node-rs/argon2";
import bcrypt from "bcrypt";
import { ENV } from "./_core/env";

const ARGON2ID_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

function getPepper(): Uint8Array {
  if (!ENV.passwordPepper) {
    throw new Error("PASSWORD_PEPPER is required for password hashing");
  }
  return new TextEncoder().encode(ENV.passwordPepper);
}

/** Crea hashes Argon2id nuevos usando el pepper administrado como secreto del algoritmo. */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, { ...ARGON2ID_OPTIONS, secret: getPepper() });
}

/**
 * Valida Argon2id y mantiene compatibilidad de lectura con hashes bcrypt existentes.
 * Los hashes bcrypt se actualizan a Argon2id en el próximo cambio de contraseña.
 */
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (passwordHash.startsWith("$argon2")) {
    return verify(passwordHash, password, { secret: getPepper() });
  }
  return bcrypt.compare(password, passwordHash);
}

export function isLegacyBcryptHash(passwordHash: string): boolean {
  return passwordHash.startsWith("$2a$") || passwordHash.startsWith("$2b$") || passwordHash.startsWith("$2y$");
}
