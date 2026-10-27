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

**RF-001 … RF-012 done.** Two levels, real model, share links, and a measured
50-prompt evaluation at **92.5%** in-scope / **10/10** rejections.

Evaluation lives in `tests/eval/prompts.json` (corpus) and
`apps/api/eval/run_eval.py` (runner). Read `docs/EVALUATION.md` before changing
either. Rules learned from it:
- the system prompt must list **each action with its exact parameter names and
  ranges**. Without them the model guessed `scale`/`multiplier` and every such
  rule failed validation.
- the compiler fills level-scoped ids (`checkpointId`, `platformId`) from the
  level's own capabilities; the model has never seen the level.
- every registered event must actually be emitted. `timer.interval` was declared
  but never fired, so rules using it looked enabled and did nothing.
- an unknown action parameter is **rejected**, never silently dropped. Dropping
  `scale: 100` and defaulting `factor` to 1.2 turned a 100x request into 1.2x.
- when measuring, check whether a failure is the product's or the *test's*. Four
  of the first-round failures were wrong expectations (one rule may carry two
  actions), and "fixing" them would have broken working behaviour.

Quality gates that must stay green:

```bash
pnpm --filter @ruleforge/web typecheck && pnpm --filter @ruleforge/web lint
pnpm --filter @ruleforge/web test
pnpm --filter @ruleforge/web build
pnpm run test:e2e
cd apps/api && uv run pytest -q && uv run ruff check .
```

## Next task

P95 latency is the one target still missed (28.6s vs 15s). That needs a product
decision: raise `max_tokens` further, or stop retrying truncated generations and
ask the player to simplify. Do not pick silently.
