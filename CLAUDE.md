# CLAUDE.md

## Project

Oh My PPT — 本地优先的 AI 幻灯片生成与编辑工具。Electron + React + TypeScript。

## Commands

```bash
pnpm dev          # 开发
pnpm build        # 不要跑构建
pnpm run typecheck:node # 跑 node 类型检查
pnpm run typecheck:web # 跑 renderer 类型检查
pnpm typecheck    # 跑类型检查  
pnpm lint         # 不要跑ESLint
pnpm format       # 不要跑Prettier
```

> 不要跑 `npm run lint` / `npm run build`。

## Code Style

- Prettier: `singleQuote`, `no semi`, `printWidth: 100`, `trailingComma: none`
- 路径别名: `@shared/*` → `src/shared/*`, `@renderer/*` → `src/renderer/src/*`

## Execution Rules

- 先判断问题落在哪条链路：生成、编辑、导入、导出或运行时；不要只修当前可见入口
- 公共规则变更要确认生成和编辑都覆盖，包括整页编辑、deck 编辑、selector 编辑
- 改 runtime asset 时，同步检查 session asset 兼容/刷新机制
- 修 bug 优先补最小定向回归测试，必要时覆盖相邻入口
- 验证时跑最相关的最小测试集；不要跑 `npm run lint` 或 `npm run build`
