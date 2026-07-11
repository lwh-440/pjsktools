# Project Sekai 全平台玩家助手

一个面向 Project Sekai / PJSK 的全平台玩家助手，包含轻量自建后端、网页端和原生 Android App。

## 当前实现

- `apps/api`: TypeScript + Fastify 后端，提供区服、master 数据、活动、玩家档案、账号、收藏、成绩和分享卡接口。
- `apps/web`: React + Vite 网页端，提供中文仪表盘、资料搜索、活动线、歌曲筛选、收藏和成绩记录入口。
- `android`: Kotlin + Jetpack Compose 原生 Android 项目，通过同一套后端 API 获取数据。

后端默认使用内存数据，便于本地开发。生产环境可接 PostgreSQL/Redis，相关配置和接口边界已经预留。

## 参考来源

- Team-Haruki/Haruki-Sekai-API: 多区服游戏 API、玩家资料和排名接口参考。
- Team-Haruki/haruki-sekai-*-master: master 数据同步来源。
- Team-Haruki/Haruki-Sekai-Asset-Updater: 素材更新链路参考，不在客户端直接暴露。

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

Android 端请用 Android Studio 打开 `android/` 目录，设置后端地址后运行。

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
