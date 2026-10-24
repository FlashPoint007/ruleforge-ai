import { ApiClient } from "@/api/ApiClient";

export interface HealthState {
  status: "checking" | "online" | "offline";
  detail: string;
}

/**
 * Probes the API once. A missing or failing backend must never break the page:
 * the scaffold has to stay usable with zero credentials and zero servers.
 */
export async function checkBackend(): Promise<HealthState> {
  const result = await ApiClient.health();

  if (result.ok) {
    return {
      status: "online",
      detail: `${result.data.service} · ${result.data.provider} · v${result.data.version}`,
    };
  }

  return { status: "offline", detail: `后端未连接（${result.reason}）` };
}
