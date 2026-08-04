# 合规运维实施手册

本文只覆盖访问日志、异地归档、加密备份、SSH 与告警。它不会自动开通
COS/域名邮箱，也不会自动修改现有 Caddy、Docker Compose、数据库或 SSH 配置。

## 一、上线门禁

以下项目全部具备后才可启用定时任务：

1. COS 私有桶、生命周期与最小权限 CAM 子账号已由控制台创建并实测。
2. 在离线可信设备生成 `age` identity，并至少做一份独立安全副本；生产服务器只
   获得 `age1...` 公钥 recipient。
3. 已安装 `age`、Python venv、fail2ban，并配置可用的安全告警收件地址。
4. `/etc/pjsktools/compliance.env` 与 `/etc/pjsktools/cos.env` 均为
   `root:root 0600`，且不是符号链接。
5. 当前数据库备份、恢复演练与 Caddy 配置已有独立快照。
6. **法律复核阻断项：**公开隐私政策目前使用“SEKAI TOOLS（sekai-tools.cn 网站运营者）”，
   不公开备案主体法定姓名。生产上线前必须由运营者或法律顾问确认该表述是否满足个人信息
   处理者身份披露要求；未形成书面确认不得上线。复核材料不得把个人姓名提交到公开 Git。

不要把填好的 env、COS 密钥、`age` identity、数据库备份、访问日志或告警正文
提交到 Git。

### 玩家公开资料紧急停止展示

项目不建设关键词过滤或自动审核后台。收到人工举报后，由受授权运维人员建立工单，核查后
把处置记录写入服务器私密 JSON 文件，并通过 `PLAYER_DISPLAY_DENYLIST_FILE` 指向该文件。
文件必须为 `root:root 0600`、不得进入 Git/COS 日志；每条记录只包含：

```json
{
  "entries": [{
    "region": "jp",
    "playerUid": "1234567890",
    "ticketId": "SEC-2026-001",
    "reasonCode": "reported-profile-review",
    "actionedAt": "2026-08-04T12:00:00.000Z",
    "expiresAt": "2026-08-11T12:00:00.000Z"
  }]
}
```

处置流程：保存生产配置快照，核对工单权限，使用原子替换更新私密文件，重启最小范围 API，
然后确认对应公开 profile 与 refresh 均返回通用 404，响应及应用访问日志不出现 UID。恢复展示
必须由另一名授权人员复核工单结论，移除或到期记录、重启 API，并验证正常显示；工单仅记录
`ticketId/reasonCode/actionedAt/expiresAt/执行角色/复核角色/恢复时间`，不得记录玩家昵称、签名
全文或举报邮件正文。任何解析错误都会阻止 API 启动，必须先修复私密文件，不能临时绕过。

## 二、Caddy 脱敏访问日志

`deploy/compliance/Caddy.access-log.caddy` 是可导入片段，不是完整生产
Caddyfile。先把片段复制到与现有 Caddyfile 同目录，再在每个公开站点块内加入：

```caddyfile
import compliance_access_log
```

若 Caddy 在容器内运行，还必须在现有 Compose 的 Caddy service 中把宿主机目录只映射
到同一路径，例如 `/var/log/pjsktools:/var/log/pjsktools`；否则日志会随容器重建丢失，
宿主机归档 timer 也看不到它。先检查容器实际 UID/GID，再把宿主机目录只授予该运行
身份写权限，目录不得开放给其他用户，日志文件继续保持 `0600`。修改 Compose 前保存
副本并用 `docker compose config` 验证，不能用示例覆盖现有生产文件。

API 结构化安全事件使用独立文件 `/var/log/pjsktools/security.json`，通过
`SECURITY_EVENT_LOG_PATH` 配置；不可逆事件标识使用独立的 `SECURITY_LOG_HMAC_KEY`，
该密钥只放生产秘密配置。访问日志和安全事件日志共享 200 天本地/COS 归档策略，但
不得把普通应用 stdout 当作安全日志替代品。

