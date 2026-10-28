"""Targeted probe: do the two known-failing prompts behave consistently?

The 3x sample showed zero verdict flips, but it did not include the two prompts
that failed the full run, so it cannot speak for them. This probes them directly:
one looks like an infrastructure truncation, the other like a model miss — and
those two have very different implications.
"""

import asyncio
import statistics
import time

from app.compiler import RuleCompiler, parse_ir
from app.providers import get_provider
from app.services.levels import SUPPORTED_LEVELS

CASES = [
    ("k36", "当玩家血量大于 3 时，获得护盾"),
    ("b28", "落地时重力反转"),
]

REPEATS = 8


async def main() -> None:
    provider = get_provider("deepseek")
    compiler = RuleCompiler()
    level = SUPPORTED_LEVELS["lab-01"]

    for case_id, prompt in CASES:
        statuses: list[str] = []
        latencies: list[int] = []

        for _ in range(REPEATS):
            started = time.perf_counter()
            try:
                document = await provider.generate(prompt, level_id="lab-01", locale="zh-CN")
                latency = int((time.perf_counter() - started) * 1000)
                result = compiler.compile(parse_ir(document), level=level)
                status = "ready" if result.ok else document.get("status", "rejected")
            except Exception as error:  # noqa: BLE001 - the error kind is the data
                latency = int((time.perf_counter() - started) * 1000)
                status = f"error:{type(error).__name__}"

            statuses.append(status)
            latencies.append(latency)

        counts: dict[str, int] = {}
        for status in statuses:
            counts[status] = counts.get(status, 0) + 1

        print(f"[{case_id}] {prompt}")
        print(f"  outcomes: {counts}")
        print(f"  stable: {len(counts) == 1}")
        print(f"  latency median {int(statistics.median(latencies))}ms max {max(latencies)}ms")


if __name__ == "__main__":
    asyncio.run(main())
