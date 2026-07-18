# Project Sekai 全平台玩家助手

一个面向 Project Sekai / PJSK 玩家和资料整理场景的全平台工具，包含 Fastify 后端、React Web 端和 Jetpack Compose Android 客户端。项目坚持真实数据优先：数据或资源不可用时返回明确的缺失、未实装或不可用状态，不生成伪数据。

## 当前功能

### 后端与公共 API

- 五个区服：`jp`、`en`、`tw`、`kr`、`cn`，区服数据、缓存和资源严格隔离。
- master 数据、活动、歌曲、卡牌、卡池、称号、素材、服装、贴纸和漫画目录。
- 账号、玩家资料、成绩、排名、计算工具和分享卡接口。
- 收藏目标全局去重，支持 `player`、`event`、`song`、`card`、`gacha`、`honor`、`material`、`costume`、`stamp`、`comic`。
- 收藏夹与收藏目标多对多关联；收藏可以属于多个收藏夹，也可以保留为“未分类”。
- 收藏夹 CRUD、收藏幂等创建、原子替换、批量添加/移除/替换和 `If-Match` 乐观并发控制。
- 统一目录路由：`/api/master/{region}/catalogs/{type}`。多选筛选支持重复参数和逗号分隔值，响应包含 `filterMeta` 与 `appliedFilters`。
- OpenAPI 合约位于 `apps/api/openapi/openapi.json`；Android 生成代码只通过合约检查同步，不手工编辑生成文件。

### Web

- 仪表盘、活动与排名、玩家资料、歌曲/卡牌和六类扩展图鉴。
- 活动、歌曲、卡牌、卡池、称号、素材、服装、贴纸、漫画统一筛选面板。
- 筛选状态同步 URL，搜索防抖，筛选和分页自动回到第一页；桌面为展开面板，窄屏为抽屉。
- 筛选面板的展开/收起状态和页面滚动位置在结果更新时保持稳定。
- 图鉴列表、歌曲/卡牌/活动/集合详情支持收藏。
- `/me/favorites` 支持收藏夹创建、改名、删除、全部/未分类视图、搜索、类型/区服筛选和批量整理。
- 收藏操作使用乐观更新，失败时自动回滚；失效目标仍可整理或删除。

### Android

- Android 使用后端 API，不直接访问上游数据源或资源镜像。
- 当前已具备原生工程、区服和环境入口，以及活动、歌曲、卡牌和扩展目录的只读接入基础。
- 收藏、账号写入、玩家资产和工具等业务仍按 `agent.md` 的阶段计划推进。

## 项目结构

```text
apps/api/       Fastify + TypeScript 后端、数据库迁移、OpenAPI 和合约测试
apps/web/       React + Vite Web 客户端
android/        Kotlin + Jetpack Compose Android 客户端
scripts/        本地 smoke、OpenAPI 生成/检查和数据验证脚本
refer/          Sekai Viewer、Moesekai 等参考项目
agent.md        架构约束、功能记录、渲染注意事项和验收要求
```

## 快速开始

需要 Node.js 22+ 和 npm。

```bash
npm install
npm run dev       # 启动 API，默认 http://127.0.0.1:4000
npm run dev:web   # 启动 Web，默认 http://127.0.0.1:5173
```

如果只需要构建：

```bash
npm run build
```

Android 可用 Android Studio 打开 `android/`。Android 构建环境、模块边界、生成客户端和阶段验收要求见 `agent.md`。

Live2D 与故事舞台复用网页端的 Pixi/Cubism 运行时。发布 APK 前必须将网页端部署到稳定的 HTTP(S) 来源，并在构建时显式配置：

```bash
./gradlew :app:assembleRelease -PPJSKTOOLS_WEB_RUNTIME_BASE_URL=https://tools.example.com
```

未配置时 Android 会关闭交互式网页运行时并显示配置错误，不会猜测本地 Vite 端口。运行时 WebView 只允许同源导航；区服通过 `?region=jp` 等 URL 参数传入。

部署网页时设置 `VITE_API_BASE_URL`，再把生成的网页 HTTPS 地址作为 Android 的 `PJSKTOOLS_WEB_RUNTIME_BASE_URL`。网页托管必须为 SPA 深层路由配置回退到 `index.html`，以便 Live2D 与故事播放器直接加载。

## 数据库与环境变量

后端读取项目根目录 `.env`，也读取 `apps/api/.env`。可参考 `.env.example`。

- `PORT`：API 端口，默认 `4000`
- `API_HOST`：监听地址，默认 `127.0.0.1`
- `JWT_SECRET`：登录令牌密钥
- `DATABASE_URL`：PostgreSQL 连接串；留空时使用内存存储
- `REDIS_URL`：Redis 连接串；留空时使用进程内缓存
- `HARUKI_API_BASE_URL`：可选的 Haruki API 代理地址
- `SMTP_HOST`、`SMTP_USER`、`SMTP_PASS`、`SMTP_FROM`：生产邮件配置；本地 smoke 会主动禁用 SMTP 并使用开发验证码，避免误发邮件

使用 PostgreSQL 时执行：

```bash
npm run db:migrate -w apps/api
```

收藏夹迁移为 `apps/api/src/db/migrations/010_favorite_folders.sql`，会合并历史重复收藏，并将历史收藏保留为未分类。生产数据库迁移和发布不由本仓库自动执行。

## 常用验证命令

```bash
npm test                         # API 测试
npm run openapi:export           # 导出 OpenAPI
npm run openapi:check            # 检查 Android 合约生成结果
npm run check:encoding           # 检查编码异常
npm run verify:local             # 构建、编码检查和本地 smoke
```

本地 smoke 不应连接生产服务或发送真实邮件。一次性 PostgreSQL 迁移验收需要可用的临时 PostgreSQL 实例；如果本机 Docker daemon 不可用，不能将内存存储测试当作 PostgreSQL 验收结果。

## 开源许可与参考项目

本项目选择对包含或改写自 GPL/AGPL 参考项目的部分按 `AGPL-3.0-or-later` 提供对应源代码。正式公开运行前，本仓库会公开，并在网页/API 的关于页面提供运行版本对应源码的稳定链接。

- `Sekai-World/sekai-viewer`（GPL-3.0）：资源路径、内容播放和部分工具实现的参考来源。
- `moe-sekai/Moesekai`（AGPL-3.0）：计算逻辑、数据模型和工具流程的参考来源。
- `Team-Haruki/Haruki-Sekai-API` 与 `haruki-sekai-*-master`（MIT）：API 和 master 数据流程参考来源。
- `@sekai-world/pixi-live2d-display-mulmotion`（MIT）：Web Live2D 运行时依赖。

完整的第三方来源、许可证和上线前披露要求见 `THIRD_PARTY_NOTICES.md` 与 `OPEN_SOURCE_COMPLIANCE.md`。许可证不授予 Project Sekai 名称、商标、游戏数据、卡图、音频、剧情、Live2D 或其他官方素材的使用权。

## 安全边界与发布状态

本项目只处理公开资料、手动记录和用户自愿同步的数据，不实现自动游玩、代打、绕过客户端安全机制或抓取私密数据。

当前代码可用于本地开发和部署前验证，但尚未执行生产发布、线上数据库迁移或最终域名/SMTP/OAuth 配置。正式上线前请完成隐私政策、免责声明、数据与素材归属、账号删除和第三方服务合规审查。
