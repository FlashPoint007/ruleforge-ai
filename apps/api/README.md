# RuleForge AI — API

FastAPI service. Milestone **M0 (RF-001)** scaffold: health and preset endpoints only.
No model calls, no compiler, no database yet — and this README says so on purpose.

## Requirements

- Python 3.11 or 3.12
- [uv](https://docs.astral.sh/uv/)

## Install and run

```bash
cd apps/api
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

- Health: <http://127.0.0.1:8000/api/v1/healthz>
- Presets: <http://127.0.0.1:8000/api/v1/presets>
- OpenAPI docs: <http://127.0.0.1:8000/docs>

## Test and lint

```bash
uv run pytest -q
uv run ruff check .
```

## Configuration

Copy `.env.example` to `.env` (never commit `.env`).
The default `LLM_PROVIDER=mock` needs **no API key**: the mock provider is fully offline
and deterministic. Setting `LLM_PROVIDER=deepseek` currently raises `NotImplementedError`
on purpose — the real provider belongs to milestone M3.

## Layout

```text
app/
├── main.py              # create_app(), CORS, router wiring
├── core/config.py       # pydantic-settings; all secrets live server side
├── api/v1/              # /healthz, /presets
├── providers/           # LLMProvider protocol + mock/deepseek stubs
├── domain/              # Rule IR and DSL models (empty in M0)
├── repositories/        # storage abstraction (empty in M0)
├── services/            # application services (empty in M0)
└── security/            # rate limiting and identity (empty in M0)
```
