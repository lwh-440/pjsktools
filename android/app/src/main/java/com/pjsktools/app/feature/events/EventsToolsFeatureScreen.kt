package com.pjsktools.app.feature.events

import android.content.Context
import android.content.ContextWrapper
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import com.pjsktools.app.feature.catalog.RemoteCatalogImage
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner

@Composable
fun EventsToolsFeatureScreen(
    baseUrl: String,
    region: String,
    onRelatedNavigate: (EventNavigationTarget) -> Unit,
    accountContext: EventsAccountContext?,
    modifier: Modifier = Modifier,
    initialSection: EventsToolsSection = EventsToolsSection.CURRENT,
    eventTargetId: String? = null,
    onEventTargetConsumed: (() -> Unit)? = null
) {
    val repository = remember(baseUrl) { EventsToolsRepository(baseUrl) }
    var section by remember { mutableStateOf(initialSection) }
    var windowHours by remember { mutableStateOf<Int?>(null) }
    var dashboard by remember { mutableStateOf<EventsDashboard?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshRequest by remember { mutableStateOf(0) }
    var handledRefreshRequest by remember { mutableStateOf(0) }
    var countdown by remember { mutableStateOf(10) }
    var selectedEventId by remember { mutableStateOf<String?>(null) }
    var eventDetail by remember { mutableStateOf<FullEventDetail?>(null) }
    var eventDetailError by remember { mutableStateOf<String?>(null) }
    var selectedRank by remember { mutableStateOf<Int?>(null) }
    var rankingDetail by remember { mutableStateOf<RankingPlayerDetail?>(null) }
    val localContext = LocalContext.current
    val lifecycleOwner = remember(localContext) { localContext.findLifecycleOwner() }
    var lifecycleStarted by remember { mutableStateOf(lifecycleOwner?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.STARTED) != false) }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, _ ->
            lifecycleStarted = lifecycleOwner?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.STARTED) != false
        }
        lifecycleOwner?.lifecycle?.addObserver(observer)
        onDispose { lifecycleOwner?.lifecycle?.removeObserver(observer) }
    }

    LaunchedEffect(baseUrl, region, windowHours, section, refreshRequest, lifecycleStarted) {
        if (!lifecycleStarted) return@LaunchedEffect
        if (refreshRequest > handledRefreshRequest && section == EventsToolsSection.CURRENT) {
            handledRefreshRequest = refreshRequest
            dashboard?.currentEvent?.id?.takeUnless { it == "none" || it == "unknown" }?.let {
                catchingUi { repository.refreshRanking(region, it) }
            }
        }
        do {
            loading = true
            error = null
            catchingUi { repository.loadDashboard(region, windowHours) }
                .onSuccess { dashboard = it }
                .onFailure { error = it.message ?: "活动数据加载失败" }
            loading = false
            if (section != EventsToolsSection.CURRENT) break
            countdown = 10
            while (countdown > 0) { delay(1_000); countdown -= 1 }
        } while (true)
    }

    LaunchedEffect(region, eventTargetId) {
        if (!eventTargetId.isNullOrBlank()) {
            section = EventsToolsSection.HISTORY
            selectedEventId = eventTargetId
        }
    }

    LaunchedEffect(baseUrl, region, selectedEventId) {
        val id = selectedEventId ?: return@LaunchedEffect
        eventDetail = null
        eventDetailError = null
        catchingUi { repository.eventFull(region, id) }
            .onSuccess {
                eventDetail = it
                if (id == eventTargetId) onEventTargetConsumed?.invoke()
            }
            .onFailure { eventDetailError = it.message ?: "活动详情加载失败" }
    }

    LaunchedEffect(baseUrl, region, dashboard?.currentEvent?.id, selectedRank) {
        val rank = selectedRank ?: return@LaunchedEffect
        val eventId = dashboard?.currentEvent?.id?.takeUnless { it == "none" || it == "unknown" } ?: return@LaunchedEffect
        rankingDetail = null
        catchingUi { repository.rankingPlayer(region, eventId, rank) }
            .onSuccess { rankingDetail = it }
            .onFailure { error = it.message ?: "排名详情加载失败" }
    }

    Column(modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(Modifier.weight(1f)) {
                Text("活动、排名与工具", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text("区服 ${region.uppercase()} · 与网页共用后端", style = MaterialTheme.typography.bodySmall)
            }
            Column {
                OutlinedButton(onClick = { refreshRequest += 1 }, enabled = !loading) { Text(if (loading) "加载中" else "立即刷新") }
                if (section == EventsToolsSection.CURRENT && !loading) Text("${countdown}s 后刷新", style = MaterialTheme.typography.labelSmall)
            }
        }
        LazyRow(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(EventsToolsSection.entries) { item ->
                if (section == item) Button(onClick = {}) { Text(item.label) }
                else OutlinedButton(onClick = { section = item }) { Text(item.label) }
            }
        }
        error?.let { ErrorCard(it, Modifier.padding(16.dp)) }
        when (section) {
            EventsToolsSection.CURRENT -> CurrentEventContent(baseUrl, dashboard, rankingDetail, selectedRank, { selectedRank = it }, { selectedRank = null }, loading, Modifier.weight(1f))
            EventsToolsSection.HISTORY -> EventHistoryContent(baseUrl, dashboard, eventDetail, eventDetailError, selectedEventId, { selectedEventId = it }, onRelatedNavigate, loading, Modifier.weight(1f))
            EventsToolsSection.FORECAST -> ForecastContent(repository, region, dashboard?.currentEvent?.id, dashboard?.borders.orEmpty(), dashboard?.insights, windowHours, { windowHours = it }, loading, Modifier.weight(1f))
            EventsToolsSection.TOOLS -> ToolsContent(repository, region, dashboard?.currentEvent?.id, accountContext, Modifier.weight(1f))
        }
    }
}