`deploy/compliance/compose.logging.yml` 只是叠加示例。应用前先只读核对生产 service
名称、volume 和运行身份：

```bash
docker compose --env-file .env.production -f compose.prod.yml ps
docker compose --env-file .env.production -f compose.prod.yml exec -T api id
docker compose --env-file .env.production -f compose.prod.yml exec -T caddy id
docker compose --env-file .env.production -f compose.prod.yml \
  -f deploy/compliance/compose.logging.yml config
```

宿主目录必须由 root 管理且不对其他用户开放；根据上面实际 UID/GID 给 API 和 Caddy
各自必要的目录写权限，先验证两者新建文件均为 `0600`。不要凭镜像名称猜 UID，也不要
用 `chmod 777`。若两容器 UID 不同，可用精确 POSIX ACL 授予目录创建权限，文件仍由
各自进程以 `0600` 创建。确认 bind mount 后再重建最小范围容器。

API 当前文件由 `logrotate-pjsktools-security` 每日 `copytruncate`、立即 gzip，保留/
限制 200 天并在轮转后强制当前及压缩文件为 `0600`。归档器同时发现 Caddy 的
`access-*.json.gz` 和 API 的 `security*.json.gz`，为两者上传数据+SHA-256 清单。
`copytruncate` 存在极短复制窗口，正式验收应在持续写测试中核对 JSON 每行完整及事件
序号；未来应用支持安全 reopen 后再经审查切换为 signal/reopen 轮转。

Compose 示例还为 API、Caddy、PostgreSQL 的 Docker `json-file` 设置 `10m × 5` 上限，
防止容器 stdout 耗尽磁盘。这些短期容器日志不是 200 天合规归档，也不得上传 COS。

日志为 JSON，文件模式 `0600`，每天 UTC 00:00 或达到 100 MiB 时压缩轮转，
本地保留 200 天。标准字段保留客户端 IP、时间、方法、主机、协议、状态码、响应
大小与耗时；另写入请求 UUID、不含查询串的 path 和 User-Agent。片段会：

- 删除原始 URI，避免任何查询参数落盘；
- 删除全部请求/响应 header，避免 Referer、Cookie、Authorization 等落盘；
- 不记录请求体、响应体；
- 把 path 中 8 位以上数字标识和 UUID 段替换为 `:id`。

