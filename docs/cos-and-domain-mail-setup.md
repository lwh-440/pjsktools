# COS 与域名邮箱开通手册

两项服务必须由账号持有人在腾讯云/企业微信控制台开通。本仓库只提供客户端实现和
占位配置，不包含任何真实 APPID、SecretId、SecretKey、SMTP 授权码或个人资料。

## 一、腾讯云 COS

1. 打开 [COS 控制台](https://console.cloud.tencent.com/cos5/bucket)，新建
   `pjsktools-compliance-<APPID>` 风格的桶。地域必须选择上海 `ap-shanghai`，标准
   存储、单可用区、私有读写。
2. 开启版本控制与默认 SSE-COS（AES-256）服务端加密。不要开启静态网站、公有读、
   匿名访问或跨域写入。
3. 创建四条生命周期规则：`logs/` 200 天删除，`backups/daily/` 35 天删除，
   `backups/weekly/` 92 天删除，`deletions/tombstones/` 至少 200 天后删除。桶必须开启
   版本控制；墓碑前缀的非当前版本也不得早于 200 天清理。先在测试前缀验证规则匹配，
   再用于生产前缀。
4. 如控制台已为账号开放[对象锁定](https://cloud.tencent.com/document/product/436/55294)，
   先确认它能否只覆盖日志对象。若租户仅支持桶级默认保留，不要在同时存放 35/92 天
   备份的共享桶上设 200 天锁；应另建私有日志桶后再锁 200 天。未开放时保持版本控制，
   并确保服务器 CAM 身份没有 DeleteObject、生命周期、版本删除或改 ACL 权限。
5. 在 CAM 新建专用子账号/角色，仅授权该桶的 `logs/*`、`backups/daily/*`、
   `backups/weekly/*`、`deletions/tombstones/*` 使用 `PutObject`、`HeadObject`、`GetObject`，并仅为月度随机
   验证提供必要的前缀列表权限。不得授权 DeleteObject、PutBucketPolicy、PutACL、
   跨桶或其他云产品权限。建议上传与月度验证使用两个不同角色；若暂时共用，也必须
   没有删除和权限管理能力。
6. 生成子账号密钥后，只写入服务器 `/etc/pjsktools/cos.env`（`root:root 0600`）和
   本机秘密目录；不要出现在 shell 历史、命令参数、日志、聊天或 Git。
7. 先上传一个无敏感信息的测试文件，确认 HEAD 返回相同 `x-cos-meta-sha256`、正确
   Content-Length 及 `x-cos-server-side-encryption: AES256`，再随机下载复算哈希。
8. 设置每月 10 元费用告警，并开启异常公网流量/请求数告警。价格以
   [COS 计费页](https://cloud.tencent.com/document/product/436/53482)当日展示为准。

服务器脚本使用腾讯云官方 Python SDK，上传时显式设置 SSE-COS，并把本地 SHA-256
写入对象自定义元数据。官方 SDK 的 SSE-COS 示例见
[对象加密](https://cloud.tencent.com/document/product/436/63744)。COS 未开通、密钥
为空或权限不足时脚本会失败并保留本地文件，不会假装归档成功。

## 二、联系邮箱

1. 当前公开的隐私、安全、举报及一般联系地址统一使用 `sekaitools@qq.com`，继续使用
   现有 QQ SMTP 发送验证码和系统通知，不开通或切换域名邮箱。
2. 网页中的 `mailto` 链接使用不同主题区分隐私权利请求、安全漏洞、违法信息举报和
   一般咨询；收件箱应按主题建立过滤规则和处理标签。
3. 完成站内验证码、QQ、163 等外部邮箱投递和回复测试，检查退信、垃圾箱与显示名称
   是否正常。SMTP 密码或授权码只放生产秘密配置与本机秘密目录，不进入 Git 或日志。
4. 建立处理时限：安全漏洞/违法信息先自动回执，严重安全事件尽快人工确认；隐私权利
   请求在验证身份后登记、处理、复核并留存不含请求正文的处置记录。
