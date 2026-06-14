# dev-browser

**一种 Electron 桌面浏览器 / 开发者工具集** — 用于管理 PWA 风格的应用窗口、代理、SEO 记录，拥有硬朗的粗野主义（Brutalist）UI。

## 技术栈

| 层级     | 技术                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| 桌面壳层 | [Electron](https://www.electronjs.org/) + [electron-vite](https://electron-vite.org/) |
| 前端     | [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)        |
| 路由     | [TanStack Router](https://tanstack.com/router/latest)                                 |
| 样式     | [Tailwind CSS v4](https://tailwindcss.com/)                                           |
| 国际化   | [Paraglide JS / inlang](https://inlang.com/)                                          |
| 构建     | [Vite+](https://viteplus.dev/) / [Rolldown](https://rolldown.rs/)                     |
| 包管理   | [pnpm](https://pnpm.io/)                                                              |

## 功能

- **浏览器** — 内嵌浏览器面板，支持代理配置、自定义 User-Agent、SEO 记录抓取
- **Dock** — PWA 风格应用启动台：以独立窗口安装和运行 Web 应用，支持自定义窗口配置（尺寸、标题栏、边框）和 User-Agent，以及每应用注入自定义 CSS
- **SEO** — 社交元信息预览（OG / Facebook / Twitter），历史记录侧边栏
- **设置** — 全局代理、数据目录、默认 User-Agent、语言切换

## 快速开始

```bash
# 1. 克隆后安装依赖
pnpm install

# 2. 启动开发模式（含热更新）
pnpm dev

# 3. 运行代码检查、格式化、类型检查
vp check

# 4. 生产构建
pnpm build
```

## 项目结构

```
src/
├── main/              # Electron 主进程
│   ├── index.ts       # 入口：窗口管理、IPC 注册
│   ├── browser-manager.ts    # 浏览器页签管理器
│   ├── dock-window-manager.ts # Dock 应用独立窗口管理
│   ├── bridge-injector.ts     # JS Bridge 注入
│   ├── bridge-store.ts        # Bridge 配置持久化
│   ├── apps-store.ts          # Dock 应用存储
│   ├── settings-store.ts      # 设置存储
│   ├── seo.ts                 # SEO 元信息抓取
│   └── fetcher.ts             # HTTP 请求工具（支持代理）
├── preload/           # Electron preload 脚本
│   ├── index.ts       # 全局 IPC 桥（settings, dock 等）
│   └── browser-preload.ts     # 浏览器页签 IPC 桥
├── renderer/          # 渲染进程（React 应用）
│   ├── index.html
│   ├── toolbar.html           # 工具栏独立窗口
│   └── src/
│       ├── main.tsx
│       ├── routes/            # TanStack Router 路由页面
│       │   ├── index.tsx      # 首页 / Dock 页面
│       │   ├── browser.tsx    # 浏览器面板
│       │   ├── dock.tsx       # Dock 应用管理
│       │   ├── seo.tsx        # SEO 预览
│       │   ├── settings.tsx   # 设置
│       │   └── about.tsx      # 关于
│       ├── components/        # 可复用组件
│       │   ├── DockAppFormModal.tsx  # 安装/编辑应用表单
│       │   └── WindowSizeInput.tsx
│       ├── paraglide/         # 自动生成的 i18n 消息
│       └── useLocale.ts       # 语言切换 Hook
messages/               # i18n 源文件（en.json, zh-CN.json）
```

## 开发命令

```bash
# ── 开发 ──
pnpm dev            # 启动 Electron 开发模式

# ── 格式化 / 检查（使用 Vite+） ──
vp fmt              # 格式化代码
vp lint             # 代码规范检查
vp check            # 格式化 + 检查 + 类型检查（推荐）

# ── 类型检查 ──
pnpm typecheck      # 主进程 + 渲染进程

# ── 构建 ──
pnpm build           # 类型检查 + 构建
pnpm build:mac       # macOS 安装包
pnpm build:win       # Windows 安装包
pnpm build:linux     # Linux 安装包
```

> 本项目使用 **Vite+**（`vp` CLI）进行格式化、代码检查等操作。Vite+ 还封装了包管理和运行环境管理，运行 `vp help` 查看完整命令列表。

## 设计语言

该项目使用 **RawBlock** 粗野主义设计系统。详见 [`design.md`](./design.md)。

核心原则：

- 无圆角、无阴影、纯黑白 + 链接蓝
- 3–5px 粗边框作为主要视觉组织手段
- Archivo Black 大标题 + Work Sans 正文 + Space Mono 等宽字体
- 明暗反转作为悬停/激活状态

## 国际化

i18n 源文件位于 `messages/` 目录，采用 [inlang](https://inlang.com/) / Paraglide JS 方案。

- 添加新 key：编辑 `messages/en.json` 和 `messages/zh-CN.json`
- 编译：`npx @inlang/paraglide-js compile`
- 在代码中使用：`import { m } from '../paraglide/messages.js' → m.some_key()`

## 构建配置

- TypeScript 配置：`tsconfig.json`（主进程 `tsconfig.node.json`、渲染进程 `tsconfig.web.json`）
- Electron 打包：`electron-builder.yml`
- Vite 配置：`electron.vite.config.ts`（3 入口：main / preload / renderer）

## 许可

MIT
