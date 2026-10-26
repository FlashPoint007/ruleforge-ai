"""Rule IR and compiled RulePack models.

Two stages on purpose (spec section 4.2): the model emits loose Rule IR, and the
compiler turns it into a complete, versioned RulePack. Only the compiled pack is
executable by the client.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AtomicCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: str
    fact: str
    value: float | int | bool | str


class GroupCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    all: list["ConditionNode"] | None = None
    any: list["ConditionNode"] | None = None


ConditionNode = AtomicCondition | GroupCondition


class RuleAction(BaseModel):
    """A single registered operation with bounded parameters."""

    model_config = ConfigDict(extra="forbid")

    op: str
    target: str
    params: dict[str, float | int | bool | str] = Field(default_factory=dict)


class RuleTrigger(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event: str


class RuleIR(BaseModel):
    """One rule as the model emits it: ids and defaults may be missing."""

    model_config = ConfigDict(extra="forbid")

    id: str | None = None
    trigger: RuleTrigger
    conditions: list[ConditionNode] = Field(default_factory=list)
    actions: list[RuleAction]


class Rule(BaseModel):
    """One rule as the client executes it: every field present."""

    model_config = ConfigDict(extra="forbid")

    id: str
    trigger: RuleTrigger
    conditions: list[ConditionNode]
    actions: list[RuleAction]


class RulePack(BaseModel):
    """The compiled, executable pack. This is what the client consumes."""

    model_config = ConfigDict(extra="forbid")

    dslVersion: str
    engineVersion: str
    packId: str
    levelId: str
    levelVersion: str
    seed: int
    rules: list[Rule]


class RuleIRDocument(BaseModel):
    """The provider's whole answer, including refusals."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["ok", "unsupported"]
    rules: list[RuleIR] = Field(default_factory=list)
    explanation: str = ""
    warnings: list[str] = Field(default_factory=list)


class ValidationReport(BaseModel):
    """The five validation layers, each reported separately."""

    model_config = ConfigDict(extra="forbid")

    schemaOk: bool = False
    typeOk: bool = False
    semanticOk: bool = False
    conflictOk: bool = False
    levelCompatible: bool = False
    errors: list[str] = Field(default_factory=list)


class CompileResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool
    pack: RulePack | None = None
    report: ValidationReport
    explanation: str = ""
    warnings: list[str] = Field(default_factory=list)


class GenerateRuleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestId: str = Field(min_length=1, max_length=64)
    prompt: str = Field(min_length=1, max_length=500)
    levelId: str = Field(min_length=1, max_length=64)
    locale: str = Field(default="zh-CN", max_length=16)
    existingPackId: str | None = None
    dslVersion: str = "1.1.0"


class GenerateRuleResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestId: str
    status: Literal["ready", "unsupported", "validation_failed", "upstream_error"]
    rulePack: RulePack | None = None
    explanation: str = ""
    warnings: list[str] = Field(default_factory=list)
    validation: ValidationReport = Field(default_factory=ValidationReport)


class LevelCapabilities(BaseModel):
    """What a level can actually support. Drives level-compatibility checks."""

    model_config = ConfigDict(extra="forbid")

    levelId: str
    levelVersion: str
    hasEnemies: bool = False
    hasCoins: bool = False
    collapsiblePlatforms: int = 0
    hideablePlatforms: list[str] = Field(default_factory=list)
    checkpoints: list[str] = Field(default_factory=list)
    enemySpawnPoints: int = 0
    coinSpawnPoints: int = 0
