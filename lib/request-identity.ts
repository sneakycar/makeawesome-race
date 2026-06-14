import { createHash } from "crypto";

function getBadMoneySalt(): string {
  const salt = process.env.BAD_MONEY_HASH_SALT;
  if (salt) return salt;
  if (process.env.NODE_ENV === "production") {
    console.warn("[bad-money] BAD_MONEY_HASH_SALT missing — using dev fallback");
  }
  return "makeawesome-race-bad-money-dev";
}

export function getRequestIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp?.trim()) return cfIp.trim();
  return "unknown";
}

export function hashIdentity(value: string, salt?: string): string {
  const effectiveSalt = salt ?? getBadMoneySalt();
  return createHash("sha256").update(`${effectiveSalt}:${value}`).digest("hex");
}

export function hashRequestIp(ip: string): string {
  return hashIdentity(ip);
}

export function hashUserAgent(userAgent: string): string {
  const normalized = userAgent.trim() || "unknown";
  return hashIdentity(normalized);
}
