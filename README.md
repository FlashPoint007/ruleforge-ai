# RuleForge AI ｜ 规则造物局

> 用一句自然语言描述一条规则，得到一个经过确定性编译、可验证、可回放的关卡玩法。
> Describe a rule in plain language — get a deterministic, validated, replayable game rule.

**当前状态：M3 起步（RF-007）。一句话 → 服务端编译 → 客户端执行，整条链路已打通（mock provider，未接真实模型）。**
本项目处于开发早期，README 只描述**已经可以运行**的东西，不描述计划中的能力。

---

## 这是什么

玩家用自然语言描述规则（例如「每跳一次重力反转」），服务端 LLM 只负责产出**受控的 Rule IR**，
再由确定性编译器校验成带版本的 DSL，最后由 Phaser 在本地执行。

- 模型**永远不返回可执行代码**，只返回结构化 IR。
- 生成层与执行层严格分离：AI 只能选择预先注册的 Trigger / Condition / Operation。
- 校验不依赖模型的 JSON mode：schema、类型、语义、冲突、关卡兼容性全部在服务端复检。

完整技术方案见 [`docs/RuleForge_AI_V1.1.md`](docs/RuleForge_AI_V1.1.md)。

## 现在能玩到什么

```bash
pnpm install && pnpm --filter @ruleforge/web dev
```

打开 <http://localhost:5173>，点「进入实验室」：

- 方向键 / A·D 移动，空格跳跃（带土狼时间与跳跃缓冲，手感不是硬邦邦的）
- 摄像机平滑跟随，坠落到击杀线以下自动淡出复活
- 触屏有屏幕按键，PC 与手机都能操作
- 关卡数据在 `game-content/levels/lab-01.json`，加载前会校验，非法关卡直接拒绝而不是猜

### 关卡内容（RF-004）

- **5 种敌人**：史莱姆、螃蟹、刺球、水母、飞行机器人，各自巡逻
- **10 枚金币**，实时计数显示在 HUD
- **可坍塌平台**：踩上去 2 秒后消失，会先抖动预警
- **踩踏击败**：从上方落到敌人头上可以击败它并弹起；侧面接触会死亡

### 规则引擎（最小闭环）

点「重力反转」规则卡，跳一次 —— 世界真的翻过来，角色倒挂在顶部。

**12 个动作全部实现**（RF-006 补齐最后 6 个）。

| 动作 | 作用 |
|---|---|
| `player.gravity.toggle` | 重力方向反转 |
| `player.speed.multiply` | 玩家速度倍率 |
| `player.jump.scale` | 跳跃高度倍率 |
| `enemy.speed.multiply` | 所有现存敌人速度倍率（可限时） |
| `enemy.direction.reverse` | 敌人巡逻方向反转 |
| `coin.flee` | 金币逃离玩家 |

新增的 6 个动作都带有规范要求的硬约束，不满足时**拒绝执行**而不是降级：

| 动作 | 约束 |
|---|---|
| `enemy.spawn` / `coin.spawn` | 只能使用关卡预置的安全生成点，点被占用时返回失败 |
| `platform.collapseAfter` | 只能作用于标记为 collapsible 的平台，`delayMs` 必须 250–5000 |
| `platform.visibility.set` | 只能作用于 allowlist 中的平台 id，隐藏时碰撞体同步关闭 |
| `player.shield.grant` | 1 层，持续 1000–10000ms，到时间自动解除 |
| `checkpoint.activate` | 只能使用关卡预定义的 checkpoint id |

**现在不存在「已注册但未实现」的动作**：有测试断言注册表数量与实现集合完全一致。

### 一句话生成规则（RF-007）

在「规则输入面板」输入一句话，服务端把它编译成受控 DSL 并校验，通过后客户端直接执行：

```
Prompt → LLMProvider(mock) → Rule IR → 编译器 → 五层校验 → RulePack → 客户端执行
```

五层校验各自独立可报告，任何一层失败都会返回 `validation_failed` 并给出具体原因：

| 层 | 检查内容 |
|---|---|
| schema | 非空、事件/动作已注册、规则数与动作数上限、条件深度 |
| type | 布尔事实不能做大小比较；`eq` 两侧类型必须一致 |
| semantic | 参数是否在注册范围内（如 `magnitude` 500–1400）、modEq 除数不为 0 |
| conflict | 两条规则不能写同一资源（两个 toggle 会互相抵消） |
| level | 关卡是否真的支持该动作（有敌人？有可坍塌平台？平台 id 存在？） |

**只有非空且全部通过校验的包才会返回 `ready`。**

默认 `LLM_PROVIDER=mock`：Mock provider 从 `tests/fixtures/` 按关键词挑选固定 IR，
所以整条流水线在**没有任何 API Key** 的情况下也能演示与测试。接真实模型只是换一个 provider。