该片段已用官方 Caddy `v2.11.4` 完成语法和实际请求日志测试；生产也应使用不低于
`v2.11.4` 的安全修复版本。修改生产配置前，应先用当前生产使用的同版本 Caddy 在临时副本执行 `caddy adapt`
和 `caddy validate`。验证 JSON 后再 reload，不要直接 restart；确认首页、API 健康
检查与 OAuth 回调正常后才保留。Caddy 官方日志过滤与文件轮转语义见
[log directive](https://caddyserver.com/docs/caddyfile/directives/log)。

## 三、Web CSP 与安全响应头

`deploy/compliance/Caddy.web-security-headers.caddy` 只用于 Web 站点，不导入 API
站点；API 已有独立的严格 JSON 响应策略。先在 Web 站点块导入：

```caddyfile
import web_security_headers_report_only
```

Report-Only 策略按当前代码所需资源制定：本站/API、QQ 官方按钮和头像、游戏图片及
音视频 CDN、Sekai Best Live2D 脚本、API 公告 iframe；不允许 object、第三方 frame、
任意 form-action 或 frame-ancestors。React 现有动态 style attribute 只通过
`style-src-attr 'unsafe-inline'` 放行，脚本不允许通用 `unsafe-inline`/`unsafe-eval`，
仅为 Live2D 保留 `wasm-unsafe-eval`。同时设置 DENY 点击劫持、nosniff、no-referrer
和最小 Permissions-Policy。

完成至少一个完整观察周期和以下回归后，才把上述 import 替换为且只能替换为：

```caddyfile
import web_security_headers_enforced
```

切换门禁：

1. 用生产同版本 Caddy 对完整临时配置执行 `adapt` 和 `validate`。
2. 检查首页、登录/注册、QQ 登录回跳、账号页、全部图鉴图片、QQ 头像、谱面、公告
   iframe、音频/视频、Live2D、分享图、PWA manifest 和移动端浏览器。
3. 在浏览器开发者工具汇总 CSP Report-Only violation；若出现来源，先确认确为必需且
   可信的固定源，再精确增加 scheme+host，禁止用 `*` 或笼统 `https:` 消警。
4. `curl -I` 确认 Report-Only 阶段没有正式 CSP；正式阶段只有
   `Content-Security-Policy`，没有 Report-Only，且安全头各只有一个预期值。
5. 正式切换使用 reload，不 restart；保留现有连接与配置快照。发现资源或登录异常
   立即恢复 Report-Only import 并 reload。

当前 `apps/web/index.html` 会从 `https://sekai.best` 加载 Live2D Cubism Core，因此
该固定 host 在 `script-src` 中有实际依据，正式 enforced 前必须用真实 Live2D 页面
验证。后续应优先评估把固定版本脚本本地托管；若继续跨域加载且上游支持稳定 CORS，
再评估增加 SRI `integrity` 与 `crossorigin`，完成构建和运行回归后收紧第三方脚本源。

当前没有接收 CSP 报告的专用 API，因此 Report-Only 结果通过审核浏览器和自动回归
收集，不能把报告请求体写入通用访问日志。未来增加报告端点时必须限流、去标识化，
不得保存完整页面 URL、查询串或用户数据。Caddy header 语义见
[header directive](https://caddyserver.com/docs/caddyfile/directives/header)。

## 四、安装顺序

先复制示例而不是直接编辑仓库文件：

```bash
sudo install -d -m 0700 /etc/pjsktools
sudo install -m 0600 deploy/compliance/compliance.env.example /etc/pjsktools/compliance.env
sudo install -m 0600 deploy/compliance/cos.env.example /etc/pjsktools/cos.env
```

填写后先执行只读预检：

```bash
sudo deploy/compliance/install-compliance-ops.sh --check
sudo deploy/compliance/harden-ssh.sh --check
```

`--apply` 只适用于首次安装；检测到同名目录、unit 或 fail2ban 配置会拒绝覆盖。
执行后逐个手动运行并检查：

```bash
sudo systemctl start pjsktools-log-archive.service
sudo systemctl start pjsktools-encrypted-backup.service
sudo systemctl start pjsktools-cos-restore-check.service
sudo systemctl start pjsktools-compliance-monitor.service
sudo systemctl list-timers 'pjsktools-*'
```

日志归档每天运行。每个数据对象都生成独立 `.sha256` 清单，数据对象和清单对象分别
执行 SSE-COS 上传及 HEAD 元数据校验；只有两者全部成功后才写本地验证 marker。
月度随机取回会同时下载数据对象及配对清单，复算数据哈希并核对清单内容。
数据库每天生成一个直接流式 `age` 加密的 custom-format dump；
星期日另复制一份 weekly。daily 本地/COS 35 天，weekly 92 天，访问日志 200 天。
本地清理要求 marker 中的数据键/哈希、清单键/哈希与本地两个文件全部一致；旧格式、
缺清单或任一哈希不一致都会保留文件并等待人工核查。

账号注销墓碑不只存在数据库备份中。每天数据库备份完成后，独立任务只选择
`user_hash`、`email_hash`、`deleted_at`，校验两个 hash 均为 64 位 HMAC-SHA256，
再用 `age` 加密并上传 `deletions/tombstones/`。临时 JSON 为 `0600`，默认位于 root
专用 tmpfs，完成加密后立即删除；服务器仍只有 age recipient，没有解密 identity。
密文和配对清单在本地与 COS 至少保留 200 天并依赖桶版本控制。任何 SQL、字段校验、
age、数据/清单上传或 HEAD 校验失败都会令 service 失败、保留已有密文并触发监控。

## 五、加密备份与恢复验证

在离线设备生成 identity：

```bash
age-keygen -o pjsktools-backup.agekey
age-keygen -y pjsktools-backup.agekey
```

第一条命令生成的文件是解密私钥，不上传服务器、不进入聊天/Git；第二条输出的
`age1...` 公钥写入生产 `AGE_RECIPIENT`。私钥至少保留两份，分别使用加密磁盘或
密码管理器保护。

生产服务器没有私钥，因此月度 COS 取回验证只验证对象可下载且 SHA-256 一致。
继续保留现有每周数据库恢复演练；它与这里新增的异地密文校验互不替代。每月还应在
隔离恢复机随机下载一个 `.dump.age`，用离线 identity 解密并恢复到临时
PostgreSQL，核对迁移版本、关键表行数和应用只读 smoke；完成后安全销毁临时数据。
恢复演练记录只写日期、对象键、哈希、结果和执行人角色，不写数据库内容。

### 注销墓碑恢复顺序（不得颠倒）

1. 在隔离恢复环境解密并恢复选定的数据库备份，但暂不开放 API/Web 流量。
2. 从 COS 版本化前缀 `deletions/tombstones/` 取得时间最新且上传/清单完整的一组
   `.json.age` 与 `.sha256`，复算密文 SHA-256 后用离线 age identity 解密到 `0600`
   临时 JSON。
3. 用当前受控的 `DELETION_TOMBSTONE_KEY` 和恢复库专用 `DATABASE_URL` 执行：

   ```bash
   node scripts/replay-deletion-tombstones.mjs replay /private/path/latest-tombstones.json
   ```

4. 检查输出、墓碑行数和已注销账号均未复活，再执行应用只读 smoke。重放失败必须销毁
   此次恢复库并重新开始，不能带病开放流量。
5. 安全删除明文墓碑文件，记录密文对象键、哈希、重放结果和执行角色。

`DELETION_TOMBSTONE_KEY` 必须作为恢复所需的长期秘密独立备份；不要随普通密钥轮换
任意替换。若必须轮换，应先由应用/安全审查制定兼容旧 HMAC 版本的迁移方案，否则旧
墓碑无法匹配恢复出的账号。

## 六、SSH 加固

先打开并分别验证两个 `ubuntu` 公钥 SSH 会话，保持两者不关闭。运行预检后才可：

```bash
sudo deploy/compliance/harden-ssh.sh --apply --confirmed-second-session
```

脚本确认 `ubuntu` 账号及 `authorized_keys`、要求至少两个 22 端口连接、备份旧配置、
写入独立 drop-in，执行 `sshd -t` 后才 reload。目标设置为：禁止 root、密码和键盘
交互登录；只允许 `ubuntu` 公钥；关闭 X11；最大认证尝试 3 次。reload 后保持旧会话，
立即开第三个会话验收。失败时按脚本输出的 `/var/backups/pjsktools-ssh/<timestamp>`
恢复，不要关闭最后一个可用会话。

fail2ban 使用标准 `sshd` jail：10 分钟内 3 次失败封禁 1 小时。不要把自己的固定
管理出口加入永久封禁；正式启用前先确认云防火墙与 UFW 仍只开放必要端口。

## 七、告警、巡检与留存

15 分钟巡检磁盘、最近加密备份、COS 上传、TLS 有效期及 fail2ban。所有异常先写
syslog；已正确配置 sendmail 时再发送至角色邮箱。建议同时在云监控配置：

- 根分区 >= 85%；
- systemd service 失败；
- 备份/COS 成功标记超过 30 小时；
- TLS 剩余不足 21 天；
- 异常登录与 fail2ban 短时大量封禁。

每月保存一次随机日志取回验证结果，每月检查 COS 生命周期和费用告警，每周执行
数据库恢复演练，每季度复核 CAM/SSH/服务器权限。相关网络日志保存 200 天；任何
人工导出的诊断包也应遵守相同脱敏和到期删除规则。
