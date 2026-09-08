# UX 优化执行与验收清单

范围：仅调整已有网页与 Android 功能的呈现、交互、反馈和可访问性；不新增业务功能，不开启 Haruki 集成，不改变计算公式或生产数据。按 Web P1 → Web P2 → Web P3 → Android P1 → Android P2 → Android P3 顺序实施。用户于 2026-09-09 改为 Android P2/P3 完成后一起打包：P2 验收及源码提交后进入 P3，最终合并验证、正式签名和三处发布；其他已完成批次的记录保持原样。

## 来源与去重

原始 20 项中 Android 系统栏安全区映射 A1，其余 19 项用 W1–W19 追踪；Android 补充清单 A1–A11 覆盖并细化相关项。W8 包含网页筛选和 Android 分页；W11、W12 已归入 Android，跨端相同原则分别验收。

| 批次 | 来源 | 完成标准 |
| --- | --- | --- |
| Web P1 | W1 手机导航 | 手机默认收拢全部导航，当前模块清晰；展开、选项跳转及收起可操作，桌面保留完整导航。 |
| Web P1 | W2 顶部压缩 | 标题、区服和刷新职责清楚，不反复显示正常初始化状态；错误仍可见；刷新按钮有进行中状态。 |
| Web P1 | W3 图鉴状态 | 初载、后台刷新、筛选零结果和请求失败各自明确；错误就地重试，已有内容不无故消失。 |
| Web P1 | W4 详情响应 | 歌曲、卡牌、活动及集合详情点击立即反馈；加载、失败、重试、关闭均正常，旧请求不覆盖新选择。 |
| Web P1 | W5 推荐展示 | 已有组卡推荐结果以卡牌与关键数值显示；空结果说清原因，读取结果不依赖 JSON。 |
| Web P1 | W6 弹层行为 | 对话框语义、焦点进入与返回、Tab 范围、Esc 关闭、背景滚动锁生效；多层详情只关闭顶层。 |
| Web P2 | W7 首页去重 | 区服及已在顶部显示的信息不重复占主内容；现有常用入口优先且可达。 |
| Web P2 | W8 网页部分 | 图鉴筛选常驻区域紧凑，展开后仍能明确知道结果范围，不让长筛选挤走主体。 |
| Web P2 | W9 手机筛选 | 已选条件可辨认；底部有查看结果/收起操作，清空与关闭易找到；保留现有即时筛选语义。 |
| Web P2 | W10 卡片层次 | 图片比例稳定，名称最突出，角色/属性/星级次之，ID 弱化；长标题不挤坏卡片与按钮。 |
| Web P2 | W13 玩家语言 | 内部状态、缺失字段和来源标识转换为玩家能理解的说明；技术信息不占默认主内容。 |
| Web P2 | W14 展示顺序 | 相关列表与详情采用一致的信息优先级和标签顺序，不重置已选筛选、分页和滚动上下文。 |
| Web P3 | W15 控件层次 | 主操作、次操作和图标操作的大小与样式一致；手机触控目标足够，键盘焦点可见。 |
| Web P3 | W16 视觉一致 | 相同层级字号、间距、边框、圆角和阴影一致；不以统一样式牺牲长文本可读性。 |
| Web P3 | W17 数据格式 | 分数右对齐；数值单位、时间表达一致；真实 0 与缺失值明确区分，不靠 truthy 判断混淆。 |
| Web P3 | W18 详情收纳 | 次要说明和原始计算详情默认折叠，关键结果保持可见，不移除既有可查信息。 |
| Web P3 | W19 图片 | 首屏优先，其余接近可视区才请求；固定比例避免跳动；短暂失败可以重试且恢复成功。 |
| Android P1 | A1 安全区/键盘 | 状态栏、导航栏与 IME 不遮挡输入框、错误说明和提交按钮；键盘出现时可滚到当前输入。 |
| Android P1 | A2 + W8 Android部分 | 长筛选可收拢，结果优先；分页不因筛选高度被挤得难以找到，跳页与返回保持上下文。 |
| Android P1 | A3 + W11 | 长标题在列表、详情与按钮中可换行/合理截断，操作不被挤出；点击区域不缩小。 |
| Android P1 | A4 + W12反馈部分 | 登录、保存、刷新及失败信息靠近对应操作，反馈清晰且无需回页面顶部寻找。 |
| Android P2 | A5 + W7 | 首页重复区服与状态收拢，保留现有主要入口。 |
| Android P2 | A6 + W12排序部分 | 账户信息、常用管理和低频操作按使用频率分组排序，危险操作与常用操作区别清楚。 |
| Android P2 | A7 + W10 | 卡牌图片、名称、角色/属性/星级和 ID 的层级一致，列表扫描容易。 |
| Android P2 | A8 + W14 | 相关列表和详情字段优先级一致，返回后保持已有选择及位置。 |
| Android P2 | A9 + W13 | 设置、空态和错误使用玩家语言，说明当前状态和可做的操作，不默认暴露内部字段。 |
| Android P3 | A10 + W15–18 | Material 控件、触控目标、字号间距和主次操作一致；数值/单位/0与缺失及次要详情原则与网页一致。 |
| Android P3 | A11 | 小屏与系统大字体下无不可操作截断、相互覆盖或横向溢出，长文本和键盘场景可滚动。 |

## 六批执行门槛

每批顺序：实现 → 本批自动检查与实际交互验收 → 独立审查 → 修复并复验受影响项 → 提交并同步 GitHub/main → 同步本地交付位置与服务器 → 线上抽查并记录证据。Android P2/P3 按用户最新要求合并交付：P2 本地验收和独立审查通过、源码提交后即可进入 P3，不再以 P2 单独服务器发布为前置；P3 完成后对合并改动统一验证、审查、签名并发布。不用整仓重复测试替代具体交互验收。

