import { hash, verify } from "@node-rs/argon2";

// OWASP recommendation: Argon2id, 19 MiB, t=2, p=1. (Bifire src/lib/auth/password.ts)
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const PASSWORD_MIN_LENGTH = 12;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Minimal strength policy for admin accounts (length + not trivially repetitive). */
export function passwordProblems(password: string): string[] {
  const issues: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push(`at least ${PASSWORD_MIN_LENGTH} characters`);
  if (new Set(password).size < 6) issues.push("at least 6 distinct characters");
  return issues;
}
