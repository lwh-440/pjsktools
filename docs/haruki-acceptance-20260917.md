# Haruki 资产验收矩阵（更新至2026-09-26）

## 2026-09-26 Team Haruki registry 公告适配：5394d81 已同步并生产复验

`f2b4428`（承接 `5394d81`、`dd1cc7c`）已提交到本地 `main`、GitHub `main`，并部署到 `101.35.21.48` 的 `/opt/pjsktools`；服务器最新 marker 为 `f2b4428`，API 容器重建后为 `healthy`。本次包含：

- master registry current 清单按 ETag 条件重验证，304 时复用内存清单；清单顶层 `contentHash` 透传，文件 sha256 用于 immutable blob 地址。
- blob 内容按 sha256 地址缓存；blob 返回 404 时回退 `/files/{name}.json`，并发请求共享同一回退结果；raw GitHub 模式不把 `music_metas.json` 错映射成 `musics.json`。
- `/v1/metas/{region}/music_metas.json` 独立接口按区域缓存并支持 ETag，计算器的独立获取路径也会携带 `If-None-Match` 并复用 304；`/api/master/:region/information` 也接入 API 的 ETag/304 响应。
- Web API、API resolver、Android asset proxy 的候选上限统一为 12，OpenAPI 约束同步为 12；Android network 单测通过。这样事件封面在 Haruki 直链、代理和旧 `.webp` 候选中不会在第 6 项提前截断。

生产证据：`/api/master/jp/status` 返回 `synced=true`、`repository=Team-Haruki/haruki-sekai-master`，cards 1452、songs 719、events 218；核心 reference collections 的 `sourceUrl` 全部为 `https://sekai-api-cdn.haruki.seiunx.com/v1/master/jp/blob/...`。生产 `POST /api/tools/deck-compare` 返回 `musicMetaTrace.status=matched`、`rowCount=3730`、`source=https://sekai-api-cdn.haruki.seiunx.com/v1/metas/jp/music_metas.json`、`missingFields=[]`。生产公告接口首个请求为 200 且带 ETag，带同一 `If-None-Match` 的第二个请求实际返回 304。上游 CDN 的 current 与 music metas 均已核对有 ETag；当前服务器网络实测上游对条件请求仍返回 200，因此客户端 304 分支以本地测试覆盖，不能把 200 记成上游 304。

旧源回退按“先确认 Haruki 404，再使用旧候选”执行。复查发现 CN costume `261011`、`261021` 的 Haruki PNG 已恢复为 HTTP 200；KR honor `20059`–`20062` 和 CN material `3004` 的当前 Haruki 主图及已列旧候选均为 HTTP 404，仍保留“无可用图”的未通过状态，不能伪称已接入。JP tips 的 Moe 旧源以及其他已确认 Haruki 缺失的资源继续作为显式 fallback；API 的 `source` 字段仍记录实际候选来源。

Android 正式包已重新构建并签名，`testDebugUnitTest`、`assembleRelease` 与 network 单测通过，签名证书 SHA-256 为 `0e02a9f1468ec3d378bbbd0eb3d7c807bbe5e31c135ba6838d64dc230d05e0e9`。本轮 APK 2797933 字节、SHA-256 `7354bbd91f0f425c67da2fb068317b7e875c5360b17ca05f568a135919f2c540`，服务器文件与公网下载字节一致；当前没有启动中的 Android 模拟器，所以本轮只记构建、签名和公网字节验收，不虚构新包的设备画面验收。

## 2026-09-20 Android final c5de19d：公网包与故事1背景修复通过

`c5de19d`已推送并同步服务器`101.35.21.48`。服务器与公网完整APK均为2797933字节、SHA256 `1f02e2a93bc69d6644d2541d5e3fb2fb9c185f350bbf63350f75cfa09125f498`；四文件源码SHA256为`c0a4b7acb9b6cb6d044c4843a609ad4a0d645eb1b337cc090381e3ac1ef3129f`，与提交一致，marker为完整`c5de19d` snapshot `android-c5de19d-final`。旧bfdbfdc包与故事503失败保留为历史，当前final包发布与来源校验通过。

新包安装后，JP故事1原生背景`bg_a002201`实际显示，503消失；旧两张图是raw/proxy重复，现按一张正确背景计。证据为`.runtime/asset-acceptance-20260917/android-story1-background-fixed.png`，定向2/2、正式build/sign/review均通过。

bfdbfdc WebView故事1另有完整时间线证据：自动推进到`ready 85/85`并恢复播放，截图`.runtime/asset-acceptance-20260917/android-bfdbfdc-story1-complete85.png`；此前暂停38、恢复42的证据仍保留。该结论覆盖故事运行时推进与暂停恢复样本，不等于每句语音亲听、全故事库或全部动作通过。

## 2026-09-20 Android bfdbfdc历史包：模型实显通过，故事1背景503（已由c5de19d修复）

`bfdbfdc`已提交并推送。修复包正式脚本构建完成，SHA256为`1666322272821962048e3e525b60ee248ede3e1fea9d5cbd87ff316530f92f66`，主代理在`emulator-5554`执行`install -r`成功。新版`clb01_21miku`舞台实际显示完整人物，包括头部、长发、身体和裙装，证据`.runtime/asset-acceptance-20260917/android-bfdbfdc-live2d-render.png`；该模型样本的运行地址缺失阻塞已由新包实显关闭。

点击`s-common-angry01`后UI显示“正在播放Motion/s-common-angry01”，但尚未连续采样人物动作变化，不能据此记全部动作通过。bfdbfdc发布现已完成：服务器`101.35.21.48`的APK与公网完整下载均为2797933字节，SHA256均为`1666322272821962048e3e525b60ee248ede3e1fea9d5cbd87ff316530f92f66`。服务器Gradle源码SHA256为`c0a4b7acb9b6cb6d044c4843a609ad4a0d645eb1b337cc090381e3ac1ef3129f`，与提交一致，snapshot marker为`bfdbfdce30830774d305ca42b619672c5f016c76`；GitHub推送和服务器源码同步已分别确认。

该段记录bfdbfdc历史：新版JP卡牌故事1原生播放区曾实测两张raw/proxy背景HTTP503，停在`1/85`、`SpecialEffect bg_a002201`，证据`.runtime/asset-acceptance-20260917/android-bfdbfdc-story1-background503.png`；后续c5de19d已修复，当前final包单一正确背景实际显示，见顶部。

原包`f9e4aaf`的CN260221详情也已由主代理目视真实服装图、名称“暗色格调”、性别男性及适用角色11/12/13/16/23/26，证据`android-f9e4aaf-cn260221-gender.png`。关闭该Android gender条目样本待办，不外推全部服装元数据。

## 2026-09-20 Android旧包release阻塞：f9e4aaf缺少公网运行地址

已公开的`f9e4aaf`正式包由主代理实测EN `clb01_21miku`：纹理实际显示，详情统计动作为20、贴图为1，但Live2D舞台显示红字`WEB_RUNTIME_BASE_URL未配置`，证据`.runtime/asset-acceptance-20260917/android-f9e4aaf-live2d-runtime-missing.png`。构建漏配公网运行地址，**f9e4aaf未通过整个release验收**；纹理或动作数量不等于舞台运行通过。

后续bfdbfdc修复包已安装且该模型完整人物实显，见顶部；其故事1背景503已由c5de19d修复，当前final包背景通过。f9e4aaf的JP Comic1及MySekai家具1816样本通过结论保持；旧包故事播放通过仅适用于原版本，不能覆盖新版故事验收或全部模型动作。

## 2026-09-19 Android f9e4aaf实显增量：JP Comic1与家具1816

JP Comic1列表与详情在正式App实际显示，证据`.runtime/asset-acceptance-20260917/android-f9e4aaf-comic1-detail.png`。独立review确认调用`RemoteCatalogImage`的新resolver；生产同组三个候选的请求返回200、PNG、324831字节，`x-asset-source`为Haruki。截图证明设备实显，来源由已审查调用链及同候选生产响应支持，**不是设备网络抓包证据**；本样本不外推全部漫画。

MySekai家具1816列表与详情主图KAITO大型玩偶实际显示，成本文本为蓝色memoria×15、cotton×3、linen×3，证据`android-f9e4aaf-mysekai1816-detail.png`。原生成本区仅显示文本，本次不计制作素材图片通过。MySekai其他类别继续待验；后续bfdbfdc模型实显及f9e4aaf CN260221 gender样本通过见顶部，动作连续变化仍未验。

## 2026-09-19 公开组卡推荐图片与Android安装增量

Web公开组卡推荐使用卡ID `1,2,3,4,5` 测试输入，首次连接失败后重试成功，五张卡图均实际显示128×128，来源全部为Haruki `startapp/thumbnail/chara`。主代理已目视`deck-recommend-browser.json/png`中的五图，证据位于`.runtime/asset-acceptance-20260917/`。关闭该推荐结果图片入口待办，不据此外推计算精度。

Android `f9e4aaf`已安装到任务新冷启`emulator-5554`，主代理通过scrcpy与sky实际点击App图标，只读adb确认`com.pjsktools.app/.MainActivity`，正式首页已显示；窗口最大化后可操作。后续JP Comic1与MySekai家具1816主图已有顶部实显证据；其他MySekai类别仍待验；模型实显与CN260221 gender后续通过见顶部。

## 2026-09-19 Web卡牌角色筛选：26头像Haruki实显通过

主代理在生产页面进入卡牌→展开筛选，26个角色头像均实际显示，来源为`https://images.haruki.seiunx.com/sekai-toolbox/static_images/chara_icon/`，自然尺寸128×128；截图中三行26头像均已目视清晰。证据为`.runtime/asset-acceptance-20260917/card-filter-characters-browser.json/png`。关闭Web卡牌角色筛选头像这一入口的待办，不外推Android或奖励头像。

## 2026-09-19 资产resolver与Android发布：093978d实图通过，f9e4aaf已发布并有原生样本

`093978d`已推送并部署，API healthy。生产`resolver-093978d-pickaxe.headers`实测HTTP200、`image/png`、9488字节、`x-asset-source`为Haruki；主代理已实际查看`resolver-093978d-browser.png`中的镐图，浏览器图片152×152。证据均位于`.runtime/asset-acceptance-20260917/`。这关闭该resolver候选顺序修复的待审/未上线状态，实显结论限本次镐图样本。

`d380d93`已推送并部署API-only配置，将`ASSET_CACHE_DIR`指向既有node可写的`api_data/assets`。主代理真实请求resolve pickax0001：首次200、PNG、9488字节、cache miss，第二次cache hit，容器healthy。证据为`.runtime/asset-acceptance-20260917/resolver-d380d93-pickaxe-first.headers`、`resolver-d380d93-pickaxe-second.headers`及`resolver-d380d93-pickaxe.png`。当时并发候选抢用旧源的顺序修复尚未上线；后续093978d部署与Haruki实图证据见上段，保留两次验收的区别。

`f9e4aaf` Android四文件已提交并推送，10项network tests、compile、assembleRelease/Debug及签名检查通过。Release为2797933字节，SHA256为`beb690b442d34e4bfcbf1978ddda9aa8a1e4954bb029c62a5061906c6c15b937`。`publish-android-f9e4aaf.sh`以exit0完成发布，服务器APK与公网完整下载的`.runtime/asset-acceptance-20260917/android-f9e4aaf-public.apk`同hash；公网下载session68857以exit0结束。本地`deploy/downloads`的APK与sha已同步，四文件精确源码tar已同步服务器。**新包已安装emulator-5554并实际打开正式首页**；scrcpy窗口最大化后可操作，JP Comic1与家具1816主图已实显，其他MySekai类别待验；模型实显与CN260221 gender后续通过见顶部。旧78fda34及其他已发布包hash保留为历史。

MySekai素材16「モーター」重新搜索后正常，主代理已在详情实际看到Haruki图片、152×152，证据`mysekai-material16-browser.json/png`。此前搜索0结果不作为后端名称缺失；当前UI没有relatedblueprints区，不计不存在的相关蓝图区域为验收通过。

## 2026-09-19 MySekai类型关联：78db345已部署，wall2与普通镐样本通过

`78db345`已提交、推送GitHub并部署，API healthy，4/4 tests、build与独立review通过。生产网页本轮结果如下（证据均位于`.runtime/asset-acceptance-20260917/`）：

| 入口 | 实际显示与关联结果 | 证据 |
| --- | --- | --- |
| wall2详情 | 主图与两项素材共三图均Haruki、152×152；成本仅木×30、linen×3，不再混入tool100002成本 | `mysekai-78db345-wall2-browser.json/png` |
| 工具列表 | 八个工具名称正确，八张图均Haruki、152×152 | `mysekai-78db345-tools-list.json/png` |
| tool100001详情 | 普通镐主图与wood×5、stone×3共三图均Haruki、152×152 | `mysekai-78db345-tool100001-browser.json/png` |
| tool100010详情 | 电锯主图与铁×5、马达×5、电池×5共四图均Haruki、152×152，主代理已目视；取代此前两图loading的未完成状态 | `mysekai-78db345-tool100010-browser.json/png` |
| floor3详情 | 新会话tab6恢复生产UI后，主图及wood×30、linen×3两材料共三图全部Haruki、152×152，主代理已目视 | `mysekai-floor3-fresh-browser.json/png`；本条Haruki实显待办关闭；旧会话回退证据`mysekai-78db345-floor3-browser.json/png`保留 |

JP生产完整响应核对：`/api/master/jp/exchanges/context`共3112条兑换，其中78条含蓝图奖励、工具蓝图奖励为0；`/api/master/jp/missions/context`共1536条任务（普通28、新手11、角色572、称号925），蓝图奖励及工具蓝图奖励均为0。该工具奖励分支已有代码修正与测试，JP生产无匹配UI样本；不造样本、不以家具蓝图代替。floor3新会话实显已通过；Android本轮新增入口仍待验，不以Web样本外推。