| 批次 | 依赖与主要检查 |
| --- | --- |
| Web P1 | 建立导航、请求状态和弹层通用行为；`npm run build -w apps/web`、`npm run test -w apps/web`；实际验证手机导航、慢请求/失败/零结果、快速切换详情、Esc/Tab/返回焦点、嵌套弹层与滚动锁。 |
| Web P2 | 复用 P1 状态和弹层；网页 build/test；验证首页、卡牌/歌曲筛选、已选条件、列表→详情→返回、长标题，以及中文状态与原始详情可达性。 |
| Web P3 | 复用 P1/P2 页面层级；网页 build/test；验证桌面/小屏、键盘焦点、数字 0/null、单位时间、图片首屏请求与进入视区请求、模拟失败后重试，必要时检查现有图片回退候选。 |
| Android P1 | 以已发布网页行为作参照；相关模块单测、`:app:testDebugUnitTest :app:assembleDebug` 与 `:app:lintDebug`；设备/模拟器验收系统栏、IME、长标题、筛选/分页、就近反馈。 |
| Android P2 | 复用 A P1 布局和反馈；以已发布网页为视觉基准，完成 A5–A9 信息布局及导航、卡片、按钮的可见风格协调；同上相关检查；验收首页、账户、图鉴、详情返回与设置空态，并对照网页同类页面的主次层级。 |
| Android P3 | 将网页对应的颜色、字号、间距、形状及控件规则收敛到共享 tokens，统一 Material 与响应式；相关检查加受影响设计系统/图片测试；实际验收小屏、大字体、键盘、横屏及图片失败恢复；正式签名流程通过后交付。 |

网页最低交互矩阵：约 360/390px 手机、768px 中屏、1440px 桌面，200% 浏览器缩放；纯键盘与移动视口；默认数据、长标题、0、缺失、无结果、慢请求与失败。仅在检查需要时使用测试数据/请求拦截，不改生产数据。检查筛选/详情关闭后焦点与滚动位置、区服切换不串数据。已有搜索防抖、URL 状态和缓存不得退化。

Android 最低交互矩阵：约 360dp 小屏、常规手机、横屏，字体缩放 1.0/1.3/2.0，键盘打开/关闭，系统返回键、边到边系统栏；实际走现有首页、图鉴筛选/分页/详情、账号输入/保存、设置。记录真实运行证据，静态代码断言不算视觉验收。测试结束恢复模拟器字体、旋转和测试网络状态。

## Android P2/P3：接近当前网页的视觉方向

用户追加要求 App 风格接近当前网页；这是 A5–A11 的视觉实施方向，不新增业务功能。P1 完成既定三处交付前仅规划，不开始 P2 实现。基准为已发布 Web P3 的 CSS（最近样式提交 `889af1c`，当前工作树两份 CSS 无未提交修改）：`apps/web/src/main.tsx` 先加载 `styles.css`、后加载 `product-theme.css`。后者 184 行起的最终规则将早期 5/6px 圆角覆盖为控件 8px、面板 10px，应使用最终生效值。

真实 Android 调用链为 `MainActivity.kt` → 根目录 `PjskToolsApp.kt` → `ui/theme/Theme.kt` → `android/core/designsystem/.../Theme.kt`。`ui/PjskToolsApp.kt` 不是本次主入口。以下是待实施映射，不能作为视觉验收已通过的证据。

| 网页基准与现有差异 | Android 精确入口与目标映射 |
| --- | --- |
| `product-theme.css :root` 的青绿 `#00a7a5`、深青绿 `#007f82`、粉 `#e84c8b`、黄 `#f1c84b`、正文 `#18212b` 已与 App 的 `SekaiTeal/TealDark/Pink/Yellow/Ink` 一致；网页次要文字 `#5b6875`，App 为 `#53616c`。 | 共享 `Theme.kt` 保留已有品牌色；P3 将 `onSurfaceVariant` 等次要文字语义统一。粉/黄用于小面积强调与状态，不扩展为大面积背景。主按钮可保留深青绿实色保障白字可读性，青绿用于边线与焦点。 |
| 网页画布 `#eef3f5`、面板白色、柔和表面 `#f5f8fa`；App 背景目前使用柔和表面色，部分首页卡片使用整块 `primaryContainer`。 | 共享 `LightColors.background` 对应网页画布，`surface` 对应白色卡片，柔和底色保留为次级区块。`HomeFeatureScreen` 改为白色主体与青绿侧边/短强调条，减少大块有色容器。网页网格背景不是必要目标；保留 App 现有深色模式并单独检验可读性。 |
| 网页最终 `--control-radius:8px`、`--surface-radius:10px`；App `SekaiShapes` 为 4/6/8/12/16dp，且 Button、DrawerItem 仍可能使用 Material 默认胶囊。 | P3 在共享 `Theme.kt` 定义或明确映射控件 8dp、卡片/面板 10dp、小标签/图片 4dp；`Button/OutlinedButton/FilterChip/OutlinedTextField/NavigationDrawerItem` 显式采用相应形状，不能只改 `Shapes` 就假定所有控件同步。 |
| 网页面板边线 `#cfd9df`、图鉴边线 `#d1dce2`，统一轻阴影 `0 6px 18px rgba(34,55,67,.08)`；App 各处 Card 的边线与 0/2/4dp elevation 不同。 | `ShellCard/MetricCard`、账户 `Panel`、`CatalogItemCard/DetailCard`、`ContentListCard/DetailCard` 采用统一 1dp 轮廓与轻量 elevation（约 1–2dp 起调，设备验看后定值）；分组面板保留网页式短青绿标记。Compose elevation 不与 CSS 模糊半径直接换算。 |
| 网页页标题约 25px、手机首页标题 30px，卡片名称常见 15px、次要资料 12–13px；App 目前仅修改默认 Material 字重，各页面混用 headline/title/body。 | P3 为 `SekaiTypography` 明确层级：页面标题 `titleLarge` 约 24sp，首页主标题约 28sp，区块标题 18sp，卡片名称 `titleMedium` 16sp，正文 14–16sp，元信息 12–13sp；行高随字号配套。名称优先、ID 弱化；采用系统字体与 sp，不新增字体下载，不逐像素缩小网页标题。 |
| 网页按钮有明确主操作实色、次操作白底描边，最终普通高度 42px/手机 44px，焦点轮廓 3px；App 默认形状和主次用法尚不一致。 | P2 在所改页面协调现有主次操作；P3 将主操作映射 `Button`、次操作 `OutlinedButton`、低频操作 `TextButton`，图标操作保留 Material 语义/反馈。Android 点击区域至少 48dp，按钮内容随大字增高；不照搬网页 40/44px 紧凑导航高度，也不模拟桌面 hover 位移。 |
| 网页导航为 `#17252b` 深底、文字 `#cbd8dc`、选中粉色左边线；App 抽屉为 `SekaiInk=#18212b`，选中主要靠圆形/胶囊背景。 | 根 `PjskToolsApp.kt` 的 `ModalDrawerSheet/NavigationDrawerItem` 采用对应深底与细粉色选中条，保留分组和当前模块指示；顶部维持移动抽屉、区服切换和安全区。只协调外观，不引入桌面常驻侧栏、不改变 `section` 导航与 `key(...)` 状态边界。 |
| 网页列表和详情遵循图片→名称→核心标签→弱化 ID，次要来源说明默认收纳；App 卡牌副标题仍拼接角色/属性/星级，详情说明有时先于主图。 | `CatalogRepository.parseCatalogItem` 只提取已返回的展示字段；`CatalogItemCard/DetailContent`、`ContentComponents` 各详情按同一字段顺序呈现。P2 完成信息层级与中文标签；P3 收敛数字右对齐、单位/0与缺失、次要说明样式，保留所有原有信息可达。 |

