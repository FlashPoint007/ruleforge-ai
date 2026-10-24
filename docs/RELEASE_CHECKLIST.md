# 发布检查单

在每次对外演示或部署前逐项勾选。未勾选的项必须在交付说明里显式写出。

## 1. 代码与质量门禁

- [ ] `pnpm --filter @ruleforge/web typecheck` 通过
- [ ] `pnpm --filter @ruleforge/web lint` 通过
- [ ] `pnpm --filter @ruleforge/web test` 通过
- [ ] `pnpm --filter @ruleforge/web build` 通过
- [ ] `cd apps/api && uv run pytest -q` 通过
- [ ] `cd apps/api && uv run ruff check .` 通过
- [ ] CI 在 `main` 上为绿

## 2. 安全

- [ ] 仓库中不存在任何 API Key / 云凭据 / `.env` 文件
- [ ] `VITE_*` 变量中不含任何密钥
- [ ] 无 `eval` / `new Function` / 动态脚本执行
- [ ] 模型输出经过 schema、类型、语义、冲突、关卡兼容性五层校验
- [ ] 日志不落完整用户 Prompt 与密钥

## 3. 运行时

- [ ] 固定 tick，事件队列有界
- [ ] 定时效果绑定模拟时钟，重置与规则替换后无残留副作用
- [ ] 规则数量、动作数量、循环次数均在上限内

## 4. 无密钥可用性

- [ ] `LLM_PROVIDER=mock` 时前端可进入主页
- [ ] 后端不可用时前端不白屏（降级提示）
- [ ] `GET /api/v1/healthz` 返回 200

## 5. 交付说明

- [ ] 记录实际执行的命令与真实输出
- [ ] 未验证的能力明确标注为「未实现」，不夸大
