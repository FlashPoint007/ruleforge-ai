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

export type GenerationStatus = "ready" | "unsupported" | "validation_failed";

export interface GenerateRuleRequest {
  requestId: string;
  prompt: string;
  levelId: string;
  locale: string;
  existingPackId: string | null;
  dslVersion: string;
}

export interface GenerateRuleResponse {
  requestId: string;
  status: GenerationStatus;
  rulePack?: RulePack;
  explanation?: string;
  warnings: string[];
  validation: {
    schemaOk: boolean;
    conflictOk: boolean;
    levelCompatible: boolean;
  };
}

export interface ApiError {
  requestId: string;
  code: "unsupported" | "validation_failed" | "rate_limited" | "upstream_error";
  message: string;
}
