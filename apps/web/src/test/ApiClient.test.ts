import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClient, resolveBaseUrl } from "@/api/ApiClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiClient", () => {
  it("falls back to the default base url", () => {
    expect(resolveBaseUrl()).toBe("http://localhost:8000/api/v1");
  });

  it("degrades gracefully when the backend is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await ApiClient.health();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("ECONNREFUSED");
    }
  });

  it("reports the http status on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await ApiClient.presets();

    expect(result).toEqual({ ok: false, reason: "HTTP 503" });
  });
});
