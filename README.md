# pjsktools

面向 Project Sekai / PJSK 玩家和资料整理场景的全平台工具箱，由 Fastify API、React Web 客户端和 Jetpack Compose Android 客户端组成。

项目以真实数据和可追溯状态为基本原则：上游数据、资源或功能不可用时，接口和客户端应明确返回缺失、未配置或暂不可用状态，不生成伪造数据。

> 本项目是非官方社区项目，与 SEGA、Colorful Palette、Craft Egg 或 Project Sekai 的运营方无隶属或授权关系。仓库许可证不授予游戏名称、商标、数据、图片、音频、剧情、Live2D 模型等第三方内容的使用权。

## 已实现能力

### 数据、活动与内容

- 支持 `jp`、`en`、`tw`、`kr`、`cn` 五个区服，区服数据、缓存与资源解析相互隔离。
- 提供活动、歌曲、卡牌、卡池、称号、素材、服装、贴图和漫画等 master 数据与详情接口。
- 提供公告、兑换所、任务、虚拟 Live、Live2D、MySekai 和故事目录/播放上下文。
- 活动排名包含 Top 100、分数线、变化记录、历史、预测和指定名次玩家详情。
- World Link 活动按角色榜保存和展示排名，不回退或混入活动总榜。
- 分享卡接口可为玩家、成绩、活动、卡牌和歌曲生成 `1200 x 630` PNG。

### 玩家工具

- 控分、活动点数估算、卡组比较、卡组推荐、歌曲推荐、区域道具建议、普通活动规划和 MySekai 计算。
- 公共玩家资料查询与刷新；上游不存在、限流或暂不可用时保留明确错误语义。
- 登录后可使用绑定玩家快照运行工具，并查看资料分析、数据完整度和工具就绪状态。

### 账号与 Haruki 同步

- 邮箱验证码注册/登录、刷新令牌、可选 QQ Connect 登录与账号绑定。
- 收藏夹、多收藏夹归类、批量整理、乐观并发控制，以及个人成绩和卡组配置。
- Haruki Public 数据预览和本地缓存。
- Haruki OAuth 使用 PKCE；访问令牌由服务端加密保管，不下发到 Web 或 Android 客户端。
- 可导入 OAuth 已验证的玩家绑定，在写入前查看卡牌和数据组差异，并显式确认同步。
- 支持手动同步、每日同步、空数据保护、授权失效提示、令牌撤销和可选 webhook 更新。
- Web 与 Android 共用服务端玩家快照；用户可断开 Haruki 或删除 pjsktools 账号。

### Web 与 Android

- Web 提供响应式图鉴、筛选、收藏、活动排名、内容播放器、计算工具和账号中心。
- Android 为原生多模块 Compose 应用，覆盖工具台、活动/排名、图鉴、内容、账号、收藏和 Haruki 连接流程。
- Android 只调用本项目 API，不直接访问上游 PJSK 数据源；Live2D 和故事舞台复用已部署的 Web 运行时。
- API 合约位于 `apps/api/openapi/openapi.json`，Android Retrofit/serialization 模型由 OpenAPI 生成并在 CI 中校验。

## 技术架构

| 路径 | 说明 |
| --- | --- |
| `apps/api/` | Fastify + TypeScript API、数据同步、PostgreSQL 存储、迁移和 Vitest 测试 |
| `apps/web/` | React 19 + Vite Web 客户端，包含 Pixi/Live2D 内容运行时 |
| `android/` | Kotlin + Jetpack Compose 多模块 Android 客户端 |
| `scripts/` | OpenAPI 生成/检查、本地 smoke、区服与内容验证脚本 |
| `deploy/` | Docker/Caddy 部署、备份、域名切换和 Android 发布脚本 |
| `refer/` | Sekai Viewer、Moesekai 等上游参考项目；不参与应用构建 |
| `apps/api/src/db/migrations/` | PostgreSQL schema 迁移，当前包含 Haruki 同步迁移 `013` |

生产部署由 PostgreSQL、Fastify API、Vite 静态站点和 Caddy 组成。开发环境未配置数据库时使用进程内存存储，重启后数据会丢失。

## 环境要求

- Node.js 22+
- npm（使用根目录 `package-lock.json`）
- Android 开发：Android Studio、JDK 21、Android SDK 35
- 持久化开发或生产环境：PostgreSQL 16+
- 完整生产部署：Docker Engine 与 Docker Compose

