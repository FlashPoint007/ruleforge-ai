# RuleForge AI — Agent Development Instructions

## Project source of truth
- Read `docs/RuleForge_AI_V1.1.md` before changing the repo.
- This is a **new project specification**, not evidence of already implemented functionality.
- The DeepSeek Harness agent is for coding; **never deploy Harness as the runtime game server**.

## Product promise
The player describes a rule in natural language. A server-side LLM returns controlled Rule IR; a deterministic compiler validates it into versioned DSL; Phaser executes the DSL locally. Never execute arbitrary code returned by the model.

## MVP scope
- React + Vite + TypeScript + Phaser 3 client.
- FastAPI + Python server, `LLMProvider` switchable between `mock`, `deepseek` and later `gemini`.
- SQLite for local development, behind repository abstraction; Firestore later.
- 2 small playable levels, up to 3 combinable rules, 12 registered actions, safe rollback, immutable challenge links.
- Offline preset rules must work without a model key.

## Technical requirements
- DeepSeek API: official model ID `deepseek-flash`, `base_url=https://api.deepseek.com`.
- DeepSeek JSON mode only guarantees JSON syntax; always run schema, type, semantic, conflict and level-compatibility validation.
- Keep model secrets in server-side environment variables, never in Vite `VITE_*` vars.
- No `eval`, `new Function`, generated-script execution, open-ended dynamic property resolution, unbounded loops or per-frame model calls.
- Fixed simulation tick; bounded event queue; timed effects bound to simulated clock; all effects cleaned on reset or rule replacement.
- Idempotent API calls where appropriate; stable DSL, engine, level versions and seed for challenge sharing.

## Coding workflow
1. Inspect repo and specify the next bounded task (issue ID RF-xxx).
2. List files to edit and concrete acceptance tests.
3. Write tests or fixtures before complex runtime behavior.
4. Implement minimal passing solution; run actual lint, typecheck, unit tests and build.
5. Report exact commands executed and their outcomes. Never claim tests passed if not run.
6. Update README and docs when behavior or commands change.

## Quality gates
- Keep test coverage for core runtime branches, conflicts and rollback.
- Run pytest and Vitest for modified code, Playwright for UI flows when available.
- No hardcoded API keys, fabricated cloud integrations or fake deployment claims.
- Do not buy cloud resources, publish publicly, push to a remote repo or change production infrastructure without explicit task authorization.

## Current milestone

**RF-001 … RF-008 done.** The promise chain is verified against the real model:
prompt -> DeepSeek -> Rule IR -> compiler -> five validation layers -> RulePack
-> client.

Providers:
- `mock` (default) reads tests/fixtures by keyword and needs no key
- `deepseek` calls the real API; `app/providers/deepseek.py` owns the network and
  nothing else. Per spec 5.3/5.5: `response_format=json_object`, `finish_reason`
  checked, 25s timeout, exactly one bounded retry, and **no retry on 4xx** (a 401
  will never succeed).
- json_object guarantees syntax only; every response still goes through all five
  compiler layers.

Test hermeticity (learned the hard way): `tests/conftest.py` points
`Settings.model_config["env_file"]` at a nonexistent file and clears the settings
cache. Environment variables alone are NOT enough, because pydantic-settings reads
the .env file directly — a developer's real key would otherwise leak into the
suite and make ordinary tests call the network.

Secrets: the API key lives only in `apps/api/.env`, which is gitignored. Never
write a key into a tracked file, a fixture, or a test.

Quality gates that must stay green:

```bash
pnpm --filter @ruleforge/web typecheck && pnpm --filter @ruleforge/web lint
pnpm --filter @ruleforge/web test
pnpm --filter @ruleforge/web build
pnpm run test:e2e
cd apps/api && uv run pytest -q && uv run ruff check .
```

Live model test is opt-in: `RULEFORGE_LIVE_TESTS=1 uv run pytest -q`.

## Next task

**RF-009: persistence and immutable challenge links.** Rules and challenges are
still in-memory; the SQLite repository layer and `/challenges` endpoints are next.
