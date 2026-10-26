import type { Challenge } from "@ruleforge/shared-types";

import { resolveBaseUrl } from "@/api/ApiClient";

export type ChallengeResult = { ok: true; challenge: Challenge } | { ok: false; reason: string };

const TIMEOUT_MS = 10_000;

/**
 * Loads a frozen challenge by id.
 *
 * Returns the server's answer as-is: the caller decides how to present a refusal,
 * but it must never invent a challenge that the server does not have.
 */
export async function fetchChallenge(challengeId: string): Promise<ChallengeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${resolveBaseUrl()}/challenges/${encodeURIComponent(challengeId)}`, {
      signal: controller.signal,
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (response.status === 404) {
      return { ok: false, reason: "这条挑战不存在，或者已经被删除。" };
    }
    if (!response.ok) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }

    return { ok: true, challenge: (await response.json()) as Challenge };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown network error";
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
