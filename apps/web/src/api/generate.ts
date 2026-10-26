import type { GenerateRuleResponse } from "@ruleforge/shared-types";

import { resolveBaseUrl } from "@/api/ApiClient";

export type GenerateResult =
  | { ok: true; body: GenerateRuleResponse }
  | { ok: false; reason: string };

export interface ChallengeSummary {
  challengeId: string;
  url: string;
}

export type SaveResult = { ok: true; body: ChallengeSummary } | { ok: false; reason: string };

const GENERATE_TIMEOUT_MS = 30_000;
const SAVE_TIMEOUT_MS = 10_000;

async function postJson<T>(path: string, payload: unknown, timeoutMs: number): Promise<T | string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${resolveBaseUrl()}${path}`, {
      method: "POST",
      signal: controller.signal,
      // The anonymous identity is a server-issued cookie; sending credentials
      // lets the browser attach it so a challenge is owned by this session.
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return `HTTP ${response.status}`;
    }

    return (await response.json()) as T;
  } catch (error) {
    return error instanceof Error ? error.message : "unknown network error";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls POST /rules/generate.
 *
 * The server is authoritative: this never compiles or repairs a pack. It forwards
 * the request and returns whatever the server decided, including a refusal.
 */
export async function generateRule(input: {
  prompt: string;
  levelId: string;
  locale?: string;
}): Promise<GenerateResult> {
  const result = await postJson<GenerateRuleResponse>(
    "/rules/generate",
    {
      requestId: crypto.randomUUID(),
      prompt: input.prompt,
      levelId: input.levelId,
      locale: input.locale ?? "zh-CN",
      existingPackId: null,
      dslVersion: "1.1.0",
    },
    GENERATE_TIMEOUT_MS,
  );

  return typeof result === "string" ? { ok: false, reason: result } : { ok: true, body: result };
}

/**
 * Saves a compiled pack and mints a share link.
 *
 * Saving is a separate step from generating so a pack can be re-shared without
 * spending another model call.
 */
export async function saveChallenge(packId: string): Promise<SaveResult> {
  const result = await postJson<{ challengeId: string; url: string }>(
    "/challenges",
    { packId, visibility: "unlisted" },
    SAVE_TIMEOUT_MS,
  );

  if (typeof result === "string") {
    return { ok: false, reason: result };
  }
  return { ok: true, body: { challengeId: result.challengeId, url: result.url } };
}