@Composable
private fun CurrentEventContent(
    baseUrl: String,
    dashboard: EventsDashboard?,
    rankingDetail: RankingPlayerDetail?,
    selectedRank: Int?,
    onSelectRank: (Int) -> Unit,
    onCloseDetail: () -> Unit,
    loading: Boolean,
    modifier: Modifier
) {
    LazyColumn(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { SectionSpacer() }
        if (dashboard == null) {
            item { EmptyCard(if (loading) "正在加载活动与实时排名…" else "暂无活动数据") }
            return@LazyColumn
        }
        item {
            InfoCard("当前活动") {
                val event = dashboard.currentEvent
                Text(event?.name ?: "当前没有正在进行的活动", fontWeight = FontWeight.Bold)
                event?.eventType?.let { Text(it) }
                if (event != null && event.id != "none") Text("${shortDate(event.startAt)} — ${shortDate(event.endAt)}")
                dashboard.updatedAt?.let { Text("榜单更新：${shortDate(it)}", style = MaterialTheme.typography.bodySmall) }
                dashboard.sourceHealth?.let {
                    Text("来源状态：${it.status ?: "unknown"}${if (it.stale) "（可能延迟）" else ""}")
                    it.primarySource?.let { source -> Text("主来源：$source", style = MaterialTheme.typography.bodySmall) }
                    it.fallbackLine?.let { fallback -> Text(fallback, style = MaterialTheme.typography.bodySmall) }
                }
            }
        }
        if (dashboard.warnings.isNotEmpty()) item { WarningCard("更新状态", dashboard.warnings) }
        rankingDetail?.let { detail ->
            item {
                InfoCard("实时排名详情 · #${detail.row.rank}") {
                    if (detail.row.leaderImageCandidates.isNotEmpty()) {
                        RemoteCatalogImage(baseUrl, detail.row.leaderImageCandidates, "${detail.row.playerName} 当前队长", heightDp = 180)
                    }
                    Text(detail.row.playerName, fontWeight = FontWeight.Bold)
                    Text("${formatLong(detail.row.score)} pt · 时速 ${detail.row.growth?.let(::formatLong) ?: "-"} pt/h")
                    Text(detail.profileWord ?: "暂无公开签名")
                    Text("队长卡 ${detail.row.leaderCardId ?: "-"} · Lv.${detail.row.leaderCardLevel ?: "-"} · MR ${detail.row.leaderCardMasterRank ?: "-"}")
                    Text("称号 ${detail.profileHonorCount} · 采样间隔 ${detail.intervalSeconds?.let { "$it 秒" } ?: "-"}")
                    val churn = detail.churn1h?.let { "近 1H 周回 $it" } ?: "近 1H PT 更新 ${detail.observedPtUpdates ?: 0} 次"
                    Text("$churn · 状态 ${detail.churnStatus ?: "source-unavailable"}")
                    TraceSummary("玩家轨迹", detail.playerTrace)
                    TraceSummary("档线轨迹", detail.rankTrace)
                    TextButton(onClick = onCloseDetail) { Text("关闭详情") }
                }
            }
        }
        if (selectedRank != null && rankingDetail == null) item { EmptyCard("正在加载 #$selectedRank 的真实排名详情…") }
        item {
            InfoCard("实时边线（${dashboard.borders.size}）") {
                if (dashboard.borders.isEmpty()) Text("暂无真实边线数据")
                dashboard.borders.forEach { Text("T${it.rank}    ${formatLong(it.score)} pt", fontWeight = FontWeight.SemiBold) }
            }
        }
        item { Text("Top 100（${dashboard.top100.size}）", modifier = Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        if (dashboard.top100.isEmpty()) item { EmptyCard("暂无实时 Top 100 数据") }
        items(dashboard.top100, key = { it.rank }) { row ->
            Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clickable { onSelectRank(row.rank) }) {
                Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (row.leaderImageCandidates.isNotEmpty()) {
                        RemoteCatalogImage(baseUrl, row.leaderImageCandidates, "${row.playerName} 当前队长", modifier = Modifier.widthIn(max = 64.dp), heightDp = 64)
                    }
                    Text("#${row.rank}", modifier = Modifier.widthIn(min = 44.dp), fontWeight = FontWeight.Bold)
                    Column(Modifier.weight(1f)) {
                        Text(row.playerName, fontWeight = FontWeight.SemiBold)
                        row.userId?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                    }
                    Column {
                        Text(formatLong(row.score), fontWeight = FontWeight.Bold)
                        row.growth?.let { Text("+${formatLong(it)}", style = MaterialTheme.typography.bodySmall) }
                    }
                }
            }
        }
        item { SectionSpacer() }
    }
}

