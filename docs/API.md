# RuleForge AI — API 契约（v1）

> 状态：**只有 `/healthz` 与 `/presets` 已实现（RF-001 脚手架）**。
> 其余路径为 V1.1 目标契约，尚未实现，调用会返回 404。请勿在未实现前把它们当作可用能力。

Base URL（开发）：`http://127.0.0.1:8000/api/v1`

## 已实现

### `GET /api/v1/healthz`

服务健康检查。不依赖任何密钥或数据库。

```json
{
  "status": "ok",
  "service": "ruleforge-api",
  "version": "0.1.0",
  "env": "development",
  "provider": "mock"
}
```

### `GET /api/v1/presets`

返回本地预设规则元数据（读取 `game-content/presets/*.json`）。无需模型密钥。

```json
[
  { "id": "preset-gravity-flip", "name": "重力反转", "description": "..." }
]
```

## 规划中（未实现）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/levels` | 关卡元数据 |
| `POST` | `/rules/generate` | 调用 LLM → IR → 编译/校验 |
| `POST` | `/rules/validate` | 不调用模型，校验已有规则 |
| `POST` | `/challenges` | 保存不可变挑战（幂等） |
| `GET` | `/challenges/{id}` | 获取挑战内容 |

### 约定（面向未来实现）

- 所有响应携带 `requestId`，便于日志关联。
- 失败业务枚举：`unsupported` / `validation_failed` / `rate_limited` / `upstream_error`。
- HTTP 状态：400 / 422 / 429 / 502 / 503。
- 只有**非空且全部通过校验**的完整规则包才能返回 `ready`。
- 客户端必须二次校验 `dslVersion` 与资源上限，永远不信任模型文字。
