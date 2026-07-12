# Project Sekai 全平台玩家助手

一个面向 Project Sekai / PJSK 的全平台玩家助手，包含轻量自建后端、网页端和原生 Android App。

## 当前实现

- `apps/api`: TypeScript + Fastify 后端，提供区服、master 数据、活动、玩家档案、账号、收藏、成绩和分享卡接口。
- `apps/web`: React + Vite 网页端，提供中文仪表盘、资料搜索、活动线、歌曲筛选、收藏和成绩记录入口。
- `android`: Kotlin + Jetpack Compose 原生 App 工程骨架，旧验证原型已清理；业务实施计划以 `agent.md` 为准。

后端默认使用内存数据，便于本地开发。生产环境可接 PostgreSQL/Redis，相关配置和接口边界已经预留。

## 开源许可与参考项目

本项目选择路线 2：对包含或改写自 GPL/AGPL 参考项目的部分，按 `AGPL-3.0-or-later` 提供对应源代码。正式公开运行前，本仓库会公开，并在网页/API 的关于页面提供运行版本对应源码的稳定链接。

- `Sekai-World/sekai-viewer`（GPL-3.0）：资源路径、内容播放和部分工具实现的参考来源。其派生或改写部分随本项目源码按 `AGPL-3.0-or-later` 提供。
- `moe-sekai/Moesekai`（AGPL-3.0）：计算逻辑、数据模型和工具流程的参考来源。其派生或改写部分随本项目源码按 `AGPL-3.0-or-later` 提供。
- `Team-Haruki/Haruki-Sekai-API` 与 `haruki-sekai-*-master`（MIT）：API 和 master 数据流程的参考来源；保留 MIT 版权与许可声明。
- `@sekai-world/pixi-live2d-display-mulmotion`（MIT）：Web Live2D 运行时依赖；保留其版权与许可声明。

完整的第三方来源、许可证和上线前披露要求见 `THIRD_PARTY_NOTICES.md` 与 `OPEN_SOURCE_COMPLIANCE.md`。

上述开源许可证仅覆盖相应开源代码，并不授予 Project Sekai 的名称、商标、游戏数据、卡图、音频、剧情、Live2D 或其他官方素材的使用权。正式上线前仍须遵守官方规则并取得适用的内容授权。

## 快速开始

```bash
npm install
npm run dev
```

后端默认地址为 `http://localhost:4000`。

网页端：

```bash
npm run dev:web
```

Android 端可用 Android Studio 打开 `android/`。当前只有生产工程骨架和环境入口，业务功能尚未开始；实现顺序、接口映射和验收门槛见 `agent.md`。

## 环境变量

后端会读取项目根目录 `.env`，也会读取 `apps/api/.env`。可以参考 `.env.example`。

- `PORT`: API 端口，默认 `4000`
- `API_HOST`: API 监听地址，默认 `127.0.0.1`
- `JWT_SECRET`: 登录令牌密钥
- `DATABASE_URL`: PostgreSQL 连接串，留空时使用内存存储
- `REDIS_URL`: Redis 连接串，留空时使用内存缓存
- `HARUKI_API_BASE_URL`: 可选的 Haruki API 代理地址。若本机运行 Team-Haruki/Haruki-Sekai-API 且使用示例配置中的 `backend.port: 9999`，通常填写 `http://127.0.0.1:9999`。未配置时，玩家资料/活动分数线会使用本地开发占位数据。

## 安全边界

本项目只处理公开资料、手动记录和用户自愿同步的数据。不实现自动游玩、代打、绕过客户端安全机制或抓取私密数据。
