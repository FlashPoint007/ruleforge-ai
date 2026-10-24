import asyncio

import pytest

from app.providers import DeepSeekLLMProvider, MockLLMProvider, get_provider


def test_mock_provider_is_returned_by_default():
    provider = get_provider("mock")

    assert isinstance(provider, MockLLMProvider)
    assert provider.name == "mock"


def test_provider_lookup_is_case_insensitive():
    assert isinstance(get_provider(" MOCK "), MockLLMProvider)


def test_deepseek_provider_is_declared_but_not_implemented():
    provider = get_provider("deepseek")

    assert isinstance(provider, DeepSeekLLMProvider)


def test_mock_provider_is_deterministic_and_offline():
    provider = get_provider("mock")

    first = asyncio.run(provider.generate("jump flips gravity", level_id="lab-01", locale="zh-CN"))
    second = asyncio.run(provider.generate("jump flips gravity", level_id="lab-01", locale="zh-CN"))

    assert first == second
    assert first["provider"] == "mock"
    assert first["rules"] == []


def test_deepseek_provider_fails_loudly():
    provider = get_provider("deepseek")

    with pytest.raises(NotImplementedError):
        asyncio.run(provider.generate("anything", level_id="lab-01", locale="zh-CN"))


def test_unknown_provider_is_rejected():
    with pytest.raises(ValueError):
        get_provider("gemini")
