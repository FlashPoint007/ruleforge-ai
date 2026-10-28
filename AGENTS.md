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

**RF-001 … RF-013 done**, plus a stability measurement.

Evaluation: `tests/eval/generate_corpus.py` generates `prompts.json`;
`apps/api/eval/run_eval.py` runs it, with `--repeats` and stratified `--sample`.
Read `docs/EVALUATION.md` before touching either.

Measured facts (do not restate them more confidently than this):
- 300 prompts, 99.2% in-scope, 95% CI [97.0, 99.8], 60/60 rejections, P95 10.3s.
- **Verdicts are stable**: 3 runs x 60 sampled cases = 180 calls, zero flips. The two
  failures from the single full run both passed 8/8 when probed directly, so they
  were transient noise, not defects. A single-run number carries roughly ±0.5% noise.
- **Latency is not stable**: P95 swings between 10s and 15s across runs, and one
  prompt reached 40.7s after a truncation retry. "P95 meets 15s" is not a property
  to rely on.

Corpus rules: generated, not hand-edited (a test enforces it); bilingual variants
authored, never mechanically wrapped; sample stratified and evenly spread, because
a prefix sample or a dropped category would look stable for the wrong reason.

Quality gates that must stay green:

```bash
pnpm --filter @ruleforge/web typecheck && pnpm --filter @ruleforge/web lint
pnpm --filter @ruleforge/web test
pnpm --filter @ruleforge/web build
pnpm run test:e2e
cd apps/api && uv run pytest -q && uv run ruff check .
```

## Next task

Latency is the remaining risk, not correctness. Options: stop retrying truncated
generations (faster, worse UX), raise `max_tokens` (slower, better), or stream.
That is a product decision — do not pick silently.
