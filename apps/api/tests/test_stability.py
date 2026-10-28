"""Stability measurement guards.

The stability numbers are what let the project say "the model behaves consistently".
A bug in that maths would produce a confident, wrong claim, so the arithmetic is
tested directly on synthetic runs.
"""

from eval.run_eval import CaseResult, build_stability, stratified_sample


def result(prompt_id: str, category: str, status: str, passed: bool) -> CaseResult:
    return CaseResult(
        prompt_id=prompt_id,
        category=category,
        prompt="x",
        expected="ready",
        compiled_status=status,
        passed=passed,
    )


CASES = [
    {"id": "a", "category": "simple", "prompt": "x", "expect": "ready"},
    {"id": "b", "category": "simple", "prompt": "x", "expect": "ready"},
]


def test_identical_runs_report_zero_flips():
    runs = [
        [result("a", "simple", "ready", True), result("b", "simple", "rejected", False)],
        [result("a", "simple", "ready", True), result("b", "simple", "rejected", False)],
    ]

    stability = build_stability(CASES, runs)

    assert stability["verdictFlipRate"] == 0.0
    assert stability["alwaysPassed"] == 1
    assert stability["neverPassed"] == 1
    assert stability["flaky"] == 0
    assert stability["passRateSpread"] == 0.0


def test_a_status_change_is_counted_as_unstable():
    runs = [
        [result("a", "simple", "ready", True), result("b", "simple", "ready", True)],
        [result("a", "simple", "error", False), result("b", "simple", "ready", True)],
    ]

    stability = build_stability(CASES, runs)

    assert stability["verdictFlipRate"] == 0.5
    assert stability["flaky"] == 1
    assert stability["alwaysPassed"] == 1
    assert len(stability["unstableCases"]) == 1
    assert stability["unstableCases"][0]["promptId"] == "a"


def test_pass_rate_spread_reflects_run_totals():
    runs = [
        [result("a", "simple", "ready", True), result("b", "simple", "ready", True)],
        [result("a", "simple", "ready", True), result("b", "simple", "error", False)],
    ]

    stability = build_stability(CASES, runs)

    assert stability["passRatePerRun"] == [1.0, 0.5]
    assert stability["passRateSpread"] == 0.5


def test_stratified_sample_keeps_every_category():
    corpus = [{"id": f"{c}-{i}", "category": c} for c in ("a", "b", "c") for i in range(10)]

    sample = stratified_sample(corpus, 9)

    categories = {case["category"] for case in sample}
    # A category dropped from the sample would look perfectly stable because
    # nothing was measured in it.
    assert categories == {"a", "b", "c"}
    assert len(sample) <= 9


def test_stratified_sample_spreads_across_the_category():
    corpus = [{"id": f"a-{i}", "category": "a"} for i in range(20)]

    sample = stratified_sample(corpus, 5)

    ids = [case["id"] for case in sample]
    # Taking the first five would sample only the earliest variants.
    assert ids == ["a-0", "a-4", "a-8", "a-12", "a-16"]


def test_sample_larger_than_corpus_returns_everything():
    corpus = [{"id": "a-0", "category": "a"}]

    assert stratified_sample(corpus, 10) == corpus