floor3历史定位：正确Haruki URL为`https://sekai-assets.haruki.seiunx.com/jp-assets/ondemand/mysekai/thumbnail/surface_appearance/mis0001/tex_mis0001_floor_appearance_1.png`，实现代理连续三次GET均200、PNG、9772字节，路径并未缺失。Web `ArtImage`在一次`onerror`回退成功后，由会话内`successfulImageSources`记住旧fallback。原tab3刷新曾遇`ERR_CONNECTION_CLOSED`，新首页曾遇60秒工具超时及kernel reset；这些未完成尝试保留，后续tab6全Haruki实显证据已关闭该条待办。

CN服装wrapper来源仍未完成迁移：未找到等价Haruki表，实现代理证据中有9条历史缺失、15条关联歧义，不能把现有缩略图或gender修正当作catalog全量迁移。Android前次冷启已device连通、无需再次Allow，当时窗口上部截图与坐标不可靠，随后`emu kill`并还原ini；最新emulator-5554镜像窗口最大化后已可操作。App图片加载器改用后端resolve的f9e4aaf已推送并构建/签名通过，新包已发布且公网完整下载同hash，随后已安装并显示首页；Comic1与家具1816已有实显样本，其余入口见顶部待办。

## 2026-09-19 CN card4分享：04b4b2f已部署并实际显示卡面

`04b4b2f`分享修复已提交、推送GitHub并部署，服务器API healthy，31/31 tests与API build通过。生产网页按用户流程选择国服→卡牌4→生成，实际显示带卡面的1200×630分享图，主代理已目视截图；图片URL与保存链接href均带`v=source-v2`。证据为`.runtime/asset-acceptance-20260917/share-card-cn4-04b4b2f-browser.json/png`。本样本关闭旧“只有模板”待办，其他分享类型与Android范围分别保留。

## 2026-09-19 MySekai制作素材：d51769b双入口1816通过，分享增量

`d51769b`修正MySekai成本表为`mysekaiBlueprintMysekaiMaterialCosts`，并接通blueprint自身成本关联；已推送GitHub、完成服务器部署，API healthy。生产JP `fixtures/1816`与`blueprints/1816`两条详情均实际显示KAITO大型玩偶主图及三项制作素材，每个入口四图均为Haruki、152×152：蓝色memoria（60）×15、cotton（22）×3、linen（21）×3。证据为`.runtime/asset-acceptance-20260917/mysekai-d51769b-fixture1816-browser.json/png`及`mysekai-d51769b-blueprint1816-browser.json/png`，关闭这两个入口的制作素材实显待办。

页面最初八项统计为0、预览无样本是独立context请求尚未完成；随后统计与名称正常填入，不记为契约bug。工具类型错关联曾影响正向blueprint、fixture成本反查、兑换/任务奖励；后续78db345已修正、review通过并部署，wall2正确成本、八工具列表与普通镐详情已有顶部实显证据。wall2早先混入tool100002成本的失败保留为历史；JP兑换/任务无工具蓝图奖励样本，保留代码与测试结论；floor3新会话与电锯详情随后均Haruki实显通过。本次1816家具蓝图样本不外推Android。

CN `song/1`分享已生成1200×630图片，主代理目视Tell Your World的初音曲绘背景，证据`share-song-cn1-browser.json/png`，歌曲分享实图样本通过。CN `card/4`初轮仅显示模板；后续04b4b2f部署并实显卡面通过，见顶部新证据。既有生日card1464与Android event217通过记录不变。

## 2026-09-19 CN gender修复：da3e90a生产API与Web260221通过（后续Android样本通过见顶部）

`da3e90a`的24项测试、API build与独立review通过，已推送GitHub，`deploy-assets`服务器部署成功、API healthy。生产API证据 `.runtime/asset-acceptance-20260917/cn-costume-da3e90a-api.json` 中，260221为 `male/matched`，关联master来源与图片URL均为Haruki；260211为 `female/no-match`，由于关联组仍有unknown gender（`unresolvedGroupGender=true`），保留wrapper的female值，不能记成matched或全部服装元数据已迁移。

生产Web恢复后，从首页经SPA导航选择国服并搜索260221，详情实际显示“性别：male”，主代理已目视服装图。`.runtime/asset-acceptance-20260917/cn-costume-da3e90a-browser.json`记录128×128、同CN Haruki proxy图片，截图为`cn-costume-da3e90a-detail.png`。该Web样本待办关闭；此前IAB `ERR_CONNECTION_CLOSED`和工具超时保留为未完成尝试，不再作为当前Web阻塞。

本轮Android曾device连通，正式包`com.pjsktools.app/.MainActivity`以PID3959实际打开首页，授权已完成。CUA多显示器截图上部裁剪及坐标行为仍不可靠，缩小窗口重启后仍存在，本轮未进入漫画或模型，也未完成gender验收；Android保持待验，不标记为等待用户Allow，不改写此前已通过的Android图片样本。随后任务模拟器`emulator-5558`已正常`emu kill`（exit0）释放资源，未停止其他设备、Java或Chrome。

## 2026-09-19 漫画新增正式验收：e5e8116，JP新增40图全部Haruki实际显示

`e5e8116`本地、GitHub与服务器已同步，`deploy-assets`部署成功，API healthy。漫画新增40条，同时保留原63条 tips；两组内容比对无匹配，不能将新漫画当作原 tips 的同内容替换。

新页面会话的完整结果 `.runtime/asset-acceptance-20260917/comics-e5e8116-browser-complete.json` 为 `cards=40`、`loaded=40`、`Haruki=40`、`fallback=[]`、`loading=0`、`unavailable=false`：本轮JP新增40张漫画全部由Haruki来源实际显示。同批完整截图 `comics-e5e8116-complete.png` 已由主代理目视40图；CUA长截图的拼接重叠与长空白属于截图产物，不据此判定UI布局异常。

Comic 40详情原图也已由主代理目视，证据 `comics-e5e8116-detail-40.png`，DOM图片尺寸644×478、实际URL为Haruki proxy；仅覆盖该条详情，不外推全部漫画详情或Android。

初轮10图JSON中 `Comic 6`、`Comic 8`、`Comic 10` 实际走fallback的记录保留；随后看到40个DOM图片元素也未单独计为来源通过。本节通过结论依据新会话完整来源与显示证据，仅覆盖JP新增40图。原63条tips及其来源待办保留，原2160项样本统计不以新增内容冲销或改写。

五服当前 `tips.json` 均无 `comic_0001`–`comic_0040` 的名称记录；`Comic N` 是本项目显示占位名，`haruki-comic_####` 是内部ID命名空间，不作为官方标题或官方master ID。上游缺图与其他既有待办保持不变。

## 2026-09-18 Live2D 生产样本：3b6b6c5模型与表情动作已验收

`3b6b6c5`已提交并推送GitHub，`/tmp/deploy-assets.sh`服务器部署成功，API healthy。CUA在真实生产页面刷新 `EN Live2D v1/collabo/21_miku/clb01_21miku` 后，画布显示初音；点击 `face_smile_01` 与 `face_closeeye_01` 后状态改变，闭眼状态截图实际确认。证据为 `.runtime/asset-acceptance-20260917/live2d-3b6b6c5-viewport.png` 与 `.runtime/asset-acceptance-20260917/live2d-3b6b6c5-closeeye.png`。

该证据只覆盖这一个生产模型样本及两个表情动作，不外推全库，不计Android通过，也不等于所有动作、表情、motion3及模型索引已迁移。原Live2D legacy bridge与完整目录边界仍按下文记录。

## 2026-09-18 漫画 Haruki 路径纠正：40/40 HTTP成功（后续JP页面验收见顶部）

此前把 `comic_0001`–`comic_0040` 的 Haruki 资源写成 404，是因为探测错误使用了 `/jp` 根。修正脚本 `check-haruki-comics-corrected.cjs` 对两种根和三组候选共240个 URL复核，正确路径 `https://sekai-assets.haruki.seiunx.com/jp-assets/startapp/comic/one_frame/comic_0001.png` 至 `comic_0040.png` **40/40 HTTP 200、image/png**；结果保存在 `haruki-comics-40-corrected.json`。

这次HTTP核查只证明 Haruki 资源可取。40个新漫画图与原63条 tips 是不同内容，内容比对无匹配，原 tips 条目和当次页面结果保留。后续新增漫画已随 `e5e8116` 部署，JP新会话完整来源与实际显示40/40通过，见顶部；旧“新增仍在审查/部署中”和“页面待复验”状态已被取代，初轮fallback记录仍保留。

## 2026-09-18 WorldLink详情正式验收：3e9d23e trace与两种图表均通过

`3e9d23e`已推送并部署。生产 EN179 Miku21 详情接口返回 HTTP 200，Haruki 轨迹分页完整收集：`playerTrace` **1405** 条、`rankTrace` **1384** 条，均为 `traceCompleteness=complete`，覆盖分别为15页和14页、`termination=exhausted`、`excludedIdentityRecords=0`。证据为 `worldlink-detail-3e9d23/report.json`。

同一生产页面实际打开详情并显示玩家追踪与档线追踪两种折线图，截图为 `worldlink-detail-3e9d23/player.png` 与 `worldlink-detail-3e9d23/rank.png`；报告 `passed=true`，接口响应中的队长卡主 URL 为同区 Haruki。该证据取代顶部旧版“详情trace仍0”的结论，但只覆盖 EN179 Miku21 的一条公开详情。

本次仍未完成：churn/parking 继续使用旧 rks-n 统计或显示不可用，不能称 Haruki 完整迁移；overall tier-series 已由 141a3d8 生产复验切到 Haruki overview，但其他榜单上下文仍不由该样本外推；其余区服/角色详情未由本样本外推。已确认的 CN future 2、KR 称号 4、CN 素材 1 缺图仍保留，不跨区替图。

## 2026-09-18 CN服装正式验收：603ed80已部署，18件列表与详情通过

`603ed80`已推送GitHub、完成服务器部署，snapshot marker为603ed80、API healthy，CI35335803358成功。正式Web `cn-costume-mapping-603ed80/report.json`中18/18已发布服装列表及详情均显示128px真实图，最终URL为同CN Haruki正确bundle，errors=[]；2件future明确未通过，未跨区替图。

主代理目视Web260221详情，以及原正式APK中的CN251221「冲锋苹果狗」列表/详情、CN260211「甜心天使」详情，图片均真实显示。证据为`android-cn251221-list-603ed80.png`、`android-cn251221-detail-603ed80.png`、`android-cn260211-detail-603ed80.png`。本次API-only，Android沿用已验证原APK；任务模拟器5558已`emu kill`。

按原2160列表样本中的同ID增量复验，关闭18项旧缺图后累计**2153显示（2053 Haruki＋100旧Moe tips页面样本）、7未显示（CN未发布2件＋KR称号4件＋CN素材1件）**。这是原批次加同ID复验，不是2160项重新整批扫描，也不代表全库完成；漫画40个 Haruki 资源的 HTTP 证据尚未改变这次页面统计。

服装catalog元数据仍来自Moe wrapper，本次缩略图映射与图源为Haruki，不能称全部服装元数据已迁移。当时男款260221在wrapper中的gender为female；后续da3e90a已部署修复，生产API为male/matched，Web与Android260221样本均通过，详见顶部。排名详情 trace 已在 3e9d23e 正式验收，overall tier-series 已在 141a3d8 生产复验，churn/parking 仍未完成。

## 2026-09-18 WorldLink增量：3d29a53已部署，列表与图片样本通过

`3d29a53`已修复此前review拦下的角色筛选与详情UID mismatch：从master提供全角色选项，并检查identityMismatch。独立review通过，主代理三组44/44测试通过，GitHub推送、服务器部署及CI35332875697均成功。旧“排名候选被拦、尚未部署”已被本节取代；**完整排名子功能迁移仍未完成**。

| 入口 | 实际证据 | 验收边界 |
| --- | --- | --- |
| EN179 Miku21 / Len23公开overview | 两个角色响应均有六角色选项及100条数据，来源为各自Haruki `world-bloom/{21或23}/overview`；保留上游2026-09-15T10:15:00Z时间 | 不用本次请求时间伪装角色章数据新鲜 |
| Miku浏览器列表及详情队长图 | `worldlink-haruki-3d29a53/report.json`的Miku部分100张卡图均实际Haruki显示；详情队长图128×128，主代理目视 | 同报告随后Len等待第73行图超时，不把整个报告标为全通过 |
| Len浏览器第三次验证 | 首次73行等待超时、第二次导航超时均保留为未通过尝试；第三次`worldlink-len-3d29a53-verified/report.json`为passed=true，100张卡图Haruki显示、详情队长128×128，主代理已目视详情 | 新证据只覆盖本次Len列表/图片；不将此前超时抹成首次成功 |
| 详情trace / 周回 / 档线历史 | 该次3d29a53报告仍记录trace0；后续3e9d23e已对EN179 Miku21返回playerTrace1405/rankTrace1384并实际显示两种折线图；overall tier-series随后由141a3d8生产复验 | 以顶部3e9d23e与141a3d8为当前结论；churn/parking语义仍待完成，不能用单角色详情外推全部区服/角色 |

## 2026-09-18 CN服装来源纠正与官方关联依据（后续603ed80已验收）

**本节取代此前把20件CN服装统称上游缺图的判断。** 初次来源调查按官方真实字段重建同区缩略图，18件已发布服装均GET200、sharp完整解码128×128；随后603ed80部署并取得18件Web列表/详情与Android代表图证据，见顶部。原巡检25项缺图保留为历史，按同ID增量验收后剩7项未显示。

