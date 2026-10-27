"""Guards for the evaluation harness itself.

The harness is measurement code, so it must be trustworthy: a broken runner would
report a confident, wrong number. These tests run it offline against the mock
provider and check the bookkeeping, not the model's quality.
"""

import asyncio
import json
from pathlib import Path

import pytest

from eval.run_eval import load_corpus, run

REPORT_DIR = Path(__file__).resolve().parents[3] / "tests" / "eval" / "reports"


def test_corpus_was_generated_not_hand_edited():
    """The JSON must match what the generator produces.

    Hand-editing the corpus would let the counts drift from the categories the
    spec requires, which is exactly what the generator's assert prevents.
    """
    import subprocess
    import sys

    generator = Path(__file__).resolve().parents[3] / "tests" / "eval" / "generate_corpus.py"
    before = (Path(__file__).resolve().parents[3] / "tests" / "eval" / "prompts.json").read_text(
        encoding="utf-8"
    )

    subprocess.run([sys.executable, str(generator)], check=True, capture_output=True)

    after = (Path(__file__).resolve().parents[3] / "tests" / "eval" / "prompts.json").read_text(
        encoding="utf-8"
    )
    assert before == after, "prompts.json is out of sync with generate_corpus.py"


def test_corpus_has_the_five_required_categories():
    corpus = load_corpus()
    counts: dict[str, int] = {}
    for case in corpus["prompts"]:
        counts[case["category"]] = counts.get(case["category"], 0) + 1

    assert counts == {
        "simple": 60,
        "combined": 90,
        "conditional": 60,
        "rejected": 60,
        "bilingual": 30,
    }
    assert len(corpus["prompts"]) == 300


def test_every_case_declares_a_prompt_and_an_expectation():
    corpus = load_corpus()
    ids = set()

    for case in corpus["prompts"]:
        assert case["id"] not in ids, f"duplicate prompt id {case['id']}"
        ids.add(case["id"])
        assert case["prompt"].strip()
        assert case["expect"] in {"ready", "rejected"}


def test_bilingual_cases_have_an_english_twin():
    corpus = load_corpus()
    pairs = corpus["englishPairs"]

    for case in corpus["prompts"]:
        if case["category"] != "bilingual":
            continue
        assert case["pair"] in pairs, f"{case['id']} has no English pair"
        assert pairs[case["pair"]].strip()


def test_report_shape_matches_the_spec_fields():
    corpus = load_corpus()
    report = asyncio.run(run("mock", limit=3))

    assert report["corpusVersion"] == corpus["version"]
    for key in ("provider", "model", "totals", "byCategory", "results"):
        assert key in report

    for entry in report["results"]:
        # Spec 9.2 names the recorded fields.
        for field in (
            "promptId",
            "expected",
            "generatedStatus",
            "compiledStatus",
            "latencyMs",
            "model",
            "errors",
        ):
            assert field in entry


def test_a_ready_case_without_rules_cannot_pass():
    """The pass rule must not be satisfiable by an empty pack."""
    report = asyncio.run(run("mock", limit=2))

    for entry in report["results"]:
        if entry["expected"] == "ready" and entry["ruleCount"] == 0:
            assert entry["passed"] is False


def test_rejection_cases_only_pass_when_nothing_compiles():
    report = asyncio.run(run("mock"))
    rejections = [r for r in report["results"] if r["expected"] == "rejected"]

    assert rejections
    for entry in rejections:
        if entry["passed"]:
            assert entry["compiledStatus"] != "ready"


def test_totals_are_internally_consistent():
    report = asyncio.run(run("mock", limit=5))
    totals = report["totals"]

    assert totals["cases"] == len(report["results"])
    assert totals["passed"] == sum(1 for r in report["results"] if r["passed"])
    assert totals["inScopeCases"] + totals["rejectionCases"] == totals["cases"]


def test_committed_reports_are_valid_json():
    """A report checked into the repo must remain readable."""
    for path in REPORT_DIR.glob("report-*.json"):
        json.loads(path.read_text(encoding="utf-8"))


@pytest.mark.parametrize("provider", ["mock"])
def test_writes_a_report_file(provider, tmp_path):
    out = tmp_path / "report.json"
    report = asyncio.run(run(provider, limit=2))
    out.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")

    assert out.is_file()
    assert json.loads(out.read_text(encoding="utf-8"))["totals"]["cases"] == 2