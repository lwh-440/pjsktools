# Android 后续计划

> 当前阶段只保存计划，不修改 Android 源码。网页端和后端先完成真实数据中台与工具箱体验，Android 后续按同一后端 API 接入。

## 目标

- Android 与网页端共用同一个后端，不直接依赖 Team-Haruki、Sekai Viewer 或 Moesekai 的外部接口逻辑。
- 所有展示内容以真实数据为准；真实数据暂不可用时显示明确不可用状态，不用伪造数据填充。
- Android 端后续覆盖网页端核心功能：玩家档案、分数线、历史活动、歌曲、卡牌、卡池、称号、素材、服装、贴图/漫画、账号同步和工具计算。

## 参考项目

- `Sekai-World/sekai-viewer`
  - 后续遇到歌曲详情、谱面图、封面、卡图、活动图、master 数据组织、多区服资源差异时，优先参考它的实现方式。
- `moe-sekai/Moesekai`
  - 后续遇到 SUS 谱面、真实谱面图、`music_meta`、谱面播放器、缓存策略、工具型功能时，优先参考它的实现方式。
- Android 端不直接复制这两个项目的前端代码；它只消费本项目后端整理后的统一 API。

## 后续接入接口

优先接入：

- `GET /api/regions`
- `GET /api/assets/:region/config`
- `GET /api/master/:region/music/:musicId/full`
- `GET /api/master/:region/cards/:cardId/full`
- `GET /api/master/:region/events/:eventId/full`
- `GET /api/master/:region/:collection/:id/full`
- `GET /api/master/:region/gachas`
- `GET /api/master/:region/honors`
- `GET /api/master/:region/materials`
- `GET /api/master/:region/costumes`
- `GET /api/master/:region/stamps`
- `GET /api/events/:region/:eventId/ranking-forecast`
- `POST /api/tools/score-control`
- `POST /api/tools/deck-recommend`

账号同步：

- 邮箱登录、注册、刷新、退出。
- QQ 登录和绑定等待 QQ 互联审核通过后再做端到端接入。
- 收藏、成绩、设置必须与网页端共用后端数据。

## 功能路线

- 歌曲图鉴：列表分页、搜索、详情页、封面、时长、BPM、难度、真实谱面图、SUS 外链。
- 卡牌图鉴：普通图、特训图、属性、稀有度、角色、真实技能、相关活动、相关卡池。
- 活动详情：活动图、剧情简介、章节、相关卡牌、相关歌曲、相关卡池。
- 展示类 master：卡池、称号、素材、服装、贴图/漫画。
- 分数线：沿用当前真实排名接口，当前活动分数线保持自动刷新，并展示实验性预测。
- 工具：周回/控分工具、保守组卡推荐工具。
- 离线/失败状态：接口不可用时显示最近一次成功数据、刷新时间和明确错误，不用假数据。

## 暂不实施

- 当前阶段不修改 Android 源码。
- Android v1 不内嵌 MikuMikuWorld/WASM 或 WebGL 可播放谱面播放器，只展示真实谱面图片和外链。
- 不实现自动游玩、代打、私密数据抓取或绕过游戏客户端安全机制。

## 验收标准

- Android 后续实现时，必须通过同一后端 API 获取真实数据。
- 同一区服下，Android 与网页端显示的歌曲、卡牌、活动、分数线保持一致。
- 真实谱面图不可用时，不得显示伪造谱面图。
- 登录后收藏与成绩记录能与网页端同步。


## 账号与玩家数据 API 补充
- Android 后续必须复用同一后端账号体系：邮箱验证码注册、邮箱登录、QQ OAuth 绑定、refresh/logout。
- 需要接入 /api/me/player-bindings，支持一个账号绑定多个区服 UID，并选择默认 UID。
- 需要接入 /api/me/player-data/:bindingId/cards，用于上传/编辑用户持有卡、等级、Master Rank、技能等级、特训状态等。
- 需要接入 /api/me/deck-configs 保存卡组配置。
- 组卡推荐使用 /api/me/tools/deck-recommend，不可在 Android 端重复实现私有算法；Android 只负责输入、展示和解释缺失字段。
- 参考项目：Sekai-World/sekai-viewer 用于活动加成和用户卡牌列表体验，moe-sekai/Moesekai 用于 deck recommend、score-control、用户数据和后续高级计算方向。
- 当前阶段仍不修改 Android 源码。
