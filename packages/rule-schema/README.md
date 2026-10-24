# @ruleforge/rule-schema

DSL v1.1 的**单一真相源**：事件白名单、条件运算符、12 个 P0 动作、资源上限与 TypeScript 类型。

- `DSL_VERSION` = `1.1.0`
- `P0_EVENTS`（8 个）、`P0_CONDITION_OPERATORS`（7 个）、`P0_ACTIONS`（12 个）
- `RULE_LIMITS`：每包 3 条规则、每规则 3 个条件节点 / 2 个动作、条件深度 2、效果上限 10s
- `validateRulePackShape(pack)`：**结构性**预检，只验证形状与注册表成员资格

> 该函数不是权威校验。语义、冲突与关卡兼容性校验在服务端编译器中进行（里程碑 M2）。
> 客户端的这次检查只是防止渲染明显非法的数据包。

## 使用

```ts
import { DSL_VERSION, P0_ACTIONS, validateRulePackShape } from "@ruleforge/rule-schema";

const result = validateRulePackShape(incoming);
if (!result.ok) {
  console.warn(result.errors);
}
```

## 测试

```bash
pnpm --filter @ruleforge/rule-schema test
```
