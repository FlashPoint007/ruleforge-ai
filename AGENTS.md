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

**RF-001 … RF-009 done.** Prompt -> DeepSeek -> IR -> compiler -> five validation
layers -> RulePack -> client, with SQLite persistence and immutable share links.

Persistence invariants:
- immutability is enforced by the schema (unique pack_id + INSERT OR IGNORE), not
  by convention: a pack id can never be overwritten with different content
- a challenge freezes dsl/engine/level versions and seed, so old links keep
  replaying the rule they were created with
- `generation_requests` has **no column for prompt text** — only length and hash.
  Never add one.
- `/rules/generate` persists the pack it returns. If it did not, `/challenges`
  would 404 for a rule the client was just handed.

Wiring rule: routes must take dependencies as `Annotated[..., Depends(...)]`
parameters. Calling a `get_*()` factory directly inside a route bypasses
`dependency_overrides`, which silently breaks both tests and the real wiring.

Identity: the anonymous id is a server-issued httponly cookie, minted on first
contact with any endpoint. A client-supplied user id is never an identity claim.

Quality gates that must stay green:

```bash
pnpm --filter @ruleforge/web typecheck && pnpm --filter @ruleforge/web lint
pnpm --filter @ruleforge/web test
pnpm --filter @ruleforge/web build
pnpm run test:e2e
cd apps/api && uv run pytest -q && uv run ruff check .
```

## Next task

**RF-010: playing a shared challenge.** `GET /challenges/{id}` returns a frozen
pack, but the client cannot yet open `/c/{challengeId}` and play it. That closes
the share loop end to end.