## 本地启动

安装依赖：

```bash
npm ci
```

按需创建本地配置。不要提交 `.env`、`.secrets/`、OAuth 密钥或令牌：

```powershell
Copy-Item .env.example .env
```

未创建 `.env` 也可以使用默认端口和内存存储启动基础开发环境：

```bash
npm run dev
npm run dev:web
```

- API：`http://127.0.0.1:4000`
- Web：`http://127.0.0.1:5173`
- 健康检查：`http://127.0.0.1:4000/health`
- OpenAPI：`http://127.0.0.1:4000/openapi.json`
- API 路由索引：`http://127.0.0.1:4000/api/docs`

Web 默认自动探测本地 API；分离部署时在构建 Web 前设置 `VITE_API_BASE_URL`。

## 环境配置

API 依次读取仓库根目录 `.env`、`apps/api/.env` 和调用位置可解析到的根配置。完整字段及示例见 `.env.example`，常用配置如下。

### 基础服务

| 变量 | 用途 |
| --- | --- |
| `API_HOST` / `PORT` | API 监听地址和端口，开发默认 `127.0.0.1:4000` |
| `JWT_SECRET` | 访问令牌签名密钥；生产环境必须使用高强度随机值 |
| `DATABASE_URL` | PostgreSQL 连接串；留空时使用内存存储 |
| `PGHOST` 等 | 可替代 `DATABASE_URL` 的 PostgreSQL 分项配置 |
| `PUBLIC_WEB_BASE_URL` | OAuth 回跳和公开 Web 地址 |
| `CORS_ALLOWED_ORIGINS` | 逗号分隔的允许来源，默认使用 `PUBLIC_WEB_BASE_URL` |
| `MASTER_RAW_BASE_URL` | master 数据缺失时的 GitHub Raw 回退来源 |
| `AUTO_UPDATE_ENABLED` | 是否启动玩家、排名、master 和 Haruki 定时任务 |

邮箱登录使用 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS` 和 `SMTP_FROM`。QQ 登录使用 `QQ_CONNECT_APP_ID`、`QQ_CONNECT_APP_KEY`、`QQ_CONNECT_REDIRECT_URI` 和 `QQ_CONNECT_SCOPE`；未配置时 QQ 登录保持禁用。

### Haruki OAuth

基础公共预览使用 `HARUKI_PUBLIC_SUITE_BASE_URL`。完整 OAuth 同步还需要配置：

- OAuth authorize、token、profile、bindings、game-data 和 revoke 端点；
- `HARUKI_OAUTH_CLIENT_ID` 与 `HARUKI_OAUTH_CLIENT_SECRET`；
- 与 Haruki 控制台一致的 `HARUKI_OAUTH_REDIRECT_URI`；
- `HARUKI_TOKEN_ENCRYPTION_KEY`：32 字节随机值，以 Base64 或 64 位十六进制编码；
- 可选 webhook：`HARUKI_WEBHOOK_ENABLED`、`HARUKI_WEBHOOK_SYNC_ENABLED`、`HARUKI_WEBHOOK_SECRET`。

`HARUKI_TOKEN_ENCRYPTION_KEY_VERSION` 和 `HARUKI_TOKEN_PREVIOUS_ENCRYPTION_KEYS` 用于密钥轮换。旧密钥仅应在旧令牌尚未完成轮换时保留。

生产环境会拒绝非 HTTPS、带用户信息或不在代码允许来源列表中的 Haruki 端点，并要求 HTTPS OAuth redirect URI。不要把真实 OAuth 凭据写入 `.env.example` 或部署清单。

如果只需设置兼容 Haruki API 的基础地址，可以运行：

```bash
npm run config:haruki -- http://127.0.0.1:9999
```

## 数据库

配置 PostgreSQL 后执行全部迁移：

```bash
npm run db:migrate -w apps/api
```

生产发布必须先备份数据库，再运行迁移。`013_haruki_player_sync.sql` 会建立 OAuth 连接、同步审核、webhook、限流和玩家绑定相关结构，并对无法安全推导身份的旧绑定采取失败保护；请先在临时数据库验证迁移和回滚方案。

需要明确强制测试使用内存存储时设置：

```powershell
$env:PJSKTOOLS_FORCE_MEMORY_STORE = "true"
npm test
```

## Android 开发

用 Android Studio 打开 `android/`，或在命令行运行：

```powershell
Set-Location android
./gradlew assembleDebug testDebugUnitTest lintDebug
```

Debug 默认连接 Android 模拟器宿主机的 `http://10.0.2.2:4000/`。真机或自定义后端可传入：

