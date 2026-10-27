"""The 50-prompt evaluation runner (spec 9.2).

Two modes, deliberately:
- `--provider mock` runs offline and asserts the harness itself is correct
  (routing, compilation, rejection). It is what CI runs.
- `--provider deepseek` measures the real model. It costs quota, so it is manual.

The runner never mutates the corpus to make a run pass: a prompt that fails is
recorded as a failure, because the point of the exercise is the number.
"""

import argparse
import asyncio
import json
import statistics
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.compiler import RuleCompiler, parse_ir
from app.domain.models import LevelCapabilities
from app.providers import MockLLMProvider, get_provider
from app.services.levels import SUPPORTED_LEVELS


def _repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "tests" / "eval" / "prompts.json").is_file():
            return parent
    raise RuntimeError("tests/eval/prompts.json not found; run from the repository")


CORPUS = _repo_root() / "tests" / "eval" / "prompts.json"
REPORT_DIR = _repo_root() / "tests" / "eval" / "reports"


@dataclass
class CaseResult:
    prompt_id: str
    category: str
    prompt: str
    expected: str
    generated_status: str = ""
    compiled_status: str = ""
    passed: bool = False
    reasons: list[str] = field(default_factory=list)
    ops: list[str] = field(default_factory=list)
    rule_count: int = 0
    has_condition: bool = False
    has_duration: bool = False
    latency_ms: int = 0
    token_usage: int = 0
    model: str = ""
    errors: list[str] = field(default_factory=list)


def load_corpus() -> dict[str, Any]:
    return json.loads(CORPUS.read_text(encoding="utf-8"))


def level_for(prompt_case: dict[str, Any]) -> LevelCapabilities:
    # Both MVP levels support the full vocabulary; use the default.
    return SUPPORTED_LEVELS["lab-01"]


def normalise_ir(pack: Any) -> dict[str, Any]:
    """Reduces a compiled pack to the parts that must match across languages.

    Natural-language explanations are excluded on purpose: spec 9.2 says wording
    does not have to agree, only the action/condition structure.
    """
    rules = []
    for rule in pack.rules:
        rules.append(
            {
                "event": rule.trigger.event,
                "actions": sorted(action.op for action in rule.actions),
                "conditionCount": len(rule.conditions),
            }
        )
    return {"rules": sorted(rules, key=lambda item: (item["event"], tuple(item["actions"])))}


def evaluate_case(
    case: dict[str, Any],
    *,
    document: dict[str, Any],
    compiled: Any,
    latency_ms: int,
    model: str,
    token_usage: int = 0,
) -> CaseResult:
    result = CaseResult(
        prompt_id=case["id"],
        category=case["category"],
        prompt=case["prompt"],
        expected=case["expect"],
        latency_ms=latency_ms,
        model=model,
        token_usage=token_usage,
    )

    result.generated_status = document.get("status", "?")
    if compiled.ok:
        result.compiled_status = "ready"
    elif document.get("status") == "unsupported":
        result.compiled_status = "unsupported"
    else:
        result.compiled_status = "rejected"

    if not compiled.ok:
        result.errors = list(compiled.report.errors)

    if compiled.ok and compiled.pack is not None:
        pack = compiled.pack
        result.ops = [action.op for rule in pack.rules for action in rule.actions]
        result.rule_count = len(pack.rules)
        result.has_condition = any(rule.conditions for rule in pack.rules)
        result.has_duration = any(
            "durationMs" in action.params or "delayMs" in action.params
            for rule in pack.rules
            for action in rule.actions
        )

    # --- verdict ---
    if case["expect"] == "ready":
        if result.compiled_status != "ready":
            result.reasons.append(f"expected ready, got {result.compiled_status}")
        else:
            expected_ops = case.get("expectOps")
            if expected_ops:
                missing = sorted(set(expected_ops) - set(result.ops))
                if missing:
                    result.reasons.append(f"missing expected op(s): {missing}")

            min_rules = case.get("minRules")
            if min_rules and result.rule_count < min_rules:
                result.reasons.append(f"expected >= {min_rules} rules, got {result.rule_count}")

            if case.get("needsCondition") and not result.has_condition:
                result.reasons.append("expected a condition, got none")

            if case.get("needsDuration") and not result.has_duration:
                result.reasons.append("expected a duration parameter, got none")
    else:
        # A rejection case passes only if nothing executable came back.
        if result.compiled_status == "ready":
            result.reasons.append("expected a refusal, but the rule compiled")

    result.passed = not result.reasons
    return result


