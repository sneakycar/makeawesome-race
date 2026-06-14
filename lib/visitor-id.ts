import { createHash } from "crypto";

export function hashVisitorDeviceId(deviceId: string): string {
  const salt = process.env.SUPPORT_DEVICE_SALT || "makeawesome-race-device";
  const normalized = deviceId.trim().toLowerCase();
  return createHash("sha256").update(`${salt}:${normalized}`).digest("hex");
}

export function normalizeDeviceId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128) return null;
  if (!/^[0-9a-f-]{16,128}$/i.test(trimmed)) return null;
  return trimmed;
}
