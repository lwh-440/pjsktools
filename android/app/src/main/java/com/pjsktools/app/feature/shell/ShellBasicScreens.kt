package com.pjsktools.app.feature.shell

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pjsktools.core.designsystem.SekaiPink
import com.pjsktools.core.designsystem.SekaiTeal
import com.pjsktools.core.designsystem.SekaiYellow
import com.pjsktools.app.feature.catalog.RemoteCatalogImage
import com.pjsktools.app.feature.compliance.ComplianceLinks
import kotlinx.coroutines.CancellationException
import com.pjsktools.app.BuildConfig
import com.pjsktools.app.core.ApiOrigin

@Composable
fun HomeFeatureScreen(
    baseUrl: String,
    region: String,
    cachePolicy: ShellCachePolicy,
    isAuthenticated: Boolean,
    accountLabel: String? = null,
    onRegionChange: (String) -> Unit,
    onOpenAccount: () -> Unit,
    onOpenCurrentEvent: () -> Unit,
    onShortcut: (ShellShortcut) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val repository = remember(baseUrl, region, cachePolicy) {
        ShellRepository(baseUrl, cachePolicy, context.cacheDir.resolve("shell/$region"))
    }
    var dashboard by remember { mutableStateOf<HomeDashboard?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshKey by remember { mutableStateOf(0) }
    LaunchedEffect(repository, region, refreshKey) {
        loading = true
        error = null
        try {
            dashboard = repository.loadHome(region)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            error = e.message ?: "首页数据加载失败"
        } finally {
            loading = false
        }
    }

    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Surface(
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp).fillMaxWidth(),
                shape = MaterialTheme.shapes.large,
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                shadowElevation = 4.dp
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(Modifier.fillMaxWidth().height(5.dp)) {
                        Box(Modifier.weight(5f).fillMaxSize().background(SekaiTeal))
                        Box(Modifier.weight(2f).fillMaxSize().background(SekaiPink))
                        Box(Modifier.weight(1f).fillMaxSize().background(SekaiYellow))
                    }
                    Column(
                        Modifier.padding(start = 18.dp, end = 18.dp, bottom = 18.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text("CONNECT EVERY LIVE", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                        Text("Project Sekai\n游戏工具台", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        Text(
                            "活动、图鉴、玩家资料与计算工具，和网页版共用同一套实时数据。",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.76f)
                        )
                        Row(
                            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            dashboard?.regions?.ifEmpty { null }?.forEach { item ->
                                if (item.id == region) Button(onClick = {}) { Text(item.id.uppercase()) }
                                else OutlinedButton(onClick = { onRegionChange(item.id) }) { Text(item.id.uppercase()) }
                            } ?: listOf("jp", "en", "tw", "kr", "cn").forEach { id ->
                                if (id == region) Button(onClick = {}) { Text(id.uppercase()) }
                                else OutlinedButton(onClick = { onRegionChange(id) }) { Text(id.uppercase()) }
                            }
                        }
                    }
                }
            }
        }
        item {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                MetricCard("区服", region.uppercase(), SekaiTeal, Modifier.weight(1f))
                MetricCard("歌曲", dashboard?.songCount?.toString() ?: "-", SekaiPink, Modifier.weight(1f))
                MetricCard("卡牌", dashboard?.cardCount?.toString() ?: "-", SekaiYellow, Modifier.weight(1f))
            }
        }
        if (loading && dashboard == null) item { LoadingCard("正在加载真实仪表盘数据") }
        error?.let { message -> item { ErrorCard(message) { refreshKey += 1 } } }
        dashboard?.let { data ->
            item {
                ShellCard("当前活动", data.currentEvent?.let { "${it.name}\n${it.startAt ?: "-"} - ${it.endAt ?: "-"}" } ?: "当前活动不可用") {
                    TextButton(onClick = onOpenCurrentEvent) { Text("查看分数线") }
                    TextButton(onClick = { refreshKey += 1 }, enabled = !loading) { Text("刷新") }
                }
            }
            item {
                ShellCard("Top 3", data.updatedAt?.let { "更新 $it" }) {
                    if (data.topRanks.isEmpty()) Text("等待实时榜单数据。")
                    data.topRanks.forEach { rank ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("#${rank.rank}  ${rank.name}", fontWeight = FontWeight.SemiBold)
                            Text("${rank.score} pt")
                        }
                        HorizontalDivider()
                    }
                }
            }
            if (data.warnings.isNotEmpty()) item {
                ShellCard("数据状态", "部分上游数据未就绪；页面没有使用示例数据。") {
                    data.warnings.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
        item {
            ShellCard("账号状态", if (isAuthenticated) "已登录，可使用绑定 UID 与上传资产。" else "登录后启用资产联动。") {
                accountLabel?.takeIf(String::isNotBlank)?.let { Text(it, fontWeight = FontWeight.SemiBold) }
                Button(onClick = onOpenAccount) { Text(if (isAuthenticated) "进入个人信息管理" else "登录 / 注册") }
            }
        }
        item {
            ShellCard("常用入口", "按网页端工作流分组，点击后由主壳导航。") {
                ShellShortcut.entries.chunked(2).forEach { row ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { item ->
                            OutlinedButton(onClick = { onShortcut(item) }, modifier = Modifier.weight(1f)) { Text(item.label) }
                        }
                        if (row.size == 1) Text("", Modifier.weight(1f))
                    }
                }
            }
        }
        item { Text("", Modifier.padding(8.dp)) }
    }
}

