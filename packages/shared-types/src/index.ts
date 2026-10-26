/** Transport types shared by the web client and the FastAPI service. */

import type { RulePack } from "@ruleforge/rule-schema";

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  env: string;
  provider: string;
}

export interface LevelMeta {
  id: string;
  name: string;
  version: string;
  difficulty: "intro" | "standard" | "hard";
}

export interface PresetMeta {
  id: string;
  name: string;
  description: string;
  dslVersion: string;
  levelId: string;
  rules: unknown[];
}

export type GenerationStatus = "ready" | "unsupported" | "validation_failed" | "upstream_error";

export interface GenerateRuleRequest {
  requestId: string;
  prompt: string;
  levelId: string;
  locale: string;
  existingPackId: string | null;
  dslVersion: string;
}

export interface ValidationReport {
  schemaOk: boolean;
  typeOk: boolean;
  semanticOk: boolean;
  conflictOk: boolean;
  levelCompatible: boolean;
  errors: string[];
}

export interface GenerateRuleResponse {
  requestId: string;
  status: "ready" | "unsupported" | "validation_failed" | "upstream_error";
  rulePack: RulePack | null;
  explanation: string;
  warnings: string[];
  validation: ValidationReport;
}

export interface ApiError {
  requestId: string;
  code: "unsupported" | "validation_failed" | "rate_limited" | "upstream_error";
  message: string;
}
/** A frozen, shareable challenge. Versions are pinned so old links keep working. */
export interface Challenge {
  challengeId: string;
  ownerId: string;
  packId: string;
  levelId: string;
  levelVersion: string;
  engineVersion: string;
  dslVersion: string;
  seed: number;
  visibility: "private" | "unlisted" | "public";
  createdAt: string;
  rulePack: RulePack | null;
}
