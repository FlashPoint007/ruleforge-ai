"""DeepSeek provider.

Spec section 5.3/5.5: json_object mode guarantees JSON *syntax* only, never the
schema, so everything it returns still goes through the compiler's five layers.
This module talks to the network and nothing else — it never executes anything.
"""

import asyncio
import json
import random
from typing import Any

import httpx

from app.domain.registry import (
    MAX_ACTIONS_PER_RULE,
    MAX_CONDITIONS_PER_RULE,
    MAX_RULES_PER_PACK,
    P0_ACTIONS,
    P0_CONDITION_OPERATORS,
    P0_EVENTS,
    P0_FACT_PATHS,
    PARAM_BOUNDS,
    allowed_params,
)

SYSTEM_PROMPT = """You are the compiler front-end for RuleForge, a game where the player
describes a rule in natural language and the game applies it.

Return exactly one json object. Never return code, prose, markdown or urls.

Shape:
{
  "status": "ok" | "unsupported",
  "rules": [
    {
      "trigger": {"event": "<one of the allowed events>"},
      "conditions": [
        {"op": "<allowed operator>", "fact": "<allowed fact>", "value": <value>}
      ],
      "actions": [{"op": "<allowed action>", "target": "<target>", "params": {...}}]
    }
  ],
  "explanation": "<one short sentence in the player's language>",
  "warnings": []
}

Hard rules:
- Use only the events, operators, facts and actions listed below. Anything else is invalid.
- At most {max_rules} rules, {max_conditions} condition nodes and {max_actions} actions per rule.
- Conditions may use "all"/"any" groups at most 2 levels deep.
- If the request cannot be expressed with the allowed vocabulary, return
  {"status":"unsupported","rules":[],"explanation":"<why>","warnings":[]}.
- If the player asks for a quantity or intensity outside these ranges (for example
  100x jump height, or unlimited enemies), return "unsupported" and say why.
  Never substitute a legal value and claim success: the player would get a
  different rule than the one they asked for.
- Use the exact parameter names listed for each action. An unknown parameter is
  rejected by the server, so a guess fails the whole request.
- An empty rules array with status "ok" is invalid.

Allowed events: {events}
Allowed actions: {actions}
Allowed condition operators: {operators}
Allowed facts: {facts}
""".strip()


def _action_catalogue() -> str:
    """Renders each action with the parameter names the server actually accepts.

    Omitting this left the model to guess, and it guessed plausible-but-wrong
    names ("scale", "multiplier") that the validator then had to reject.
    """
    lines: list[str] = []

    for action in P0_ACTIONS:
        parts: list[str] = []

        for name, (low, high) in PARAM_BOUNDS.get(action, {}).items():
            parts.append(f"{name}: {low}-{high}")

        if action == "platform.visibility.set":
            parts.append("visible: true|false")
        if action == "platform.visibility.set":
            parts.append("platformId: a level-defined id")
        if action == "checkpoint.activate":
            parts.append("checkpointId: a level-defined id")

        if "durationMs" in allowed_params(action):
            parts.append("durationMs: 0-10000 (optional)")

        rendered = ", ".join(parts) if parts else "no parameters"
        lines.append(f"  - {action} ({rendered})")

    return "\n" + "\n".join(lines)


def build_system_prompt() -> str:
    """Substitutes the registry into the prompt.

    Plain str.format() cannot be used: the prompt contains literal JSON braces,
    which format() would try to interpret as placeholders.
    """
    replacements = {
        "{max_rules}": str(MAX_RULES_PER_PACK),
        "{max_conditions}": str(MAX_CONDITIONS_PER_RULE),
        "{max_actions}": str(MAX_ACTIONS_PER_RULE),
        "{events}": ", ".join(P0_EVENTS),
        "{actions}": _action_catalogue(),
        "{operators}": ", ".join(P0_CONDITION_OPERATORS),
        "{facts}": ", ".join(P0_FACT_PATHS),
    }

    prompt = SYSTEM_PROMPT
    for token, value in replacements.items():
        prompt = prompt.replace(token, value)
    return prompt


class DeepSeekError(RuntimeError):
    """Raised when the upstream call fails in a way the caller must report."""


class DeepSeekLLMProvider:
    """Calls the DeepSeek chat completions API and returns a Rule IR document."""

    name = "deepseek"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = "https://api.deepseek.com",
        model: str = "deepseek-flash",
        timeout_seconds: float = 25.0,
        max_retries: int = 1,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if not api_key:
            raise ValueError("DEEPSEEK_API_KEY is required when LLM_PROVIDER=deepseek")
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout_seconds
        self._max_retries = max_retries
        self._transport = transport

    async def generate(self, prompt: str, *, level_id: str, locale: str) -> dict[str, Any]:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": build_system_prompt()},
                {
                    "role": "user",
                    "content": (
                        f"Level: {level_id}\nLocale: {locale}\n"
                        f"Player description:\n{prompt}"
                    ),
                },
            ],
            # Syntax-only guarantee; the compiler still validates everything.
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
            "max_tokens": 3072,
        }

        last_error: Exception | None = None
        for attempt in range(self._max_retries + 1):
            try:
                return await self._call_once(payload)
            except _RetryableError as error:
                last_error = error
                if attempt >= self._max_retries:
                    break
                # Exponential backoff with jitter, per spec 5.5.
                delay = (0.5 * (2**attempt)) + random.uniform(0, 0.25)
                await asyncio.sleep(delay)

        raise DeepSeekError(str(last_error) if last_error else "upstream call failed")

    async def _call_once(self, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self._base_url}/chat/completions"

        try:
            async with httpx.AsyncClient(
                timeout=self._timeout, transport=self._transport
            ) as client:
                response = await client.post(url, json=payload, headers=headers)
        except (httpx.TimeoutException, httpx.TransportError) as error:
            raise _RetryableError(f"network error: {error}") from error

        if response.status_code == 429 or response.status_code >= 500:
            # Retryable per spec; 4xx other than 429 is not.
            raise _RetryableError(f"upstream HTTP {response.status_code}")

        if response.status_code >= 400:
            raise DeepSeekError(f"upstream rejected the request: HTTP {response.status_code}")

        return self._parse_response(response.text)

    def _parse_response(self, raw: str) -> dict[str, Any]:
        try:
            body = json.loads(raw)
        except json.JSONDecodeError as error:
            raise DeepSeekError("upstream returned non-JSON") from error

        choices = body.get("choices") or []
        if not choices:
            raise _RetryableError("upstream returned no choices")

        choice = choices[0]
        finish_reason = choice.get("finish_reason")
        content = (choice.get("message") or {}).get("content")

        if finish_reason == "length":
            raise _RetryableError("truncated generation (finish_reason=length)")
        if not content:
            raise _RetryableError("empty generation")

        try:
            document = json.loads(content)
        except json.JSONDecodeError as error:
            # JSON mode should prevent this; if it happens, one repair attempt is
            # allowed by spec 5.5, which the retry loop already provides.
            raise _RetryableError("model returned invalid JSON despite json mode") from error

        if not isinstance(document, dict):
            raise DeepSeekError("model returned a non-object JSON document")

        return document


class _RetryableError(Exception):
    """Internal marker for failures worth one bounded retry."""