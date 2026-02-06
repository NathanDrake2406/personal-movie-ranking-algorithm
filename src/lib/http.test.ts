import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson, fetchText, fetchWithTimeout } from "./http";

function abortError(message = "aborted"): Error {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

describe("http helpers", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("converts timeout abort errors into temporarily unavailable", async () => {
    global.fetch = vi.fn().mockRejectedValue(abortError());

    await expect(fetchWithTimeout("https://example.com")).rejects.toThrow(
      "Temporarily unavailable",
    );
  });

  it("preserves caller abort errors", async () => {
    const controller = new AbortController();
    controller.abort();
    global.fetch = vi.fn().mockRejectedValue(abortError());

    await expect(
      fetchWithTimeout("https://example.com", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("retries transient network failures for idempotent requests", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

    await expect(
      fetchJson<{ ok: boolean }>("https://example.com"),
    ).resolves.toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-idempotent requests", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

    await expect(
      fetchJson("https://example.com", { method: "POST" }),
    ).rejects.toThrow("fetch failed");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable status code then succeeds", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        headers: new Headers(),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: 1 }) });

    await expect(fetchJson("https://example.com")).resolves.toEqual({
      data: 1,
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable status codes", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers(),
    });

    await expect(fetchJson("https://example.com")).rejects.toThrow(
      "Request failed: 404 Not Found",
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("throws last error after all retry attempts exhausted", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

    await expect(fetchJson("https://example.com")).rejects.toThrow(
      "fetch failed",
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("retries fetchText on transient failure", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({ ok: true, text: async () => "<html>ok</html>" });

    await expect(fetchText("https://example.com")).resolves.toBe(
      "<html>ok</html>",
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
