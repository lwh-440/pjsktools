# pjsktools

面向 Project SEKAI / PJSK 玩家和资料整理场景的非官方全平台工具箱，由 Fastify API、React Web 和 Jetpack Compose Android 客户端组成。

项目坚持“真实数据、可追溯状态”：上游数据、资源或功能不可用时，接口和客户端应明确返回缺失、未配置或暂不可用状态，不生成伪造数据。

> 本项目与 SEGA、Colorful Palette、Craft Egg 或 Project Sekai 官方没有隶属或授权关系。仓库许可证不授予第三方游戏名称、商标、数据、图片、音频、剧情或 Live2D 内容的使用权。

## 功能概览

- 支持 JP、EN、TW、KR、CN 五个区服，并隔离各区服数据、缓存和资源。
- 提供活动、歌曲、卡牌、卡池、称号、素材、服装、贴纸、漫画、公告、兑换所、任务、虚拟 Live、Live2D、MySekai 和故事内容。
- 活动排名支持 Top 100、分数线、历史、变化和预测；检测到 World Link 等单角色榜活动时，提供单人榜/总榜切换。
- 提供玩家资料、玩家快照、收藏、成绩、卡组、活动规划、歌曲/卡组推荐和分享卡片工具。
- 支持邮箱验证码注册/登录、QQ Connect 登录与绑定、收藏夹、跨端玩家快照、个人数据导出和账号注销。
- Web 与 Android 均提供隐私政策、用户协议、安全举报、公安备案和 ICP 备案入口。
- Haruki 集成功能已实现相应接口和客户端能力，但当前生产环境保持关闭，必须由用户主动授权并完成真实联调后才能开启。

## 技术架构

| 路径 | 内容 |
| --- | --- |
| `apps/api/` | Fastify 5 + TypeScript API、数据同步、PostgreSQL 存储、迁移和 Vitest 测试 |
| `apps/web/` | React 19 + Vite 6 + TypeScript Web 客户端、React Router、PixiJS/Live2D 运行时 |
| `android/` | Kotlin + Jetpack Compose 多模块 Android 客户端，使用 Retrofit/serialization 和 KSP |
| `apps/api/openapi/` | API OpenAPI 合约；Android 生成客户端由合约生成 |
| `apps/api/src/db/migrations/` | PostgreSQL 数据库迁移 |
| `scripts/` | OpenAPI、编码、smoke、区服、内容和接口验证脚本 |
| `deploy/` | Docker Compose、Caddy、生产部署、备份和 Android 发布脚本 |
| `assets/`、`apps/web/public/` | 必须随源码提供的静态资源 |

生产环境由 PostgreSQL、Fastify API、Vite 静态站点和 Caddy HTTPS 反向代理组成。数据库与 API 端口只在私有 Docker 网络中开放；本机缓存不作为生产数据源。

## 环境要求

- Node.js 22+
- npm（使用根目录 `package-lock.json`）
- Android Studio、JDK 21、Android SDK 35
- PostgreSQL 16+（持久化开发或生产）
- Docker Engine 与 Docker Compose（完整生产部署）

## 本地开发

```powershell
npm ci
Copy-Item .env.example .env
npm run dev       # API: http://127.0.0.1:4000
npm run dev:web   # Web: http://127.0.0.1:5173
```

基础开发环境未配置 PostgreSQL 时可使用内存存储，但重启会丢失数据。不要提交 `.env`、`.secrets/`、OAuth 凭据、SMTP 授权码、COS 密钥、数据库备份或签名密钥。

## 常用验证

```powershell
npm run build
npm test
npm run check:encoding
npm run openapi:export
npm run openapi:check
npm run verify:local
```

Android 普通 Debug 验证：

```powershell
Set-Location android
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

正式 APK 必须使用经过审查的验证脚本。脚本会从干净 `origin/main` 导出源码，依次运行 Unit、Debug、Release、`apksigner`、SHA-256 和原子发布；只有输出 `ANDROID_VALIDATION_COMPLETE` 才可发布：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File `
  .runtime\run-reviewed-android-validation.ps1
```

## 生产部署

完整说明见 [`deploy/README.md`](deploy/README.md)。基本入口如下：

```bash
cp deploy/.env.production.example .env.production
docker compose --env-file .env.production -f compose.prod.yml up -d --build
docker compose --env-file .env.production -f compose.prod.yml ps
```

生产发布顺序应为：数据库备份与迁移 → API → Web/Caddy → Android APK。发布前应验证 HTTPS、OAuth 回调、Android App Link、数据库恢复方案和回滚快照。

## 合规与安全

线上公开页面：

- [隐私政策](https://sekai-tools.cn/privacy)
- [用户协议](https://sekai-tools.cn/terms)
- [安全与举报](https://sekai-tools.cn/security)
- [公安备案查询](https://beian.mps.gov.cn/#/query/webSearch?code=44011302005743)

生产环境保存经过脱敏的访问/安全日志，并将日志和加密备份归档到私有 COS。COS 使用专用 CAM 子账号、私有读写和必要前缀权限；SecretId、SecretKey、SMTP 凭据、QQ App Key、SSH 私钥和数据库凭据只保存在受限的秘密目录或生产 Secret 配置中。

账号注销会删除账号、会话、绑定、收藏、成绩、卡组和玩家快照；法律要求保留的删除墓碑和安全审计记录会被隔离保存。玩家昵称与签名来自游戏公开资料，项目不建设关键词过滤或自动内容审核后台，提供人工举报、核查和停止展示流程。

## 本地文件清理

构建缓存、依赖、日志、临时截图、临时 XML 和本地验证产物不属于项目源码。清理时只删除经过确认的生成物；保留 `.secrets/`、`.env*`、数据库备份、正式签名材料、用户源码、正式静态资源和 `refer/` 参考源码。不要把本地缓存或验证产物提交到仓库。

## 开源与第三方声明

源码按仓库中的 `LICENSE` 发布；第三方组件、参考项目、固定版本和归属见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) 与 [`OPEN_SOURCE_COMPLIANCE.md`](OPEN_SOURCE_COMPLIANCE.md)。网络服务公开修改版时，应按适用许可证提供对应源码和部署材料，绝不公开密钥、用户数据或 provider token。