@Composable
fun PublicProfileFeatureScreen(
    baseUrl: String,
    region: String,
    cachePolicy: ShellCachePolicy,
    isAuthenticated: Boolean,
    initialUid: String = "",
    onFavorite: (PublicProfile) -> Unit,
    onOpenFullAnalysis: (PublicProfile) -> Unit,
    onOpenLogin: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val repository = remember(baseUrl, region, cachePolicy) {
        ShellRepository(baseUrl, cachePolicy, context.cacheDir.resolve("shell/$region"))
    }
    var uid by remember(initialUid) { mutableStateOf(initialUid) }
    var request by remember { mutableStateOf<Pair<String, Boolean>?>(null) }
    var profile by remember { mutableStateOf<PublicProfile?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(repository, region, request) {
        val target = request ?: return@LaunchedEffect
        loading = true
        error = null
        try {
            profile = repository.publicProfile(region, target.first, target.second)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            error = e.message ?: "玩家资料加载失败"
        } finally {
            loading = false
        }
    }
    LazyColumn(modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("公开玩家查询", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("查询 ${region.uppercase()} 公开 UID。完整资产分析需要登录并绑定 UID。")
                OutlinedTextField(value = uid, onValueChange = { uid = it.filterNot(Char::isWhitespace) }, label = { Text("玩家 UID") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { request = uid.trim() to false }, enabled = uid.isNotBlank() && !loading) { Text("查询") }
                    OutlinedButton(onClick = { request = uid.trim() to true }, enabled = uid.isNotBlank() && !loading) { Text("强制刷新") }
                }
            }
        }
        if (loading) item { LoadingCard("正在读取公开玩家数据") }
        error?.let { item { ErrorCard(it) { request = uid.trim() to false } } }
        profile?.let { player ->
            item {
                ShellCard(player.nickname, "${player.region.uppercase()} · UID ${player.userId}") {
                    Text("Rank ${player.rank ?: "-"}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    player.comment?.let { Text(it) }
                    player.source?.let { Text("数据源：$it", style = MaterialTheme.typography.bodySmall) }
                    if (player.titles.isNotEmpty()) Text("称号：${player.titles.joinToString(" / ")}")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { onFavorite(player) }, enabled = isAuthenticated) { Text("收藏") }
                        Button(onClick = { if (isAuthenticated) onOpenFullAnalysis(player) else onOpenLogin() }) {
                            Text(if (isAuthenticated) "进入完整分析" else "登录后完整分析")
                        }
                    }
                }
            }
        }
        item { Text("公开查询只展示服务端真实返回字段；角色 Rank、Challenge Live、Bonds、区域道具等完整分析由登录态个人模块承接。", Modifier.padding(16.dp), style = MaterialTheme.typography.bodySmall) }
    }
}

