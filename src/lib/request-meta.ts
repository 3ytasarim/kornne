import "server-only";
import { headers } from "next/headers";
import { createHash } from "node:crypto";

/**
 * Client IP behind Nginx. Nginx must OVERWRITE X-Real-IP / X-Forwarded-For with $remote_addr
 * (docs/architecture/deployment-staging.md) — otherwise the header is client-controlled.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Salted SHA-256 of the IP — enough for rate limiting; raw IPs are never stored. (Bifire pattern) */
export async function getIpHash(): Promise<string> {
  const salt = process.env.IP_HASH_SALT;
  if (!salt && process.env.NODE_ENV === "production") throw new Error("IP_HASH_SALT is required in production");
  return createHash("sha256").update(`${salt ?? "kornne-dev"}:${await getClientIp()}`).digest("hex").slice(0, 32);
}
