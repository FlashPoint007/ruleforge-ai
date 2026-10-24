import type { HealthResponse, PresetMeta } from "@ruleforge/shared-types";

const DEFAULT_BASE_URL = "http://localhost:8000/api/v1";
const REQUEST_TIMEOUT_MS = 4000;

export type ApiResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export function resolveBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  return configured && configured.trim().length > 0 ? configured.trim() : DEFAULT_BASE_URL;
}

async function request<T>(path: string): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${resolveBaseUrl()}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown network error";
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

export const ApiClient = {
  health: () => request<HealthResponse>("/healthz"),
  presets: () => request<PresetMeta[]>("/presets"),
};