@Composable
fun SettingsFeatureScreen(
    settings: ShellSettings,
    onSave: (ShellSettings) -> Unit,
    onClearCache: (region: String?) -> CacheClearResult,
    sessionLabel: String,
    cacheSizeLabel: String,
    configurationError: String? = null,
    modifier: Modifier = Modifier
) {
    val uriHandler = LocalUriHandler.current
    var baseUrl by remember(settings.apiBaseUrl) { mutableStateOf(settings.apiBaseUrl) }
    var region by remember(settings.defaultRegion) { mutableStateOf(settings.defaultRegion) }
    var cachePolicy by remember(settings.cachePolicy) { mutableStateOf(settings.cachePolicy) }
    var error by remember { mutableStateOf<String?>(null) }
    var cacheNotice by remember { mutableStateOf<String?>(null) }
    var visibleCacheSize by remember(cacheSizeLabel) { mutableStateOf(cacheSizeLabel) }
    LazyColumn(modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        configurationError?.let { message -> item { ErrorCard(message) {} } }
        item {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("设置", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("设置会持久化并直接驱动所有 Android API 请求与默认区服。每个 API 来源使用独立登录会话，切换服务器后需要在该服务器单独登录。")
                OutlinedTextField(value = baseUrl, onValueChange = { baseUrl = it }, label = { Text("API Base URL") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Text("默认区服", fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("jp", "en", "tw", "kr", "cn").forEach { id ->
                        if (id == region) Button(onClick = {}) { Text(id.uppercase()) }
                        else OutlinedButton(onClick = { region = id }) { Text(id.uppercase()) }
                    }
                }
            }
        }
        item { ShellCard("运行诊断", "用于确认账号状态与本地缓存，不展示令牌内容。") {
            Text("会话：$sessionLabel")
            Text("Shell 缓存：$visibleCacheSize")
            Text("当前 API：${settings.apiBaseUrl}")
        } }
        item {
            ShellCard("缓存原则", "缓存必须按区服、接口路径和参数隔离，禁止跨区借用。") {
                ShellCachePolicy.entries.forEach { policy ->
                    if (policy == cachePolicy) Button(onClick = {}) { Text(policy.label) }
                    else OutlinedButton(onClick = { cachePolicy = policy }) { Text(policy.label) }
                    Text(policy.description, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        error?.let { item { ErrorCard(it) { error = null } } }
        cacheNotice?.let { item { ShellCard("缓存清理结果", it) {} } }
        item {
            Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { uriHandler.openUri(BuildConfig.WEB_RUNTIME_BASE_URL) },
                    enabled = BuildConfig.WEB_RUNTIME_BASE_URL.isNotBlank()
                ) { Text("打开网页版工具台") }
                Button(onClick = {
                    runCatching { ApiOrigin.normalize(baseUrl, BuildConfig.DEBUG, BuildConfig.TEMPORARY_HTTP_HOST) }
                        .onSuccess { normalized -> error = null; onSave(ShellSettings(normalized, region, cachePolicy)) }
                        .onFailure { error = it.message ?: "API Base URL 不安全" }
                }) { Text("保存设置") }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = {
                        val result = onClearCache(region)
                        cacheNotice = result.message
                        visibleCacheSize = result.remainingSizeLabel
                    }) { Text("清除此区服缓存") }
                    OutlinedButton(onClick = {
                        val result = onClearCache(null)
                        cacheNotice = result.message
                        visibleCacheSize = result.remainingSizeLabel
                    }) { Text("清除全部缓存") }
                }
            }
        }
    }
}

@Composable
fun AboutFeatureScreen(modifier: Modifier = Modifier) {
    val sources = listOf(
        "Sekai.best" to "游戏资产、公开资料和部分基础数据。",
        "Moesekai Metadata" to "公式计算参考数据、歌曲 Meta 与聚合目录。",
        "Haruki" to "公开玩家数据、排名详情和数据补充。",
        "Uni / Haruki" to "同区游戏资产镜像与备用加载。",
        "rks-n" to "实时排名、档线、时序和周回统计。"
    ).filterNot { !BuildConfig.HARUKI_FEATURE_ENABLED && it.first.contains("Haruki") }
    LazyColumn(modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("关于 Project Sekai 工具台", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("为 JP、EN、TW、KR、CN 提供图鉴、活动数据、玩家资产分析和计算工具。Android 与网页共用同一套后端数据。")
            }
        }
        items(sources) { (name, description) -> ShellCard(name, description) {} }
        item { ShellCard("区服与缓存原则", "五个区服的数据与资产独立加载，不跨区借用；可用缓存可先展示，再在后台刷新。") {} }
        item {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("合规与联系", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text("查看隐私政策、用户协议、安全与举报渠道及网站备案信息。")
                ComplianceLinks(Modifier.fillMaxWidth())
            }
        }
    }
}

@Composable
fun ShareFeatureScreen(
    baseUrl: String,
    region: String,
    cachePolicy: ShellCachePolicy,
    initialType: String = "profile",
    initialId: String = "",
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val repository = remember(baseUrl, region, cachePolicy) {
        ShellRepository(baseUrl, cachePolicy, context.cacheDir.resolve("shell/shared"))
    }
    var type by remember(initialType) { mutableStateOf(initialType) }
    var id by remember(initialId) { mutableStateOf(initialId) }
    var request by remember(region) { mutableStateOf<Pair<String, String>?>(null) }
    var card by remember(region) { mutableStateOf<ShareCard?>(null) }
    var loading by remember(region) { mutableStateOf(false) }
    var error by remember(region) { mutableStateOf<String?>(null) }
    LaunchedEffect(repository, request) {
        val target = request ?: return@LaunchedEffect
        loading = true
        error = null
        card = null
        try { card = repository.shareCard(region, target.first, target.second) }
        catch (e: CancellationException) { throw e }
        catch (e: Throwable) { error = e.message ?: "分享卡加载失败" }
        finally { loading = false }
    }
    LazyColumn(modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("分享卡", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("当前区服：${region.uppercase()}。玩家、成绩和活动分享均按此区服解析。")
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("profile" to "玩家档案", "score" to "成绩", "event" to "活动").forEach { item ->
                        if (type == item.first) Button(onClick = {}) { Text(item.second) }
                        else OutlinedButton(onClick = { type = item.first }) { Text(item.second) }
                    }
                }
                OutlinedTextField(value = id, onValueChange = { id = it }, label = { Text("分享对象 ID") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Button(onClick = { request = type to id.trim() }, enabled = id.isNotBlank() && !loading) { Text("生成并加载") }
            }
        }
        if (loading) item { LoadingCard("正在请求服务端分享卡") }
        error?.let { item { ErrorCard(it) { request = type to id.trim() } } }
        card?.let { share ->
            item {
                ShellCard(share.title, share.summary) {
                    RemoteCatalogImage(baseUrl, listOf(share.imageUrl), share.title, heightDp = 360)
                    Text(resolveImageUrl(baseUrl, share.imageUrl), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
internal fun ShellCard(title: String, subtitle: String? = null, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column {
            Box(Modifier.padding(start = 16.dp).width(48.dp).height(3.dp).background(MaterialTheme.colorScheme.primary))
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                subtitle?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                content()
            }
        }
    }
}

@Composable
private fun MetricCard(label: String, value: String, accent: androidx.compose.ui.graphics.Color, modifier: Modifier) {
    Card(
        modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column {
            Box(Modifier.fillMaxWidth().height(4.dp).background(accent))
            Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
internal fun LoadingCard(label: String) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            CircularProgressIndicator()
            Text(label)
        }
    }
}

@Composable
internal fun ErrorCard(message: String, retry: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.35f))
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("连接暂时不可用", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onErrorContainer)
            Text(message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
            TextButton(onClick = retry) { Text("重新加载") }
        }
    }
}

private fun resolveImageUrl(baseUrl: String, imageUrl: String) = if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) imageUrl else "${baseUrl.trimEnd('/')}/${imageUrl.trimStart('/')}"