@Composable
private fun EventHistoryContent(
    baseUrl: String,
    dashboard: EventsDashboard?,
    detail: FullEventDetail?,
    detailError: String?,
    selectedEventId: String?,
    onSelectEvent: (String) -> Unit,
    onRelatedNavigate: (EventNavigationTarget) -> Unit,
    loading: Boolean,
    modifier: Modifier
) {
    val currentId = dashboard?.currentEvent?.id
    val history = dashboard?.events.orEmpty().filter { it.id != currentId }
    LazyColumn(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { SectionSpacer() }
        detailError?.let { item { ErrorCard(it) } }
        detail?.let { full ->
            item {
                InfoCard(full.event.name) {
                    if (full.bannerCandidates.isNotEmpty()) RemoteCatalogImage(baseUrl, full.bannerCandidates, full.event.name, heightDp = 220)
                    Text(full.event.eventType ?: "未知活动类型")
                    Text("${shortDate(full.event.startAt)} — ${shortDate(full.event.endAt)}")
                    full.event.storyOutline?.let { Text(it) }
                    RelatedEventItems("相关歌曲", full.relatedSongs, baseUrl, onRelatedNavigate)
                    RelatedEventItems("相关卡牌", full.relatedCards, baseUrl, onRelatedNavigate)
                    RelatedEventItems("相关卡池", full.relatedGachas, baseUrl, onRelatedNavigate)
                }
            }
        }
        if (selectedEventId != null && detail == null && detailError == null) item { EmptyCard("正在加载活动完整详情…") }
        if (history.isEmpty()) item { EmptyCard(if (loading) "正在加载往期活动…" else "暂无往期活动数据") }
        items(history, key = { it.id }) { event ->
            Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clickable { onSelectEvent(event.id) }) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(event.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(event.eventType ?: "未知活动类型")
                    Text("${shortDate(event.startAt)} — ${shortDate(event.endAt)}", style = MaterialTheme.typography.bodySmall)
                    event.storyOutline?.takeIf { it.isNotBlank() }?.let { Text(it, maxLines = 3) }
                    Text("点击查看完整详情 · Event ID ${event.id}", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        item { SectionSpacer() }
    }
}

@Composable
private fun ForecastContent(
    repository: EventsToolsRepository,
    region: String,
    eventId: String?,
    borders: List<BorderRow>,
    insights: RankingInsights?,
    windowHours: Int?,
    onWindowChange: (Int?) -> Unit,
    loading: Boolean,
    modifier: Modifier
) {
    val scope = rememberCoroutineScope()
    var targetRank by remember { mutableStateOf("1000") }
    var currentPt by remember { mutableStateOf("0") }
    var ptPerRun by remember { mutableStateOf("25000") }
    var remainingMinutes by remember { mutableStateOf("180") }
    var availableRuns by remember { mutableStateOf("50") }
    var planResult by remember { mutableStateOf<ToolResult?>(null) }
    var planError by remember { mutableStateOf<String?>(null) }
    var planning by remember { mutableStateOf(false) }
    LazyColumn(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { SectionSpacer() }
        item {
            LazyRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf(null, 1, 3, 6)) { window ->
                    val label = window?.let { "近 ${it}h" } ?: "全部样本"
                    if (windowHours == window) Button(onClick = {}) { Text(label) }
                    else OutlinedButton(onClick = { onWindowChange(window) }) { Text(label) }
                }
            }
        }
        if (insights == null) {
            item { EmptyCard(if (loading) "正在加载真实历史样本…" else "当前活动没有预测数据") }
            return@LazyColumn
        }
        item {
            InfoCard(if (insights.experimental) "实验性预测" else "预测摘要") {
                Text("真实样本 ${insights.sampleCount} 条")
                insights.retentionRecommendation?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                insights.unavailableReason?.let { Text(it) }
                Text("预测与当前边线分开显示，不会补点或插值。", style = MaterialTheme.typography.labelSmall)
            }
        }
        if (insights.warnings.isNotEmpty()) item { WarningCard("预测状态", insights.warnings) }
        item {
            InfoCard("目标档线规划") {
                NumberField("目标排名", targetRank) { targetRank = it }
                NumberField("当前 PT", currentPt) { currentPt = it }
                NumberField("每局 PT", ptPerRun) { ptPerRun = it }
                NumberField("剩余分钟", remainingMinutes) { remainingMinutes = it }
                NumberField("可打局数", availableRuns) { availableRuns = it }
                Button(onClick = {
                    scope.launch {
                        planning = true
                        planError = null
                        catchingUi {
                            val rank = targetRank.optionalInt("目标排名") ?: throw IllegalArgumentException("目标排名不能为空")
                            val target = insights.lines.find { it.rank == rank }?.forecast3h
                                ?: borders.find { it.rank == rank }?.score
                                ?: throw IllegalStateException("目标 T$rank 暂无真实预测线或当前边线")
                                repository.scoreControl(region, ScoreControlInput(
                                    currentPt.requiredLong("当前 PT"), target, remainingMinutes.requiredDouble("剩余分钟"),
                                    ptPerRun.requiredDouble("每局 PT"), availableRuns.optionalInt("可打局数"),
                                    eventId?.takeUnless { it == "none" }, rank
                                ))
                        }.onSuccess { planResult = it }.onFailure { planError = it.message }
                        planning = false
                    }
                }, enabled = !planning) { Text(if (planning) "规划中…" else "按真实档线规划") }
                planError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                planResult?.highlights?.forEach { (label, value) -> Text("$label：$value") }
            }
        }
        item { Text("预测线", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        if (insights.lines.isEmpty()) item { EmptyCard("暂无足够样本生成预测") }
        items(insights.lines, key = { "forecast-${it.rank}" }) { line ->
            InfoCard("T${line.rank} · ${formatLong(line.currentScore)} pt") {
                Text("速度：${line.speedPerHour?.let(::formatDouble) ?: "-"} pt/h")
                Text("1h：${line.forecast1h?.let(::formatLong) ?: "-"} · 3h：${line.forecast3h?.let(::formatLong) ?: "-"}")
                line.forecastEnd?.let { Text("活动结束预测：${formatLong(it)} pt") }
                Text("样本 ${line.sampleCount} · 跨度 ${line.sampleSpanHours?.let(::formatDouble) ?: "-"}h")
                Text(line.reason ?: line.confidence ?: "实验性预测", style = MaterialTheme.typography.bodySmall)
            }
        }
        item { Text("历史样本摘要", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        if (insights.historyLines.isEmpty()) item { EmptyCard("暂无持久化历史摘要；刷新榜单后会逐步积累") }
        items(insights.historyLines.take(20), key = { "history-${it.sampleType}-${it.rank}" }) { line ->
            InfoCard("T${line.rank} · ${line.latestScore?.let(::formatLong) ?: "-"} pt") {
                Text("样本 ${line.sampleCount} · 跨度 ${line.sampleSpanHours?.let(::formatDouble) ?: "-"}h")
                Text("速度 ${line.speedPerHour?.let(::formatDouble) ?: "-"} pt/h · ${line.confidence ?: "unavailable"}")
                line.confidenceReason?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                line.latestSampledAt?.let { Text("最近：${shortDate(it)}", style = MaterialTheme.typography.labelSmall) }
            }
        }
        item {
            InfoCard("近期真实样本趋势") {
                val byRank = insights.recentSamples.groupBy { it.rank }.toSortedMap()
                if (byRank.isEmpty()) Text("暂无真实采样点")
                byRank.entries.take(12).forEach { (rank, rawSamples) ->
                    val samples = rawSamples.sortedBy { it.sampledAt }.takeLast(20)
                    val min = samples.minOf { it.score }
                    val max = samples.maxOf { it.score }
                    Text("T$rank · ${samples.size} 个采样点", fontWeight = FontWeight.Bold)
                    samples.forEach { sample ->
                        Text("${shortDate(sample.sampledAt)} · ${formatLong(sample.score)} pt", style = MaterialTheme.typography.labelSmall)
                        val progress = ((sample.score - min).toFloat() / (max - min).coerceAtLeast(1).toFloat()).coerceIn(0f, 1f)
                        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
                    }
                    val delta = samples.last().score - samples.first().score
                    Text("本窗口变化 ${if (delta >= 0) "+" else ""}${formatLong(delta)} pt；尺度 ${formatLong(min)}—${formatLong(max)}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item { SectionSpacer() }
    }
}

@Composable
private fun ToolsContent(
    repository: EventsToolsRepository,
    region: String,
    currentEventId: String?,
    accountContext: EventsAccountContext?,
    modifier: Modifier
) {
    val scope = rememberCoroutineScope()
    val eventId = currentEventId?.takeUnless { it == "none" || it == "unknown" }
    var running by remember { mutableStateOf<String?>(null) }
    var toolError by remember { mutableStateOf<String?>(null) }
    var result by remember { mutableStateOf<ToolResult?>(null) }
    var showRaw by remember { mutableStateOf(false) }

    var currentPt by remember { mutableStateOf("0") }
    var targetPt by remember { mutableStateOf("1000000") }
    var remainingMinutes by remember { mutableStateOf("180") }
    var ptPerRun by remember { mutableStateOf("25000") }
    var availableRuns by remember { mutableStateOf("50") }
    var ownedCardIds by remember { mutableStateOf("") }
    var deckTarget by remember { mutableStateOf("event") }
    var musicId by remember { mutableStateOf("") }
    var difficulty by remember { mutableStateOf("expert") }
    var boost by remember { mutableStateOf("3") }

    fun runTool(name: String, action: suspend () -> ToolResult) {
        scope.launch {
            running = name
            toolError = null
            showRaw = false
            catchingUi { action() }
                .onSuccess { result = it }
                .onFailure { toolError = it.message ?: "$name 请求失败" }
            running = null
        }
    }

    LazyColumn(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { SectionSpacer() }
        item {
            InfoCard("控分计算") {
                Text("直接调用网页同款 score-control API。", style = MaterialTheme.typography.bodySmall)
                NumberField("当前 PT", currentPt) { currentPt = it }
                NumberField("目标 PT", targetPt) { targetPt = it }
                NumberField("剩余分钟", remainingMinutes) { remainingMinutes = it }
                NumberField("每局 PT", ptPerRun) { ptPerRun = it }
                NumberField("可打局数（可留空）", availableRuns) { availableRuns = it }
                Button(onClick = {
                    runTool("控分计算") {
                        repository.scoreControl(region, ScoreControlInput(
                            currentPt = currentPt.requiredLong("当前 PT"),
                            targetPt = targetPt.requiredLong("目标 PT"),
                            remainingMinutes = remainingMinutes.requiredDouble("剩余分钟"),
                            ptPerRun = ptPerRun.requiredDouble("每局 PT"),
                            availableRuns = availableRuns.optionalInt("可打局数"),
                            eventId = eventId
                        ))
                    }
                }, enabled = running == null) { Text(if (running == "控分计算") "计算中…" else "开始控分计算") }
            }
        }
        item {
            InfoCard("组卡推荐") {
                Text("公开模式需填写真实持有卡牌 ID；没有卡牌时后端会返回缺失状态。", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(ownedCardIds, { ownedCardIds = it }, label = { Text("持有卡牌 ID，逗号或空格分隔") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("event" to "活动", "power" to "综合力", "skill" to "技能").forEach { (value, label) ->
                        if (deckTarget == value) Button(onClick = {}) { Text(label) }
                        else OutlinedButton(onClick = { deckTarget = value }) { Text(label) }
                    }
                }
                Button(onClick = {
                    runTool("组卡推荐") {
                        repository.recommendDeck(region, DeckRecommendInput(
                            ownedCardIds = splitIds(ownedCardIds), eventId = eventId, target = deckTarget
                        ))
                    }
                }, enabled = running == null) { Text(if (running == "组卡推荐") "搜索中…" else "开始组卡推荐") }
            }
        }
        item {
            InfoCard("普通活动规划") {
                Text("串联组卡、活动 PT、控分、歌曲与区域道具结果。", style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(musicId, { musicId = it }, label = { Text("歌曲 ID（可留空）") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(difficulty, { difficulty = it.lowercase() }, label = { Text("难度") }, modifier = Modifier.fillMaxWidth())
                NumberField("当前 PT", currentPt) { currentPt = it }
                NumberField("目标 PT", targetPt) { targetPt = it }
                NumberField("剩余分钟", remainingMinutes) { remainingMinutes = it }
                NumberField("体力消耗", boost) { boost = it }
                Button(onClick = {
                    runTool("普通活动规划") {
                        repository.normalEventPlan(region, NormalEventPlanInput(
                            eventId = eventId,
                            musicId = musicId.takeIf { it.isNotBlank() },
                            difficulty = difficulty.takeIf { it.isNotBlank() } ?: "expert",
                            currentPt = currentPt.requiredLong("当前 PT"),
                            targetPt = targetPt.requiredLong("目标 PT"),
                            remainingMinutes = remainingMinutes.requiredDouble("剩余分钟"),
                            boost = boost.requiredDouble("体力消耗"),
                            ownedCardIds = splitIds(ownedCardIds)
                        ))
                    }
                }, enabled = running == null) { Text(if (running == "普通活动规划") "规划中…" else "生成普通活动规划") }
            }
        }
        item {
            InfoCard("歌曲推荐") {
                Text("公开模式使用同区服真实歌曲与活动数据。", style = MaterialTheme.typography.bodySmall)
                Button(onClick = {
                    runTool("歌曲推荐") {
                        repository.musicRecommend(region, eventId, currentPt.requiredLong("当前 PT"), targetPt.requiredLong("目标 PT"))
                    }
                }, enabled = running == null) { Text(if (running == "歌曲推荐") "推荐中…" else "公开歌曲推荐") }
            }
        }
        item {
            InfoCard("区域道具推荐") {
                Text("公开模式必须填写 1—5 个真实卡牌 ID。", style = MaterialTheme.typography.bodySmall)
                Button(onClick = {
                    runTool("区域道具推荐") {
                        val ids = splitIds(ownedCardIds).take(5)
                        require(ids.isNotEmpty()) { "请先填写至少一个卡牌 ID" }
                        repository.areaItemRecommend(region, ids)
                    }
                }, enabled = running == null) { Text(if (running == "区域道具推荐") "计算中…" else "公开区域道具推荐") }
            }
        }
        item {
            InfoCard("绑定玩家数据工具") {
                val account = accountContext
                if (account == null) {
                    Text("宿主尚未提供登录 token 与 bindingId；绑定工具不会静默退化为公开模式。")
                } else if (account.region != region) {
                    Text("绑定区服 ${account.region.uppercase()} 与当前区服 ${region.uppercase()} 不一致，请先切换区服。", color = MaterialTheme.colorScheme.error)
                } else {
                    Text("已接入绑定 ${account.bindingId} · ${account.region.uppercase()}", style = MaterialTheme.typography.bodySmall)
                    Button(onClick = {
                        runTool("绑定活动 PT") {
                            repository.eventPoint(region, eventId, musicId.takeIf(String::isNotBlank), difficulty,
                                currentPt.requiredLong("当前 PT"), targetPt.requiredLong("目标 PT"), account)
                        }
                    }, enabled = running == null) { Text("绑定数据活动 PT") }
                    Button(onClick = {
                        runTool("绑定歌曲推荐") {
                            repository.musicRecommend(region, eventId, currentPt.requiredLong("当前 PT"), targetPt.requiredLong("目标 PT"), account)
                        }
                    }, enabled = running == null) { Text("绑定数据歌曲推荐") }
                    Button(onClick = {
                        runTool("绑定区域道具") { repository.areaItemRecommend(region, emptyList(), account) }
                    }, enabled = running == null) { Text("绑定数据区域道具") }
                    Button(onClick = {
                        runTool("绑定 MySekai") { repository.mysekaiRecommend(region, eventId, account) }
                    }, enabled = running == null) { Text("绑定数据 MySekai") }
                    Button(onClick = {
                        runTool("绑定普通活动规划") {
                            repository.boundNormalEventPlan(account, NormalEventPlanInput(
                                eventId, musicId.takeIf(String::isNotBlank), difficulty,
                                currentPt.requiredLong("当前 PT"), targetPt.requiredLong("目标 PT"),
                                remainingMinutes.requiredDouble("剩余分钟"), boost.requiredDouble("体力消耗"), emptyList()
                            ))
                        }
                    }, enabled = running == null) { Text("绑定数据普通活动规划") }
                }
            }
        }
        toolError?.let { item { ErrorCard(it) } }
        result?.let { output ->
            item {
                InfoCard(output.title) {
                    output.highlights.forEach { (label, value) ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(label)
                            Text(value, fontWeight = FontWeight.Bold)
                        }
                    }
                    if (output.missingFields.isNotEmpty()) {
                        HorizontalDivider()
                        Text("缺失字段", fontWeight = FontWeight.Bold)
                        output.missingFields.take(20).forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                    }
                    if (output.warnings.isNotEmpty()) {
                        HorizontalDivider()
                        Text("警告与公式状态", fontWeight = FontWeight.Bold)
                        output.warnings.take(20).forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                    }
                    if (output.estimatedFields.isNotEmpty()) {
                        HorizontalDivider()
                        Text("估算字段", fontWeight = FontWeight.Bold)
                        output.estimatedFields.take(20).forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                    }
                    if (output.readiness.isNotEmpty()) {
                        HorizontalDivider()
                        Text("环节就绪状态", fontWeight = FontWeight.Bold)
                        output.readiness.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
                    }
                    if (output.trace.isNotEmpty()) {
                        HorizontalDivider()
                        Text("公式与计算轨迹", fontWeight = FontWeight.Bold)
                        output.trace.take(20).forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                    }
                    TextButton(onClick = { showRaw = !showRaw }) { Text(if (showRaw) "收起服务端原始结果" else "查看服务端原始结果") }
                    if (showRaw) Text(output.rawJson, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item { SectionSpacer() }
    }
}

@Composable
private fun TraceSummary(title: String, points: List<RankingTracePoint>) {
    Text(title, fontWeight = FontWeight.Bold)
    if (points.isEmpty()) Text("暂无足够趋势数据", style = MaterialTheme.typography.bodySmall)
    else {
        val first = points.minBy { it.timestamp }
        val last = points.maxBy { it.timestamp }
        Text("${shortTimestamp(first.timestamp)} ${formatLong(first.score)} → ${shortTimestamp(last.timestamp)} ${formatLong(last.score)} pt（${points.size} 点）", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun RelatedEventItems(
    title: String,
    related: List<EventRelatedItem>,
    baseUrl: String,
    onNavigate: (EventNavigationTarget) -> Unit
) {
    if (related.isEmpty()) return
    HorizontalDivider()
    Text(title, fontWeight = FontWeight.Bold)
    related.take(12).forEach { item ->
        Column(Modifier.fillMaxWidth().clickable { onNavigate(EventNavigationTarget(item.kind, item.id, item.title)) }) {
            if (item.imageCandidates.isNotEmpty()) RemoteCatalogImage(baseUrl, item.imageCandidates, item.title, heightDp = 120)
            Text(item.title, fontWeight = FontWeight.SemiBold)
            item.subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

@Composable
private fun NumberField(label: String, value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(value, onValueChange, label = { Text(label) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
}

@Composable
private fun InfoCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            content()
        }
    }
}

@Composable
private fun WarningCard(title: String, warnings: List<String>) {
    InfoCard(title) { warnings.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) } }
}

@Composable
private fun ErrorCard(message: String, modifier: Modifier = Modifier) {
    Card(modifier.fillMaxWidth()) { Text(message, Modifier.padding(14.dp), color = MaterialTheme.colorScheme.error) }
}

@Composable
private fun EmptyCard(message: String) {
    InfoCard("数据状态") { Text(message) }
}

@Composable private fun SectionSpacer() { Column(Modifier.padding(top = 2.dp)) {} }

private fun splitIds(value: String): List<String> = value.split(Regex("[,\\s]+"))
    .map(String::trim).filter(String::isNotBlank).distinct()

private fun String.requiredLong(label: String): Long = toLongOrNull()?.takeIf { it >= 0 }
    ?: throw IllegalArgumentException("$label 必须是非负整数")

private fun String.requiredDouble(label: String): Double = toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 }
    ?: throw IllegalArgumentException("$label 必须是非负数字")

private fun String.optionalInt(label: String): Int? = if (isBlank()) null else toIntOrNull()?.takeIf { it >= 0 }
    ?: throw IllegalArgumentException("$label 必须是非负整数")

private fun formatLong(value: Long): String = "%,d".format(value)
private fun formatDouble(value: Double): String = "%,.1f".format(value)
private fun shortDate(value: String): String = value.replace('T', ' ').removeSuffix("Z")
private fun shortTimestamp(value: Long): String = shortDate(java.time.Instant.ofEpochMilli(if (value > 1_000_000_000_000L) value else value * 1_000).toString())

private suspend inline fun <T> catchingUi(crossinline block: suspend () -> T): Result<T> = try {
    Result.success(block())
} catch (error: CancellationException) {
    throw error
} catch (error: Throwable) {
    Result.failure(error)
}

private tailrec fun Context.findLifecycleOwner(): LifecycleOwner? = when (this) {
    is LifecycleOwner -> this
    is ContextWrapper -> baseContext.findLifecycleOwner()
    else -> null
}