```powershell
./gradlew :app:assembleDebug -PPJSKTOOLS_API_BASE_URL=http://192.168.1.10:4000
```

发布构建必须使用 HTTPS API，并为 Live2D/故事播放器配置已部署 Web 地址：

```powershell
./gradlew :app:assembleRelease `
  -PPJSKTOOLS_API_BASE_URL=https://api.example.com `
  -PPJSKTOOLS_WEB_RUNTIME_BASE_URL=https://tools.example.com
```

Web 托管必须为 SPA 深层路由回退到 `index.html`。Haruki Android OAuth 同时支持自定义 scheme 和经过 Digital Asset Links 验证的 HTTPS App Link；正式包的证书指纹与域名配置见 `deploy/README.md`。

签名文件和密码只允许保存在 `.secrets/`。仓库提供 `deploy/prepare-android-signing.ps1` 与 `deploy/build-android-release.ps1`，但不会提交密钥或 APK。

## 构建与验证

```bash
npm run build                     # 构建 API 和 Web
npm test                          # API 测试
npm run test -w apps/web          # Web 测试
npm run openapi:export            # 导出 OpenAPI 合约
npm run openapi:check             # 校验已提交的 Android 生成客户端
npm run check:encoding            # 检查文本编码异常
npm run verify:local              # API/Web 构建、编码检查和本地 smoke
npm run verify:player-interfaces  # 验证五区公共玩家/排名接口
```

生成 Android API 客户端需要 OpenAPI Generator `7.12.0`，脚本默认从 `tools/openapi-generator-cli-7.12.0.jar` 读取：

```bash
npm run openapi:generate
```

生成文件位于 `android/core/api/generated/`，应通过 OpenAPI 合约重新生成，不应手工维护。GitHub Actions 会构建和测试 API、核对 OpenAPI、重新生成 Android 客户端，并运行 Android debug 构建、单元测试和 lint。

## 部署

完整的生产说明见 `deploy/README.md`。Docker Compose 入口为 `compose.prod.yml`：

```bash
cp deploy/.env.production.example .env.production
docker compose --env-file .env.production -f compose.prod.yml up -d --build
docker compose --env-file .env.production -f compose.prod.yml ps
```

生产栈会先运行数据库迁移，再启动 API；Caddy 提供 HTTPS、Web 静态文件和 API 反向代理。PostgreSQL 与 API 端口应只存在于私有 Docker 网络。部署前还应完成异地加密备份、恢复演练、域名/OAuth 回调核对和 Android App Link 校验。

## 安全边界

- 不实现自动游玩、代打、绕过客户端安全机制或抓取私密游戏数据。
- Haruki OAuth token 只存放在服务端，并使用 AES-256-GCM 与版本化密钥加密。
- 同步写入前要求审核；上游返回空组、身份不匹配或数据格式异常时不覆盖现有快照。
- 日志不得记录 token、OAuth payload、原始玩家套件或其他敏感响应。
- `.env`、`.secrets/`、日志、数据库备份、APK 和构建产物不得提交到仓库。
- 公开部署前必须完成隐私政策、免责声明、账号删除、数据保留策略和第三方服务合规审查。

## 许可与第三方来源

除文件另有声明外，本仓库源码按 `AGPL-3.0-or-later` 发布，完整文本见 `LICENSE`。

主要参考和依赖来源包括：

- `Sekai-World/sekai-viewer`（GPL-3.0）：资源路径、内容播放、目录行为和部分工具实现；
- `moe-sekai/Moesekai`（AGPL-3.0）：计算逻辑、数据模型、工具流程和 Haruki OAuth 合约参考；
- Team-Haruki 项目（MIT）：Haruki API、OAuth 和 master 数据流程参考；
- `@sekai-world/pixi-live2d-display-mulmotion`（MIT）：Web Live2D 运行时。

公开运行修改版服务时，必须按 AGPL 向网络用户提供与部署版本对应的完整源码和必要构建/部署脚本，同时绝不能公开密钥、用户数据或 provider token。详细来源、固定版本与发布要求见 `THIRD_PARTY_NOTICES.md` 和 `OPEN_SOURCE_COMPLIANCE.md`。