P2 最小分组：① `feature/shell/ShellBasicScreens.kt` 的 `HomeFeatureScreen/SettingsFeatureScreen` 完成首页区服去重、玩家用语与设置空态，同时协调首页卡片及按钮；② `feature/account/AccountFeatureScreen.kt` 的 `AccountWorkspace` 和 `AccountDataPanels.kt` 调整为概要→玩家账号→资料/资产/常用记录→QQ关联→隐私权利→协议链接；③ `feature/catalog/CatalogFeatureScreen.kt`、必要的展示字段映射和 `feature/content/ContentComponents.kt` 完成图鉴与详情层级。P2 可对共享样式作支撑这些可见变化的最小调整；全局 token 定义、剩余控件替换和响应式一致性在 P3 收敛，避免各页复制新的颜色/尺寸常量。

设置布局历史问题已修复：360×640 真实设备截图曾显示默认区服单行五按钮将第 5 个 CN 挤成无标签椭圆。P2 已改为可换行布局，实测五个标签完整、CN 可点击并保存；P3 已完成相关字体与横屏复验，包括字体 2.0 + 横屏 + IME 下输入可见、Save 可滚动到并保存成功。

保留 P1 的安全区/IME、反馈定位、请求取消、详情栈、列表锚点与关闭复位；保留 controller、缓存/区服隔离、默认 UID、权限确认、Haruki 编译开关、数据排序与计算算法。移动布局以单列和可换行操作为主，横屏/宽屏只用已有响应式空间；不得把桌面网格等比缩小。视觉验收对照网页同类首页、图鉴、详情、账户页的色彩与层级，按现有 Android 360dp、字体 1.0/1.3/2.0、键盘与横屏矩阵执行，并覆盖现有深色模式；未运行的检查明确保留待完成。

P2 验收清单（最终自动检查、全部最后定向 QA 与独立审查已通过，源码已提交并同步；正式签名和服务器交付已随 P2/P3 合并发布完成）：

- A5 首页：区服只保留主壳现有选择入口；歌曲/卡牌数量、当前活动、常用入口可见且原跳转可用，区服切换继续使用对应数据。
- A6 账户：概要→玩家账号→资料/资产/常用记录→QQ→隐私权利的分组顺序正确；现有选择/default UID、表单输入、就近反馈和危险操作确认保留。验看登录前及已有资料状态，不为验收实施真实删除。
- A7 图鉴：图片、名称、角色/属性/星级、ID 主次清楚，与网页同类卡片一致；中文映射不改变原数据值，长标题与图片比例保持可读，无新增请求依赖。
- A8 详情：列表/详情核心字段顺序一致；覆盖服装 ID 950、卡牌 1445→卡池 990 和歌曲 803 EXPERT；关闭/系统返回保持原条目、分页、筛选和滚动位置，谱面收起不清空其他内容。
- A9 设置/状态：360×640 五个默认区服按钮的文字均可见可点，CN 不再成为空椭圆；地址错误、未加载、无结果和来源暂缺文案清楚，已有重试有实际动作；IME 打开时可滚到输入/错误/保存，保存与缓存选择语义不变。
- 风格与回归：对照已发布网页检查青绿主色、深色导航、白色描边卡片、名称/元信息层级、主次按钮；保留至少 48dp 触控与 P1 安全区/裁剪/IME。按本批受影响范围执行现有自动检查与设备交互，完整 token/Material/字体缩放矩阵仍由 P3 最终收敛；P2 若已触及相关项则同时复验。

### P3 真实可达实施入口补充

P2 最终自动检查、全部最后定向设备 QA 与独立审查均已通过，提交 `978265f0b4820a43d13303b420dd4d81378309f0` 已同步根 main 与 origin/main，CI `34249431273` success。按用户最新要求取消 P2 单独签名发布，原 Terra 负责主题/主壳、ui_features 负责功能页并行实施 P3；以 P2 最终代码为基线，最后合并验证打包发布。

| P3 项目 | 共享实现与必须接入的实际调用点 |
| --- | --- |
| A10 tokens/Material | 共享 `android/core/designsystem/src/main/java/com/pjsktools/core/designsystem/Theme.kt` 定义颜色、Typography、8dp 控件/10dp 面板形状与间距；App `ui/theme/Theme.kt` 保持系统深浅色转接。根 `PjskToolsApp.kt` 的 `ModalDrawerSheet/NavigationDrawerItem`、顶部按钮/区服选择，以及各可达页的 Button/OutlinedButton/TextButton/FilterChip/OutlinedTextField/Card/AlertDialog 显式接入统一形状与主次规则；不得只改默认 Shapes 就视为已覆盖。 |
| A10 共用容器/48dp | 最小共享表面、操作和折叠样式复用于 `ShellBasicScreens.kt` 的 `ShellCard/MetricCard/LoadingCard/ErrorCard`，`AccountDataPanels.kt` 的 `Panel/InlineActionFeedback`，`CatalogFeatureScreen.kt` 的卡片/分页/谱面头，`ContentComponents.kt` 的列表/详情/状态面板，`EventsToolsFeatureScreen.kt` 的 `InfoCard/WarningCard/ErrorCard/EmptyCard`，以及 `DeckCompareFeatureScreen.kt` 的方案与结果卡。触控区域至少 48dp，不降低 Material 最小交互尺寸；长按钮用可增高/换行布局。 |
| A10 数字/0与缺失 | 共享可空数值展示函数与数字文本样式，作用于首页 Top 3、公开玩家 Rank、活动实时排名/档线/增长/预测、工具 highlights、卡组比较结果/历史、账号绑定摘要和歌曲成绩。尤其 `EventsToolsFeatureScreen` 的 `observedPtUpdates ?: 0`、`AccountFeatureScreen.BindingCard` 的 `summary?.inventoryCount ?: 0` 会在展示端把缺失变成 0，应区分；`DeckCompareFeatureScreen.number(Double?)` 已区分 null，复用语义而不倒退。数值右对齐并采用等宽数字，单位与时间表达一致；不顺手修改输入解析、默认值或计算公式。 |
| A10 次要信息折叠 | `EventsToolsFeatureScreen.ToolsContent` 已有 JSON 开关，收纳公式轨迹/估算字段等次要块，关键 highlights、影响结果的缺失与警告保持可见；`DeckCompareFeatureScreen.DeckResultCard` 的公式版本、Exact Trace 为次要块，胜出方案/差值/各方案结果保持可见。沿用 P2 的 Catalog/Content 来源说明。`AccountDataPanels.DeckRecommendPanel` 目前仅显示 `rawJson.take(800)`，不能直接把唯一结果折叠掉：应先用现有响应展示最小主结果，再提供完整原始信息入口，禁止继续以截断 JSON 代替结果。 |
| A11 易遗漏布局 | 根 `PjskToolsApp` 在正常导航前的无效 API fallback 直接调用 `SettingsFeatureScreen`，必须与普通设置页同验；`DeckCompareFeatureScreen.ChoiceRow` 的六难度单 Row、方案操作行及长方案名；`AccountFeatureScreen` 的 `LegalAcceptanceDialog/AccountDeletionDialog/LegalCheckbox`；`feature/compliance/ComplianceLinks.kt` 的三链接单 Row；`ContentComponents.ResourceGroup` 的图片/长文本组合；`RemoteContentMedia.kt` 中音频播放/停止与剧情演出控件均实际可达。只调整布局可滚动/可换行，不改确认门槛、播放生命周期或业务状态。 |
| 图片与深色衔接 | 可达页面实际使用 `feature/catalog/RemoteCatalogImage.kt` 和 `feature/content/RemoteContentMedia.kt` 的 `RemoteContentImage`；覆盖排名头像、分享卡、卡牌/服装、谱面、剧情和资源列表。保留固定比例/尺寸、候选回退、取消与缓存规则，按既定图片失败恢复要求验证；深色下检查占位/失败文案及卡片边线。当前主 App 源码未调用 design-system 的 `BackendImage/ResultContent/StateMessage`，不要只改这些未接入组件或扩展旧页面。 |

