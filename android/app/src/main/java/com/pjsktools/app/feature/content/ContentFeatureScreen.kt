package com.pjsktools.app.feature.content

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive

@Composable
fun ContentFeatureScreen(
    baseUrl: String,
    webRuntimeBaseUrl: String,
    region: String,
    onNavigate: (ContentNavigationTarget) -> Unit,
    modifier: Modifier = Modifier,
    initialSection: ContentSection = ContentSection.INFORMATION,
    repository: ContentRepository = remember(baseUrl) { ContentRepository(baseUrl) }
) {
    var section by rememberSaveable { mutableStateOf(initialSection) }
    var searchInput by rememberSaveable { mutableStateOf("") }
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf("all") }
    var filter2 by rememberSaveable { mutableStateOf("") }
    var filter3 by rememberSaveable { mutableStateOf("") }
    var sort by rememberSaveable { mutableStateOf("default") }
    var pageSize by rememberSaveable { mutableIntStateOf(24) }
    var page by rememberSaveable { mutableIntStateOf(1) }
    var reload by remember { mutableIntStateOf(0) }
    var data by remember { mutableStateOf<ContentPage<*>?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var detailTarget by remember { mutableStateOf<Any?>(null) }
    var detail by remember { mutableStateOf<Any?>(null) }
    var detailLoading by remember { mutableStateOf(false) }
    var detailError by remember { mutableStateOf<String?>(null) }
    var detailReload by remember { mutableIntStateOf(0) }
    var playback by remember { mutableStateOf<PlaybackState?>(null) }
    var playbackLoading by remember { mutableStateOf(false) }
    var playbackError by remember { mutableStateOf<String?>(null) }
    var playbackRequest by remember { mutableStateOf<StoryPlaybackRequest?>(null) }
    var virtualPlaybackRequest by remember { mutableStateOf<String?>(null) }
    var stepRequest by remember { mutableStateOf<VirtualStepRequest?>(null) }
    var stepDetails by remember { mutableStateOf<Map<VirtualStepKey, VirtualLiveStepDetail>>(emptyMap()) }
    var stepLoading by remember { mutableStateOf<Set<VirtualStepKey>>(emptySet()) }
    var stepErrors by remember { mutableStateOf<Map<VirtualStepKey, String>>(emptyMap()) }

    fun clearDetailState() {
        detailTarget = null; detail = null; detailLoading = false; detailError = null
        playback = null; playbackLoading = false; playbackError = null; playbackRequest = null; virtualPlaybackRequest = null
        stepRequest = null; stepDetails = emptyMap(); stepLoading = emptySet(); stepErrors = emptyMap()
    }

    fun clearDetailEnhancements() {
        playback = null; playbackLoading = false; playbackError = null; playbackRequest = null; virtualPlaybackRequest = null
        stepRequest = null; stepDetails = emptyMap(); stepLoading = emptySet(); stepErrors = emptyMap()
    }

    LaunchedEffect(initialSection) { section = initialSection }
    LaunchedEffect(searchInput) {
        delay(350)
        if (query != searchInput.trim()) { query = searchInput.trim(); page = 1 }
    }
    LaunchedEffect(section) {
        searchInput = ""; query = ""; filter = defaultFilter(section); filter2 = ""; filter3 = ""
        sort = defaultSort(section); page = 1
        clearDetailState()
    }
    LaunchedEffect(region) { clearDetailState(); page = 1 }
    LaunchedEffect(region, section, query, filter, filter2, filter3, sort, page, pageSize, reload) {
        loading = true; error = null; data = null
        try {
            val loaded: ContentPage<*> = when (section) {
                ContentSection.INFORMATION -> repository.information(region)
                ContentSection.EXCHANGES -> repository.exchanges(region)
                ContentSection.MISSIONS -> repository.missions(region)
                ContentSection.VIRTUAL_LIVES -> repository.virtualLives(region)
                ContentSection.LIVE2D -> repository.live2d(region, query, filter2.filterDigits(), filter3, filter, page, pageSize)
                ContentSection.MYSEKAI -> repository.mysekai(region, MysekaiKind.valueOf(filter), query, filter2, page, pageSize)
                ContentSection.STORIES -> repository.stories(region, filter, query, filter2, filter3.filterDigits(), sort, page, pageSize)
            }
            currentCoroutineContext().ensureActive(); data = loaded; loading = false
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Throwable) {
            currentCoroutineContext().ensureActive(); error = failure.message ?: "内容加载失败"; loading = false
        }
    }
    LaunchedEffect(region, detailTarget, detailReload) {
        val target = detailTarget ?: return@LaunchedEffect
        clearDetailEnhancements(); detailLoading = true; detailError = null; detail = null
        try {
            detail = when (target) {
                is InformationItem -> repository.informationDetail(region, target.id)
                is ExchangeItem -> repository.exchangeDetail(region, target.id)
                is MissionItem -> target
                is VirtualLiveItem -> repository.virtualLiveDetail(region, target.id)
                is Live2dItem -> repository.live2dDetail(region, target.id)
                is MysekaiItem -> repository.mysekaiDetail(region, target)
                is StoryItem -> repository.storyDetail(region, target.storyType, target.id)
                else -> null
            }
            currentCoroutineContext().ensureActive()
            detailLoading = false
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Throwable) {
            currentCoroutineContext().ensureActive()
            detailError = failure.message ?: "详情加载失败"; detailLoading = false
        }
    }
    LaunchedEffect(region, virtualPlaybackRequest) {
        val id = virtualPlaybackRequest ?: return@LaunchedEffect
        playbackLoading = true; playback = null; playbackError = null
        try {
            playback = repository.virtualLivePlayback(region, id)
            currentCoroutineContext().ensureActive(); playbackLoading = false
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Throwable) {
            currentCoroutineContext().ensureActive(); playbackError = failure.message ?: "播放数据加载失败"; playbackLoading = false
        }
    }
    LaunchedEffect(region, stepRequest) {
        val request = stepRequest ?: return@LaunchedEffect
        val key = request.key
        stepLoading = stepLoading + key; stepErrors = stepErrors - key
        try {
            val result = repository.virtualLiveStep(request.key.region, request.key.liveId, request.key.index)
            currentCoroutineContext().ensureActive()
            stepDetails = stepDetails + (key to result); stepLoading = stepLoading - key
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Throwable) {
            currentCoroutineContext().ensureActive()
            stepErrors = stepErrors + (key to (failure.message ?: "节目段加载失败")); stepLoading = stepLoading - key
        }
    }
    LaunchedEffect(region, playbackRequest) {
        val request = playbackRequest ?: return@LaunchedEffect
        playbackLoading = true; playback = null; playbackError = null
        try {
            playback = repository.storyPlayback(region, request.storyType, request.storyId, request.episodeId)
            currentCoroutineContext().ensureActive(); playbackLoading = false
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Throwable) {
            currentCoroutineContext().ensureActive(); playbackError = failure.message ?: "故事播放数据加载失败"; playbackLoading = false
        }
    }

    if (detailTarget != null) {
        ContentDetailView(baseUrl, webRuntimeBaseUrl, detailTarget!!, detail, detailLoading, detailError, playback, playbackLoading,
            playbackError, region = region, onBack = { clearDetailState() },
            onRetry = { detailReload++ }, onNavigate = onNavigate,
            onPlayStory = { story, chapter -> playbackRequest = StoryPlaybackRequest(story.storyType, story.storyId, chapter.id) },
            onLoadVirtualPlayback = { virtualPlaybackRequest = it },
            stepDetails = stepDetails, stepLoading = stepLoading, stepErrors = stepErrors,
            onLoadVirtualStep = { liveId, index -> stepRequest = VirtualStepRequest(VirtualStepKey(region, liveId, index), System.nanoTime()) },
            modifier = modifier)
        return
    }

    val visibleItems = sortLocalItems(section, localVisibleItems(section, data?.items.orEmpty(), query, filter, filter2), sort)
    val serverPaged = section in setOf(ContentSection.LIVE2D, ContentSection.MYSEKAI, ContentSection.STORIES)
    val totalPages = if (serverPaged) data?.totalPages ?: 1 else ((visibleItems.size + pageSize - 1) / pageSize).coerceAtLeast(1)
    val safePage = page.coerceIn(1, totalPages)
    val pageItems = if (serverPaged) visibleItems else visibleItems.drop((safePage - 1) * pageSize).take(pageSize)

    LazyColumn(modifier.fillMaxSize().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 10.dp)) {
                itemsIndexed(ContentSection.entries) { _, candidate ->
                    FilterChip(selected = section == candidate, onClick = { section = candidate }, label = { Text(candidate.label) })
                }
            }
        }
        item {
            OutlinedTextField(searchInput, { searchInput = it }, label = { Text(searchLabel(section)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        }
        item {
            ContentFilters(section, data, filter, { filter = it; page = 1 }, filter2, { filter2 = it; page = 1 },
                filter3, { filter3 = it; page = 1 }, sort, { sort = it; page = 1 }, pageSize, { pageSize = it; page = 1 })
        }
        item {
            StatusPanel(data?.capabilityStatus, data?.warnings.orEmpty(), data?.unavailableReason, error,
                sourceHealth = data?.sourceHealth.orEmpty(), syncedAt = data?.syncedAt,
                unavailableCollections = data?.unavailableCollections.orEmpty(), lookupDiagnostics = data?.lookupDiagnostics.orEmpty()) { reload++ }
        }
        if (loading && data == null) item {
            Row(Modifier.fillMaxWidth().padding(24.dp), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator() }
        }
        if (!loading && error == null && pageItems.isEmpty()) item { Text("没有符合条件的内容。", modifier = Modifier.padding(24.dp)) }
        itemsIndexed(pageItems) { _, item ->
            ContentListCard(baseUrl, item, onClick = { clearDetailState(); detailTarget = item })
        }
        if (totalPages > 1) item {
            Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = { page = (safePage - 1).coerceAtLeast(1) }, enabled = safePage > 1) { Text("上一页") }
                Text("第 $safePage / $totalPages 页 · 共 ${data?.total ?: visibleItems.size} 项", style = MaterialTheme.typography.bodySmall)
                Button(onClick = { page = (safePage + 1).coerceAtMost(totalPages) }, enabled = safePage < totalPages) { Text("下一页") }
            }
        }
    }
}

