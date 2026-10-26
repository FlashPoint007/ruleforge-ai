import type { GenerateRuleResponse } from "@ruleforge/shared-types";

import { resolveBaseUrl } from "@/api/ApiClient";

export type GenerateResult =
  | { ok: true; body: GenerateRuleResponse }
  | { ok: false; reason: string };

const TIMEOUT_MS = 30_000;

/**
 * Calls POST /rules/generate.
 *
 * The server is authoritative: this function never compiles or fixes a pack. It
 * forwards the request and returns whatever the server decided, including a
 * refusal, so the UI can show the real reason instead of a generic error.
 */
export async function generateRule(input: {
  prompt: string;
  levelId: string;
  locale?: string;
}): Promise<GenerateResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${resolveBaseUrl()}/rules/generate`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        requestId: crypto.randomUUID(),
        prompt: input.prompt,
        levelId: input.levelId,
        locale: input.locale ?? "zh-CN",
        existingPackId: null,
        dslVersion: "1.1.0",
      }),
    });

    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }

    return { ok: true, body: (await response.json()) as GenerateRuleResponse };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown network error";
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