P3 设备矩阵沿用既定范围：约 360dp 小屏、常规手机和横屏，字体 1.0/1.3/2.0，键盘打开/关闭及系统深浅色；对真实可达组件做代表性组合验收，不要求每个页面机械执行全组合。必须包含正常设置与 fallback、账户输入/确认弹窗、六难度选择行、长标题列表→关联详情→返回、剧情/演出媒体控制与页尾协议链接。检查点击目标不重叠、标签完整、输入/错误/确认按钮可滚到、系统栏与键盘边界不退化；主题切换不能丢失当前输入和详情状态。结束恢复字体、旋转与网络测试设置。

P3 已确证的补充问题：① 当前 Catalog Card 默认底色呈浅紫（主工作区 `.runtime/ux-p2-card.png`），共享主题需协调 Material `surfaceContainer` 系列，不能只改 `surface`；② 浅色模式打开深色抽屉时，状态栏仍用黑色图标，时钟/电量对比差（`.runtime/ux-p2-view.png`），A11 应实际验收明/暗模式×抽屉开/关的系统栏背景与图标对比，P2 不改系统栏策略；③ 切换系统 night 触发 Activity 重建后从账户返回首页，P3 应在根 `PjskToolsApp` 的现有导航状态保存入口处理，并实测横屏/主题重建时保留当前模块，兼顾已有输入/详情状态，不新增导航功能。

P3 范围去重：A10 保留全局颜色与 surfaceContainer、字号/间距/形状、显式 Material 控件及 48dp、数字/单位/0与缺失、剩余次要详情收纳；A11 保留字体 1.0/1.3/2.0、小屏/横屏/IME/系统栏、深色及重建状态、既定图片失败恢复。P2 已解决的首页区服去重、账户区块排序、卡片字段层次、中文枚举、技术信息折叠/状态保留、设置 CN 换行，以及已有粉色导航标记不重复实现；仅在 P3 共享样式或重建状态改动影响它们时回归。此前 P3 入口表用于列出调用覆盖范围，不能解读为所有现有组件均需重写。

## 发布路径与约束

- 工作树为 `.runtime/ux-polish-worktree`，起点 `1083a1f`；只提交本任务改动。主工作区既有 generated 文件改动保留，禁止覆盖或混入提交。
- 开发预览：项目根目录 `npm run dev` 提供 API `127.0.0.1:4000`，`npm run dev:web` 提供网页 `127.0.0.1:5173`；网页 API 可用 `VITE_API_BASE_URL` 配置。使用已装依赖，不无故重装或更新依赖。
- 服务器项目位于 `/opt/pjsktools`，无 `.git`，使用明确的 `git diff` 路径清单归档部署；生产配置为该目录 `.env.production`。起始 `.deployed-revision` 为 `1083a1fbde2a08f392427151d623dfe2b8c249d0`。SSH 主机信任记录使用主工作区 `.secrets/known_hosts`，不使用验证失败的根目录 `.codex-server-known-hosts`；私钥仍留在私有配置位置。
- 纯网页批次同步受审查提交对应的源码，再在现有 API 健康前提下执行 `sudo docker compose --env-file .env.production -f compose.prod.yml up -d --build --no-deps caddy`。`caddy` 是网页镜像服务，API/数据库无改动时不重建它们。现有 `.runtime` 与 `.secrets` 旧 tar/固定 hash 发布脚本不可直接用于新提交。
- 每批留存提交号、审查结果、实际测试结果、服务器部署结果、网页路由与静态资源抽查。网页抽查真实页面和 HTTPS API health，不能只看 HTTP 200；上线前记录当前镜像/源码版本以便回退。若范围扩大到 API/数据库，按现有部署规则先备份并重新评估必要检查。
- Android 日常 Debug 验收在任务工作树；正式 APK 必须运行主工作区 `.runtime/run-reviewed-android-validation.ps1`。它会 fetch 并导出干净 `origin/main`，因此先完成审查并同步 main，再运行正式验证；不能把未合入修改当作签名输入。
- 正式 Android 流程为 Unit → Debug → Release → `apksigner verify` → APK/SHA-256 原子发布；必须看到 `ANDROID_VALIDATION_COMPLETE`。脚本使用原有签名材料、Android SDK 35 和现有 Gradle 缓存，发布输出为主工作区 `deploy/downloads/pjsktools-android-0.1.0.apk` 及 `.sha256`。
- 已确认本机环境可用：`C:/Program Files/Android/Android Studio/jbr` 为 JDK 21.0.10；`C:/Users/83899/AppData/Local/Android/Sdk` 包含 API 35、build-tools 35.0.0、platform-tools/adb.exe 与 emulator/emulator.exe。已有 AVD 为 `Medium_Phone_API_36.0`（1080×2400，420dpi）和 `Pixel_Tablet`，无需重新下载 SDK。adb 未在 PATH 时用绝对路径。
- 本次 Windows 构建恢复选择现成的 `C:/Program Files/Java/jdk-17`（Oracle JDK 17.0.16）：Gradle 8.9 在 JDK 21 下出现 transforms 临时目录移至 immutable 目录的 `AccessDeniedException`；保持现有新缓存与正式参数、仅切换 JDK 17 后，`help` 配置探针于 1 分 54 秒返回 `BUILD SUCCESSFUL`，daemon 14308 日志确认实际 Java home 为该 JDK 17。随后完整四任务 `compileDebugKotlin / testDebugUnitTest / assembleDebug / lintDebug` 使用同一 JDK 17 与 `.runtime/gradle-android-ux-cache` 于 20 分 51 秒返回 `BUILD SUCCESSFUL`，25 项单元测试、0 失败，本机四任务构建验证已恢复。正式发布脚本保持原样，可通过 `JAVA_HOME` 指向该 JDK 17 启动，仍使用脚本默认的 `.runtime/gradle-android-compliance-cache`；不更改脚本或缓存选择，不下载新构建工具。
- 每个 Android 批次正式产物上传服务器 `deploy/downloads`，校验签名与上传/下载校验和，确认 APK 真正来自本批 main 提交。该目录以只读卷映射给 Caddy，更新 APK 不需要重建 API 或数据库。保留旧版可回退后再替换，新旧 APK/校验和成对一致。
- `deploy/server-up.sh` 是全栈重建流程；`deploy/verify-server.sh` 会主动创建数据库备份，不是纯只读检查。UI 批次使用针对性发布与验收，避免无关迁移/备份。