| 范围 | 当前权威结论 | 剩余工作 |
| --- | --- | --- |
| CN已发布18件服装 | 展示`costumeNumber`误构造旧路径，正确使用真实costume3dId映射；603ed80正式Web18件列表/详情128px均通过，Android两件代表已目视 | 图片问题关闭；catalog仍Moe wrapper、男款gender已由da3e90a修复且Web与Android260221均通过，不能称元数据全部Haruki |
| CN未发布2件 | 261021→`cos26102_body`、261011→`cos26101_body`正确同区路径仍404；registry为missing，发布时间2026-09-30 | 保留正式记录及资源缺失，未以其他图片替换 |
| KR称号与CN素材 | KR20059官方路径仍`kr-assets/startapp/honor/honor_total_recharge_202609/degree_main.png`，本轮404；20059–20062既有4项缺图结论保留。CN素材3004当前同区路径仍404 | 未发现替代：Toolbox通用material奖励实际只显示文本Badge，无不同素材图片映射证据，不宣称修复 |
| 排名迁移状态 | 3d29a53修角色筛选及identityMismatch；3e9d23e已部署并验收EN179 Miku21详情轨迹与两种图表；141a3d8已生产复验overall tier-series为Haruki overview | churn/parking仍非完整Haruki来源；不以单角色详情或overall档线外推完整排名迁移 |

