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

**RF-001 … RF-007 done.** The full promise chain works with the mock provider:
prompt -> Rule IR -> compiler -> five validation layers -> RulePack -> client.

Server (apps/api):
- `app/domain/registry.py` mirrors packages/rule-schema. It must stay in lockstep
  with the TS registry; `tests/test_contract.py` asserts that.
- `app/compiler/validators.py` holds the five layers, each independently reportable.
  A later layer never runs once an earlier one failed.
- `app/compiler/compiler.py` fills ids/targets/defaults and hashes the content into
  a stable packId. It knows nothing about providers.
- Only a non-empty, fully valid pack may be returned as `ready`.

Cross-language guarantee: `tests/test_generate_api.py` writes golden packs to
`tests/golden/`, and `apps/web/src/test/contract.test.ts` loads and *executes*
them. A server that emits something the client cannot run fails in CI, not in
the browser.

Quality gates that must stay green:

```bash
pnpm --filter @ruleforge/web typecheck && pnpm --filter @ruleforge/web lint
pnpm --filter @ruleforge/web test          # includes the contract test
pnpm --filter @ruleforge/web build
pnpm run test:e2e                          # generation tests skip if API is down
cd apps/api && uv run pytest -q && uv run ruff check .
```

## Next task

**RF-008: the real DeepSeek provider.** The pipeline is complete and provider
agnostic; `DeepSeekLLMProvider` still raises NotImplementedError. Implement it
with the spec's 5.3/5.5 rules (json_object, finish_reason checks, one bounded
retry, timeout 25s) and keep it behind `LLM_PROVIDER=deepseek`.