@Composable
private fun ContentFilters(
    section: ContentSection,
    data: ContentPage<*>?,
    filter: String,
    onFilter: (String) -> Unit,
    filter2: String,
    onFilter2: (String) -> Unit,
    filter3: String,
    onFilter3: (String) -> Unit,
    sort: String,
    onSort: (String) -> Unit,
    pageSize: Int,
    onPageSize: (Int) -> Unit
) {
    val choices = when (section) {
        ContentSection.EXCHANGES -> listOf("all" to "全部", "active" to "进行中", "permanent" to "常驻", "upcoming" to "即将开始", "ended" to "已结束")
        ContentSection.MISSIONS -> listOf("all" to "全部", "normal" to "普通", "beginner" to "新手", "character" to "角色", "honor" to "称号")
        ContentSection.VIRTUAL_LIVES -> listOf("all" to "全部", "active" to "进行中", "upcoming" to "即将开始", "ended" to "已结束")
        ContentSection.LIVE2D -> listOf("region-referenced" to "本区已引用", "global-only" to "全局共享", "all" to "全部", "unavailable" to "不可用")
        ContentSection.MYSEKAI -> MysekaiKind.entries.map { it.name to it.label }
        ContentSection.STORIES -> listOf("all" to "全部", "eventStories" to "活动", "unitStories" to "组合", "cardEpisodes" to "卡牌", "specialStories" to "特殊")
        else -> emptyList()
    }
    if (choices.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        itemsIndexed(choices) { _, choice -> FilterChip(filter == choice.first, { onFilter(choice.first) }, { Text(choice.second) }) }
    }
    val secondaryLabel = when (section) {
        ContentSection.LIVE2D -> "角色 ID"
        ContentSection.MYSEKAI -> "分类（可选）"
        ContentSection.STORIES -> "组合（可选）"
        ContentSection.EXCHANGES -> "兑换所 ID（可选）"
        ContentSection.MISSIONS -> "角色 ID（可选）"
        else -> null
    }
    secondaryLabel?.let {
        OutlinedTextField(filter2, onFilter2, label = { Text(it) }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
    }
    val thirdLabel = when (section) {
        ContentSection.LIVE2D -> "服装类型（可选）"
        ContentSection.STORIES -> "活动/卡牌 ID（可选）"
        else -> null
    }
    thirdLabel?.let {
        OutlinedTextField(filter3, onFilter3, label = { Text(it) }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
    }
    val sorts = when (section) {
        ContentSection.INFORMATION -> listOf("time-desc" to "从新到旧", "time-asc" to "从旧到新", "id-asc" to "ID 从小到大")
        ContentSection.MISSIONS -> listOf("seq" to "任务顺序", "id" to "任务 ID", "requirement" to "要求值", "stages" to "阶段数量")
        ContentSection.STORIES -> listOf("time-desc" to "从新到旧", "time-asc" to "从旧到新", "id-asc" to "ID 从小到大")
        else -> emptyList()
    }
    if (sorts.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
        itemsIndexed(sorts) { _, choice -> FilterChip(sort == choice.first, { onSort(choice.first) }, { Text(choice.second) }) }
    }
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
        itemsIndexed(listOf(12, 24, 48)) { _, size -> FilterChip(pageSize == size, { onPageSize(size) }, { Text("每页 $size") }) }
    }
    if (!data?.facets.isNullOrEmpty()) {
        Text("可用筛选：${data?.facets?.values?.flatten()?.distinct()?.take(8)?.joinToString().orEmpty()}", style = MaterialTheme.typography.bodySmall)
    }
}

private fun defaultFilter(section: ContentSection) = when (section) {
    ContentSection.LIVE2D -> "region-referenced"
    ContentSection.MYSEKAI -> MysekaiKind.FIXTURES.name
    else -> "all"
}

private fun defaultSort(section: ContentSection) = when (section) {
    ContentSection.INFORMATION, ContentSection.STORIES -> "time-desc"
    ContentSection.MISSIONS -> "seq"
    else -> "default"
}

private fun searchLabel(section: ContentSection) = when (section) {
    ContentSection.INFORMATION -> "搜索公告标题或 ID"
    ContentSection.EXCHANGES -> "搜索兑换所或资源"
    ContentSection.MISSIONS -> "搜索任务说明"
    ContentSection.VIRTUAL_LIVES -> "搜索 Live 名称或 ID"
    ContentSection.LIVE2D -> "搜索模型名称、ID 或路径"
    ContentSection.MYSEKAI -> "搜索名称、说明或 ID"
    ContentSection.STORIES -> "搜索故事名称或 ID"
}

private fun localVisibleItems(section: ContentSection, items: List<*>, query: String, filter: String, filter2: String): List<Any> {
    val normalized = query.lowercase()
    return items.filterNotNull().filter { item ->
        val textMatches = normalized.isBlank() || searchableText(item).lowercase().contains(normalized)
        val filterMatches = when {
            filter == "all" || section in setOf(ContentSection.LIVE2D, ContentSection.MYSEKAI, ContentSection.STORIES) -> true
            item is ExchangeItem -> item.status == filter
            item is MissionItem -> item.kind == filter
            item is VirtualLiveItem -> liveStatus(item) == filter
            else -> true
        }
        val secondaryMatches = when {
            filter2.isBlank() -> true
            item is ExchangeItem -> item.summaryId == filter2.trim()
            item is MissionItem -> item.characterId == filter2.trim()
            else -> true
        }
        textMatches && filterMatches && secondaryMatches
    }
}

private fun sortLocalItems(section: ContentSection, items: List<Any>, sort: String): List<Any> = when {
    section == ContentSection.INFORMATION && sort == "time-desc" -> items.sortedByDescending { (it as InformationItem).startAt ?: 0L }
    section == ContentSection.INFORMATION && sort == "time-asc" -> items.sortedBy { (it as InformationItem).startAt ?: 0L }
    section == ContentSection.INFORMATION && sort == "id-asc" -> items.sortedBy { (it as InformationItem).id.toLongOrNull() ?: Long.MAX_VALUE }
    section == ContentSection.MISSIONS && sort == "seq" -> items.sortedBy { (it as MissionItem).seq ?: Int.MAX_VALUE }
    section == ContentSection.MISSIONS && sort == "id" -> items.sortedBy { (it as MissionItem).id.toLongOrNull() ?: Long.MAX_VALUE }
    section == ContentSection.MISSIONS && sort == "requirement" -> items.sortedBy { (it as MissionItem).requirement ?: Int.MAX_VALUE }
    section == ContentSection.MISSIONS && sort == "stages" -> items.sortedByDescending { (it as MissionItem).stages.size }
    else -> items
}

private fun searchableText(item: Any): String = when (item) {
    is InformationItem -> "${item.id} ${item.title} ${item.type.orEmpty()} ${item.tag.orEmpty()}"
    is ExchangeItem -> "${item.id} ${item.name} ${item.rewards.joinToString { it.name }}"
    is MissionItem -> "${item.id} ${item.sentence} ${item.characterName.orEmpty()}"
    is VirtualLiveItem -> "${item.id} ${item.name} ${item.type.orEmpty()}"
    is Live2dItem -> "${item.id} ${item.name} ${item.modelPath.orEmpty()}"
    is MysekaiItem -> "${item.id} ${item.name} ${item.description.orEmpty()}"
    is StoryItem -> "${item.id} ${item.name} ${item.description.orEmpty()}"
    else -> item.toString()
}

private fun liveStatus(item: VirtualLiveItem): String {
    val now = System.currentTimeMillis()
    return when { item.startAt != null && now < item.startAt -> "upcoming"; item.endAt != null && now > item.endAt -> "ended"; else -> "active" }
}

private fun String.filterDigits(): String = filter(Char::isDigit)
private data class StoryPlaybackRequest(val storyType: String, val storyId: String, val episodeId: String)
internal data class VirtualStepKey(val region: String, val liveId: String, val index: Int)
private data class VirtualStepRequest(val key: VirtualStepKey, val nonce: Long)
