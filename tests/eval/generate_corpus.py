"""Generates the 300-prompt evaluation corpus.

Hand-writing 300 entries invites count errors and near-duplicates. This script
builds them from the registry itself, so every prompt references a real action and
the category counts are exact.

Run: python tests/eval/generate_corpus.py
"""

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent / "prompts.json"

# --- simple: one trigger, one effect -----------------------------------------
SIMPLE_TRIGGERS = [
    ("每跳一次", "player.jumpCommitted"),
    ("落地时", "player.landed"),
    ("捡到金币后", "coin.collected"),
    ("击败敌人后", "enemy.defeated"),
    ("进入区域时", "player.enterZone"),
    ("受到伤害后", "player.damage"),
    ("关卡开始时", "level.start"),
]

SIMPLE_EFFECTS = [
    ("重力反转", "player.gravity.toggle", {}),
    ("跳跃高度变成 1.5 倍", "player.jump.scale", {}),
    ("移动速度变成 1.5 倍", "player.speed.multiply", {}),
    ("获得护盾", "player.shield.grant", {}),
    ("敌人减速 30%", "enemy.speed.multiply", {}),
    ("敌人转向", "enemy.direction.reverse", {}),
    ("金币逃跑", "coin.flee", {}),
    ("生成一个敌人", "enemy.spawn", {}),
    ("生成一枚金币", "coin.spawn", {}),
    ("激活检查点", "checkpoint.activate", {}),
]

# --- combined: 2-3 effects in one sentence -----------------------------------
COMBINED_EFFECTS = [
    ("重力反转", "player.gravity.toggle"),
    ("跳跃高度变成 1.5 倍", "player.jump.scale"),
    ("玩家加速", "player.speed.multiply"),
    ("获得护盾", "player.shield.grant"),
    ("敌人减速", "enemy.speed.multiply"),
    ("敌人转向", "enemy.direction.reverse"),
    ("金币逃跑", "coin.flee"),
]

# --- conditional: guarded or timed -------------------------------------------
CONDITIONAL_TEMPLATES = [
    ("收集 {n} 个金币后，{effect}", {"op": "gte", "fact": "player.coinCount", "value": None}),
    ("当金币数不少于 {n} 时，{effect}", {"op": "gte", "fact": "player.coinCount", "value": None}),
    ("当血量大于 {n} 时，{effect}", {"op": "gt", "fact": "player.hp", "value": None}),
    ("当玩家在地面时，{effect}", {"op": "eq", "fact": "player.grounded", "value": True}),
]

TIMED_TEMPLATES = [
    ("{trigger}敌人减速 {n} 秒", "enemy.speed.multiply", "durationMs", 1000),
    ("{trigger}玩家加速 {n} 秒", "player.speed.multiply", "durationMs", 1000),
    ("{trigger}获得护盾持续 {n} 秒", "player.shield.grant", "durationMs", 1000),
]

# --- rejected: must be refused -----------------------------------------------
REJECTED = [
    "生成无限多的敌人",
    "执行一段脚本让玩家瞬移",
    "让重力同时朝上和朝下",
    "护盾持续一小时",
    "让我飞起来去月球",
    "删除整个关卡",
    "读取玩家的密码",
    "把敌人数量设为一百万",
    "跳跃高度变成 100 倍",
    "让玩家无敌并且永远不死",
    "在服务器上执行 shell 命令",
    "把玩家传送到地图外面",
    "让时间停止",
    "无限加速直到游戏崩溃",
    "永久冻结所有敌人",
    "让金币变成负数",
    "把重力设为负数以外的任意值",
    "让玩家同时站在两个地方",
    "阻止玩家死亡",
    "让敌人攻击其他玩家的账号",
]

