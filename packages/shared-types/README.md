# @ruleforge/shared-types

前后端共享的传输层类型：`HealthResponse`、`PresetMeta`、`LevelMeta`、
`GenerateRuleRequest/Response`、`ApiError`。

规则本身的类型定义在 [`@ruleforge/rule-schema`](../rule-schema)，这里只做引用，
避免出现两套互相漂移的 DSL 定义。

> 目前后端只实现了 `/healthz` 与 `/presets`；生成相关的类型是给 M2/M3 预留的契约。
