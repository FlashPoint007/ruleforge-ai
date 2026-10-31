"""SQLite repositories.

Development storage. The schema mirrors spec section 6.3; the abstraction above
means Firestore can replace this without touching services.

Immutability is enforced by the schema, not by convention: `content_hash` is
unique and inserts use INSERT OR IGNORE, so a pack id can never be overwritten
with different content.
"""

import json
import sqlite3
import threading
from pathlib import Path

from app.domain.models import (
    Challenge,
    GenerationRecord,
    RulePack,
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS rule_packs (
    pack_id        TEXT PRIMARY KEY,
    owner_id       TEXT NOT NULL,
    dsl_version    TEXT NOT NULL,
    engine_version TEXT NOT NULL,
    level_id       TEXT NOT NULL,
    level_version  TEXT NOT NULL,
    content_json   TEXT NOT NULL,
    content_hash   TEXT NOT NULL,
    created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges (
    challenge_id   TEXT PRIMARY KEY,
    owner_id       TEXT NOT NULL,
    pack_id        TEXT NOT NULL REFERENCES rule_packs(pack_id),
    level_id       TEXT NOT NULL,
    level_version  TEXT NOT NULL,
    engine_version TEXT NOT NULL,
    dsl_version    TEXT NOT NULL,
    seed           INTEGER NOT NULL,
    visibility     TEXT NOT NULL,
    created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generation_requests (
    request_id     TEXT PRIMARY KEY,
    anonymous_id   TEXT NOT NULL,
    provider       TEXT NOT NULL,
    model          TEXT NOT NULL,
    status         TEXT NOT NULL,
    latency_ms     INTEGER NOT NULL,
    prompt_length  INTEGER NOT NULL,
    prompt_hash    TEXT NOT NULL,
    error_code     TEXT,
    created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_day
    ON generation_requests (anonymous_id, created_at);
CREATE INDEX IF NOT EXISTS idx_challenges_visibility
    ON challenges (visibility, created_at);
"""


def _resolve_path(database_url: str) -> str:
    """Turns the configured sqlite URL into a filesystem path."""
    prefix = "sqlite+aiosqlite:///"
    if database_url.startswith(prefix):
        raw = database_url[len(prefix) :]
    elif database_url.startswith("sqlite:///"):
        raw = database_url[len("sqlite:///") :]
    else:
        raw = database_url
    return raw


class SqliteDatabase:
    """Owns the connection and the schema.

    Uses the stdlib driver synchronously: this is local development storage and
    the queries are trivial. Moving to aiosqlite belongs with the Firestore work,
    not before it.
    """

    def __init__(self, database_url: str) -> None:
        self.path = _resolve_path(database_url)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(self.path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        # FastAPI runs sync endpoints in a thread pool, so several requests can
        # reach this one connection at once. sqlite3 serialises individual calls
        # but not a read-modify-write sequence, so the writes are locked here.
        self._lock = threading.Lock()
        self._connection.executescript(SCHEMA)
        self._connection.commit()

    @property
    def connection(self) -> sqlite3.Connection:
        return self._connection

    @property
    def lock(self) -> threading.Lock:
        return self._lock

    def close(self) -> None:
        self._connection.close()


class SqliteRulePackRepository:
    def __init__(self, database: SqliteDatabase) -> None:
        self._db = database

    def save_pack(self, pack: RulePack, *, owner_id: str, created_at: str) -> str:
        content = pack.model_dump(mode="json")
        content_json = json.dumps(content, sort_keys=True, separators=(",", ":"))
        content_hash = _sha256(content_json)

        # INSERT OR IGNORE: an existing pack_id keeps its original content. A
        # later attempt to store different content under the same id is refused
        # by the primary key rather than silently overwriting a shared link.
        with self._db.lock:
            self._db.connection.execute(
            """
            INSERT OR IGNORE INTO rule_packs (
                pack_id, owner_id, dsl_version, engine_version,
                level_id, level_version, content_json, content_hash, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    pack.packId,
                    owner_id,
                    pack.dslVersion,
                    pack.engineVersion,
                    pack.levelId,
                    pack.levelVersion,
                    content_json,
                    content_hash,
                    created_at,
                ),
            )
            self._db.connection.commit()
        return pack.packId

    def get_pack(self, pack_id: str) -> RulePack | None:
        row = self._db.connection.execute(
            "SELECT content_json FROM rule_packs WHERE pack_id = ?", (pack_id,)
        ).fetchone()
        if row is None:
            return None
        return RulePack.model_validate(json.loads(row["content_json"]))

    def get_content_hash(self, pack_id: str) -> str | None:
        row = self._db.connection.execute(
            "SELECT content_hash FROM rule_packs WHERE pack_id = ?", (pack_id,)
        ).fetchone()
        return None if row is None else row["content_hash"]


class SqliteChallengeRepository:
    def __init__(self, database: SqliteDatabase) -> None:
        self._db = database

    def save_challenge(self, challenge: Challenge) -> str:
        # The embedded pack is stored once in rule_packs; the challenge references
        # it by id so a challenge row can never disagree with its pack.
        self._db.connection.execute(
            """
            INSERT OR IGNORE INTO challenges (
                challenge_id, owner_id, pack_id, level_id, level_version,
                engine_version, dsl_version, seed, visibility, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                challenge.challengeId,
                challenge.ownerId,
                challenge.packId,
                challenge.levelId,
                challenge.levelVersion,
                challenge.engineVersion,
                challenge.dslVersion,
                challenge.seed,
                challenge.visibility,
                challenge.createdAt,
            ),
        )
        self._db.connection.commit()
        return challenge.challengeId

    def get_challenge(self, challenge_id: str) -> Challenge | None:
        row = self._db.connection.execute(
            """
            SELECT c.*, p.content_json
            FROM challenges c
            JOIN rule_packs p ON p.pack_id = c.pack_id
            WHERE c.challenge_id = ?
            """,
            (challenge_id,),
        ).fetchone()
        if row is None:
            return None

        return Challenge(
            challengeId=row["challenge_id"],
            ownerId=row["owner_id"],
            packId=row["pack_id"],
            levelId=row["level_id"],
            levelVersion=row["level_version"],
            engineVersion=row["engine_version"],
            dslVersion=row["dsl_version"],
            seed=row["seed"],
            visibility=row["visibility"],
            createdAt=row["created_at"],
            rulePack=RulePack.model_validate(json.loads(row["content_json"])),
        )

    def list_public(self, *, limit: int = 20) -> list[Challenge]:
        rows = self._db.connection.execute(
            """
            SELECT c.*, p.content_json
            FROM challenges c
            JOIN rule_packs p ON p.pack_id = c.pack_id
            WHERE c.visibility = 'public'
            ORDER BY c.created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

        return [
            Challenge(
                challengeId=row["challenge_id"],
                ownerId=row["owner_id"],
                packId=row["pack_id"],
                levelId=row["level_id"],
                levelVersion=row["level_version"],
                engineVersion=row["engine_version"],
                dslVersion=row["dsl_version"],
                seed=row["seed"],
                visibility=row["visibility"],
                createdAt=row["created_at"],
                rulePack=RulePack.model_validate(json.loads(row["content_json"])),
            )
            for row in rows
        ]


class SqliteGenerationLogRepository:
    def __init__(self, database: SqliteDatabase) -> None:
        self._db = database

    def record(self, entry: GenerationRecord) -> None:
        self._db.connection.execute(
            """
            INSERT OR REPLACE INTO generation_requests (
                request_id, anonymous_id, provider, model, status, latency_ms,
                prompt_length, prompt_hash, error_code, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                entry.requestId,
                entry.anonymousId,
                entry.provider,
                entry.model,
                entry.status,
                entry.latencyMs,
                entry.promptLength,
                entry.promptHash,
                entry.errorCode,
                entry.createdAt,
            ),
        )
        self._db.connection.commit()

    def count_for_day(self, anonymous_id: str, day: str) -> int:
        row = self._db.connection.execute(
            """
            SELECT COUNT(*) AS n FROM generation_requests
            WHERE anonymous_id = ? AND created_at LIKE ?
            """,
            (anonymous_id, f"{day}%"),
        ).fetchone()
        return int(row["n"])


def _sha256(value: str) -> str:
    import hashlib

    return hashlib.sha256(value.encode("utf-8")).hexdigest()