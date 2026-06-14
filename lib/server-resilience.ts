/** Log and return a fallback instead of failing the request. */
export async function withFallback<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[${label}]`, err);
    return fallback;
  }
}

export function settledValue<T>(
  result: PromiseSettledResult<T>,
  fallback: T,
  label: string
): T {
  if (result.status === "fulfilled") return result.value;
  console.error(`[${label}]`, result.reason);
  return fallback;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: { retries?: number; baseDelayMs?: number } = {}
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 400;
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.ok || res.status < 500 || attempt === retries - 1) {
        return res;
      }
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === retries - 1) throw err;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, baseDelayMs * 2 ** attempt)
    );
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed");
}
