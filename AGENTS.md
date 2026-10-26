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

**RF-001 … RF-010 done.** The share loop is closed: prompt -> DeepSeek -> IR ->
compiler -> five validators -> RulePack -> client -> saved -> share link ->
`/c/{id}` -> playable.

Rules that must survive future edits:
- a challenge is frozen. Loading it must never rewrite it; editing belongs on the
  home page and creates a new pack.
- DSL version mismatch is **rejected before loading**, engine mismatch only warns.
  Running a pack built for different semantics would not fail loudly — it would
  simply behave wrong.
- `getScene()` returns a scene as soon as it is registered, which is *before*
  `create()` has built anything. Always go through `isReady()`; calling into a
  half-built scene throws on undefined.
- the challenge loader must retry until Phaser mounts. A single attempt ran before
  the canvas existed and silently dropped the player's rule.

Test policy: anything that calls the real model is opt-in via
`RULEFORGE_LIVE_TESTS=1` (backend pytest and Playwright alike). Leaving those in
the default run makes the suite flaky on a slow network and spends real quota.

Quality gates that must stay green:

```bash
pnpm --filter @ruleforge/web typecheck && pnpm --filter @ruleforge/web lint
pnpm --filter @ruleforge/web test
pnpm --filter @ruleforge/web build
pnpm run test:e2e
cd apps/api && uv run pytest -q && uv run ruff check .
```

## Next task

**RF-011: the second level.** MVP scope calls for two playable levels; only
`lab-01` exists. Then the 50-prompt evaluation set from spec section 9.2.
