import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/db/queries-kv", () => ({
  kvTopClear: vi.fn(),
}));

import { POST } from "./route";
import { revalidatePath } from "next/cache";
import { kvTopClear } from "@/db/queries-kv";

function makeRequest(token?: string): Request {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new Request("http://localhost/api/admin/bust-top", {
    method: "POST",
    headers,
  });
}

describe("POST /api/admin/bust-top", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_SECRET;
  });

  it("returns 404 when ADMIN_SECRET is not set", async () => {
    const res = await POST(makeRequest("anything"));

    expect(res.status).toBe(404);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(kvTopClear).not.toHaveBeenCalled();
  });

  it("returns 401 when token is wrong", async () => {
    process.env.ADMIN_SECRET = "correct-secret";

    const res = await POST(makeRequest("wrong-secret"));

    expect(res.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(kvTopClear).not.toHaveBeenCalled();
  });

  it("returns 401 when no token is provided", async () => {
    process.env.ADMIN_SECRET = "correct-secret";

    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
  });

  it("busts ISR and KV caches on valid auth", async () => {
    process.env.ADMIN_SECRET = "correct-secret";
    vi.mocked(kvTopClear).mockResolvedValue(3);

    const res = await POST(makeRequest("correct-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, kvKeysDeleted: 3 });
    expect(revalidatePath).toHaveBeenCalledWith("/top");
    expect(kvTopClear).toHaveBeenCalled();
  });
});