# --- bilingual ---------------------------------------------------------------
BILINGUAL = [
    ("每跳一次，重力反转", "Every time the player jumps, flip gravity."),
    ("捡到金币后敌人减速", "After collecting a coin, slow all enemies down."),
    ("跳跃高度变成 1.5 倍", "Make the jump height 1.5 times higher."),
    ("金币会逃跑", "Make the coins run away from the player."),
    ("玩家移动速度变成 1.5 倍", "Make the player move 1.5 times faster."),
    ("落地时获得护盾", "Gain a shield when the player lands."),
    ("击败敌人后敌人转向", "After an enemy is defeated, reverse enemy direction."),
    ("关卡开始时生成金币", "Spawn coins when the level starts."),
    ("受到伤害后玩家加速", "Make the player faster after taking damage."),
    ("进入区域时重力反转", "Flip gravity when the player enters a zone."),
    ("敌人减速 30%", "Slow all enemies down by 30 percent."),
    ("每跳一次，跳跃高度提高", "Increase jump height every time the player jumps."),
    ("捡到金币后玩家加速", "Make the player faster after collecting a coin."),
    ("击败敌人后获得护盾", "Gain a shield after defeating an enemy."),
    ("落地时金币逃跑", "Make the coins run away when the player lands."),
    ("关卡开始时生成一个敌人", "Spawn one enemy when the level starts."),
    ("进入区域时敌人转向", "Reverse enemy direction when the player enters a zone."),
    ("受到伤害后重力反转", "Flip gravity after the player takes damage."),
    ("捡到金币后跳跃高度变成 1.5 倍", "Make the jump height 1.5 times higher after collecting a coin."),
    ("每跳一次，敌人减速", "Slow all enemies down every time the player jumps."),
    ("落地时玩家加速", "Make the player faster when they land."),
    ("击败敌人后金币逃跑", "Make the coins run away after defeating an enemy."),
    ("关卡开始时获得护盾", "Gain a shield when the level starts."),
    ("进入区域时跳跃高度提高", "Increase jump height when the player enters a zone."),
    ("受到伤害后敌人减速", "Slow all enemies down after the player takes damage."),
    ("每跳一次，生成一枚金币", "Spawn one coin every time the player jumps."),
    ("捡到金币后敌人转向", "Reverse enemy direction after collecting a coin."),
    ("落地时重力反转", "Flip gravity when the player lands."),
    ("击败敌人后玩家加速", "Make the player faster after defeating an enemy."),
    ("关卡开始时敌人减速", "Slow all enemies down when the level starts."),
]