## 完成记录

| 批次 | 提交/审查 | 自动检查与实际交互 | 本地/GitHub/服务器同步 |
| --- | --- | --- | --- |
| Web P1 | 独立代码审查通过；提交 `8b7caaebd69e9952beebfc1ad145b865d8afb101`；CI `34211193258` success | build、16 项测试、diffcheck 通过；390px 菜单收拢/跳转，360/700/768/1440px 无横向溢出及断点导航；详情即时加载、慢请求关闭后不重开；Tab 焦点循环、Esc 返回触发卡；卡池→卡牌嵌套仅关闭子层并返回焦点、背景滚动锁保持；零结果、503 保留缓存、重试加载及恢复；工具连续输入稳定、真实推荐图文结果均已实际验收 | 本地 main 已快进且保留既有 29 个 generated 文件改动；GitHub/main、服务器及 `.deployed-revision` 已同步本批提交；HTTPS 健康检查通过，线上 390px 图鉴/菜单/当前模块及 1447 条结果已验看 |
| Web P2 | 独立最终代码审查通过；提交 `852e84869afadd30cc2a00a0771789cd1cc9b265`；CI `34214638465` 全部通过（success） | web build、19 项测试通过；最后 eventUnit 映射修改的定向测试及 build 通过；390px 筛选白石杏即时得到 55 条结果、已选条件标签和底部查看/收起正常；第 2 页→卡牌 849→Esc 返回原按钮焦点且 URL/分页条件保留；首页去重、1440px 筛选默认收起且首排资料可见；模拟 503 保留已有数据、显示中文提示且不暴露 JSON，重试恢复；活动 190→Polar Star→expert 三层详情 z20/30/40，Esc 逐层返回、焦点与滚动锁正确；冻结后 IAB 独立新状态验证 cards?page=2&characterIds=10→往期活动加载完成、216 条结果且无遗留加载状态 | 发布完成：本地 main、GitHub/main、服务器 `.deployed-revision` 一致；HTTPS API 健康且 Haruki 保持关闭；线上 IAB 确认 1447 张卡牌、默认筛选收起、中文属性与信息层级 |
| Web P3 | 实现冻结；独立最终代码审查通过；提交 `889af1c23f17b31eeaf7c4375c11b7e198ec274e`；CI `34217838351` 全部通过（success）；verify 用时 10m41s，Android assembleDebug/testDebugUnitTest/lintDebug 均通过 | 22 项测试、build、diffcheck 通过；360/768/1440px 无横向溢出；排名分数与增长右对齐并使用 tabular-nums，Tab 聚焦排名行显示约 3px 焦点轮廓；缺失目标档线就地提示且不按 0 规划；手填每局 25000 时本次每局收益显示 25000，主要结果与风险可见，JSON/采样技术信息默认折叠且置信度中文；720px 高视口中 y1953 离屏图片不请求、接近后请求；503 后同 URL 重挂载恢复；模拟缓存候选 onError 后真实备用图片加载成功；eager 图片 503 后离开 600px 观察区再进入自动恢复，无需重挂载，容器高度保持 67.36px；2026-09-09 用户在正式站首页 https://sekai-tools.cn/ 手动进行浏览器 200% 缩放检查，针对导航/文字/按钮重叠、截断及横向溢出，反馈“200% 下显示和操作正常”；此为用户首页手验，非代理浏览器测量，其他路由的 200% 全矩阵仍未验证；本条补充留待 P3 提交 | 发布完成：本地 main、GitHub/main、服务器 `.deployed-revision` 一致；服务器生产 build 通过，HTTPS health 正常且 Haruki 保持关闭；新 JS/CSS 均返回 200；线上 IAB 1440px 确认 100 条排名、12 档线、分数/增长右对齐与 tabular-nums，新 JS 加载正确 |
| Android P1 | 本地验收与最终独立审查完成；提交 `d478c494d7183ae5f803c3183501138342714643` 已同步 GitHub/main，根工作区 main 已快进；最终 fallback modifier/Manifest 调整已增量 assemble，并通过受影响场景手动复验 | 本机 JDK 17 + `.runtime/gradle-android-ux-cache` 完整四任务 `compileDebugKotlin / testDebugUnitTest / assembleDebug / lintDebug` 返回 `BUILD SUCCESSFUL`，用时 20m51s；25 项单元测试、0 失败，3 项 connected 设备测试通过（在最后仅调整 fallback modifier/Manifest 之前）。设备 360×640 已验证筛选展开、末字段输入可达、清空、每页 24→96 与第 2/11 页，以及服装 ID 950 详情关闭后图片和标题 bounds 精确复位。无 IME fallback 初始错误首行 y=105，在状态栏底部 y=63 之下；滚动后状态栏干净，底部内容裁剪于 y=1617、未进入导航栏。最终 `adjustResize` 包的账户/fallback IME、长标题与关联返回、谱面收起均已通过，详见下方记录 | 三处发布完成：本地 main、GitHub/main、服务器源码及下载文件对应 `d478c494d7183ae5f803c3183501138342714643`，服务器 marker 已写入并回读；正式签名 session 92648 返回 0/`ANDROID_VALIDATION_COMPLETE`，CI `34231766546` success，独立审查本地门槛通过；公网 APK 与校验文件验证通过，API status=ok、Haruki=true |
| Android P2 | 最终代码与本地验收冻结；全部最后定向 QA 及最终独立审查通过；提交 978265f0b4820a43d13303b420dd4d81378309f0 已同步根 main/origin，CI 34249431273 success | 最终 host session 8080 于 6m17s 返回 BUILD SUCCESSFUL，compileDebugKotlin/testDebugUnitTest/assembleDebug/lintDebug 均通过；最终 TEST-*.xml 合计 32 tests、0 failures、0 errors、0 skipped。先前 4 项 connected、0 失败，不记为最后修正后重跑。最终 Debug APK SHA-256 `47E488F0766C8F9974947BC0E77DA7B04A9775D81B61EAB069ABC3A02F723FAD`；设置、技术展开状态、关联返回、服装 950、歌曲 803 最终定向 QA 均通过 | 已按用户要求与 P3 合并正式交付；APK 构建源为 `91eddb1a9c7476cf0a66337533d9084fdf75c104`，本地/GitHub/服务器产品源码及公网下载已同步 |
| Android P3 | 最终 QA 与独立审查完成；源码提交 `91eddb1a9c7476cf0a66337533d9084fdf75c104` 已同步根 main/GitHub main，CI `34266852346` success | 最终 host session 97727 于 5m40s 通过，44 项单测、0 失败，lint 0 Error；先前 connected session 48403 的 4 项测试已通过。最终产物及分版本设备证据见下方记录 | 与 P2 合并交付完成：正式 session 26832 返回 0 / ANDROID_VALIDATION_COMPLETE；Unit 7m33s、Debug 1m33s、Release 9m59s 全部通过，公网 APK/校验文件及服务器 marker 验证通过 |

