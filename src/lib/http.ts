const DEFAULT_TIMEOUT_MS = 10000;
const MAX_RETRY_ATTEMPTS = 2;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 1200;

function createAbortError(): Error {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  return err;
}

export function isAbortError(err: unknown): err is Error {
  return err instanceof Error && err.name === "AbortError";
}

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("temporarily unavailable") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("socket") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
}

function isIdempotentMethod(method?: string): boolean {
  const normalized = (method ?? "GET").toUpperCase();
  return normalized === "GET" || normalized === "HEAD";
}

function retryDelayMs(
  attempt: number,
  retryAfterHeader?: string | null,
): number {
  if (retryAfterHeader) {
    if (/^\d+$/.test(retryAfterHeader)) {
      return Math.min(
        Number.parseInt(retryAfterHeader, 10) * 1000,
        RETRY_MAX_DELAY_MS,
      );
    }
    const retryAt = Date.parse(retryAfterHeader);
    if (!Number.isNaN(retryAt)) {
      return Math.min(Math.max(retryAt - Date.now(), 0), RETRY_MAX_DELAY_MS);
    }
  }
  const base = Math.min(
    RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
    RETRY_MAX_DELAY_MS,
  );
  return Math.round(base * (0.5 + Math.random() * 0.5));
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) throw createAbortError();

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  try {
    return await fetch(url, {
      ...init,
      signal,
      headers: {
        "user-agent":
          "movies-ranking/1.0 (+https://movies-ranking-rho.vercel.app)",
        ...(init.headers || {}),
      },
    });
  } catch (err) {
    if (isAbortError(err)) {
      if (init.signal?.aborted) {
        throw err;
      }
      throw new Error("Temporarily unavailable");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestWithRetries(
  url: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<Response> {
  const maxAttempts = isIdempotentMethod(init.method) ? MAX_RETRY_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (res.ok) return res;

      const shouldRetryStatus =
        attempt < maxAttempts &&
        RETRYABLE_STATUS_CODES.has(res.status) &&
        !init.signal?.aborted;
      if (!shouldRetryStatus) {
        return res;
      }

      await sleep(
        retryDelayMs(attempt, res.headers.get("retry-after")),
        init.signal ?? undefined,
      );
    } catch (err) {
      if (isAbortError(err)) throw err;

      const shouldRetryError =
        attempt < maxAttempts &&
        isRetryableNetworkError(err) &&
        !init.signal?.aborted;
      if (!shouldRetryError) {
        throw err;
      }

      await sleep(retryDelayMs(attempt), init.signal ?? undefined);
    }
  }

  throw new Error("Temporarily unavailable");
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<T> {
  const res = await requestWithRetries(url, init, timeoutMs);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function fetchText(
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<string> {
  const res = await requestWithRetries(url, init, timeoutMs);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}
