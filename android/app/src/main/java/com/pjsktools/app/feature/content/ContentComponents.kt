package com.pjsktools.app.feature.content

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
internal fun StatusPanel(
    capabilityStatus: String?,
    warnings: List<String>,
    unavailableReason: String?,
    error: String?,
    sourceHealth: Map<String, String> = emptyMap(),
    syncedAt: String? = null,
    unavailableCollections: List<String> = emptyList(),
    lookupDiagnostics: Map<String, String> = emptyMap(),
    onRetry: () -> Unit
) {
    if (capabilityStatus == null && warnings.isEmpty() && unavailableReason == null && error == null &&
        sourceHealth.isEmpty() && syncedAt == null && unavailableCollections.isEmpty() && lookupDiagnostics.isEmpty()) return
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            capabilityStatus?.let { Text("数据能力：${statusLabel(it)}", fontWeight = FontWeight.SemiBold) }
            unavailableReason?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            warnings.distinct().take(8).forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
            syncedAt?.let { Text("同步时间：$it", style = MaterialTheme.typography.bodySmall) }
            if (sourceHealth.isNotEmpty()) Text("数据源：${sourceHealth.entries.joinToString { "${it.key}=${it.value}" }}", style = MaterialTheme.typography.bodySmall)
            if (unavailableCollections.isNotEmpty()) Text("不可用集合：${unavailableCollections.joinToString()}", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            if (lookupDiagnostics.isNotEmpty()) Text("解析诊断：${lookupDiagnostics.entries.joinToString { "${it.key}=${it.value}" }}", style = MaterialTheme.typography.bodySmall)
            error?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
                OutlinedButton(onClick = onRetry) { Text("重试") }
            }
        }
    }
}