Android P2/P3 合并交付历史：用户明确要求“两批改动完成后一起打包”。P2 独立正式签名 session 84752 因该变更以 Ctrl+C 取消：Unit 10m5s、Debug 2m9s 已通过，Release 刚进入、未完成；不记录为正式签名成功。取消时主代理确认该流程已无 Java 进程，当时正式 APK 为 2,699,629 bytes、SHA-256 `e6b96623e3e6363def37e0a9a0ded428db360fc4bed13a261fe7a91d4a446b15`，当时服务器 marker 为 P1 的 `d478c494d7183ae5f803c3183501138342714643`。P2 当时仅提交源码，后续已随 P3 合并发布，当前正式产物见下方记录。

Android P3 返回修复前的 host 与 Debug 产物：日志为主工作区 `.runtime/ux-p3-host-20260909-012234.log`，session 56815 为第三轮完整通过的结果。首轮两处 lambda label 错误已修；第二轮为 43 项单元测试中 1 项因 `org.json` 本地 stub 失败，改用项目已有 serialization 并保留 null 兼容后通过独立审查，该轮最终 44 项全绿。Debug APK 为 22,657,510 bytes，文件时间 01:25:59，SHA-256 为 `ACB9602EF851EFF1F86B826EB405003A879DB0F64CF1273C02DE2CEFA3E7A6E6`。该包及上述 host/lint 结果均早于后续 MySekai 返回修复，已由下方最终 41B6 包验证替代。主代理已用前后 XML 对比确认：普通列表滚动后切换系统 night，仍为同一卡片，图片 bounds `[64,531][881,1348]`、标题 `[64,1359][405,1422]` 精确保留，第 1/61 页不变。

Android P3 connected 与阶段性设备 QA：主代理 session 48403 的日志为主工作区 `.runtime/ux-p3-connected-20260909-014939.log`，横屏 night 下 4 项测试于 2m12s 通过，0 failures、0 errors、0 skipped。首次实际 2 项失败定位为大 Lazy item 内部目标未精确滚入视口；测试 helper 增加 performScrollTo，并确认保存控件 Displayed/Enabled 与 POST 到达计数，原有状态/记录断言及超时保持不变，独立审查已关闭该问题。普通列表滚动，以及查询卡牌 1445→卡池 990 后 night/横屏重建、Back 逐层返回均通过；本次关联链为查询结果第 1/1 页，不是原计划第 2/61 页链路。MySekai 直接家具加载与 gate 详情 night 重建已通过。系统 Back 曾因缺少 BackHandler 退出 Debug、露出 API 为空的旧 Release；Content.closeDetail + BackHandler 修复已通过审查及下述最终包复验。

Android P3 最终发布前验证：host session 97727（主工作区 `.runtime` 中 024639 host 日志）于 5m40s 通过，44 项单元测试、0 失败，lint 0 Error；最终 Debug APK SHA-256 为 `41B6D54439A3BEF7D19B9083D80BCE5BEDF0FBC463E75F2E2F092B4428F000A6`。沿用先前已通过的 4 项 connected，不记为最终包重跑。主代理在该最终包实测主页抽屉打开后系统 Back 仅关闭抽屉且留在 Debug；MySekai ゲート详情中打开抽屉，首次 Back 保持详情不变，再次 Back 返回同一目录滚动位置，证据为主工作区 `.runtime/ux-p3-final-evidence/content-{detail,drawer-back,system-back}.xml`。临时 GET 夹具 4001 图片返回 503 后，切换 ready 并配置 5 秒响应延迟后点击重试，加载期间占位、随后图片成功显示，标题和翻页位置不动；证据为同目录 `image-failed.xml`、`image-loading.xml`、`image-ready.xml` 与 `image-ready.png`。上一 E5FA 包已实测字体 2.0 + 横屏 + IME 输入可见，Save 可滚动到并点击成功；实际图鉴显示夹具 1 项，确认地址 4001 已保存。主代理已通过 UI 保存恢复 4000/JP，连接状态明确显示已保存地址 4000；设备尺寸、字体、输入法和旋转设置已恢复基线。其他既定场景按已有分版本证据汇总，不将本次定向验证扩写为全部矩阵通过。

Android P2/P3 合并交付状态：实现、自动检查、设备 QA 与独立最终审查已完成，按上述实际分版本证据验收，不再重复已完成矩阵。源码提交 `91eddb1a9c7476cf0a66337533d9084fdf75c104` 已推送 GitHub，根 main 已快进，CI `34266852346` success。根工作区 29 个既有 generated 文件字节完全保留，用户后续 2 个 Web 修改未触碰。