官方依据为Toolbox提交`f2ec28930e2b9f79e166e1235f95b2a6bb4a52da`的[服装缩略图构造函数](https://github.com/Team-Haruki/Haruki-Toolbox/blob/f2ec28930e2b9f79e166e1235f95b2a6bb4a52da/src/modules/costumes/lib/costume-options.ts#L55)、[角色registry读取](https://github.com/Team-Haruki/Haruki-Toolbox/blob/f2ec28930e2b9f79e166e1235f95b2a6bb4a52da/src/modules/costumes/composables/useCostumeRoleData.ts#L54)及`src/shared/sekai/data-sources.ts:246`。构造使用真实costume3dId/partType/colorId与override；master连接键为`costume3ds.costume3dGroupId → costume3dGroups.groupId`。公开CN role11/street与role1/light_sound registry分别提供男/女服装的明确outfitId关联，不能使用Moe派生gender判断，也没有将展示ID与group按算式归一当作通用官方规则。

完整20件逐行证据为`plan-content-audit/missing-cn-costume-mapping-proof.json`：含registry URL、展示outfitId、真实costume3dId/groupId、角色、body/color1、master原行、HTTP/字节/尺寸/SHA256；源master Git blob为`c8a21abbf473bf35dbf3830c906765721249d0a5`，groups为`a7aaef93b71fd0c34c0593e997a700df827c553e`。18件可修ID：260821、260811、260621、260611、260421、260411、260221、260211、251221、251211、251121、251111、251021、251011、250921、250911、250821、250811。正常/CN男女/色2/真实同名歧义的规划fixture为`plan-content-audit/costume-association-fixtures.json`，仅测试输入方案，不是已执行的产品测试。

## 2026-09-18 预测窗口增量修复：a946971 已部署并实测

- 实际问题：网页选近1h后，10秒排名刷新闭包仍请求全部样本，覆盖摘要为417条/约6.92h；生产数据库近1h查询本身正确（60–61条/0.98–0.99h）。
- a946971让三条预测/历史请求统一读取最新窗口快照，回写时校验窗口、区服和请求编号；只提交数据请求相关差异，保留工作树既有UI改动。部署前服务器App.tsx与原HEAD内容核对一致。
- 本地及正式站各完成延迟旧all响应、至少两个10秒刷新周期、快速1h→3h→1h的真实浏览器验收。12档摘要跨度始终≤1.00h，没有后续无windowHours的错误轮询；正式站截图已目视。证据：forecast-window-local-fixed/report.json、forecast-window-prod-a946971/report.json及summary.png。
- 本地、GitHub修复提交a946971一致，服务器归档部署API/Caddy健康；CI35325713809全部success。浏览器在finally中关闭，专用Vite5191进程已关闭。
- 本增量关闭下文旧“预测线摘要6.92h”疑点；上游长期停更时forecast按最新样本回溯、history按当前时间过滤的不同定义尚不在本修复范围。此增量当时未部署排名迁移；后续3d29a53列表/图片进展见顶部，不以窗口修复替代排名验收。

## 当前验收状态：JP新增40漫画已验收，churn/parking与旧tips来源仍待完成

本表与上方最新增量共同优先于下方样本表和全部历史记录；仅把实际证据覆盖的入口记为通过。旧版本的失败保留为历史，不重复当作当前待办。

| 项目 | 当前结论 | 下一步 / 证据 |
| --- | --- | --- |
| 最新部署 | `093978d`已推送/部署healthy，resolve镐图HTTP200/9488B/x-asset-source Haruki、浏览器152px实图通过；d380d93缓存首次miss/再次hit证据保留；`78db345`已推送/部署healthy，4/4 tests/build/review通过，wall2正确成本、八工具列表及普通镐/电锯详情实图通过；`04b4b2f`已推送/部署healthy，CN card4分享1200×630实图与source-v2链接通过；`d51769b`已推送/部署、API healthy，MySekai JP家具/蓝图1816各四张Haruki图及三项成本通过；`da3e90a`已推送/部署且API healthy，260221 gender生产API为male/matched，Web详情male/Haruki128图与Android260221男性/服装图均通过；`e5e8116`本地/GitHub/服务器已同步，deploy-assets成功、API healthy，新增40漫画并保留63条tips，JP新增40图已全部Haruki实际显示；`3b6b6c5`已推送并部署，EN Live2D `clb01_21miku`画布及两个表情动作样本实际显示；`3e9d23e` EN179 Miku21详情接口与玩家/档线轨迹正式验收通过；`141a3d8` overall档线生产复验为Haruki overview；603ed80服装修复仍有效 | Live2D证据只覆盖单模型样本，不计Android或全库；详情证据只覆盖该公开角色；churn/parking、旧tips来源、服装Moe元数据来源仍未完成，260221 Android gender样本已通过 |
| CI与定向测试 | 603ed80的CI35335803358成功；3d29a53三组44/44及CI35332875697、其他前序成功记录保留 | CI通过不替代真实分支验收，CN服装与Miku/Len范围分别见顶部 |
| 窄屏及来源标签修复 | `1606cc8`的舞台`static → relative`/`top: auto`与真实URL来源标签已部署；正式Android重新加载后教室、一歌、对白可见 | `android-1606cc8-stage.png`、`android-1606cc8-resumed-stage.png`主代理已目视；后者60步一歌与遥均非T姿 |
| Android版本 | `c5de19d` final已推送、发布并同步服务器/公网，APK2797933B SHA256 `1f02e2a93bc69d6644d2541d5e3fb2fb9c185f350bbf63350f75cfa09125f498`；源码SHA256与提交一致；故事1背景修复实显通过 | 旧f9e4aaf运行地址缺失、bfdbfdc背景503保留历史；当前final故事1背景通过。Comic1、家具1816主图、CN260221 gender样本与完整人物样本保留；动作连续变化及其他MySekai类别待验 |
| 分享已通过样本 | CN song1的1200×630初音曲绘背景已目视（`share-song-cn1-browser.json/png`）；CN card4已在04b4b2f显示1200×630真实卡面，image/保存href均source-v2（`share-card-cn4-04b4b2f-browser.json/png`）；7b68d48生日卡1464真实卡面1200×630已目视；Android活动217于2e89c90重新生成后封面已目视 | `share-7b68d48/card1464.png`、`android-event217-share-2e89c90.png`；关闭这两个旧缺图待办，其他分享类型另验 |
| Android故事播放/生命周期 | 正式APK加载后篇完整到115/115；暂停42步两次dump不变；真实Home→recent返回35→39继续，手动暂停60步后同路返回仍60步且显示播放；返回目录后无App音频player，退出释放通过 | 排除`am start`重开Activity那次；AAudio启动证明音频流建立，不能用保留流推定后台静音。任务模拟器5558已`emu kill`；本章通过不能覆盖全部章节/逐帧资源 |
| 五区九类图鉴累计样本 | 原2160项为2135显示/25缺；603ed80同ID18件CN列表及详情增量复验通过后，累计2153显示（2053 Haruki＋100旧Moe tips页面样本）、7缺；原90次详情样本保留 | **不是整批重扫或全库覆盖**；增量证据`cn-costume-mapping-603ed80/report.json`，JP新增40漫画另批实际显示证据见 `comics-e5e8116-browser-complete.json`，不冲销原tips样本。7项为CN future2、KR4、CN素材1 |
| HTTP资产批次 | `.runtime/audit-prod-assets.log`共720主URL初检，673符合HTTP/MIME或文件头条件、47个卡池主URL404 | **不是页面显示验收**；未检查完整候选或解码。与真实页面通过不冲突，也不据此宣称47条资源全部缺失 |
| Haruki补迁移 | 内容master优先、五区music meta与缓存隔离、Exact SUS来源校验、通用/奖励角色头像已部署；TW计算来源及EN六头像实际显示已有证据；JP新增40漫画已全部Haruki实际显示；3b6b6c5单个Live2D模型画布与两个表情动作实际显示 | 其余入口、外部回退、旧tips来源、排名churn/parking与Live2D完整目录/动作legacy依赖仍未收口；Exact源正确不等于解析语义正确 |

## 2026-09-20 旧 JP tips 漫画来源复核：无可替换的 Haruki 图片

对 Team-Haruki 官方 `master/tips.json` 做了完整核对：共91条记录，其中原有63条 legacy tips 没有 `assetbundleName`，Haruki 没有对应图片资源；另外28条记录是 `1041–1068`，分别明确对应 `comic_0041–comic_0068`，已由当前 API 走 Haruki 图源。不能把数字相同的 legacy tip 与 comic 编号拼接，否则会错配：例如 `comic_0047` 属于 tip 1047「特訓・超えるために」，不是 legacy tip 47「MVPとSUPER STARとは」。

生产 API 已抽查 tip 2、47、119，均保留原数字 ID、标题和可加载的 Moe 镜像图片；网页列表及 tip 119 详情图片也已实际显示。证据为 `.runtime/asset-acceptance-20260917/jp-tips-haruki-audit.json`、`comics-live.png`、`comics-existing-haruki.png`、`jp-comics-p2-detail23.png`。因此这一项不做错误的 Haruki 替换，当前不需要代码提交或部署。

## 2026-09-23 WorldLink入口修复：Haruki角色榜不再被旧 rks-n状态阻断

提交 `aa2322a` 已推送 GitHub，并同步服务器 API。修复前，Haruki 总榜能正常返回角色列表，但旧 rks-n 的 404 会把 `worldLinkAvailable` 置为 false，导致网页入口把 WorldLink隐藏，并将详情请求挡成 503。现在以当前 `world_bloom` 活动的角色 master 与 Haruki Toolbox 为准，入口生产复验返回 `eventId=179`、`worldLinkAvailable=true`、6个角色，角色图候选均为 Haruki。

生产复验 URL：`https://api.sekai-tools.cn/api/events/en/live-ranking`，HTTP 200。活动 179 已于 2026-09-20 结束，因此随后详情/周回接口返回“无活动 World Link”404是生命周期保护，不是图片或 Haruki 资源失败；活动进行期间的详情与轨迹实显证据仍以 3e9d23e 记录为准。服务器容器健康，部署 marker 为 `aa2322a`。
| TW/KR/CN master区服核对 | 独立审查确认当前各服数据与各自Haruki registry对齐，没有本轮疑似串区或旧cache问题 | TW `6.0.0.51`：gacha61/cards1249；KR `6.0.1.22`：gacha63/cards1249；CN `6.0.0.58`：gacha63/cards1249。限已核对数据，不能外推全字段、全资产或完全Haruki |
| EN WorldLink最新结果 | 3d29a53的Miku21/Len23公开overview为Haruki、各100条/六角色；3e9d23e再验 Miku21 详情 playerTrace1405/rankTrace1384 complete，玩家/档线折线图实际显示，队长图Haruki | 详情证据只覆盖 Miku21；churn/parking仍非Haruki完整迁移。Len列表/图片以第三次verified passed=true为准 |
| TW Exact v3线上样本 | `exact-v3-48698e3/deck.json`真实TW1expert：961 notes、6 skills、Haruki SUS、missingFields空；旧缓存失效后source状态matched。页面A1579655分/9180PT，B1688202分/9480PT，主代理目视`tw-deck.png` | 4d06ca9方向误判被独立review拦下；0e3cc88修复tapFlags/方向1–6并提升v3缓存，24项测试已确认。该谱面真实计算通过，不外推所有类型和谱面 |
| 首句/单句语音 | `voice-once-48698e3/report.json`中card与Parallel均before为空；关闭自动继续后点击，真实首句分别只启动一次2.2204s/3.1608s，previewSilent与singleFirstVoice均true，runtime errors为空 | 48698e3的previewTalk/单句播放修复已有线上证据；极短unlock音源另计。特殊故事背景/视觉仍未通过 |
| 新版卡牌剧情连续回归 | `story-postdeploy-48698e3-card-full/report.json`完成85/85；pause12→12、resume到14、手动pause14→14且音频start数不变，离页停止循环BGM，requestfailed为空 | 单句修复没有破坏本章连续播放/暂停；console有匿名会话401 error，非故事资源失败，**不是零console error**。不是逐帧/全库扫描 |
| 预测线近1h交互/摘要 | a946971已修旧刷新闭包覆盖；本地及正式站延迟旧all、双10秒poll、1h→3h→1h真实验收通过 | 摘要6.92h旧问题已关闭；上方增量证据优先。停更时forecast/history时间锚点定义差异另计 |

### 当前简明待办（按优先顺序）

1. Android c5de19d final已发布并通过服务器/公网hash、源码和故事1背景实显校验；bfdbfdc故事1 WebView时间线85/85、暂停/恢复样本保留，但不等于每句语音亲听。动作连续变化、其他MySekai类别、全故事库与新版全release仍待验。Comic1、家具1816主图及CN260221 gender样本通过保留，1816成本只文本。
2. 排名churn/parking仍未完成Haruki迁移：churn需完整playerTrace派生并注明口径，parking无已证公开同构接口。已验收的列表、Miku21详情与overall tier-series不重复列入。
3. 来源缺口仍有原63条tips、CN服装Moe wrapper（无等价Haruki表，9条历史缺失、15条歧义）、Live2D目录/动作bridge，以及下文来源表中已记录的公告、note skin、识别指纹和外部回退。CN future2、KR称号4、CN素材1仍有上游缺图证据；不以其他内容替换凑完成率。
4. 实显缺口保留特殊故事`specialStories/69/74`视觉与`specialStories/2/4`旧模型/背景；公开组卡推荐五图与Web卡牌筛选26头像已通过，Android/奖励头像不外推；profile/score分享及个人数据入口缺真实可用数据。JP兑换3112/任务1536均无工具蓝图奖励，维持代码+tests、无生产UI样本，不造样本。其他已通过的MySekai、漫画、分享与预测样本以当前表为准；Exact v3结论限已测谱面，不外推全库。

### 窄屏舞台修复证据（1606cc8部署前）

`mobile-stage-7b68d48/report.json`记录669px视口、后篇`ready · 5/115`的真实页面前后对比。修复前`.story-stage`为static，绝对定位画布错误占据整个669×900视口，画布/对白offsetParent不在舞台；修复为relative后，画布回到约562×350.5的舞台内部，画布与对白offsetParent均为story-stage。主代理目视`after.png`，教室、一歌与对白完整显示；`before.png`保留作对照。报告没有page error，唯一401是未登录的auth refresh，不能算作舞台资源失败。

该before/after证据本身是部署前的根因验证。后续1606cc8已部署，正式APK重新加载的`android-1606cc8-stage.png`显示教室、一歌和对白，`android-1606cc8-resumed-stage.png`在60步显示一歌与遥非T姿，均由主代理目视；`android-1606cc8-finish-check.xml`到115/115。真实Home→recent恢复及手动暂停保持证据为`android-lifecycle-manual-pause.xml`、`android-manualpause-restored.xml`，不计入`am start`重开Activity试验。返回目录后`android-1606cc8-exited-audio.txt`当前player只有系统SoundPool、无App音频，释放通过；音频服务有AAudio启动，后台保留流不能证明后台静音。1606cc8按实际URL/代理内URL修正来源标签，准确标签仍不意味着fallback消失。

### 五区图鉴完整批次的范围与剩余项

`browser-7b68d48-final-catalog.log`及最终`catalog-1606cc8-summary.json`记录五区贴纸、素材、卡池、服装、称号、漫画六类各两页，每类每区48项，合计1440。实际1415张显示，其中1315张最终URL为Haruki；当次每区20张tips漫画没有assetbundle，合计100张页面使用旧Moe，不能算页面已迁移。后续已确认JP `comic_0001`–`0040`正确 Haruki PNG均HTTP200，后续e5e8116已新增40漫画，初轮存在部分fallback，随后新会话40图全部Haruki实际显示；新增内容与原tips不同，故不改写当次统计。60次抽样详情首条图片均显示，仅覆盖这些抽样入口。

后续`core-catalog-2e89c90-summary.json`补齐五区歌曲、卡牌、往期活动各两页，每类每区48项，720列表图片全部实际显示且URL为Haruki、无legacy；另30次首条详情均显示。两批合计九类2160项、2135显示（2035 Haruki＋100旧Moe tips页面样本）、25缺图，以及90次详情抽样。两次均exit0、浏览器finally关闭；不能把两页样本写成全库或全部详情通过。

603ed80正式Web对原缺失的同18件已发布CN服装逐一补验列表及详情均通过，主代理目视Web260221与Android251221/260211代表图。原2160项按同ID更新为2153显示（2053 Haruki＋100旧Moe tips页面样本）、7未显示；这是增量累计，不是将2160项重新扫描。服装元数据仍Moe wrapper，缩略图为同CN Haruki，不能混为全部元数据迁移。

当时25张页面缺图为KR称号20059–20062、CN素材3004及CN服装20件：261021、261011、260821、260811、260621、260611、260421、260411、260221、260211、251221、251211、251121、251111、251021、251011、250921、250911、250821、250811。官方关联调查纠正了18件已发布服装的错误路径，随后603ed80产品部署及页面增量复验关闭这18项；不能继续称其上游缺失。剩余261021/261011正确路径404且未到2026-09-30、KR4及素材1共7项未显示。保留名称，不跨区替图。

### Exact v3已部署与真实基准（保留前序问题）

前序2e89c90修复同谱面并发冷载，`exact-cold-2e89c90/deck.json`记录TW11012expert冷载两队PT存在且missingFields为空，但当时TW1expert仍错误输出398音符/75技能/37fever，不能当作解析通过。随后4d06ca9实现解析时，独立review发现channel5方向1–6误套tapFlags，阻止以该版验收；0e3cc88修复方向与tap属性分离、提升parser v3使旧缓存失效，24项本地/真实Haruki测试经主代理确认。

当前48698e3线上`exact-v3-48698e3/deck.json`真实TW1expert已得961计分音符、6技能、Haruki SUS、missingFields为空，source matched证明旧缓存没有继续沿用。主代理目视`tw-deck.png`：A1579655分/9180PT，B1688202分/9480PT。该样本完成实际计算，不再列为“解析尚未实现”；同时保留测试范围，不能由note总数对齐外推所有谱面计分类型正确。

可复用的一手来源为MIT [sus-io解析接口](https://github.com/mkpoli/sus-js/blob/master/packages/sus-parse/src/lib/sus-parse.ts)、MIT [SekaiCalculator计分音符转换](https://github.com/cc004/SekaiCalculator/blob/main/Program.cs)及MIT [Haruki v0.4.3音符语义](https://github.com/Team-Haruki/pjsekai-scores-rs/tree/v0.4.3/src/notes)。sus-io提供tick-based taps/directionals/slides/bpms，但小节长度parseInt与仅3xx长音等限制需要适配；旧C#参考不覆盖现代擦键。项目现有Haruki WASM提供fromSus/eventsJson/getTime，却未导出计分notes，渲染noteCount不可作为游戏总数。`refer/Moesekai/refer/re_sekai-calculator`只接受已解析MusicScore，不能填补解析层。

解析实现依据与复核要点：正确读取`#BPMxx:`、`#mmm08`及持续生效的小节拍数，按BPM分段积分；合并同tick/lane/width的tap、flick和长音端点，处理relay/hidden、critical及擦键；每半拍在长音内部插入自动判定点；lane0只提取技能，lane15只提取fever。tapFlags只解释tap数据，direction1–6只表达flick方向；按master的15类映射权重，保留longId和稳定排序，并以parserVersion区分旧缓存。Haruki channel9是装饰链，不能作为普通长音新增计分或auto ticks；真实TW11012/JP811/JP1append的附着tap已逐点核对，其中append隐藏装饰节点附着金色擦键不能删除，不能仅靠总数判断该语义。

真实回归基准：TW/JP0001expert均961 notes，TW11012expert935，JP0811expert760，TW/JP0001append1353，来自对应Haruki master。TW0001expert原始SUS为150BPM、4拍，技能在小节8/17/27/39/51/69，即12.8/27.2/43.2/62.4/81.6/110.4秒；fever prepare/start在41/49，即65.6/78.4秒。研究源快照为`plan-content-audit/exact-*`，线上v3证据另列上方；文档整理没有重跑或覆盖`check-exact.cjs`产物。

### 首句语音修复与预测窗口交互

独立review已确认旧首句double start是真实voice重复，不是浏览器unlock。48698e3修复previewTalk及单句播放，3项controller与28项Web测试通过；`voice-once-48698e3/report.json`在card/Parallel初始均无source启动（before=[]），关闭auto后点击分别只有一次2.2203958秒/3.1608125秒真实voice。两者previewSilent/singleFirstVoice均true、errors=[]；约0.000045秒unlock单独识别，card循环BGM另计。该修复关闭首句重复待办，special69背景/整体视觉仍未通过。

同版随后完成`story-postdeploy-48698e3-card-full/report.json`整章85/85回归，主代理核对pause12→12、resume到14、手动pause14→14且音频start数不变；afterLeave停止循环BGM，requestfailed=[]。因此本章新增单句补丁没有破坏连续播放和暂停行为。console唯一error为匿名会话401，不记故事资源失败，也不写“零console error”；这是该章交互验收，不是逐帧或全库资源检查。

`forecast-window-2e89c90/report.json`用真实tab近1h完成切换，aria选中true，三个windowHours=1接口200，页面window=1h/12档/61样本。旧getByRole(button)选择器不匹配已被此证据取代；摘要仍显示6.92h需独立核对过滤范围，不能由tab和请求成功推定摘要正确。

### 排名公开接口替代已查明，产品迁移仍进行中

官方[Haruki-Event-Tracker router](https://github.com/Team-Haruki/Haruki-Event-Tracker/blob/5f77a7f9e606a9b7b9aeb6deaf7f53cd7bacecc3/src/api/router.rs)提供公开web WorldBloom overview、rank/user details。本轮无登录GET：EN179/角色21 overview200、100人＋17档线；同角色rank1 detail200、rankTrace/playerTrace各100条；JP217/T1000 detail200、有metrics与100历史点；角色榜追加cursor第二页也200。证据`plan-content-audit/haruki-wl-*.json`、`haruki-tier-detail.json`及官方`tracker-*.txt`。未调用private/cloud受保护接口。

tier-series最新点可由overview的topRankings＋borderLines替代；141a3d8已在生产复验overall榜线来自Haruki overview，WorldLink详情轨迹也由3e9d23e实际显示。trace的interval只管指标窗口，历史需按末timestamp分页；公共userId为64hex匿名ID，不可送数字UID档案接口。角色章已停更时不能拿tracker新时间伪装fresh。churn无同构公开批量端点，可从完整playerTrace按正分数变化派生但须注明窗口、覆盖及口径；rankTrace跟名次换人，仅适合档线。parkingPeriods尚无已证公开等价，不能以列表完成概括完整排名迁移。

### 卡牌识别指纹溯源：旧清单404，仓内无端到端消费者

只读研究`fingerprint-legacy-research.md`确认：`storage.sekai.best/sekai-best-assets/chara_hash.json`本轮返回404/XML；当前`/api/master/:region/cards/import-manifest`保留catalog并标记fingerprint source-unavailable。仓内Web/Android没有import-manifest或fingerprints消费逻辑，只有API实现和契约，**不能称已经存在完整卡图识别功能**。

旧Sekai-Viewer截图匹配算法可从官方dev提交`7359c32960ab3dc47945ad1719cda32462d1074d`及历史实现还原：截图卡片中心round裁剪、32×32灰度DCT，取去掉第0行/列的8×8系数、中位数阈值，64位bit串与Hamming匹配。旧清单生成器及canonical图预处理未找到，因此用Haruki缩略图生成新指纹只能作为待设计/验证的版本化新算法，不能声称与旧清单逐位兼容或识别迁移已完成。

### 三服master来源复核（独立审查2026-09-18）

下表依据独立审查代理已完成的只读生产/registry核对；本次文档整理没有重新请求或启动测试。

| 区服 | 当前Haruki版本 | 对应仓库 | registry / 生产gacha数 | registry / 生产cards数 | cards blob SHA前缀 |
| --- | --- | --- | ---: | ---: | --- |
| TW | 6.0.0.51 | Team-Haruki/haruki-sekai-tc-master | 61 / 61 | 1249 / 1249 | ccb8fc9f… |
| KR | 6.0.1.22 | Team-Haruki/haruki-sekai-kr-master | 63 / 63 | 1249 / 1249 | fd8c19c0… |
| CN | 6.0.0.58 | Team-Haruki/haruki-sekai-sc-master | 63 / 63 | 1249 / 1249 | f08c3262… |

三个区生产状态的`staleCollections`均为空、同步日期均为2026-09-18；reference master cards分别指向`/master/tw/blob/`、`/master/kr/blob/`、`/master/cn/blob/`，SHA与当下各区manifest一致，代码仓库映射也对应tc/kr/sc。此证据排除本轮所疑的跨区master和旧cache误用；不能据此证明所有master字段、全部资源显示、其他缓存层或所有来源均完成迁移。

### 已有样本的当前结论

本节优先于后面的历史矩阵。只对明确的服务器、ID、画面和交互样本作结论，**不宣称全项目、全量资产、五区或 Android 全部通过**。文档整理本身未运行新测试；以下汇总主代理、实现代理、独立审查及已保存的来源核查证据。临时证据主要位于 `.runtime/asset-acceptance-20260917/`，其余日志注明路径；清理前以本文件保留结论。

| 范围 | 最新可证明状态 | 剩余问题 / 证据 |
| --- | --- | --- |
| Web/API版本 | 最新`48698e3`已推送并归档部署，snapshot marker一致、API healthy；包含parser v3及首句语音修复，旧截图按版本保留 | CI35307671673已completed/success、全部checks通过。正式APK仍为已验证78fda34构建 |
| Android公开下载 | 当前正式公网包基于`c5de19d`，**2797933字节**；完整下载与服务器SHA256均为**`1f02e2a93bc69d6644d2541d5e3fb2fb9c185f350bbf63350f75cfa09125f498`** | c5de19d发布及源码校验证据见顶部；旧bfdbfdc hash `1666322272821962048e3e525b60ee248ede3e1fea9d5cbd87ff316530f92f66`、旧`android-f9e4aaf-public.apk` hash `beb690b442d34e4bfcbf1978ddda9aa8a1e4954bb029c62a5061906c6c15b937`、旧`android-public-78fda34.apk` hash `074582213b1782a537e7c925bf9f2bea12f1021b92709d87f70703b2060ffcf0`、0bf6947 hash `27cac4c84113d9be4dd63bb6b6004138043dfe8b14c2461dae36b1c3fa81518e`保留历史。新包已安装，Comic1与家具1816主图已实显；其余内容仍按具体入口验收 |
| Web卡牌剧情 cardEpisodes/1/1 | `48698e3`新线上85/85完成；pause12→12、resume14、手动pause14→14且音频start数不变，离页停止循环BGM。78fda34及前序模型/motion样本保留 | 最新`story-postdeploy-48698e3-card-full/report.json` requestfailed=[]，console有匿名会话401，非故事资源失败且不能说零console error。**这是该章播放/交互验收，不是逐帧或全库资源扫描** |
| Web活动剧情 eventStories/1/1000001 | 稳定加载后，一歌与咲希均可见；一歌model3/texture/moc3/physics及motion均200，没有requestfailed | 约45秒完整加载后 `story-postdeploy-1ae255e-event-stable/action-059.png`。ScenarioAction.index稀疏，不应与modelQueue数组下标混同；此样本没有模型队列缺口。不代表整章或所有事件通过 |
| Web团体剧情 unitStories/idol/30000 | 场景/对白由15推进至41/226，BGM与多句语音解码播放，记录无失败媒体请求 | `plan-content-audit/story-other-types-1ae255e/`。只通过本段样本，不覆盖完整226步或所有团体剧情 |
| 特殊剧情 specialStories/69/74，Parallel Paaaarty!!!! | 78fda34已有前4句startapp语音200与真实实播；旧首句重复被review确认后，48698e3单句复验before=[]、点击后仅一次3.1608秒voice、无runtime error | `voice-once-48698e3/report.json`关闭首句重复待办；旧`special-share-78fda34/special69.png`缺模型/背景的视觉结论未被修复，bg_g000102缺资源仍保留 |
| 特殊剧情 specialStories/2/4，op_01 | 0bf6947复验完整推进74/74、BGM/SE真实播放；缺背景不再中断控制器 | 历史场景的3个旧服装模型未匹配，bg00025/24/03/02仍404，**完整画面未通过**。不能称prototype、删除记录或替换其他背景；来源结论见下 |
| Android故事WebView | 1606cc8部署后正式APK舞台教室/一歌/对白、60步一歌/遥非T姿已目视；后篇完成115/115，手动暂停保持、真实Home→recent继续及返回目录释放通过 | 证据及限制见上方专项；旧空黑帧已被后续替代。AAudio启动不等于已证明后台静音，不将该章外推全部故事；任务模拟器5558已关闭 |
| 分享卡 | 7b68d48生日卡1464真实卡面1200×630已目视；2e89c90 Android活动217重新生成的封面已目视。活动素材及song/1文字/字体旧样本保留 | `share-7b68d48/card1464.png`、`android-event217-share-2e89c90.png`；这两个旧问题已关闭，其他类型/score不能外推 |
| Web预测线公开计算 | 合成输入显示差683503/需28局/每小时227835pt旧样本保留；后续实际近1h tab选中、三接口200、1h/12档/61样本交互通过 | `forecast-window-2e89c90/report.json`取代旧按钮选择器失败；摘要6.92h为独立范围疑点，不外推摘要过滤正确 |
| Web卡组比较公开计算 | TW aggregate Haruki meta-tc已证；48698e3的TW1expert Exact v3为961notes/6skills/missing[]，A1579655分/9180PT、B1688202分/9480PT真实显示 | `exact-v3-48698e3/deck.json`、`tw-deck.png`；旧parser失败已由方向修复及v3缓存失效取代，仅对测试与线上样本作结论。公式`Moesekai.MultiLivePTCalculator`真实归属保留 |
| Web World Link EN | 3d29a53 Miku21/Len23列表均Haruki overview、各100条及六角色选项；两角色100卡图Haruki与详情队长128px有实际显示证据，时间保持2026-09-15 | `worldlink-haruki-3d29a53/report.json`的Miku部分、`worldlink-len-3d29a53-verified/report.json`的Len passed=true；Len前两次超时保留。详情trace0/周回source-unavailable，完整详情迁移未通过 |
| Android其他已通过样本 | 原生Live2D clb01_21miku首纹理可见、计数1；卡1473技能说明；JP排名第2名队长1003；活动216关联歌曲、5张卡和前4卡池图 | 证据 `android-live2d-final-detail.png`、`android-card1473-skill.png/xml`、`android-rank-detail.png/xml`、`android-event216-related*.png`。Live2D动作/表情0不能算动画通过 |
| 保留的原生内容样本 | JP811 HARD冷载真实谱面、VirtualLive1音频至EOS、MySekai家具/素材/蓝图各首3项；JP兑换50210奖励卡1331/成本47、称号任务101奖励105、公告6485正文宣传图显示 | 这些是已记录具体样本；无需因历史表写“未覆盖”而重复全测，也不能外推所有ID/区服 |
| 缺图与上游证据 | 原25项历史缺图中的CN18件已由603ed80正式列表/详情验收关闭；累计剩CN未发布2、KR4、CN素材1共7项 | 18项是同ID增量复验，不是全批次重扫；男款gender已由da3e90a修复且生产API通过，Web与Android260221样本均通过，不计图片失败 |
| 登录及个人数据入口 | **未覆盖**：本任务没有可用真实测试会话、收藏记录、绑定快照或已上传suite证据 | 收藏、绑定头像、个人资产计算需对应真实数据；score分享需实际已保存成绩ID，不能使用歌曲ID代替。未检查或提取个人浏览器凭据 |

### 数据源剩余状态：仍未达到“完全替换为Haruki”

本表来自API源码实际调用链和已有运行证据的核对，不是全量重新联网测试。7b68d48已部署的改动与实际调用验收分别记录；**Haruki优先、图片显示成功、或结果可算出均不等于所有真实请求已经只来自Haruki**。Team-Haruki维护的GitHub master属于Haruki发布来源；npm/Cubism SDK、备案图、QQ登录、用户自有头像和站点自身地址不列为游戏数据源。

| 分类 / 功能 | 实际请求或候选链 | 当前结论与下一项 |
| --- | --- | --- |
| Haruki优先，但保留外部master回退 | `masterData.ts`、`referenceMaster.ts`：配置Haruki后优先，失败仍请求metadata.exmeaning.com、metadata.pjsk.moe，再同区Team-Haruki raw及本地旧缓存 | 不是纯Haruki模式；需逐组确认回退是否仍实际触发与缓存来源。不能把整个metadata层一概写已迁移 |
| Haruki优先，但保留外部图片回退 | `assets.ts:getAssetCandidates`、`externalData.ts:regionAssetCandidates`：Haruki后仍有storage.exmeaning.com、storage.pjsk.moe、storage.sekai.best及代理；旧漫画另有Sekai-comics/Moe静态候选 | 可能仍产生外部真实图片请求；本轮部分Haruki404不能靠旧源命中写Haruki通过。需有同一资源证据再收口，不删除正常入口凑比例 |
| **内容master补迁移已部署** | 普通master优先Haruki、失败仍回旧metadata；603ed80服装缩略图按Haruki真实关联修复，但catalog基础仍来自Moe wrapper | **moe_costume.json是派生对象 `{costumes:...}`**，不能称服装元数据全Haruki或用costume3ds数组冒充；男款260221已由da3e90a生产API纠正为male/matched、Web与Android260221详情通过；260211为female/no-match，仍保留wrapper。其他内容真实source仍逐组验收 |
| **Music meta补迁移已部署** | 7b68d48按region选择官方Haruki五区JSON，缓存隔离并校验source和时间；旧未分区文件不再读取 | 官方五份已GET/解析，TW真实aggregate的Haruki meta-tc来源已证；其他入口/区服运行结果不能外推 |
| **Exact SUS与v3样本通过** | 0e3cc88修复方向1–6与tap属性混淆并升级v3；48698e3真实TW1expert从Haruki重新解析961notes/6skills、missing[]，两队分数/PT显示通过 | 24项本地/真实Haruki测试已确认；旧同URL坏缓存已失效。保留覆盖边界，不能将该样本或count对齐外推全库计分语义 |
| **角色/奖励头像补迁移已部署** | 通用`getCharacterIconCandidates`与character_rank_exp奖励均使用Haruki官方映射，并精确允许代理host | WorldLink六头像均实际Haruki、128×128显示通过；筛选/奖励分支另验，不能外推所有角色 |
| **谱面音符皮肤真实外部请求** | `chartRenderer.ts:NOTE_HOST=asset3.pjsekai.moe/live/note/custom01`，冷渲染会下载音符图并内联到SVG/PNG | SUS已Haruki不等于整张图所有依赖Haruki。此项是渲染资源，非npm库；当前未查到可证同款Haruki路径，保留未迁移结论，不猜替图 |
| **卡片识别指纹失效外部依赖** | API import-manifest仍引用旧chara_hash.json，本轮404/XML，返回source-unavailable；仓内Web/Android无消费者 | 旧截图DCT64匹配算法已溯源，清单生成/预处理未找到；新Haruki指纹须版本化和真实识别验证。不能称完整识别已存在或迁移完成，也不删除API凑完成率 |
| **Live2D目录及动作bridge** | `externalData.ts:getLive2dModels`读取storage.sekai.best的model_list.json；动作/表情manifest及motion3仍来自Sekai-Viewer资产库；Haruki BuildModelData/moc3/texture/physics已接入 | 是已注明但仍存在的真实外部依赖，不是Cubism SDK本体。缺少可证完整Haruki模型索引/同格式动作导出替代，不能声称全Haruki |
| **公告列表/正文/宣传图** | JP/CN列表经baijing.exmeaning.com；正文与宣传图使用游戏官方production-web.sekai.colorfulpalette.org或lf3-mkcncdn-tos.dailygn.com | 列表Moe数据与游戏官方正文都不是Haruki；此前显示通过仅是功能通过。当前无已核实Haruki等价公告接口/完整正文路径，不以猜名替换 |
| 排名：WorldLink列表与单角色详情已部分迁移 | 3d29a53角色榜overview改用Haruki并取master全角色，Miku/Len实际列表来源及100图已验证；3e9d23e的EN179 Miku21详情playerTrace1405/rankTrace1384 complete且两种图表实际显示；overall tier-series由141a3d8生产复验为Haruki overview | churn/parking仍有rks-n依赖或不可用；列表、单角色详情和overall档线不能作为完整排名迁移证据 |
| 本地旧派生数据/公式参考 | WorldBloom支持卡组bonus等可读refer/Moesekai本地JSON；`Moesekai.MultiLivePTCalculator`、源码归属说明是公式标签 | 本地JSON是仍需说明出处的运行数据；公式标签本身不发网络请求，不应为了迁移改写真实归属。两者都不能直接称Haruki原创 |

`assets.ts`仍有 `moeChartBase` 等诊断字符串，但当前图鉴的chartSvgUrl/chartPngUrl指向本地Haruki SUS渲染API；**单看源码URL字面量不算运行请求**。上表noteHost、指纹及fallback则有实际消费者；Exact SUS与普通内容master已于7b68d48补迁移，下一步是核对真实运行来源，不再重复列为尚未改代码。没有证据的接口及fallback覆盖仍需审查，不通过删除功能或泛化屏蔽请求宣称100%。

### 仍需补齐的独立入口

除上述明确失败/部分通过项外，Web卡牌筛选26角色头像已在顶部新证据中通过；公开组卡推荐五图已通过；MySekai制作素材已有顶部具体样本通过；分享卡剩余类型等缺口按当前待办记录。纯数据的公开玩家档案和其他计算结果也应单独核对。World Link、预测线与卡组比较已有明确样本，具体限制见顶部行，不列为不适用或完全未触达。普通活动详情没有独立“活动奖励页”；VirtualLive1奖励水晶及曲目封面、Web JP总榜100个队长图与一条明细已有证据，不重复列为完全未触达。

Talk暂停边界在78fda34已通过；48698e3的card/Parallel首句单次播放、静默预览及cardEpisodes/1/1新整章85/85连续/暂停/离页停止均通过，special69整体视觉仍未通过。card1464和Android活动217分享、窄屏舞台、Android后篇115步及退出释放已分别通过。其余入口按顶部待办继续，不沿用旧版失败覆盖新证据。

`/me/deck`、`/me/scores`、档案分析正文以及Android账号收藏/成绩/卡组目前主要是文本、表格或SVG；它们需要真实数据验收，但不能虚构成尚有独立卡面控件。`/me/bindings`、`/me/assets`受 `HARUKI_FEATURE_ENABLED`控制。所有区、所有ID和全部分支的完整覆盖账本尚未收口，不能用若干代表样本代替全量结论。

### Music meta：官方五区数据源已核实，公式归属另计

78fda34核查时，`musicMeta.ts`写死 `https://moe.exmeaning.com/data/music_meta/music_metas.json`，没有region参数和缓存隔离；旧文件存在时会持续优先重读。旧卡组比较报告source为 `/app/apps/api/data/music-meta/music_metas.json`，不能证明其来源。**该代码状态已被7b68d48取代并部署**：改为五区HarukiURL、分区内存/磁盘缓存，封装source/fetchedAt，校验来源与24小时有效期，旧未分区文件不再使用。TW真实aggregate已证meta-tc来源；其余区服/入口运行覆盖仍不能外推。

[Toolbox官方data-sources.ts](https://github.com/Team-Haruki/Haruki-Toolbox/blob/f2ec28930e2b9f79e166e1235f95b2a6bb4a52da/src/shared/sekai/data-sources.ts) 的 `SEKAI_MUSIC_METAS_URLS` 明确下表映射；五份本轮均完整GET200 application/json并成功解析，不是猜文件名。

| 区服 | `https://sekai-master-cdn.haruki.seiunx.com/` 下文件 | 完整GET字节 | 行数 |
| --- | --- | ---: | ---: |
| JP | music_metas.json | 2392585 | 3719 |
| EN | music_metas-en.json | 2084211 | 3239 |
| TW | music_metas-tc.json | 2046459 | 3180 |
| KR | music_metas-kr.json | 2065843 | 3210 |
| CN | music_metas-cn.json | 2074617 | 3224 |

五区全部16572行均包含当前normalizer所需12字段（music_id、difficulty、music_time、event_rate、base_score、base_score_auto、三种skill_score数组、fever_score、fever_end_time、tap_count），并抽查歌曲1/expert实际字段值；字段存在不等于所有数值/公式语义均验证。数据副本 `plan-content-audit/music-meta-{region}-haruki.json`。这些映射及缓存修复已随7b68d48部署，不能将部署本身当作全部计算入口的运行验收。

数据分发地址与计算公式参考是两件事。`deckComparator.ts` 的 `referenceFormulaId=Moesekai.MultiLivePTCalculator` 及源码参考应保留真实归属；将music meta迁到Haruki CDN不会自动让公式变成“Haruki原创公式”，也不证明所有估算字段或Exact模式正确。

### 角色头像：WorldLink六Haruki头像显示通过，其他入口待验

已记录的旧版 `assets.ts:getCharacterIconCandidates`只返回Moesekai直链及代理；7b68d48已部署以下Haruki静态映射，并同步character_rank_exp奖励分支。后续`worldlink-2e89c90-settled/report.json`已证六头像真实Haruki URL、128×128且稳定榜单显示；同一函数服务的图鉴筛选/奖励仍需独立证据。此前保留的legacy主要是Live2D motion bridge，角色头像不是例外。

[Toolbox官方data-sources.ts](https://github.com/Team-Haruki/Haruki-Toolbox/blob/f2ec28930e2b9f79e166e1235f95b2a6bb4a52da/src/shared/sekai/data-sources.ts)（文件blob `1f7eb41f4911e4db284ee8e7d6d8fea7f344d562`）的 `resolveCharacterIconUrl` 使用基址 `https://images.haruki.seiunx.com/sekai-toolbox/static_images/chara_icon/`，按明确昵称表取图；`SekaiCharacterAvatar.vue`也调用此函数。这是Haruki官方静态源，不是猜测游戏bundle。

| 角色ID | 官方文件名 | 本轮完整GET字节 | 解码 |
| --- | --- | ---: | --- |
| 21 | miku.png | 24104 | PNG128×128，完整解码退出0，已目视 |
| 22 | rin.png | 24712 | PNG128×128，完整解码退出0 |
| 23 | len.png | 22934 | PNG128×128，完整解码退出0，已目视 |
| 24 | luka.png | 25620 | PNG128×128，完整解码退出0 |
| 25 | meiko.png | 23708 | PNG128×128，完整解码退出0 |
| 26 | kaito.png | 23783 | PNG128×128，完整解码退出0 |

六个均200 image/png且后续WorldLink真实显示通过。官方映射覆盖1–31；不能由21–26外推其他角色全部有效。源码副本 `plan-content-audit/toolbox-data-sources.txt`，图片 `character-*-haruki.png`。7b68d48已使用映射并精确允许代理host `images.haruki.seiunx.com`；筛选/奖励显示仍待补验。

### 特殊故事2/4：历史开场的来源结论

- [Team-Haruki specialStories master](https://github.com/Team-Haruki/haruki-sekai-master/blob/main/master/specialStories.json)（核查blob `e05c00200606b924cc62bbc16ada5bda1fc13365`）保留id2「オープニング」，有效期字段为2020-01-01至2020-12-31 00:00 JST；episode4明确scenarioId=`op_01`、parent bundle=`special-story`。**历史日期不等于废弃/prototype标签**，没有替代opening记录依据。
- [实际op_01 JSON](https://sekai-assets.haruki.seiunx.com/jp-assets/startapp/scenario/special/special-story/op_01.json)的三个Character2dId本来均为0，CostumeType分别为 `light_sound_a_normal`、`miku_normal`、`light_sound_b_normal`；NeedBundleNames明确bg00025/26/24/03/02。master character2ds没有id0；不能按角色名猜模型对应关系。
- 参考Sekai-Viewer当前dev `storyLoader.ts`（核查blob `574b6ffb7f13655061d86dc950605029db2151dc`）仍明确op开头使用parent bundle；与历史main和本项目已加载路径一致。没有依据改到child `story_sp_ts_01_01`。这也更新了临时旧报告中“dev helper尚未取到”的时点限制。
- Haruki-Toolbox完整树 `f2ec28930e2b9f79e166e1235f95b2a6bb4a52da` 的EventStorySection仅显示活动梗概/章节名，未提供该opening的播放器或旧资源映射。未找到可证明的模型/背景别名；保留缺资源状态与可用音频/对白，不借其他故事替代。完整核查原证据为 `plan-content-audit/special-opening-source-audit.md`，有效结论已归档本节。

### 特殊故事69/74：已证实的语音映射与未解背景

master的scenarioId为 `story_connect_live_parallelpaaaarty_01`，成功加载的原始scenario内部却写 `story_connect_live_Parallel_Paaaarty_01`。失败的线上地址采用内部ID且统一加ondemand。可用真实前缀是：

`https://sekai-assets.haruki.seiunx.com/jp-assets/startapp/sound/scenario/voice/story_connect_live_parallelpaaaarty_01/`

| 原始VoiceId（文件后缀.mp3） | 完整GET | 音频证据 |
| --- | --- | --- |
| connectlive_12_beforestory_01_21_piapro | 200 audio/mpeg，128565字节 | 3.160816秒，MP3/44100Hz/单声道，完整解码退出0 |
| connectlive_12_beforestory_02_22_piapro | 200 audio/mpeg，137969字节 | 3.395918秒，同格式，完整解码退出0 |
| connectlive_12_beforestory_03_26_piapro | 200 audio/mpeg，149463字节 | 3.683265秒，同格式，完整解码退出0 |
| connectlive_12_beforestory_04_25_piapro | 200 audio/mpeg，265447字节 | 未做本地完整解码 |
| connectlive_12_beforestory_05_23_piapro | 200 audio/mpeg，227830字节 | 未做本地完整解码 |

首句的ondemand+原ID、ondemand+master ID、startapp+原ID均404，只有startapp+master ID成功，因此两处路径差异均有实证。该结果不能用于将所有故事语音全局改startapp，或全局小写/去下划线；其他已通过章节使用不同导出根。78fda34有前4句真实实播，随后确认的首句重复由48698e3修复并取得单次播放证据（见顶部）；视觉仍未通过，不能用GET/解码概括整章已修复。

背景 `FirstBackground` 和唯一NeedBundleNames均指定 `bg_g000102`。同名PNG/JPG/WebP×startapp/ondemand共六个完整GET均404；格式候选依据 [Haruki Asset Updater示例配置](https://github.com/Team-Haruki/Haruki-Sekai-Asset-Updater/blob/134171c8d529d35ebfae93078961b89d4e99f44d/haruki-asset-configs.example.yaml)。公开资源根的限定目录列表请求也404，未取得真实内部文件索引，因此只可断言**已核对的标准导出路径不可用、没有可证别名**，不能扩大为所有潜在路径/镜像均不存在。禁止替图。完整原证据为 `plan-content-audit/parallel-special-source-audit.md`，关键来源和数值已归档本节。

## 历史基线与历次追加（以下不是当前状态）

以下保留调查过程和当时的失败/未覆盖矩阵；与顶部当前状态冲突时，以顶部已注明版本和证据的结论为准。“当前”“尚未”等措辞只指该历史记录时点，不应重新覆盖后续通过或待修状态。

原始记录是当时工作树和 `.runtime/asset-acceptance-20260917/` 已保存证据的快照，不代表所有资源、五区或 Android 均通过。后续代码修改、部署与重新验收应更新顶部当前状态，不应以旧报告覆盖新结果。

## 判定标准与证据范围

- **显示通过**：报告中浏览器图片 `complete=true` 且 `naturalWidth/Height>0`，只覆盖记录中的条目与页面状态。
- **样本通过**：API 资源完整 GET 后成功解码，或真实 SUS/JSON/音频完整读取；不等于用户界面渲染或播放成功。
- **部分/待复验**：已访问页面，但存在加载中、明确失败、选择器不覆盖目标组件，或修复后没有新报告。
- **未覆盖**：没有该区、详情、交互或设备的有效验收证据。

`browser-audit.cjs` 使用 Chrome headless、1200×900、默认 JP、每 section 新页面；图片统计只选 `article.catalog-card`，没有滚动全页、点击详情、切换区服。它拍摄的 PNG 是当时首屏，不能证明不可见懒加载项成功。MySekai/故事/Live2D/虚拟 Live 使用其他组件，`cards=0` 不是通过，也不是全部缺图。

`probe-images.cjs` 调用 `/api/master/{region}/catalogs/{type}?page=1&pageSize=3&sort=id-desc`，顺序尝试候选，完整 GET 后用 sharp 解码；一个候选成功就停止，不保证第一候选或所有备用地址可用。现有报告没有测试列表详情和第二页。

证据文件：

| 文件 | 范围 |
| --- | --- |
| `browser-live.json` | 修复前 JP 贴纸、素材基线 |
| `browser-stream-fixed.json` | 修流后 JP 贴纸、素材首屏 |
| `browser-other-baseline.json` | JP 歌曲、卡牌、卡池、称号、服装、漫画；另含错误入口 `events` |
| `browser-content-baseline.json` | JP 往期活动、MySekai、虚拟 Live、故事、Live2D 基线 |
| `image-probe-baseline.json` | 五区歌曲/卡牌/活动，各 3 条，共 45 条解码通过 |
| `image-probe-collections-baseline.json` | JP 六类集合各 3 条，共 18 条解码通过 |
| `api-tests.log` | 当次 24 测试文件：22 通过、2 失败；159 测试：155 通过、4 失败，不是全绿 |

## Web 页面与详情矩阵

除 `/` 外，section 入口统一为 `/section/{section}`；验收时显式选择区服，记录实际请求的 region。图鉴详情通常为抽屉，不能只检查 URL 导航成功。

| section / 页面 | JP 已有显示证据 | 详情/交互状态与下一步 |
| --- | --- | --- |
| `home` / `/` | 本目录无首页验收报告 | 当前活动、推荐卡牌/歌曲图片；点击跳转；五区未覆盖 |
| `currentEvent` | 本目录无有效本页面报告 | 当前活动封面、排名卡面/称号、排名详情；不要以往期活动页代替 |
| `historyEvents` | 21/24 活动图片显示；217、216、215 在内；194–196 当时加载中 | 滚动剩余条目，打开活动详情及相关卡牌/歌曲/卡池；五区详情未覆盖 |
| `songs` | 24/24 显示，含 JP811 | 封面详情、各难度谱面、缩放/原图/SUS 尚未有显示通过报告 |
| `cards` | 11/24 显示；1463 明确“图片暂不可用”，其余 12 项加载中 | 优先复验1463；普通/特训前后不得互相错图；详情和关联卡牌未覆盖 |
| `gachas` | 10/24 显示，其余14项加载中 | 滚动、详情 banner/logo/screen 顺序、相关卡面未覆盖 |
| `honors` | 24/24 主图显示 | 称号背景、排名铭牌及边框语义组合未通过视觉比对；详情未覆盖 |
| `materials` | 修流后12/24显示，含281；其余12项加载中 | 281及279详情、低ID与翻页；不能将首屏通过扩展为全列表 |
| `costumes` | 12/24显示，其余12项加载中 | 详情、部件/颜色/角色变体与代表缩略图未覆盖 |
| `stamps` | 修流后12/24显示，含125261；其余12项加载中 | 125261详情、低ID、滚动与重试未覆盖 |
| `comics` | 8/24显示，其余16项加载中 | 详情长图、旧漫画/单格图与不同区服未覆盖 |
| `information` | 未覆盖 | 列表横幅、内部HTML正文、外链型公告；非发布区须正确提示 |
| `exchanges` | 未覆盖 | 奖励/成本图标、详情；有意无图片的引用项不能当破图 |
| `missions` | 未覆盖 | 各任务组奖励图标、名称/数量与未发布状态 |
| `virtualLives` | 基线正文出现多处“图片加载中”；选择器未采集该卡片 | 映射修复后重验海报、详情、music/MC/timeline段、声音与暂停 |
| `mysekai` | 基线访问成功但图片选择器未覆盖；请求错误59条 | 修复后家具/素材/蓝图三个tab、详情、墙地面与制作素材图片 |
| `stories` | 基线访问目录；选择器未采集封面 | 活动/卡牌/团体/特殊四种故事详情、章节及完整播放器未覆盖 |
| `live2d` | 目录显示826共享模型、本区引用0、当前结果0 | 只证明目录状态；“查看全部共享模型”→详情→模型/动作/表情未覆盖 |
| `forecast`、`tools`、`deckCompare` | 未覆盖 | 事件/歌曲/卡牌关联资产如有渲染，随对应选择器和结果复验 |
| `profile`、`share` | 未覆盖 | 玩家卡面/称号、分享卡实际PNG与页面显示 |
| `about` | 未覆盖 | 静态品牌图片/图标；无游戏资产时记为不适用，不计游戏资产通过 |
| `/me`、`/me/profile`、`/me/deck`、`/me/scores`、`/me/favorites` | 未覆盖 | 登录态头像、队伍卡面、歌曲封面、收藏目标候选与详情 |
| `/me/bindings`、`/me/assets` | 受 HARUKI_FEATURE_ENABLED 开关控制；未覆盖 | 开启时检查相关账号/玩家资产；关闭时记录不适用 |
| 登录/注册/QQ回调、legal/privacy/terms/security | 未覆盖 | 不计入游戏资产清单；静态品牌资源和必要跳转另验 |

`browser-other-baseline.json` 的 `section=events` 不是当前侧栏往期活动入口，不可作为活动目录验收证据。正确入口为 `historyEvents`。

## 五区资源样本矩阵

以下全部是 **样本通过**，不是五区浏览器显示通过。列表之外尚未覆盖详情、搜索、翻页、历史资源与区服切换缓存。

| 区服 | songs：3/3 | cards：3/3 | events：3/3 | gachas/honors/materials/costumes/stamps/comics |
| --- | --- | --- | --- | --- |
| JP | 811,809,804 | 1474,1473,1472 | 217,216,215 | 各3/3，见下表 |
| EN | 803,787,786 | 1251,1250,1249 | 180,179,178 | 未覆盖 |
| TW | 11012,11011,803 | 1271,1270,1269 | 183,182,181 | 未覆盖 |
| KR | 10010,10009,10008 | 1271,1270,1269 | 183,182,181 | 未覆盖 |
| CN | 11017,11016,11015 | 1271,1270,1269 | 183,182,181 | 未覆盖 |

| JP集合 | 通过ID |
| --- | --- |
| gachas | 4007,4006,4005 |
| honors | 8729,8728,8727 |
| materials | 281,280,279 |
| costumes | 2050,2049,2048 |
| stamps | 125261,124261,124251 |
| comics | 1068,1067,1066 |

最低补齐标准：每区每类选择最新可发布条目、一个旧条目、一个第二页条目；完成列表图片解码、详情图片显示和切换区服后同ID不串图。TW11012、KR10010、CN11017等区服专属ID应保留区服语义，不回退其他区伪装成功。

## 内容、播放与谱面专项

本节额外样本来自同任务前序完整GET调查，未保存为上述目录的结构化报告；仅作可复验样本和路径依据。后续正式验收应记录API返回路径及完整资源结果。

| 类别 | 已证实样本 | 剩余验收 |
| --- | --- | --- |
| MySekai家具/素材/墙纸 | JP `ondemand/mysekai/thumbnail/fixture/mdl_mis0001_house_house1_1.png` 200 PNG20188B；`material/item_wood_1.png` 8763B；`surface_appearance/mis0001/tex_mis0001_wall_appearance_1.png` 12970B | 修复后的API候选、三tab和详情实际显示；五区未覆盖 |
| 虚拟Live海报 | JP `ondemand/virtual_live/select/banner/vlentrance_00001_re/vlentrance_00001_re.png` 200 PNG254561B | 页面列表/详情；最新活动海报；五区未覆盖 |
| 活动故事 | `ondemand/event_story/event_stella_2020/scenario/event_01_01.json` 200 JSON80797B；event_drive_2026封面PNG123339B | API章节匹配、背景/立绘/字幕同步、章节结束与重播 |
| 卡牌故事 | `startapp/character/member/res001_no001/001001_ichika01.json` 200 JSON42020B | 特训前/后章节、角色模型和语音 |
| 团体/特殊故事 | `startapp/scenario/unitstory/idol-story-chapter/mmj_01_00.json` 86552B；`startapp/scenario/special/special-story/op_01.json` 24742B | 多章、非opening特殊故事与场景效果；五区未覆盖 |
| 背景/BGM/SE/语音 | JP背景bg_a000000 PNG53080B；BGM bgm00040 MP3402328B；SE se00117 MP3202753B；event_01_01语音105577B，均完整GET200 | 浏览器decode/play、声音实际播放和时间推进、静音/暂停/下一句/离页停止；不能以MP3下载成功当播放通过 |
| MC/长音乐 | mc_release_01_1场景JSON14439B、首语音146328B；vs_0010_02 MP35683243B，完整GET200 | 展开真实节目段、MC文本/语音同步、music/MC队列及timeline格式未覆盖 |
| Live2D | 原Sekai Viewer `v1/collabo/21_miku/clb01_21miku/21miku_collabo01_t2.model3.json` 完整GET200 JSON351B | model3全部Moc/纹理/物理/动作/表情GET及舞台渲染、拖拽缩放；完整模型未通过 |
| 谱面SUS | Haruki `startapp/music/music_score/{id}_01/expert.txt?v=2`：JP0001 14689B、JP0811 16759B、TW11012 29398B，均200 text/plain、含#BPM、CORS=* | 当前API SUS和图URL修复后复验；真实SUS→SVG/PNG；Web显示与Android解码均未通过 |

当前工作树已有 `harukiAssetPaths.ts` 共享映射，`assets.ts` 和 `externalData.ts` 均调用它；Live2D目录已恢复Sekai Viewer来源。上述**代码完成不是部署或运行验收完成**。活动故事及媒体多数使用ondemand，卡牌/团体/特殊场景与SE使用startapp，不能统一加同一前缀。

当前读取的 `assets.ts:getChartAssetDetail` 仍生成 `charts-new.unipjsk.com` SVG及旧SUS URL，谱面验收不能标绿。官方Toolbox使用真实SUS经MIT版 `pjsekai-scores-rs` v0.4.3 WASM生成SVG，无已查明的Haruki预生成PNG/SVG服务。SVG外链音符需inline DOM或将图片嵌入，不能假设 `<img src=svg>` 会加载内部外链图片。台服五位ID保留11012，不截断为四位。

官方依据：

- https://github.com/Team-Haruki/Haruki-Toolbox/blob/main/src/modules/music-library/lib/music-bpm.ts
- https://github.com/Team-Haruki/Haruki-Toolbox/blob/main/src/modules/music-library/lib/chart-preview.ts
- https://github.com/Team-Haruki/Haruki-Toolbox/blob/main/src/modules/music-library/wasm/pjsekai-scores/README.md
- https://github.com/Team-Haruki/Haruki-Sekai-Asset-Updater/blob/main/crates/sekai-asset-pipeline/src/export/tests/naming.rs

## Android：以MainActivity实际调用链验收

仓库有两个同名 `PjskToolsApp`，必须区分：`MainActivity.kt` 调用同包 `com.pjsktools.app.PjskToolsApp`，该壳进入 `app/feature/catalog/CatalogFeatureScreen`、`EventsToolsFeatureScreen` 和 `ContentFeatureScreen`；不要以 `app/ui/PjskToolsApp.kt` 的另一套模块导航替代实际运行入口。

| 实际Android入口 | 请求/渲染约定 | 验收状态 |
| --- | --- | --- |
| 主壳歌曲/卡牌/集合 | `CatalogRepository` 请求单数 `/api/master/{r}/catalog/{type}`；详情 `/{music或type}/{id}/full` | 五区列表与详情全部未做设备显示验收；Web复数 `/catalogs/` 样本不能覆盖这套载荷 |
| 当前/历史活动 | `EventsToolsRepository` 当前活动、活动full、排名端点 | 封面、排名队长/称号、相关卡牌跳转未覆盖 |
| 原生谱面 | `RemoteCatalogImage` 逐候选下载，BitmapFactory解码；跳过.svg | 需要真实PNG或适配渲染；Application虽注册Coil SVG解码器，但本控件不使用Coil |
| 故事/Live2D | `ContentComponents` 嵌入 `WebParityRuntime`，携带region | Web runtime地址配置、WebView模型/声音、后台暂停、返回释放未覆盖 |
| MySekai/公告/交换/任务/虚拟Live | `ContentRepository` 各context/catalog/full/step端点，RemoteContentImage/MediaPlayer | 全部设备显示/播放未覆盖；MySekai原生制作成本当前主要为文字，不能强报素材图片通过 |
| 留存模块 `android/feature/*` + BackendImage | GeneratedApiBridge和复数typed目录、Coil图片体系 | 可做编译/单测；其通过不等于MainActivity实际壳通过 |

同任务前序设备检查：ADB服务已存在，但 `adb devices -l` 无连接设备，未发现AVD；现有debug/release APK为9月12日旧产物。generated debug/release runtime曾指向正式Web，staging曾为invalid/空；这只能说明旧构建配置，不能证明当前APK已正确构建、安装或启动。正式验收前重新读取设备和本次构建的BuildConfig。

## 剩余优先顺序与收口条件

1. **P0：修复后真实链路**。复验JP281/125261列表与详情、卡牌1463；更新内容资产映射部署后，重验故事封面、MySekai、虚拟Live和至少一段声音。同时完成真实SUS图渲染，记录JP1/811和TW11012的API→资源→页面结果。
2. **P0：Live2D/故事运行时**。共享模型→模型详情→纹理/动作/表情；四类故事各一章；确保出现角色与背景，按钮操作有效，音频时间推进，离开页面无残留播放。失败按404、解码、CORS、Cubism、场景解析分层定位。
3. **P1：五区/九类/列表详情补齐**。EN/TW/KR/CN六类集合先补完整GET解码；所有区至少最新/历史/第二页与详情，滚动完成懒加载；对不存在的区域内容记录真实not-released，而非跨区替图。
4. **P1：Android本次构建与设备**。主壳全部九类图鉴/活动及内容页、谱面、WebView运行时；小屏与后台恢复。无设备时保持“未覆盖”，不能用API测试替代。
5. **P2：关联及登录态资产**。首页/排名详情/收藏/队伍/分享卡/兑换任务图标；补移动Web宽度、首屏缓存命中/失败候选回退/切区缓存隔离。
6. **最终收口**。每行记录部署版本、区服、ID、API路径、最终图片或媒体URL、GET/解码结果和显示/播放证据。只对已覆盖范围作通过声明；删除运行临时证据前保留此文中的结论和必要失败ID。

## 现有可执行工具及局限

以下是可运行入口，不代表本次全部已运行通过：

| 命令/工具 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| `npm run build`、`npm test`、`npm run test -w apps/web` | 构建、单测/契约 | 上游资源和实际页面/设备可用 |
| `npm run verify:regions` | 五区缓存/schema/source状态 | 全部图片/声音可读；此前本机缓存仅jp/en/cn，需重新确认 |
| `npm run verify:content` | 五区JSON/候选/状态、少数公告HTML | 候选完整GET、模型渲染、声音播放 |
| `npm run verify:story-live2d` | 合成fixture场景转换 | 真实资源和Cubism渲染；须核对映射更新后fixture预期 |
| `npm run verify:local` | 内存store下本地API smoke、编码与构建 | 真实正式数据库、浏览器资源 |
| `.runtime/asset-acceptance-20260917/probe-images.cjs` | 候选完整GET+sharp解码；可配AUDIT_REGIONS/AUDIT_TYPES/AUDIT_PAGE_SIZE | 当前仅第一页、无详情、无Android载荷/浏览器交互 |
| `.runtime/asset-acceptance-20260917/browser-audit.cjs` | JP目录首屏实际img尺寸与请求错误 | 其他卡片组件、全页滚动、详情、五区和播放；需由验收者扩展操作 |
| `android/gradlew.bat -p android :app:testDebugUnitTest --no-daemon` | 原生单测（需JDK/SDK） | 设备显示；connected测试还需已连接设备 |

现有 `api-tests.log` 的4项失败包括：3项数据库连接ENOTFOUND及1项谱面URL断言。不要把业务错误日志中的预期503一概当失败，也不要把这份有失败的记录写成全测试通过。后续新结果应单独注明，不能推断其已被修复。
## 本轮追加的真实浏览器验收

2026-09-17，本节对应仍为 ecece6f 线上版本（共享 mapper / chart 后续发布前的基线）。

- 669×707 与用户相同视口，贴纸页刷新后 ID 125261 naturalWidth=296，截图 `stamps-669-refreshed.png`。当前命中 Exmeaning 代理，因此仅证明恢复显示，尚不证明该请求迁移到了 Haruki。
- `browser-full-scroll-fixed.json`：贴纸、素材各前两页共48图逐张显示；每类每页首尾详情各4个，均完整显示。
- `browser-full-catalog-rest.json`：歌曲、卡池、称号、服装、漫画各前两页48图显示。卡牌第一页面6个失败（1458–1463），第二页24个成功；生日/周年详情错误地显示不存在的特训后图。往期活动第一页24个成功，第二页23个成功、测试活动186缺图。
- `content-interaction-actual-content-before.json`：Virtual Live 1 实际调用 audio.play() 失败，错误Haruki路径缺 ondemand；活动故事1的章节播放器 actions=0，下一句禁用。
- `content-interaction-mysekai-before.json`：家具、素材、蓝图各前6个成功显示，但都命中旧镜像，不能算Haruki迁移通过。
- `content-interaction-before-content.json` 的 Virtual Live / stories 首次运行选择器对应旧组件，超时属于验收脚本问题，不能用于判断产品失败；后续 actual-content 报告已改为 Routes 实际页面。其 Live2D 选择器有效：模型详情 model3-proxy 503、画布加载失败。
- `api-tests-memory.log`：在专用内存测试环境运行26文件164测试通过；该次运行早于随后卡牌状态/mapper增补修改，需要针对新增改动复验。

这些结果是明确覆盖范围，不是全项目验收通过。

## 2026-09-18 继续验收记录（尚未通过全部范围）

- 已部署并推送 `9f14b80`，恢复官方 ondemand 卡池 logo。`browser-full-gacha-restored.json` 五区各24个列表图均实际显示，首条详情已打开；不能推论全库均成功。
- 正式 Android 包基于 `8f42310` 完成单测、Debug/Release构建与签名校验，SHA256 `38fb14cf159a68e02f515546f39dc5db9a5a582bc5e22aa7e5b4cb30059a714e`。已安装任务模拟器 emulator-5558；素材281、贴图125261实际显示，截图 android-release-materials.png / android-release-stamps.png。
- Android JP811 EXPERT 首次加载失败，客户端下载PNG等待不足后落到不支持的SVG；服务端完整PNG GET200（1,984,594B）后App点重试成功显示真实谱面，截图 android-release-chart-ready.png。此首次加载问题仍需修复并重新构建。
- 卡牌训练判定发现回归：1473 rarity_3、1472 rarity_4、1463 rarity_4 被错误判为不可训练。specialTrainingSkillId不存在不能用于排除训练能力；295才是rarity_birthday。Android1473详情确无训练后图。此前关于1458–1463“非训练卡”的解释无效，待按真实master规则修正。
- TW服装首12列表及首详情通过；CN首12中2个真实服装显示、10个名称明确“占位”的未来2027记录无图，正在过滤明确占位而非所有缺图记录。
- KR称号20059–20062 bundle honor_total_recharge_202609、本区CN素材3004源资源完整GET404；没有使用其它区服/月份图片顶替，仍未通过。
- 公告JP6485/CN10839正文HTTP200但iframe被X-Frame-Options DENY阻断；分享卡1200×630成功解码但文字方框；称号任务奖励honor105未关联名称/图片（独立称号图380×80可用）。三项均待修复。
- JP普通任务全部28/28、新手11/11奖励图实际显示。角色任务首24条无奖励为源数据正常；首条140阶段已展开。兑换所前3个详情成本和奖励各图显示。
- 故事黑幕审查发现：画布580×362正常，但loading时可点击播放，controller尚不存在而走文本推进；ready后step已60却未执行背景动作。正在修复加载期交互及场景初始化，不能凭ready文字通过。

以上以 `.runtime/asset-acceptance-20260917` 截图/JSON和 `plan-content-audit/coverage.md` 为证据。未发布待修复Android包，未声称整个项目验收完成。

## ff34aa8 线上复验与 Android 同步

- Web/API ff34aa8（包含0e6ede4功能修复）已构建部署，API healthy。Debian字体依赖改为受签名校验的TUNA HTTP引导CA，再HTTPS安装字体；旧卡住构建及SSH已停止。
- 卡牌官方规则已纠正：rarity_3/rarity_4可特训，initialSpecialTrainingStatus=done仅训练图；生日、1/2星仅普通图。schema17触发缓存重建。`card-states.json` 对1473/1472各两图、1463仅训练图、1464生日/1469二星各一图，真实图片2520px，全部Haruki；Android正式包1473双图/1463初始已特训单图实际显示。
- 公告JP/CN iframe、JP6485内嵌图、分享卡song1中文字体、称号任务24/24奖励图均通过正式网页目视。EN测试活动166列表隐藏，按ID仍可读取。详见plan-content-audit/deployed-0e6ede4/acceptance.md（目录名沿用准备时版本，实际验收ff34aa8）。
- Live2D collabo Miku已通过Haruki BuildModelData适配后实际显示。动作/表情仍是明确legacy bridge；官方Haruki exporter不导出Cubism motion3，不能声明全Haruki迁移。
- Story首段已可出现白色转场，控制器实际执行，但23帧仍黑；独立reviewer继续实测33/60帧，尚未通过。
- CN服装过滤占位记录后，10条正式命名记录仍缺图（含已发布260221）。尚在调查真实资源映射，不能把这些正式记录也过滤掉。
- Android源码0e6ede4通过正式单测、Debug/Release、签名检查；SHA256 `6636cfeb2b064365bb91870940a9090cdaa7f9365ca049ff72b5fc99c4719020`。已安装模拟器并同步服务器下载目录，公网完整下载同hash。服务端保留旧APK于release-snapshots/android-0e6ede4。
- Android MySekai家具/素材/蓝图各首3项实际显示；VirtualLive详情曾冷载timeout，已扩客户端超时但新正式包需继续复验。811master在部署重启期间失败，不能据此认定超时修复成败，需重新冷载测试。
- API最终完整测试：28文件171/171通过，日志api-final-verified.log。

本段不代表全目标完成。仍缺故事真实场景、CN服装、Android内容/谱面最终复测，以及KR称号/CN素材上游缺失项。

## 2026-09-18 后续实测更新（故事补丁发布前）

以下更新取代上一节相应的待测状态，未覆盖项继续保留。

- 本地 HEAD、GitHub main、服务器发布标记均为 `ff34aa8`，服务器 API healthy。工作树中的后续故事补丁尚未计入线上版本。
- Android 正式包 `0e6ede4`：JP811 HARD 冷载首次显示真实谱面（`final-hard-ready.png`）；VirtualLive 1 首 MC 的原生 MediaPlayer 播放至 EOS，记录为 `audio/mpeg`、MP3 decoder、44100Hz（`android-audio-playing.txt` / `android-audio-completed.txt`）。
- Android Live2D collabo Miku 的内嵌 WebView 能显示模型，但上方原生首纹理预览 HTTP404、统计为0/0/0；该详情仍不通过。证据 `android-live2d-webview-visible.png`。
- 活动故事 `event_01_01` 顺序回放到 action8/30/60，病房、卧室、教室以及咲希/一歌实际出现。转场中的黑白画面不能单独判失败。角色多服装被同角色ID覆盖、初始化只载入前三个模型是另行定位的真实缺陷。
- 剧情声音无请求的根因是 Howler 从查询参数前的 `/api/assets/proxy` 无法推断格式；语音/BGM/SE/预载需要明确 MP3。补丁本地测试与构建通过，实际线上解码和播放尚待发布后复验。
- 卡牌故事背景与人物可显示，但张臂姿态异常；独立审查确认 `Live2DModel.from` 未接入 Pixi ticker，自动模型更新未运行。修复后需观察真正动作推进。
- 特殊故事 `op_01` 的官方 NeedBundleNames 明确 `scenario/background/bg00025`。Haruki startapp/ondemand 同bundle均404，未找到官方可证别名。初始或后续缺失背景应隔离失败，不能导致整段故事退出；该背景本身仍是未解决资源项。
- CN 10条正式命名服装均逐条验证 body/head CDN路径404：260211、260221、260411、260421、260611、260621、260811、260821、261011、261021。其中261011/261021的startAt为2026-09-30，尚未发布；其余8条已发布但所测Haruki缩略图不存在。没有以猜测bundle或其他月份/区服图片替代。

截至本节，仍不能宣称全部资源完成Haruki迁移：Live2D动作/表情仍使用已注明的legacy bridge，部分官方资源缺失，故事与Android内容页验收尚在继续。

### Android 原生内容详情补验

仍使用正式 `0e6ede4` APK、线上 `ff34aa8` API；主壳真实点击进入，各页面均保存了UI树与截图。

| 原生页面 | 显示结果 | 截图 |
| --- | --- | --- |
| JP兑换50210 | 奖励card1331卡图、成本material47券图均显示 | android-exchange-detail.png |
| JP称号任务101 | 正式名称“39！”、奖励honor105图片显示 | android-mission101.png |
| JP公告6485 | 原生头图、嵌入正文及正文宣传图显示 | android-information6485.png |

这些结果只更新原生对应页面，不能代替仍待修复的Live2D预览与故事WebView播放验收。

## 0bf6947 / e466d15 发布与增量验收

- `0bf6947` 已推送并部署，包含剧情音频格式、ticker接入、服装引用及按需加载、背景失败隔离、原生Live2D对象URL解析与详情统计、图片缺省MIME修复，以及特训后实际技能字段。API相关10/10测试、API/Web构建、OpenAPI导出/生成/一致性检查通过。
- `e466d15` 已部署并推送GitHub，修复分享图生成器漏掉Haruki允许域名及缺省/generic图片MIME处理；相关18/18测试与API构建通过。生成分享图实际素材仍待复验，不能由PNG200推定。
- Android `0bf6947` 正式验证完成：单测、Debug/Release构建及签名通过；SHA256 `27cac4c84113d9be4dd63bb6b6004138043dfe8b14c2461dae36b1c3fa81518e`。任务模拟器已安装；服务器下载文件已替换且服务端校验同hash。发布脚本完成校验后因PowerShell末尾CR空行返回非零，该尾部错误没有回滚已成功替换的文件。公网完整下载复验仍受本机连接超时影响。
- Android Live2D `clb01_21miku` 原生首纹理已实际显示，详情贴图计数为1（`android-live2d-final-detail.png`）。该模型动作/表情仍为0，不把纹理显示判成动画通过。
- Android 卡1473特训后技能正确显示“与普通技能相同”，Lv1–4真实技能说明均显示（`android-card1473-skill.png/xml`）。
- Android JP排名第2名详情显示队长卡1003及实际玩家数据（`android-rank-detail.png/xml`）。活动216封面、关联歌曲、5张关联卡牌和前4个关联卡池图均显示（`android-event216-related.png`、`android-event216-related2.png`）。
- 正式Web卡牌剧情音频代理均200 audio/mpeg；WebAudio记录语音1.7–5.6秒、循环BGM63.19秒，离页后停止。暂停后仍出现新语音启动，且模型保持T姿态，属于仍待修复的真实问题。独立motion目录的BuildMotionData已找到，不能以仅接ticker宣称动作正常。
- 正式Web活动剧情睡衣咲希action29/30、制服咲希action53均显示，音频成功；新角色进入的稳定等待复测受到浏览器连接超时影响，尚未通过。
- 特殊故事 `specialStories/2/4` 完整推进至74/74，真实BGM/SE解码播放，缺背景未再中断控制器。但是bg00025/24/03/02仍404，3个旧服装引用 `light_sound_a_normal`、`miku_normal`、`light_sound_b_normal` 无模型映射，画面仍缺资源；此章节不通过。证据 `plan-content-audit/story-other-types-0bf6947/`。单元故事新版本复测多次被导航/API连接超时阻断，未误记通过。

本轮GitHub、SSH、桌面浏览器连接存在间歇TLS或TCP失败，重试时有成功记录；网络失败与明确上游404分别保留。目标仍未完成，需继续剧情动作/暂停、分享图真实素材、其他未触达入口和有真实登录数据的页面验收。

## 2026-09-18 7b68d48 发布复验

- 本地提交 `7b68d48` 已推送到 GitHub `main`，服务器 `/opt/pjsktools/release-snapshots/assets-7b68d48/deployed-revision.txt` 已回读为同一提交。
- 服务器精确归档部署后，API/Caddy 容器均重建并健康运行；`https://api.sekai-tools.cn/health` 返回 `status=ok`、五区列表、`harukiApiConfigured=true`、`harukiFeatureEnabled=true`。
- 公网实际端点复验：生日卡 `1464` 分享图返回 `image/png`、268427 字节且 PNG 签名有效；活动 `216` 封面主 URL 为 `sekai-assets.haruki.seiunx.com`；歌曲 `1` jacket 主 URL 为 Haruki；歌曲 `1/expert` 的 `susUrl` 和渲染来源均标记 Haruki；卡牌 `1464` 普通卡图和缩略图主 URL 为 Haruki。
- 定向测试在强制内存存储下 `5` 个测试文件、`33/33` 通过。未强制内存存储的整套运行是 `28` 个文件、`183/186` 通过，剩余 `3` 项是本机 Supabase tenant DNS `ENOTFOUND`，不是本次资源路由测试失败。
- 返回结构仍保留旧镜像作为失败回退候选；主请求已经切到 Haruki。不能据此把上游明确缺失的背景、部分区域服装/素材、Live2D legacy motion 等记录为已修复。

## 2026-09-18 141a3d8 overall tier-series 生产复验

- `141a3d8` 已推送 GitHub 并部署服务器；服务器发布标记为 `141a3d8`，健康检查正常。
- 正式接口 `GET /api/events/en/live-ranking?boardType=overall` 实际返回 Haruki Toolbox overview，`sourceHealth.primarySource` 为 `https://toolbox-api-direct.haruki.seiunx.com/.../leaderboards/total/overview?interval=3600`，返回 26 条档线/榜线记录且无 warning。
- `GET /api/events/en/179/ranking-border?page=1&pageSize=100` 实际返回 26 条，记录来源为 `toolbox-api`。因此 overall tier-series 已不再依赖 rks-n；rks-n 仍仅保留为 Haruki 不可用时的兼容回退。

## 2026-09-18 生产剩余来源复核

- `d68f501` 已推送并部署，更新运行状态文字，明确 overall tier-series 已走 Haruki，rks-n 只保留 churn 和旧版回退。
- WorldLink churn 接口现场复核仍为 `rks-n.exmeaning.com`，100/100 条 `churn1h=0` 且带 active parking；Haruki Toolbox 已公开的 overview/detail 只提供轨迹、增长和分数线，未发现可等价替代的 churn/parking 批量接口，因此不能标为 Haruki 已接通。
- 当时探测 Haruki JP 旧漫画时错误使用 `/jp` 根，导致两种错误候选共80个URL全部404；后续纠正为 `jp-assets/startapp/comic/one_frame/comic_0001..0040.png` 后40/40 HTTP200。原页面使用Moe漫画的显示证据仍保留，后续e5e8116已部署新增40图，初轮部分fallback保留；随后新会话完整来源与显示证据为40/40 Haruki通过，详见顶部，仅覆盖JP新增漫画，旧tips来源待办仍保留。