### 规则条件（RF-005）

规则不再只能无条件触发。`conditions` 现在会被真正求值：

```json
{
  "trigger": { "event": "player.jumpCommitted" },
  "conditions": [{ "op": "gte", "fact": "player.coinCount", "value": 2 }],
  "actions": [{ "op": "player.gravity.toggle", "target": "player", "params": { "magnitude": 980 } }]
}
```

支持 `all` / `any` 组合（嵌套深度 ≤ 2）与 `eq neq gt gte lt lte modEq` 七种比较。
事实路径限定在规范白名单内：`player.hp`、`player.alive`、`player.grounded`、
`player.gravityDirection`、`player.coinCount`、`level.elapsedMs` 等。

两条安全规则：

1. **事件作用域事实只能在该事件中读取**。在 `coin.collected` 里读 `event.zoneId` 会被拒绝，
   而不是返回 `undefined`。
2. **无法求值即拦截**。未知事实、类型不匹配的运算符都会让规则**不执行**并计数，
   绝不静默当成 `false` —— 那等于悄悄关掉玩家写的规则。

引擎约束：
- 时间用模拟时钟，不用 `Date.now()`，可复现
- 事件队列每 tick 有界（64），规则再多也不会拖垮帧
- 每个效果登记回滚函数，关闭规则时**逆序**卸载，不留残留状态
- 参数按 DSL 规范校验范围（如 `magnitude` 必须 500–1400）

## 仓库结构

```text
ruleforge-ai/
├── apps/
│   ├── web/            # React + Vite + TypeScript + Phaser 3 客户端（@ruleforge/web）
│   └── api/            # FastAPI 服务端（uv 管理，app.main:app）
├── packages/
│   ├── rule-schema/    # DSL v1.1 的 JSON Schema / 枚举 / TS 类型（单一真相源）
│   └── shared-types/   # 前后端共享的传输类型
├── game-content/       # 关卡与预设规则数据
├── tests/e2e/          # Playwright 端到端测试
├── docs/               # 技术方案、API、ADR、发布检查单
└── .github/workflows/  # CI
```

## 环境要求

| 工具 | 版本 | 说明 |
|---|---|---|
| Node.js | >= 20（本机实测 22.x） | 前端构建与测试 |
| pnpm | 11.x | 通过 Corepack 锁定 |
| Python | 3.11 / 3.12 | 服务端 |
| uv | 最新 | Python 依赖与虚拟环境 |
| Git | 任意较新版本 | |

## 快速开始

### 1. 前端

```bash
pnpm install
pnpm --filter @ruleforge/web dev        # http://localhost:5173
```

### 2. 后端（另开一个终端）

```bash
cd apps/api
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

健康检查：

```bash
curl http://127.0.0.1:8000/api/v1/healthz
# {"status":"ok","service":"ruleforge-api", ...}
```

> 默认 `LLM_PROVIDER=mock`，**不需要任何 API Key** 即可启动、进入主页并跑通全部测试。

### 3. 环境变量

复制示例文件后再按需修改，**不要提交 `.env`**：

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

`VITE_*` 变量会被打包进客户端，**严禁**在其中放 DeepSeek Key 或任何云凭据。

## 测试与质量检查

```bash
# 前端：类型检查 + lint + 单元测试 + 构建
pnpm --filter @ruleforge/web typecheck
pnpm --filter @ruleforge/web lint
pnpm --filter @ruleforge/web test
pnpm --filter @ruleforge/web build

# 端到端（需先安装浏览器：pnpm --filter @ruleforge/web exec playwright install chromium）
pnpm --filter @ruleforge/web test:e2e

# 后端
cd apps/api
uv run pytest -q
uv run ruff check .

# 跨语言契约测试（Python 生成的包必须能被 TS 运行时执行）
pnpm --filter @ruleforge/web test -- contract
```

> 生成接口需要后端在 :8000 运行。E2E 里两条生成流程测试会在后端未启动时自动跳过，
> 而不是误报失败。

## 安全底线

- 不执行模型返回的任意代码：没有 `eval` / `new Function` / 动态脚本执行。
- 模型密钥只存在于服务端环境变量，绝不进入 `VITE_*`。
- 固定 tick、有界事件队列、定时效果绑定模拟时钟，重置与规则替换时清理全部副作用。
- 挑战链接不可变：DSL / 引擎 / 关卡版本与随机种子一起冻结。

## 文档

- [技术方案 V1.1](docs/RuleForge_AI_V1.1.md)
- [API 契约](docs/API.md)
- [ADR-001：规则 DSL](docs/ADR-001-rule-dsl.md)
- [发布检查单](docs/RELEASE_CHECKLIST.md)
- [Agent 工作约束](AGENTS.md)

## 许可

尚未确定，默认保留所有权利。