设备与测试进程已收尾：通过 UI 保存恢复 4000/JP；恢复 1080×2400、字体 1.0、旋转 1/user 0、硬件 IME 0、night=no。本次 emulator、API、fixture 已停止并确认 PID 消失。

正式签名与服务器合并发布已完成：

1. 正式 session 26832 返回 0 / `ANDROID_VALIDATION_COMPLETE`，日志目录为主工作区 `.runtime/android-validation-logs/20260909-030541-33396`。Unit 7m33s、Debug 1m33s、Release 9m59s 全部通过；干净 origin/main 的构建源为 `91eddb1a9c7476cf0a66337533d9084fdf75c104`。正式 APK 为 2,748,781 bytes，SHA-256 为 `19829a68070089970ea31008a037bc7cc46016fe3f321887d2fe8d63882e1e1f`；证书 SHA-256 为 `0e02a9f1468ec3d378bbbd0eb3d7c807bbe5e31c135ba6838d64dc230d05e0e9`，与原正式包匹配。
2. 已核验 P1 marker、回退备份及源码 hash，按显式清单同步 26 个文件和 APK/SHA。公网 GET 200，APK 原始字节 hash 与 `.sha256` 文本匹配，API `status=ok`、`harukiFeatureEnabled=true`；服务器 marker `91eddb1a9c7476cf0a66337533d9084fdf75c104` 已写入并回读。回退备份为 `/opt/pjsktools/release-snapshots/ux-android-p2-p3-from-d478c49/android-before.tar.gz`。正式下载：[Android APK](https://sekai-tools.cn/download/pjsktools-android-0.1.0.apk)。

本地/GitHub/服务器产品源码与正式 APK 对应上述构建源；本记录后续单独提交同步仅更新文档，不改变 Android 产品树，也不将文档提交号作为 APK 构建源。

P2/P3 截图日志、UX 缓存及旧 P1/P2 源码包清理所在整条命令被自动审核以 `blocked by policy` 拒绝，未执行删除，文件暂留。交付完成后仍保留此清理限制记录，不重试或绕过拒绝路径。

取消流程的临时目录 `.runtime/av-26608-1-001108` 清理被自动审批审查以 `blocked by policy` 拒绝；其中含受限临时 signing properties，目录暂留，用户已获告知，不绕过拒绝执行删除。此记录不包含任何签名秘密值。

Android P2 首轮 APK 手验：360dp 首页重复区服已去除、白色卡片与入口→当前分数线跳转正常，JP 显示 714 首歌曲/1447 张卡牌；深色首页 CN 显示 624/1249，区服数据对应且文字可读（`.runtime/ux-p2-dark.png`）。抽屉粉色选中条居中已截图确认。设置五区服按钮完整，CN 换行后可点击、保存生效，地址含错误 path 时可修正并保存。已在 Settings 真正保存 JP（仅顶栏切换不会改变默认区服）；该轮尺寸 360dp、硬件 IME=1 供后续验证使用，现已按上方 P3 收尾记录恢复基线。

Android P2 首轮详情与账户手验：卡牌 1445→卡池 990→Android Back→关闭详情，页码 2/61 不变，图片 bounds `[64,431][881,1053]`、标题 `[64,1064][320,1127]` 精确恢复；服装每页 96/第 2/11 页/ID 950 详情→Back 后，图片 `[64,431][881,1248]`、标题 `[64,1259][405,1322]` 精确恢复。歌曲 803 搜索为唯一结果，EXPERT 谱面展开/收起后演唱信息保留。未登录账户入口已实测显示，已有资料/默认 UID 由 fixture 交互覆盖。

Android P2 首轮发现并已完成最终修正/复验的 A9 项：设置错误容器的连接标题；Catalog 的 fresh/版本等原始状态改为技术信息折叠；`ceil`、服装 part/source/rarity/gender 已知枚举与无名 musicVocals 使用明确中文 fallback。独立审查另要求将技术展开状态提升到不随 Lazy item 回收丢失的位置，实现代理已修；最终冻结 host 验证、全部最后定向设备 QA 与最终独立审查均已通过；源码已提交；正式签名及服务器交付已随 P2/P3 合并发布完成。

Android P2 发布前定向复验历史记录（已通过，后续已随 P3 合并发布）：主代理已亲自检查设置错误截图，说明完整可见，不再出现旧“连接失败”标题及无效“重试”；实现代理已通过 Save 真正恢复服务器地址 `http://10.0.2.2:4000` 与默认 JP。最终 APK 卡牌 1445→卡池 990→关闭返回后，主代理重新拉取 XML 确认 1445 图片 bounds `[64,431][881,1041]`、标题 `[64,1052][320,1115]` 与打开前精确一致，仍为第 2/61 页；滚回顶部后技术信息仍保持展开，fresh、同步与版本行存在，技术资料未丢失。相关卡池显示“卡池资料 · ID 990”。服装 950 中文字段最终复验通过。歌曲 803 的真实上游条目 title 为空、name 为 `musicVocals 1847`；最终仅对明确 musicVocals 集合内的严格机器标题映射，真实名称保持原样。最终包实测显示“演唱版本 · ID 1847”，实现代理、主代理与独立审查均已核实截图，最后定向 QA 全部通过。

Android P2 最终包对应关系：最终文件为 `C:/Users/83899/Desktop/pjsktools/.runtime/ux-polish-worktree/android/app/build/outputs/apk/debug/app-debug.apk`，SHA-256 为 `47E488F0766C8F9974947BC0E77DA7B04A9775D81B61EAB069ABC3A02F723FAD`。旧 `BFB71A5F78C9F72FD08CE6908AF855D958B5613683A8E45811AC7723A7E59584` 包未覆盖歌曲 803 的真实上游 musicVocals 机器标题修正，不能用作该项最终证据。最后截图为主工作区 `.runtime/ux-p2-song803-vocals-final.png`，设备 XML 为 `/sdcard/ux-p2-songfix-vocals-final.xml`。最终设置错误提示为“请检查服务器地址/地址格式有误”，IME 下可达；已实际保存恢复本地测试地址与 JP。独立审查确认最终 lintAnalyzeDebug/AndroidTest/UnitTest 实际执行，lintReportDebug 因内容未变为 UP-TO-DATE，构建门槛通过。

Android P1 历史正式产物（现已由 P2/P3 合并包替代）：APK 为 2,699,629 bytes，SHA-256 为 `e6b96623e3e6363def37e0a9a0ded428db360fc4bed13a261fe7a91d4a446b15`；签名证书 SHA-256 为 `0e02a9f1468ec3d378bbbd0eb3d7c807bbe5e31c135ba6838d64dc230d05e0e9`，与旧版及 assetlinks 一致。正式流程首次 Release 遇到 Windows transform rename 失败，内置第二次尝试成功：Unit 10m52s、Debug 2m31s、Release 13m50s，未修改构建脚本、缓存选择或 JDK。公网 APK 原始字节 SHA-256 校验通过；公网 `.sha256` 初次因 PowerShell 返回 byte[] 而文本比较误判，按 UTF-8 解码后匹配。服务器归档使用 `/tmp/ux-android-p1-d478c49.tar`，回退文件保留在 `/opt/pjsktools/release-snapshots/ux-android-p1-d478c49/android-before.tar.gz`。P1 发布门槛已满足，P2 开始实施。

Android P1 长标题与关联返回补验：360×640 下，卡牌第 2/61 页打开 ID 1445《潮騒の狭間に》，进入相关卡池 990《Crawl out of Vibrant hellガチャ》；长标题分两行显示，bounds 为 `[69,468][724,594]`，关闭按钮完整位于 `[763,505][837,558]`。卡池加载完成后按 Android Back 返回同一卡牌，再点关闭，精确恢复原图片 bounds `[64,431][881,1168]` 与标题 bounds `[64,1179][324,1242]`，页码仍为 2/61。

Android P1 最终 IME 与谱面验收：安装 21:10:08 的最新 Debug APK 后，dumpsys 确认主窗为 `adjust=resize`。账户页以空邮箱和短密码触发纯客户端校验、不发网络请求；保持键盘打开时可滚到并点击登录按钮，再滚到完整红色错误提示“请输入有效邮箱和至少8位密码”（y=793–839），header bounds 不变、状态栏干净。无效 API fixture 的 fallback 设置页在 IME 打开后可将地址编辑为 `http://10.0.2.2:4000`，滚到底部时顶部裁剪边界固定 y=63，保存按钮 y=760–813 完整可点击，保存后成功恢复主页；测试配置已通过 UI 恢复。歌曲 803《空に免じて》的 EXPERT 谱面展开后，标题与“收起”按钮均可见；收起后预览消失、其他内容保留。

Web P1 发布产物：Caddy 镜像 `sha256:b279dfa73d2ca93c7fd487dbe7196897dacae7550afe341801786bee0cef9bb6`；线上资源 `index-BPoIo02H.js`、`index-C68aGyXN.css`。服务器回退文件为 `release-snapshots/ux-web-p1-8b7caae/web-before.tar.gz`，旧镜像标签为 `before-ux-web-p1-8b7caae`。本记录随 Web P2 提交，不单独发布。

Web P2 发布产物：Caddy 镜像 `sha256:917b10019827674298363455c1a2060025cf6cf331f0e0c0d3101c704ebadb13`；线上资源 `index-rVdi6hWo.js`、`index-DeyNQ__l.css`。服务器回退文件为 `release-snapshots/ux-web-p2-852e848/web-before.tar.gz`，旧镜像标签为 `before-ux-web-p2-852e848`。CI `34214638465` 已全部通过。

Web P3 发布产物：Caddy 镜像 `sha256:1f67d42666fe06f928f8fd71cbc5089dac3b6702eaa0684c162fbc1201851f2d`；线上资源 `index-DPrz_iG2.js`、`index-Ccxfk65V.css`。服务器回退文件为 `release-snapshots/ux-web-p3-889af1c/web-before.tar.gz`，旧镜像标签为 `before-ux-web-p3-889af1c`。CI `34217838351` 已全部通过，gh run watch --exit-status 返回 0；本记录随 Android P1 提交。

## 插入任务：Haruki 服务器配置

用户取得 Confidential Client 后追加授权服务器配置；此项独立于原 UX 范围，配置上线后继续 Android UX 批次。Compose 默认关闭的变量透传提交为 `9bd8f9b`，启用文案提交为 `86a3df3`；主工作区 main、GitHub/main 与服务器源码已同步，该次发布时服务器 `.deployed-revision` 为 `86a3df3b054ced85b71605825365562258866da6`。真实凭据仅保存于服务器权限 `600` 的私有配置，未进入 Git 或本地；私有生产配置明确启用 Haruki，Webhook 保持关闭。

已验证：生产健康状态 `status=ok`、`harukiFeatureEnabled=true`；运行时 `oauthConfigured=true`，回调为 `https://api.sekai-tools.cn/api/auth/haruki/callback`，Webhook 为 false。独立数据库角色安全检查、端点校验和令牌加密往返检查通过。以 `client_secret_basic` 携带非真实授权码请求上游 token 端点，返回 `invalid_grant`；授权入口携带上述 API 回调、`offline_access user:read bindings:read game-data:read` 四项 scope 与 PKCE，被上游接受并跳转至 Haruki 登录页。无效 state 回调返回 302 至 `/me/assets?haruki=error&code=invalid_state`，未登录访问 connection 返回 401。

网页 22 项测试与 build 通过；发布资源为 `index-B8QE20ye.js`、`index-Ccxfk65V.css`，网页镜像为 `sha256:b192db578d4d3116ca146ec73fd5deb30a49f98951c9df9bad765fd8b6b227e7`。产物和 HTTPS 验证通过；已向用户重新确认公网资源与服务器 marker `86a3df3` 对应。55 个网页源码文件核对中，37 个精确一致、18 个仅 CRLF 换行差异，0 个内容差异。该次 Haruki 发布的 CUA 工具曾两次超时；此为历史工具验收限制。2026-09-09 用户已手动验收正式站首页 200% 缩放，反馈显示和操作正常；不代表代理完成浏览器测量或其他路由全矩阵，未因这些未运行场景扩大本次任务。真实用户 OAuth 同意、回调换取令牌、绑定读取与同步仍待完成，不记为完整 OAuth 通过。

Android P1 及 P2/P3 合并交付均已完成；QA、审查、源码同步、CI、正式签名与服务器/公网产物验证通过，设备配置和测试进程已恢复收尾。当前正式 APK 构建源为 `91eddb1a9c7476cf0a66337533d9084fdf75c104`，详见完成记录。Haruki 临时 tar 清理所在整段命令被自动审批审查拒绝，文件未删除、暂留；随后以独立安全操作写入服务器部署 marker 已成功。

收尾限制：已停止本次设备/API/fixture 测试进程并恢复设备设置，正式签名流程已成功退出。保留最终交付、必要验收记录、现有用户文件与秘密材料。上述清理拒绝涉及的截图、日志、缓存及临时产物暂留，不绕过审核删除。
