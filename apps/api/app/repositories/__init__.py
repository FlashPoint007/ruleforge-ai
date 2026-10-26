"""Storage abstraction.

Services depend on the protocols in interfaces.py; sqlite.py is the development
implementation. Firestore replaces it without touching the application layer.
"""

from app.repositories.interfaces import (
    ChallengeRepository,
    GenerationLogRepository,
    RulePackRepository,
)
from app.repositories.sqlite import (
    SqliteChallengeRepository,
    SqliteDatabase,
    SqliteGenerationLogRepository,
    SqliteRulePackRepository,
)

__all__ = [
    "ChallengeRepository",
    "GenerationLogRepository",
    "RulePackRepository",
    "SqliteChallengeRepository",
    "SqliteDatabase",
    "SqliteGenerationLogRepository",
    "SqliteRulePackRepository",
]
