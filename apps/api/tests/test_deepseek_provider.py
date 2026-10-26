"""DeepSeek provider tests.

No network: every case drives the provider through an httpx MockTransport, so the
request shape, the retry policy and the response parsing are all covered without
spending a real API call. A separate opt-in test hits the real endpoint.
"""

import json
import os

import httpx
import pytest

from app.providers.deepseek import (
    DeepSeekError,
    DeepSeekLLMProvider,
    build_system_prompt,
)


def make_provider(handler, *, max_retries: int = 1) -> DeepSeekLLMProvider:
    return DeepSeekLLMProvider(
        api_key="test-key",
        base_url="https://api.example.test",
        model="deepseek-flash",
        max_retries=max_retries,
        transport=httpx.MockTransport(handler),
    )


def completion(content: str, finish_reason: str = "stop") -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "choices": [
                {"finish_reason": finish_reason, "message": {"content": content}}
            ]
        },
    )


IR = {
    "status": "ok",
    "rules": [
        {
            "trigger": {"event": "player.jumpCommitted"},
            "conditions": [],
            "actions": [{"op": "player.gravity.toggle", "target": "player", "params": {}}],
        }
    ],
    "explanation": "每跳一次重力反转",
    "warnings": [],
}


def test_system_prompt_lists_the_registry():
    prompt = build_system_prompt()

    assert "player.gravity.toggle" in prompt
    assert "player.jumpCommitted" in prompt
    assert "json" in prompt.lower()
    # The literal JSON example must survive templating intact.
    assert '"status"' in prompt
    assert "{events}" not in prompt


async def test_returns_the_parsed_document():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return completion(json.dumps(IR))

    document = await make_provider(handler).generate(
        "重力反转", level_id="lab-01", locale="zh-CN"
    )

    assert document["status"] == "ok"
    assert document["rules"][0]["actions"][0]["op"] == "player.gravity.toggle"


async def test_sends_json_mode_and_the_model():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return completion(json.dumps(IR))

    await make_provider(handler).generate("x", level_id="lab-01", locale="zh-CN")

    assert captured["model"] == "deepseek-flash"
    assert captured["response_format"] == {"type": "json_object"}
    assert captured["messages"][0]["role"] == "system"


async def test_retries_once_on_a_server_error():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(503, json={"error": "unavailable"})
        return completion(json.dumps(IR))

    document = await make_provider(handler).generate("x", level_id="lab-01", locale="zh-CN")

    assert calls["n"] == 2
    assert document["status"] == "ok"


async def test_does_not_retry_a_client_error():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(401, json={"error": "bad key"})

    with pytest.raises(DeepSeekError):
        await make_provider(handler).generate("x", level_id="lab-01", locale="zh-CN")

    # A 401 will never succeed on retry, so retrying it just wastes time.
    assert calls["n"] == 1


async def test_retries_a_rate_limit():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, json={"error": "slow down"})
        return completion(json.dumps(IR))

    document = await make_provider(handler).generate("x", level_id="lab-01", locale="zh-CN")

    assert calls["n"] == 2
    assert document["status"] == "ok"


async def test_truncated_generation_is_retried_then_reported():
    def handler(request: httpx.Request) -> httpx.Response:
        return completion("{\"status\": \"ok\", \"rules\": [", finish_reason="length")

    with pytest.raises(DeepSeekError):
        await make_provider(handler, max_retries=1).generate(
            "x", level_id="lab-01", locale="zh-CN"
        )


async def test_empty_content_is_reported():
    def handler(request: httpx.Request) -> httpx.Response:
        return completion("")

    with pytest.raises(DeepSeekError):
        await make_provider(handler).generate("x", level_id="lab-01", locale="zh-CN")


async def test_invalid_json_is_reported_not_guessed():
    def handler(request: httpx.Request) -> httpx.Response:
        return completion("here is your rule: make gravity flip")

    with pytest.raises(DeepSeekError):
        await make_provider(handler).generate("x", level_id="lab-01", locale="zh-CN")


async def test_missing_api_key_is_refused_at_construction():
    with pytest.raises(ValueError):
        DeepSeekLLMProvider(api_key="")


@pytest.mark.skipif(
    not os.getenv("DEEPSEEK_API_KEY") or os.getenv("RULEFORGE_LIVE_TESTS") != "1",
    reason="live DeepSeek test is opt-in via RULEFORGE_LIVE_TESTS=1",
)
async def test_live_generation_against_the_real_endpoint():
    """Opt-in: spends a real API call. Not part of the default suite."""
    provider = DeepSeekLLMProvider(
        api_key=os.environ["DEEPSEEK_API_KEY"],
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-flash"),
    )

    document = await provider.generate("每跳一次，重力反转", level_id="lab-01", locale="zh-CN")

    assert document["status"] in {"ok", "unsupported"}
    assert isinstance(document["rules"], list)