async def run(provider_name: str, *, limit: int | None = None) -> dict[str, Any]:
    corpus = load_corpus()
    cases = corpus["prompts"][:limit] if limit else corpus["prompts"]

    if provider_name == "mock":
        provider = MockLLMProvider()
        model = "mock"
    else:
        provider = get_provider(provider_name)
        model = getattr(provider, "_model", provider_name)

    compiler = RuleCompiler()
    results: list[CaseResult] = []

    for case in cases:
        started = time.perf_counter()
        try:
            document = await provider.generate(
                case["prompt"], level_id="lab-01", locale="zh-CN"
            )
            latency_ms = int((time.perf_counter() - started) * 1000)
            parsed = parse_ir(document)
            compiled = compiler.compile(parsed, level=level_for(case))
            results.append(
                evaluate_case(
                    case,
                    document=document,
                    compiled=compiled,
                    latency_ms=latency_ms,
                    model=model,
                )
            )
        except Exception as error:  # noqa: BLE001 - a crash is a data point
            latency_ms = int((time.perf_counter() - started) * 1000)
            results.append(
                CaseResult(
                    prompt_id=case["id"],
                    category=case["category"],
                    prompt=case["prompt"],
                    expected=case["expect"],
                    compiled_status="error",
                    reasons=[f"runner error: {error}"],
                    latency_ms=latency_ms,
                    model=model,
                    errors=[str(error)],
                )
            )

    return build_report(corpus, results, provider_name, model)


def build_report(
    corpus: dict[str, Any], results: list[CaseResult], provider_name: str, model: str
) -> dict[str, Any]:
    in_scope = [r for r in results if r.expected == "ready"]
    passed_in_scope = [r for r in in_scope if r.passed]
    rejected_cases = [r for r in results if r.expected != "ready"]
    passed_rejections = [r for r in rejected_cases if r.passed]

    latencies = sorted(r.latency_ms for r in results)
    p95 = latencies[min(len(latencies) - 1, int(len(latencies) * 0.95))] if latencies else 0

    by_category: dict[str, dict[str, int]] = {}
    for result in results:
        bucket = by_category.setdefault(result.category, {"total": 0, "passed": 0})
        bucket["total"] += 1
        bucket["passed"] += 1 if result.passed else 0

    return {
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "provider": provider_name,
        "model": model,
        "corpusVersion": corpus.get("version", "?"),
        "totals": {
            "cases": len(results),
            "passed": sum(1 for r in results if r.passed),
            "inScopeCases": len(in_scope),
            "inScopePassed": len(passed_in_scope),
            "inScopeRate": round(len(passed_in_scope) / len(in_scope), 4) if in_scope else 0.0,
            "rejectionCases": len(rejected_cases),
            "rejectionPassed": len(passed_rejections),
            "p95LatencyMs": p95,
            "medianLatencyMs": int(statistics.median(latencies)) if latencies else 0,
        },
        "byCategory": by_category,
        "results": [
            {
                "promptId": r.prompt_id,
                "category": r.category,
                "prompt": r.prompt,
                "expected": r.expected,
                "generatedStatus": r.generated_status,
                "compiledStatus": r.compiled_status,
                "passed": r.passed,
                "reasons": r.reasons,
                "ops": r.ops,
                "ruleCount": r.rule_count,
                "hasCondition": r.has_condition,
                "hasDuration": r.has_duration,
                "latencyMs": r.latency_ms,
                "model": r.model,
                "errors": r.errors,
            }
            for r in results
        ],
    }


def _safe_console() -> None:
    """Makes stdout tolerate CJK on a non-UTF-8 console."""
    import contextlib
    import sys

    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            with contextlib.suppress(ValueError, OSError):
                reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    _safe_console()
    parser = argparse.ArgumentParser(description="Run the 50-prompt evaluation set")
    parser.add_argument("--provider", default="mock", choices=["mock", "deepseek"])
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    report = asyncio.run(run(args.provider, limit=args.limit))

    target = Path(args.out) if args.out else REPORT_DIR / f"report-{args.provider}.json"
    # The reports directory does not exist on a fresh checkout.
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    totals = report["totals"]
    print(f"provider={report['provider']} model={report['model']}")
    print(f"cases={totals['cases']} passed={totals['passed']}")
    rate = f"{totals['inScopeRate']:.1%}"
    print(f"in-scope: {totals['inScopePassed']}/{totals['inScopeCases']} = {rate}")
    print(f"rejections: {totals['rejectionPassed']}/{totals['rejectionCases']}")
    print(f"p95={totals['p95LatencyMs']}ms median={totals['medianLatencyMs']}ms")
    print(f"report -> {target}")

    failures = [r for r in report["results"] if not r["passed"]]
    if failures:
        print("\nfailures:")
        for failure in failures:
            prompt = failure["prompt"][:40]
            reasons = ", ".join(failure["reasons"])
            print(f"  [{failure['promptId']}] {prompt} -> {reasons}")


if __name__ == "__main__":
    main()