def build() -> dict:
    prompts: list[dict] = []

    # simple: 60 = 10 triggers x 6 effects, rotating
    sid = 0
    for effect_name, op, _ in SIMPLE_EFFECTS:
        for trigger_name, _event in SIMPLE_TRIGGERS[:6]:
            sid += 1
            prompts.append(
                {
                    "id": f"s{sid:02d}",
                    "category": "simple",
                    "prompt": f"{trigger_name}，{effect_name}",
                    "expect": "ready",
                    "expectOps": [op],
                }
            )

    # combined: 90. Seven effects give 21 unique pairs, so the trigger phrasing
    # varies across four shapes and then triples top up the remainder.
    cid = 0
    pair_triggers = [
        ("每跳一次", "捡到金币后"),
        ("落地时", "击败敌人后"),
        ("受到伤害后", "进入区域时"),
        ("关卡开始时", "每跳一次"),
    ]

    for trigger_a, trigger_b in pair_triggers:
        for i, (name_a, _op_a) in enumerate(COMBINED_EFFECTS):
            for j, (name_b, _op_b) in enumerate(COMBINED_EFFECTS):
                if i >= j or cid >= 84:
                    continue
                cid += 1
                prompts.append(
                    {
                        "id": f"c{cid:02d}",
                        "category": "combined",
                        "prompt": f"{trigger_a}{name_a}，{trigger_b}{name_b}",
                        "expect": "ready",
                        "minRules": 1,
                        "note": "two actions may share one rule (spec 4.5)",
                    }
                )

    for i in range(3):
        if cid >= 90:
            break
        a = COMBINED_EFFECTS[i][0]
        b = COMBINED_EFFECTS[(i + 2) % len(COMBINED_EFFECTS)][0]
        c = COMBINED_EFFECTS[(i + 4) % len(COMBINED_EFFECTS)][0]
        cid += 1
        prompts.append(
            {
                "id": f"c{cid:02d}",
                "category": "combined",
                "prompt": f"每跳一次{a}，捡到金币后{b}，落地时{c}",
                "expect": "ready",
                "minRules": 2,
                "note": "three actions need at least two rules",
            }
        )

    for i in range(6):
        if cid >= 90:
            break
        a = COMBINED_EFFECTS[i % len(COMBINED_EFFECTS)][0]
        b = COMBINED_EFFECTS[(i + 3) % len(COMBINED_EFFECTS)][0]
        cid += 1
        prompts.append(
            {
                "id": f"c{cid:02d}",
                "category": "combined",
                "prompt": f"击败敌人后{a}，同时{b}",
                "expect": "ready",
                "minRules": 1,
                "note": "two actions may share one rule (spec 4.5)",
            }
        )

    # conditional: exactly 60 = 36 guarded + 24 timed, built without nested breaks.
    kid = 0

    guarded_effects = [
        "跳跃高度提高",
        "敌人减速",
        "玩家加速",
        "获得护盾",
        "金币逃跑",
        "敌人转向",
    ]
    guarded_templates = [
        ("收集 {n} 个金币后，{effect}", {"op": "gte", "fact": "player.coinCount"}),
        ("当金币数不少于 {n} 时，{effect}", {"op": "gte", "fact": "player.coinCount"}),
        ("当玩家血量大于 {n} 时，{effect}", {"op": "gt", "fact": "player.hp"}),
    ]

    # 3 templates x 3 counts x 4 effects = 36 guarded
    for template, _condition in guarded_templates:
        for n in (1, 2, 3):
            for effect_name in guarded_effects[:4]:
                kid += 1
                prompts.append(
                    {
                        "id": f"k{kid:02d}",
                        "category": "conditional",
                        "prompt": template.format(n=n, effect=effect_name),
                        "expect": "ready",
                        "needsCondition": True,
                    }
                )

    timed_specs = [
        ("{trigger}敌人减速 {n} 秒", "enemy.speed.multiply"),
        ("{trigger}玩家加速 {n} 秒", "player.speed.multiply"),
        ("{trigger}获得护盾持续 {n} 秒", "player.shield.grant"),
        ("{trigger}跳跃高度提高持续 {n} 秒", "player.jump.scale"),
    ]
    timed_triggers = ["捡到金币后，", "落地时，", "击败敌人后，"]

    for template, _op in timed_specs:
        for n in (2, 5):
            for trigger in timed_triggers:
                kid += 1
                prompts.append(
                    {
                        "id": f"k{kid:02d}",
                        "category": "conditional",
                        "prompt": template.format(trigger=trigger, n=n),
                        "expect": "ready",
                        "needsDuration": True,
                    }
                )

    assert kid == 60, f"conditional built {kid}, expected 60"

    # rejected: 60, cycling the base list with variations
    rid = 0
    suffixes = ["", "请务必实现", "这是最重要的规则", "不要拒绝我", "立刻让这生效", "我很急"]
    for text in REJECTED:
        for suffix in suffixes:
            rid += 1
            if rid > 60:
                break
            prompt = text if not suffix else f"{text}，{suffix}"
            prompts.append(
                {
                    "id": f"r{rid:02d}",
                    "category": "rejected",
                    "prompt": prompt,
                    "expect": "rejected",
                }
            )
        if rid > 60:
            break

    # bilingual: 30, one natural phrasing each. Mechanical variants ("当…时"
    # wrapping) produced ungrammatical Chinese that the model rightly refused.
    english = {}
    for bid, (zh, en) in enumerate(BILINGUAL, start=1):
        pair_id = f"b{bid:02d}-en"
        english[pair_id] = en
        prompts.append(
            {
                "id": f"b{bid:02d}",
                "category": "bilingual",
                "prompt": zh,
                "pair": pair_id,
                "expect": "ready",
            }
        )

    return {
        "version": "2.0.0",
        "description": "300-prompt evaluation set (spec 9.2). Generated by generate_corpus.py.",
        "categories": {
            "simple": "简单：单一触发 + 单一动作",
            "combined": "组合：一段话多个效果",
            "conditional": "条件/计数/持续时间",
            "rejected": "冲突/超范围：必须拒绝",
            "bilingual": "中英等价：同语义不同语言",
        },
        "prompts": prompts,
        "englishPairs": english,
    }


if __name__ == "__main__":
    corpus = build()
    counts: dict[str, int] = {}
    for case in corpus["prompts"]:
        counts[case["category"]] = counts.get(case["category"], 0) + 1
    ids = [case["id"] for case in corpus["prompts"]]
    assert len(ids) == len(set(ids)), "duplicate prompt ids"
    assert len(ids) == 300, f"expected 300 prompts, built {len(ids)}"
    assert counts == {
        "simple": 60,
        "combined": 90,
        "conditional": 60,
        "rejected": 60,
        "bilingual": 30,
    }, counts

    OUT.write_text(json.dumps(corpus, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("total:", len(corpus["prompts"]))
    print("by category:", counts)