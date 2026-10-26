import asyncio

import pytest

from app.providers import DeepSeekLLMProvider, MockLLMProvider, get_provider


def test_mock_provider_is_returned_by_default():
    provider = get_provider("mock")

    assert isinstance(provider, MockLLMProvider)
    assert provider.name == "mock"


def test_provider_lookup_is_case_insensitive():
    assert isinstance(get_provider(" MOCK "), MockLLMProvider)


def test_deepseek_provider_is_constructible_with_a_key(monkeypatch):
    # The provider is real now; with a key it must build without touching the
    # network (construction alone performs no I/O).
    from app.providers import deepseek as deepseek_module

    provider = deepseek_module.DeepSeekLLMProvider(api_key="sk-test")

    assert isinstance(provider, DeepSeekLLMProvider)
    assert provider.name == "deepseek"


def test_mock_provider_is_deterministic_and_offline():
    provider = get_provider("mock")

    first = asyncio.run(provider.generate("jump flips gravity", level_id="lab-01", locale="zh-CN"))
    second = asyncio.run(provider.generate("jump flips gravity", level_id="lab-01", locale="zh-CN"))

    assert first == second
    # The mock now emits a real IR document, not a labelled stub.
    assert first["status"] in {"ok", "unsupported"}
    assert isinstance(first["rules"], list)


def test_mock_provider_routes_prompts_to_matching_fixtures():
    provider = get_provider("mock")

    gravity = asyncio.run(provider.generate("重力反转", level_id="lab-01", locale="zh-CN"))
    unsupported = asyncio.run(provider.generate("跳舞", level_id="lab-01", locale="zh-CN"))

    assert gravity["status"] == "ok"
    assert gravity["rules"]
    assert unsupported["status"] == "unsupported"


def test_mock_provider_never_leaks_fixture_metadata_into_the_ir():
    provider = get_provider("mock")

    document = asyncio.run(provider.generate("重力反转", level_id="lab-01", locale="zh-CN"))

    # "keywords" is routing metadata; the IR schema forbids unknown fields.
    assert "keywords" not in document


def test_deepseek_without_a_key_is_refused_at_construction():
    # conftest removes DEEPSEEK_API_KEY, so building the provider must fail
    # loudly rather than silently degrading to mock.
    with pytest.raises(ValueError):
        get_provider("deepseek")


def test_unknown_provider_is_rejected():
    with pytest.raises(ValueError):
        get_provider("gemini")