"""Rule generation service: provider -> compiler -> response.

This is the only place that knows both about providers and about compilation.
The API layer stays thin; the compiler stays provider-agnostic.
"""

from app.compiler import RuleCompiler, parse_ir
from app.domain.models import (
    CompileResult,
    GenerateRuleResponse,
    LevelCapabilities,
    ValidationReport,
)
from app.providers import LLMProvider

SUPPORTED_LEVELS: dict[str, LevelCapabilities] = {
    "lab-01": LevelCapabilities(
        levelId="lab-01",
        levelVersion="1.8.0",
        hasEnemies=True,
        hasCoins=True,
        collapsiblePlatforms=2,
        hideablePlatforms=["bridge-1"],
        checkpoints=["mid-1", "end-1"],
        enemySpawnPoints=2,
        coinSpawnPoints=3,
    ),
}


class UnknownLevelError(Exception):
    """Raised when a request names a level the server does not know."""

    def __init__(self, level_id: str) -> None:
        self.level_id = level_id
        super().__init__(f"unknown level: {level_id}")


class RuleGenerationService:
    def __init__(self, provider: LLMProvider, compiler: RuleCompiler | None = None) -> None:
        self._provider = provider
        self._compiler = compiler or RuleCompiler()

    @staticmethod
    def levels() -> list[LevelCapabilities]:
        return list(SUPPORTED_LEVELS.values())

    def level(self, level_id: str) -> LevelCapabilities:
        capabilities = SUPPORTED_LEVELS.get(level_id)
        if capabilities is None:
            raise UnknownLevelError(level_id)
        return capabilities

    async def generate(
        self, *, request_id: str, prompt: str, level_id: str, locale: str, seed: int = 0
    ) -> GenerateRuleResponse:
        level = self.level(level_id)

        raw = await self._provider.generate(prompt, level_id=level_id, locale=locale)

        try:
            document = parse_ir(raw)
        except Exception as error:  # noqa: BLE001 - shape errors become a report
            report = ValidationReport(
                errors=[f"provider returned an unusable IR document: {error}"]
            )
            return GenerateRuleResponse(
                requestId=request_id,
                status="validation_failed",
                explanation="模型返回的结构不符合 IR Schema。",
                validation=report,
            )

        result: CompileResult = self._compiler.compile(document, level=level, seed=seed)

        if result.ok and result.pack is not None:
            return GenerateRuleResponse(
                requestId=request_id,
                status="ready",
                rulePack=result.pack,
                explanation=result.explanation,
                warnings=result.warnings,
                validation=result.report,
            )

        # An explicit refusal from the model is not a validation failure: the
        # model understood the request and said it cannot be expressed.
        if document.status == "unsupported":
            return GenerateRuleResponse(
                requestId=request_id,
                status="unsupported",
                explanation=result.explanation,
                warnings=result.warnings,
                validation=result.report,
            )

        return GenerateRuleResponse(
            requestId=request_id,
            status="validation_failed",
            explanation=result.explanation,
            warnings=result.warnings,
            validation=result.report,
        )