const STORAGE_KEY = "holes-race-device-id";

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return "";
  }
}
