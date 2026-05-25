# Agent.md

> 不要跑 `npm run lint`。
> 不要跑 `npm run build`。

## Project

Electron 桌面应用，主进程 (`src/main/`) + 渲染进程 (`src/renderer/`) + 共享类型 (`src/shared/`)。

## Code Style

- `singleQuote`, `no semi`, `printWidth: 100`, `trailingComma: none`
- 路径别名: `@shared/*`, `@renderer/*`

## Execution Rules

- 先定位变更属于生成、编辑、导入、导出还是运行时；不要只修单一路径
- 公共规则改动要同时确认生成与编辑链路是否覆盖，尤其是整页编辑、deck 编辑、selector 编辑
- 改运行时资源时，同步确认 session asset 兼容/刷新机制
- 修 bug 时优先补定向回归测试，覆盖当前问题和相邻入口
- 验证优先跑最小相关测试；不要跑 `npm run lint` 或 `npm run build`