@Composable
internal fun ContentListCard(baseUrl: String, item: Any, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            val images = itemImages(item)
            if (images.isNotEmpty()) RemoteContentImage(baseUrl, images, itemTitle(item), height = 148)
            Text(itemTitle(item), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(itemSubtitle(item), style = MaterialTheme.typography.bodySmall)
            Text(itemMeta(item), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun ContentDetailView(
    baseUrl: String,
    webRuntimeBaseUrl: String,
    target: Any,
    detail: Any?,
    detailLoading: Boolean,
    detailError: String?,
    playback: PlaybackState?,
    playbackLoading: Boolean,
    playbackError: String?,
    region: String,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onNavigate: (ContentNavigationTarget) -> Unit,
    onPlayStory: (StoryDetail, StoryChapter) -> Unit,
    onLoadVirtualPlayback: (String) -> Unit,
    stepDetails: Map<VirtualStepKey, VirtualLiveStepDetail>,
    stepLoading: Set<VirtualStepKey>,
    stepErrors: Map<VirtualStepKey, String>,
    onLoadVirtualStep: (String, Int) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = onBack) { Text("返回目录") }
                Text(itemTitle(target), style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).padding(start = 12.dp),
                    maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (detailLoading) item { CenteredProgress() }
        detailError?.let { message -> item { StatusPanel(null, emptyList(), null, message, onRetry = onRetry) } }
        when (detail) {
            is InformationDetail -> informationDetail(baseUrl, detail, onNavigate)
            is ExchangeDetail -> exchangeDetail(baseUrl, detail)
            is MissionItem -> missionDetail(baseUrl, detail)
            is VirtualLiveDetail -> virtualLiveDetail(baseUrl, region, detail, playback, playbackLoading, playbackError,
                onLoadVirtualPlayback, stepDetails, stepLoading, stepErrors, onLoadVirtualStep)
            is Live2dDetail -> live2dDetail(baseUrl, webRuntimeBaseUrl, region, detail)
            is MysekaiDetail -> mysekaiDetail(baseUrl, detail)
            is StoryDetail -> storyDetail(baseUrl, webRuntimeBaseUrl, region, detail, playback, playbackLoading, playbackError, onPlayStory)
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.informationDetail(
    baseUrl: String,
    detail: InformationDetail,
    onNavigate: (ContentNavigationTarget) -> Unit
) {
    item {
        DetailCard(detail.item.title) {
            Text("${detail.item.type.orEmpty()} ${detail.item.tag.orEmpty()} · ${dateRange(detail.item.startAt, detail.item.endAt)}")
            if (detail.item.imageCandidates.isNotEmpty()) RemoteContentImage(baseUrl, detail.item.imageCandidates, detail.item.title)
            StatusPanel(detail.embedStatus, detail.warnings, null, null, onRetry = {})
            detail.embeddedDetailUrl?.let { InformationWebContent(baseUrl, it) }
            detail.detailUrl?.let { url -> OutlinedButton(onClick = { onNavigate(ContentNavigationTarget.ExternalUrl(url)) }) { Text("使用外部应用打开") } }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.exchangeDetail(baseUrl: String, detail: ExchangeDetail) {
    item {
        DetailCard(detail.item.name) {
            Text("${detail.summaryName ?: detail.item.summaryName ?: "兑换所"} · ${statusLabel(detail.item.status)}")
            detail.item.exchangeLimit?.let { Text("限购 $it 次") }
            detail.item.refreshCycle?.let { Text("刷新规则：$it") }
            ResourceGroup(baseUrl, "兑换奖励", detail.item.rewards)
            ResourceGroup(baseUrl, "兑换成本", detail.item.costs)
            Text("同兑换所另有 ${detail.siblings.size} 项", style = MaterialTheme.typography.bodySmall)
            StatusPanel(detail.capabilityStatus, emptyList(), null, null, detail.sourceHealth, detail.syncedAt,
                lookupDiagnostics = detail.lookupDiagnostics, onRetry = {})
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.missionDetail(baseUrl: String, detail: MissionItem) {
    item {
        DetailCard("任务 #${detail.id}") {
            Text(detail.sentence)
            Text("${missionKind(detail.kind)} · ${detail.type} · 要求 ${detail.requirement ?: "-"}/${detail.maxRequirement ?: "-"}")
            detail.characterName?.let { Text("角色：$it") }
            detail.category?.let { Text("分类：$it") }
            if (detail.stages.isNotEmpty()) {
                Text("阶段", fontWeight = FontWeight.SemiBold)
                detail.stages.forEach { Text("${it.seq}. 要求 ${it.requirement ?: "-"} · EXP ${it.exp ?: "-"} · 数量 ${it.quantity ?: "-"}") }
            }
            ResourceGroup(baseUrl, "奖励", detail.rewards)
            detail.missingFields.forEach { Text("缺失字段：$it", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.virtualLiveDetail(
    baseUrl: String,
    region: String,
    detail: VirtualLiveDetail,
    playback: PlaybackState?,
    playbackLoading: Boolean,
    playbackError: String?,
    onLoadPlayback: (String) -> Unit,
    stepDetails: Map<VirtualStepKey, VirtualLiveStepDetail>,
    stepLoading: Set<VirtualStepKey>,
    stepErrors: Map<VirtualStepKey, String>,
    onLoadStep: (String, Int) -> Unit
) {
    item {
        DetailCard(detail.live.name) {
            if (detail.live.imageCandidates.isNotEmpty()) RemoteContentImage(baseUrl, detail.live.imageCandidates, detail.live.name)
            Text("${statusLabel(componentLiveStatus(detail.live))} · ${dateRange(detail.live.startAt, detail.live.endAt)}")
            Text("角色：${detail.characters.joinToString().ifBlank { "未收录" }}")
            Text("日程", fontWeight = FontWeight.SemiBold)
            detail.schedules.take(24).forEach { Text(it) }
            ResourceGroup(baseUrl, "奖励", detail.rewards)
        }
    }
    item {
        DetailCard("播放状态") {
            if (playback == null && !playbackLoading) Button(onClick = { onLoadPlayback(detail.live.id) }) { Text("解析连续播放队列") }
            if (playbackLoading) CircularProgressIndicator()
            playbackError?.let { Text(it, color = MaterialTheme.colorScheme.error); OutlinedButton(onClick = { onLoadPlayback(detail.live.id) }) { Text("重试播放解析") } }
            playback?.let { PlaybackPanel(baseUrl, it) }
        }
    }
    items(detail.steps, key = { it.index }) { step ->
        DetailCard("${step.seq}. ${step.label}") {
            val stepKey = VirtualStepKey(region, detail.live.id, step.index)
            Text("类型：${step.type}")
            if (step.imageCandidates.isNotEmpty()) RemoteContentImage(baseUrl, step.imageCandidates, step.label, height = 110)
            val loaded = stepDetails[stepKey]
            if (loaded == null && stepKey !in stepLoading) OutlinedButton(onClick = { onLoadStep(detail.live.id, step.index) }) { Text("展开真实节目段") }
            if (stepKey in stepLoading) CircularProgressIndicator()
            stepErrors[stepKey]?.let { message ->
                Text(message, color = MaterialTheme.colorScheme.error)
                OutlinedButton(onClick = { onLoadStep(detail.live.id, step.index) }) { Text("重试") }
            }
            loaded?.let { stepDetail ->
                Text("播放能力：${statusLabel(stepDetail.playbackStatus)}")
                stepDetail.unavailableReason?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                stepDetail.warnings.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                stepDetail.events.forEach { event ->
                    Text("${event.time?.let { "%.1fs".format(it) } ?: "--"} · ${event.type} · ${event.text ?: event.characterId ?: event.id}")
                    val animation = listOfNotNull(event.motionKey?.let { "动作 $it" }, event.facialKey?.let { "表情 $it" },
                        event.bodyCostume3dId?.let { "服装 $it" }).joinToString(" · ")
                    if (animation.isNotBlank()) Text(animation, style = MaterialTheme.typography.bodySmall)
                }
                if (stepDetail.queue.isNotEmpty()) RemoteAudioQueue(baseUrl, stepDetail.queue)
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.live2dDetail(baseUrl: String, webRuntimeBaseUrl: String, region: String, detail: Live2dDetail) {
    item {
        DetailCard(detail.model.name) {
            Text("播放能力：${statusLabel(detail.playbackStatus)}")
            Text(detail.model.modelPath ?: detail.model.id)
            Text("动作 ${detail.model.motionCount} · 表情 ${detail.model.expressionCount} · 贴图 ${detail.model.textureCount}")
            detail.textureUrls.firstOrNull()?.let { RemoteContentImage(baseUrl, listOf(it), "${detail.model.name} 贴图", height = 260) }
            Text("下方复用网页端 Pixi + Cubism4 运行时，提供拖拽、缩放、动作和表情；原生区域保留资产诊断。", style = MaterialTheme.typography.bodySmall)
            detail.unavailableReason?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            detail.model3Url?.let { Text("model3：$it", style = MaterialTheme.typography.bodySmall) }
            detail.runtimeRequirements.forEach { Text("运行要求：$it", style = MaterialTheme.typography.bodySmall) }
        }
    }
    item {
        WebParityRuntime(webRuntimeBaseUrl, region, "/section/live2d/${java.net.URLEncoder.encode(detail.model.id, "UTF-8")}", "交互式 Live2D 舞台")
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.mysekaiDetail(baseUrl: String, detail: MysekaiDetail) {
    item {
        DetailCard(detail.item.name) {
            if (detail.item.imageCandidates.isNotEmpty()) RemoteContentImage(baseUrl, detail.item.imageCandidates, detail.item.name)
            Text("${detail.item.kind.label} · ${detail.item.category ?: "未分类"} · 稀有度 ${detail.item.rarity ?: "-"}")
            detail.item.description?.let { Text(it) }
            Text("蓝图关联 ${detail.blueprintCount} · 相关家具 ${detail.relatedFixtureCount}")
            if (detail.costs.isNotEmpty()) Text("制作素材", fontWeight = FontWeight.SemiBold)
            detail.costs.forEach { cost -> Text("${cost.material?.name ?: "未解析素材"} × ${cost.quantity ?: "-"}") }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.storyDetail(
    baseUrl: String,
    webRuntimeBaseUrl: String,
    region: String,
    detail: StoryDetail,
    playback: PlaybackState?,
    playbackLoading: Boolean,
    playbackError: String?,
    onPlayStory: (StoryDetail, StoryChapter) -> Unit
) {
    item {
        DetailCard(detail.title) {
            if (detail.imageCandidates.isNotEmpty()) RemoteContentImage(baseUrl, detail.imageCandidates, detail.title)
            detail.description?.let { Text(it) }
            detail.unavailableReason?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Text(if (detail.playbackHasScenario) "已确认场景资源" else "场景资源待确认", style = MaterialTheme.typography.bodySmall)
        }
    }
    items(detail.chapters, key = { it.id }) { chapter ->
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(chapter.title, fontWeight = FontWeight.SemiBold)
                chapter.chapterTitle?.let { Text(it) }
                Text(if (chapter.scenarioStatus == "ready") "场景可读取" else "场景资源待确认", style = MaterialTheme.typography.bodySmall)
                Button(onClick = { onPlayStory(detail, chapter) }) { Text("加载并播放本章") }
            }
        }
    }
    if (playbackLoading) item { CenteredProgress() }
    playbackError?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }
    playback?.let { state -> item { DetailCard("故事播放") { PlaybackPanel(baseUrl, state) } } }
    playback?.takeIf { it.actions.isNotEmpty() }?.let {
        val chapter = detail.chapters.firstOrNull { it.id == playback.episodeId }
        if (chapter != null) item {
            val route = "/section/stories/${detail.storyType}/${java.net.URLEncoder.encode(detail.storyId, "UTF-8")}/${java.net.URLEncoder.encode(chapter.id, "UTF-8")}/play"
            WebParityRuntime(webRuntimeBaseUrl, region, route, "网页同源故事 Live2D 舞台")
        }
    }
}

@Composable
private fun PlaybackPanel(baseUrl: String, playback: PlaybackState) {
    var actionIndex by remember(playback.actions) { mutableIntStateOf(0) }
    var textMode by remember(playback.actions) { mutableStateOf(playback.actions.isNotEmpty()) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("状态：${statusLabel(playback.status)}", fontWeight = FontWeight.SemiBold)
        playback.diagnostics.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
        playback.unavailableReason?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        playback.warnings.take(12).forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
        playback.mediaImages.take(3).forEachIndexed { index, url -> RemoteContentImage(baseUrl, listOf(url), "场景图 ${index + 1}", height = 220) }
        if (playback.actions.isNotEmpty()) {
            val current = playback.actions[actionIndex.coerceIn(0, playback.actions.lastIndex)]
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { actionIndex-- }, enabled = actionIndex > 0) { Text("上一句") }
                Button(onClick = { actionIndex++ }, enabled = actionIndex < playback.actions.lastIndex) { Text("下一句") }
                OutlinedButton(onClick = { textMode = !textMode }) { Text(if (textMode) "显示舞台信息" else "文本模式") }
            }
            Text("${actionIndex + 1}/${playback.actions.size} · ${current.type}", style = MaterialTheme.typography.bodySmall)
            current.speaker?.let { Text(it, fontWeight = FontWeight.Bold) }
            Text(current.body ?: current.effectName ?: "本段没有对白。")
            if (!textMode) Text("Android 尚未集成故事 Live2D 舞台运行时；背景、动作序列与音频为真实数据，角色模型按文本模式降级。",
                color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        } else {
            playback.textSnippets.take(40).forEach { Text(it) }
        }
        if (playback.queue.isNotEmpty()) RemoteAudioQueue(baseUrl, playback.queue)
    }
}

@Composable
private fun ResourceGroup(baseUrl: String, title: String, resources: List<ResourceItem>) {
    if (resources.isEmpty()) return
    Text(title, fontWeight = FontWeight.SemiBold)
    resources.forEach { resource ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (resource.imageCandidates.isNotEmpty()) {
                RemoteContentImage(baseUrl, resource.imageCandidates, resource.name, modifier = Modifier.weight(0.32f), height = 72)
            }
            Column(Modifier.weight(1f)) {
                Text(resource.name)
                Text("${resource.type}${resource.id?.let { " #$it" }.orEmpty()} · ×${resource.quantity ?: "-"}", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun DetailCard(title: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            HorizontalDivider()
            content()
        }
    }
}

@Composable
private fun CenteredProgress() {
    Row(Modifier.fillMaxWidth().padding(24.dp), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator() }
}

private fun itemTitle(item: Any): String = when (item) {
    is InformationItem -> item.title
    is ExchangeItem -> item.name
    is MissionItem -> item.sentence
    is VirtualLiveItem -> item.name
    is Live2dItem -> item.name
    is MysekaiItem -> item.name
    is StoryItem -> item.name
    else -> item.toString()
}

private fun itemSubtitle(item: Any): String = when (item) {
    is InformationItem -> item.type ?: item.tag ?: "公告"
    is ExchangeItem -> "${item.summaryName ?: item.category ?: "兑换所"} · ${statusLabel(item.status)}"
    is MissionItem -> "${missionKind(item.kind)} · ${item.type}"
    is VirtualLiveItem -> "${statusLabel(componentLiveStatus(item))} · ${item.type ?: "Virtual Live"}"
    is Live2dItem -> "${item.costumeType ?: "模型"} · ${statusLabel(item.playbackStatus)}"
    is MysekaiItem -> "${item.kind.label} · ${item.category ?: "未分类"}"
    is StoryItem -> "${storyTypeLabel(item.storyType)} · ${item.description.orEmpty()}"
    else -> ""
}

private fun itemMeta(item: Any): String = when (item) {
    is InformationItem -> "${dateRange(item.startAt, item.endAt)} · ID ${item.id}"
    is ExchangeItem -> "获得 ${item.rewards.take(2).joinToString { "${it.name} ×${it.quantity ?: "-"}" }} · ID ${item.id}"
    is MissionItem -> "要求 ${item.requirement ?: "-"} · 阶段 ${item.stages.size} · ID ${item.id}"
    is VirtualLiveItem -> "日程 ${item.scheduleCount} · 节目 ${item.setlistCount} · 奖励 ${item.rewardCount} · ID ${item.id}"
    is Live2dItem -> "动作 ${item.motionCount} · 表情 ${item.expressionCount} · 贴图 ${item.textureCount} · ID ${item.id}"
    is MysekaiItem -> "稀有度 ${item.rarity ?: "-"} · ID ${item.id}"
    is StoryItem -> "${item.episodeCount} 章 · ${dateRange(item.startAt, null)} · ID ${item.id}"
    else -> ""
}

private fun itemImages(item: Any): List<String> = when (item) {
    is InformationItem -> item.imageCandidates
    is ExchangeItem -> item.imageCandidates.ifEmpty { item.rewards.flatMap(ResourceItem::imageCandidates) }
    is VirtualLiveItem -> item.imageCandidates
    is MysekaiItem -> item.imageCandidates
    is StoryItem -> item.imageCandidates
    else -> emptyList()
}

private fun statusLabel(value: String?): String = when (value) {
    "ready" -> "可用"
    "partial", "partial-ready" -> "部分可用"
    "active" -> "进行中"
    "upcoming" -> "即将开放"
    "ended" -> "已结束"
    "permanent" -> "常驻"
    "region-referenced" -> "本区已引用"
    "global-only" -> "全局共享"
    "missing-resource" -> "资源缺失"
    "source-unavailable" -> "数据源不可用"
    "not-released" -> "本区未实装"
    null, "" -> "未知"
    else -> value
}

private fun missionKind(value: String): String = when (value) { "normal" -> "普通"; "beginner" -> "新手"; "character" -> "角色"; "honor" -> "称号"; else -> value }
private fun storyTypeLabel(value: String): String = when (value) { "eventStories" -> "活动故事"; "unitStories" -> "组合故事"; "cardEpisodes" -> "卡牌剧情"; "specialStories" -> "特殊故事"; else -> value }
private fun componentLiveStatus(item: VirtualLiveItem): String { val now = System.currentTimeMillis(); return when { item.startAt != null && now < item.startAt -> "upcoming"; item.endAt != null && now > item.endAt -> "ended"; else -> "active" } }
private fun dateRange(start: Long?, end: Long?): String = listOfNotNull(start?.let(::formatDate), end?.let(::formatDate)).joinToString(" ～ ").ifBlank { "时间未公开" }
private fun formatDate(value: Long): String = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(value))
