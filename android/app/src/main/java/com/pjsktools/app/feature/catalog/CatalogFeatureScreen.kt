package com.pjsktools.app.feature.catalog
import com.pjsktools.app.feature.display.P3FilterChip
import com.pjsktools.app.feature.display.P3Button
import com.pjsktools.app.feature.display.P3OutlinedButton
import com.pjsktools.app.feature.display.P3OutlinedTextField
import com.pjsktools.app.feature.display.P3TextButton

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pjsktools.app.feature.display.displayCount
import com.pjsktools.app.feature.display.displayDecimal
import com.pjsktools.app.feature.display.SavedListAnchor
import com.pjsktools.app.feature.display.recordVisibleListAnchor
import kotlinx.coroutines.delay
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.first

@Composable
fun CatalogFeatureScreen(
    baseUrl: String,
    region: String,
    modifier: Modifier = Modifier,
    initialType: CatalogType = CatalogType.SONGS,
    navigationTarget: CatalogNavigationTarget? = null,
    onNavigateRelated: (CatalogNavigationTarget) -> Unit,
    repository: CatalogRepository = remember(baseUrl) { CatalogRepository(baseUrl) }
) {
    var type by rememberSaveable { mutableStateOf(initialType) }
    var searchInput by rememberSaveable { mutableStateOf("") }
    var query by rememberSaveable { mutableStateOf("") }
    var page by rememberSaveable { mutableIntStateOf(1) }
    var pageSize by rememberSaveable { mutableIntStateOf(24) }
    var reloadKey by remember { mutableIntStateOf(0) }
    var detailReloadKey by remember { mutableIntStateOf(0) }
    var costumeFilters by rememberSaveable(stateSaver = costumeFiltersSaver) { mutableStateOf(CostumeFilters()) }
    var costumeFiltersExpanded by rememberSaveable { mutableStateOf(false) }
    var pageData by remember { mutableStateOf<CatalogPage?>(null) }
    var technicalDetailsExpanded by rememberSaveable { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var selectedItem by remember { mutableStateOf<CatalogItem?>(null) }
    var detailRequest by remember { mutableStateOf<CatalogItem?>(null) }
    var detailStack by remember { mutableStateOf<List<CatalogDetail>>(emptyList()) }
    var detail by remember { mutableStateOf<CatalogDetail?>(null) }
    var detailLoading by remember { mutableStateOf(false) }
    var detailError by remember { mutableStateOf<String?>(null) }
    var savedDetailId by rememberSaveable { mutableStateOf<String?>(null) }
    var savedDetailType by rememberSaveable { mutableStateOf<String?>(null) }
    var savedDetailTitle by rememberSaveable { mutableStateOf("") }
    var savedDetailPath by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var savedDetailListContext by rememberSaveable { mutableStateOf<String?>(null) }
    var handledNavigationTarget by rememberSaveable { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()
    var listAnchorAbsoluteIndex by rememberSaveable { mutableIntStateOf(0) }
    var listAnchorOffset by rememberSaveable { mutableIntStateOf(0) }
    var restoreListAnchor by remember { mutableStateOf(false) }
    var restoreSavedListAnchor by remember { mutableStateOf(true) }
    var restoreDetailOnFirstLoad by remember { mutableStateOf(true) }

    fun clearSavedDetailContext() {
        savedDetailId = null
        savedDetailType = null
        savedDetailTitle = ""
        savedDetailPath = emptyList()
        savedDetailListContext = null
    }

    fun currentListContext() = catalogListContext(region, type, query, page, pageSize, costumeFilters)

    LaunchedEffect(searchInput) {
        delay(350)
        val next = searchInput.trim()
        if (query != next) {
            query = next
            page = 1
        }
    }
    LaunchedEffect(region, type, query, page, pageSize, costumeFilters, reloadKey) {
        val restoringFirstLoad = restoreDetailOnFirstLoad
        if (catalogShouldClearPersistedDetail(restoringFirstLoad, savedDetailListContext, currentListContext())) clearSavedDetailContext()
        loading = true
        error = null
        pageData = null
        selectedItem = null
        detailRequest = null
        detailStack = emptyList()
        detail = null
        try {
            val result = repository.catalog(region, type, query, page, pageSize, costumeFilters)
            currentCoroutineContext().ensureActive()
            pageData = result
            if (catalogShouldRestoreDetail(restoringFirstLoad, selectedItem == null, savedDetailId) ) {
                val restoredType = savedDetailType?.let { value -> CatalogType.entries.firstOrNull { it.name == value } }
                val restored = restoredType?.let { type ->
                    result.items.firstOrNull { it.id == savedDetailId && it.type == type }
                        ?: CatalogItem(savedDetailId.orEmpty(), type, savedDetailTitle.ifBlank { "图鉴条目" })
                }
                if (restored != null) {
                    selectedItem = restored
                    detailRequest = restored
                }
            }
            loading = false
            restoreDetailOnFirstLoad = catalogRestoreIntentAfterLoad(restoringFirstLoad, loadSucceeded = true)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (failure: Throwable) {
            currentCoroutineContext().ensureActive()
            error = failure.message ?: "图鉴加载失败"
            loading = false
            restoreDetailOnFirstLoad = catalogRestoreIntentAfterLoad(restoringFirstLoad, loadSucceeded = false)
        }
    }
    LaunchedEffect(region, detailRequest, detailReloadKey) {
        val target = detailRequest ?: return@LaunchedEffect
        detailLoading = true
        detailError = null
        detail = null
        try {
            val result = repository.detail(region, target)
            currentCoroutineContext().ensureActive()
            detail = result
            detailLoading = false
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (failure: Throwable) {
            currentCoroutineContext().ensureActive()
            detailError = failure.message ?: "详情加载失败"
            detailLoading = false
        }
    }
    LaunchedEffect(region, navigationTarget) {
        val target = navigationTarget ?: return@LaunchedEffect
        val item = target.toCatalogItemOrNull()
        if (item == null) {
            onNavigateRelated(target)
        } else {
            val token = encodeDetailPathItem(item)
            if (!catalogShouldHandleNavigation(handledNavigationTarget, token)) {
                return@LaunchedEffect
            }
            handledNavigationTarget = token
            detail?.let {
                detailStack = detailStack + it
                savedDetailPath = savedDetailPath + encodeDetailPathItem(it.item)
            }
            selectedItem = item
            detail = null
            detailRequest = item
            savedDetailId = item.id
            savedDetailType = item.type.name
            savedDetailTitle = item.title
            savedDetailListContext = currentListContext()
        }
    }

    fun captureListAnchor() {
        val saved = recordVisibleListAnchor(
            current = SavedListAnchor(listAnchorAbsoluteIndex, listAnchorOffset),
            visibleIndex = listState.firstVisibleItemIndex,
            visibleOffset = listState.firstVisibleItemScrollOffset,
            canRecord = true
        )
        listAnchorAbsoluteIndex = saved.index
        listAnchorOffset = saved.offset
    }

    val openRelated: (CatalogNavigationTarget) -> Unit = { target ->
        val item = target.toCatalogItemOrNull()
        if (item == null) {
            onNavigateRelated(target)
        } else {
            detail?.let {
                detailStack = detailStack + it
                savedDetailPath = savedDetailPath + encodeDetailPathItem(it.item)
            }
            selectedItem = item
            detail = null
            detailRequest = item
            savedDetailId = item.id
            savedDetailType = item.type.name
            savedDetailTitle = item.title
            savedDetailListContext = currentListContext()
        }
    }
    val closeDetail: () -> Unit = {
        val parent = detailStack.lastOrNull()
        val restoredParent = savedDetailPath.lastOrNull()?.let(::decodeDetailPathItem)
        if (parent == null && restoredParent == null) {
            restoreListAnchor = true
            selectedItem = null
            detail = null
            detailRequest = null
            clearSavedDetailContext()
        } else {
            detailStack = detailStack.dropLast(1)
            savedDetailPath = savedDetailPath.dropLast(1)
            val parentItem = parent?.item ?: restoredParent!!
            selectedItem = parentItem
            detail = parent
            detailRequest = if (parent == null) parentItem else null
            savedDetailId = parentItem.id
            savedDetailType = parentItem.type.name
            savedDetailTitle = parentItem.title
        }
    }
    BackHandler(enabled = selectedItem != null) { closeDetail() }
    fun headerItemCount() = 5 + if (type == CatalogType.COSTUMES) {
        1 + if (costumeFiltersExpanded) 1 else 0
    } else 0
    LaunchedEffect(restoreListAnchor, restoreSavedListAnchor, selectedItem, pageData?.items) {
        if ((!restoreListAnchor && !restoreSavedListAnchor) || selectedItem != null || pageData == null) return@LaunchedEffect
        snapshotFlow { listState.layoutInfo.totalItemsCount }
            .first { total -> catalogCanRestoreListAnchor(total, listAnchorAbsoluteIndex) }
        listState.scrollToItem(listAnchorAbsoluteIndex, listAnchorOffset)
        restoreListAnchor = false
        restoreSavedListAnchor = false
    }
    LaunchedEffect(listState, pageData?.items, selectedItem, restoreListAnchor, restoreSavedListAnchor) {
        if (pageData == null || selectedItem != null || restoreListAnchor || restoreSavedListAnchor) return@LaunchedEffect
        snapshotFlow { listState.firstVisibleItemIndex to listState.firstVisibleItemScrollOffset }
            .collect { (index, offset) ->
                val saved = recordVisibleListAnchor(
                    current = SavedListAnchor(listAnchorAbsoluteIndex, listAnchorOffset),
                    visibleIndex = index,
                    visibleOffset = offset,
                    canRecord = pageData != null && selectedItem == null && !restoreListAnchor && !restoreSavedListAnchor
                )
                listAnchorAbsoluteIndex = saved.index
                listAnchorOffset = saved.offset
            }
    }
    LaunchedEffect(selectedItem?.type, selectedItem?.id) {
        if (selectedItem != null) listState.scrollToItem(headerItemCount())
    }

    Column(modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        LazyColumn(
            modifier = Modifier.weight(1f),
            state = listState,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item { Text("图鉴资料", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold) }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(CatalogType.entries) { option ->
                        P3FilterChip(selected = option == type, onClick = { type = option; page = 1 }, label = { Text(option.displayName) })
                    }
                }
            }
            item {
                P3OutlinedTextField(
                    value = searchInput, onValueChange = { searchInput = it }, label = { Text("搜索名称、角色、分类或 ID") },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                    trailingIcon = { if (searchInput.isNotEmpty()) P3TextButton(onClick = { searchInput = "" }) { Text("清除") } }
                )
            }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(listOf(24, 48, 96)) { size ->
                        P3FilterChip(selected = pageSize == size, onClick = { pageSize = size; page = 1 }, label = { Text("每页 $size") })
                    }
                }
            }
            if (type == CatalogType.COSTUMES) {
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("服装筛选${costumeFilters.activeCount().takeIf { it > 0 }?.let { "（已选 $it）" }.orEmpty()}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        P3TextButton(onClick = { costumeFiltersExpanded = !costumeFiltersExpanded }) { Text(if (costumeFiltersExpanded) "收起筛选" else "展开筛选") }
                    }
                }
                if (costumeFiltersExpanded) item {
                    CostumeFilterPanel(value = costumeFilters, onChange = { costumeFilters = it; page = 1 })
                }
            }
            item {
                when {
                    loading -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator() }
                    error != null -> ErrorCard(error.orEmpty()) { reloadKey++ }
                    else -> pageData?.let { data ->
                        CatalogDataStatus(
                            data = data,
                            technicalDetailsExpanded = technicalDetailsExpanded,
                            onToggleTechnicalDetails = { technicalDetailsExpanded = !technicalDetailsExpanded }
                        )
                    }
                }
            }
            selectedItem?.let { selected ->
                item {
                    DetailCard(
                        baseUrl = baseUrl,
                        selected = selected,
                        detail = detail,
                        loading = detailLoading,
                        error = detailError,
                        onRetry = { detailReloadKey++ },
                        onNavigateRelated = openRelated,
                        onClose = closeDetail
                    )
                }
            }
            val rows = pageData?.items.orEmpty()
            if (!loading && error == null && rows.isEmpty()) {
                item { Text(pageData?.unavailableReason ?: "没有符合条件的真实图鉴数据。") }
            }
            items(rows, key = { "catalog:${it.type.apiName}:${it.id}" }) { item ->
                CatalogItemCard(baseUrl, item) {
                    captureListAnchor()
                    detailStack = emptyList()
                    savedDetailPath = emptyList()
                    selectedItem = item
                    detail = null
                    detailRequest = item
                    savedDetailId = item.id
                    savedDetailType = item.type.name
                    savedDetailTitle = item.title
                    savedDetailListContext = currentListContext()
                }
            }
        }
        pageData?.let { data ->
            PaginationRow(
                page = data.page,
                totalPages = data.totalPages,
                onPrevious = { page = (data.page - 1).coerceAtLeast(1) },
                onNext = { page = (data.page + 1).coerceAtMost(data.totalPages) }
            )
        }
    }
}

private fun CatalogNavigationTarget.toCatalogItemOrNull(): CatalogItem? {
    val type = when (kind) {
        RelatedKind.SONG -> CatalogType.SONGS
        RelatedKind.CARD -> CatalogType.CARDS
        RelatedKind.GACHA -> CatalogType.GACHAS
        RelatedKind.EVENT, RelatedKind.DISPLAY_ONLY -> return null
    }
    return CatalogItem(id = id, type = type, title = title)
}

@Composable
private fun CatalogItemCard(baseUrl: String, item: CatalogItem, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            RemoteCatalogImage(
                baseUrl = baseUrl,
                candidates = item.assetUrls,
                contentDescription = item.title,
                aspectRatio = catalogListImageAspectRatio(item.type),
                contentScale = catalogListContentScale(item.type)
            )
            Text(item.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            CatalogItemMetadata(item)
            Text("编号 ${item.id}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun DetailCard(
    baseUrl: String,
    selected: CatalogItem,
    detail: CatalogDetail?,
    loading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    onNavigateRelated: (CatalogNavigationTarget) -> Unit,
    onClose: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    "${selected.title} · 详情",
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                P3TextButton(onClick = onClose) { Text("关闭") }
            }
            when {
                loading -> CircularProgressIndicator()
                error != null -> Column {
                    Text(error, color = MaterialTheme.colorScheme.error)
                    P3Button(onClick = onRetry) { Text("重试详情") }
                }
                detail != null -> DetailContent(baseUrl, detail, onNavigateRelated)
            }
        }
    }
}

@Composable
private fun DetailContent(
    baseUrl: String,
    detail: CatalogDetail,
    onNavigateRelated: (CatalogNavigationTarget) -> Unit
) {
    var selectedChartName by rememberSaveable(detail.item.id) { mutableStateOf<String?>(null) }
    when (detail) {
        is SongCatalogDetail -> {
            RemoteCatalogImage(baseUrl, detail.assetUrls, detail.item.title, aspectRatio = 1f, contentScale = ContentScale.Crop)
            Text(listOfNotNull(detail.unit, detail.durationSeconds?.let { "${displayCount(it.toLong())} 秒" }, detail.bpm?.let { "BPM ${displayDecimal(it)}" }).joinToString(" · "))
            if (detail.categories.isNotEmpty()) Text("分类：${detail.categories.joinToString(" / ")}")
            DetailDescription(detail.item)
            SectionTitle("谱面")
            detail.difficulties.forEach { difficulty ->
                val chart = detail.charts.firstOrNull { it.difficulty.equals(difficulty.difficulty, ignoreCase = true) }
                    P3OutlinedButton(onClick = { selectedChartName = chart?.difficulty }, enabled = chart != null) {
                    Text("${difficulty.difficulty.uppercase()} · Lv.${displayCount(difficulty.playLevel?.toLong())} · ${displayCount(difficulty.totalNoteCount?.toLong())} 音符")
                }
            }
            detail.charts.firstOrNull { it.difficulty == selectedChartName }?.let { chart ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.medium,
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(
                                "${chart.difficulty.uppercase()} 真实谱面",
                                modifier = Modifier.weight(1f),
                                fontWeight = FontWeight.Bold,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            P3TextButton(onClick = { selectedChartName = null }) { Text("收起") }
                        }
                        if (chart.imageCandidates.isNotEmpty()) {
                            RemoteCatalogImage(baseUrl, chart.imageCandidates, "${detail.item.title} ${chart.difficulty} 谱面", heightDp = 480)
                        } else {
                            Text(chart.unavailableReason ?: "后端未提供该难度的真实谱面资源")
                        }
                        chart.susUrl?.let { Text("SUS 数据：$it", style = MaterialTheme.typography.bodySmall) }
                    }
                }
            }
            RelatedItems("相关活动", detail.relatedEvents, onNavigateRelated)
            RelatedItems("演唱版本", detail.vocals, onNavigateRelated)
        }
        is CardCatalogDetail -> {
            RemoteCatalogImage(baseUrl, detail.normalImageCandidates, "${detail.item.title} 特训前", aspectRatio = 2338f / 1440f)
            CatalogItemMetadata(detail.item, character = detail.character, attribute = detail.attribute, rarity = detail.rarity?.toString())
            DetailDescription(detail.item)
            if ((detail.rarity ?: 0) >= 3) {
                SectionTitle("特训后")
                RemoteCatalogImage(baseUrl, detail.afterTrainingImageCandidates, "${detail.item.title} 特训后", aspectRatio = 2338f / 1440f)
            }
            SkillBlock("技能", detail.skill)
            SkillBlock("特训后技能", detail.specialTrainingSkill)
            RelatedItems("相关活动", detail.relatedEvents, onNavigateRelated)
            RelatedItems("相关卡池", detail.relatedGachas, onNavigateRelated)
        }
        is CollectionCatalogDetail -> {
            RemoteCatalogImage(
                baseUrl, detail.assetUrls, detail.item.title,
                aspectRatio = catalogDetailImageAspectRatio(detail.item.type)
            )
            CatalogItemMetadata(detail.item)
            DetailDescription(detail.item)
            detail.costume?.let { costume ->
                SectionTitle("服装信息")
                Text("部件：${costume.partTypes.joinToString(" / ", transform = ::costumePartTypeLabel).ifBlank { "缺失" }}")
                Text("来源：${costume.source?.let(::costumeSourceLabel) ?: "未知"} · 稀有度：${costume.rarity?.let(::costumeRarityLabel) ?: "未知"}")
                Text("性别：${costume.gender?.let(::costumeGenderLabel) ?: "未知"}${costume.designer?.let { " · 设计：$it" }.orEmpty()}")
                if (costume.characterIds.isNotEmpty()) Text("适用角色：${costume.characterIds.joinToString("、")}")
                costume.partVariants.forEach { (part, variants) -> Text("${costumePartTypeLabel(part)}：${variants.joinToString("、")}") }
                costume.extraParts.forEach { extra ->
                    Text("${extra.partType?.let(::costumePartTypeLabel) ?: "extra"} / 角色 ${extra.characterId ?: "-"}：${extra.variants.joinToString("、")}")
                }
            }
            RelatedItems("相关卡牌", detail.relatedCards, onNavigateRelated)
        }
    }
}

@Composable
private fun SkillBlock(title: String, skill: SkillDetail?) {
    SectionTitle(title)
    if (skill == null) {
        Text("真实技能数据暂不可用。")
        return
    }
    Text(skill.name ?: "技能 ID ${skill.id}", fontWeight = FontWeight.SemiBold)
    if (skill.descriptionsByLevel.isEmpty()) Text("技能参数缺失")
    skill.descriptionsByLevel.toSortedMap().forEach { (level, value) -> Text("Lv.$level：$value") }
    if (skill.missingFields.isNotEmpty()) Text("缺少：${skill.missingFields.joinToString("、")}", style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun RelatedItems(
    title: String,
    entries: List<RelatedItem>,
    onNavigateRelated: (CatalogNavigationTarget) -> Unit
) {
    if (entries.isEmpty()) return
    SectionTitle(title)
    entries.take(30).forEach { entry ->
        val subtitle = entry.subtitle?.let { catalogCategoryLabel(entry.kind, it) }
        val label = "${entry.title}${subtitle?.let { value -> " · $value" }.orEmpty()} · ID ${entry.id}"
        if (entry.kind == RelatedKind.DISPLAY_ONLY) {
            Text(label)
        } else {
            P3TextButton(onClick = { onNavigateRelated(CatalogNavigationTarget(entry.kind, entry.id, entry.title)) }) {
                Text(label)
            }
        }
    }
}

@Composable
private fun CostumeFilterPanel(value: CostumeFilters, onChange: (CostumeFilters) -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("服装筛选", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            P3OutlinedTextField(value.partType, { onChange(value.copy(partType = it)) }, label = { Text("部件：body / hair / head") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            P3OutlinedTextField(value.source, { onChange(value.copy(source = it)) }, label = { Text("来源：card / shop / other") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            P3OutlinedTextField(value.rarity, { onChange(value.copy(rarity = it)) }, label = { Text("稀有度：rare / normal") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            P3OutlinedTextField(value.gender, { onChange(value.copy(gender = it)) }, label = { Text("性别：female / male") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            P3OutlinedTextField(
                value.characterId,
                { next -> onChange(value.copy(characterId = next.filter(Char::isDigit))) },
                label = { Text("角色 ID") }, singleLine = true, modifier = Modifier.fillMaxWidth()
            )
            P3TextButton(onClick = { onChange(CostumeFilters()) }) { Text("清除服装筛选") }
        }
    }
}

private val costumeFiltersSaver = listSaver<CostumeFilters, String>(
    save = { listOf(it.partType, it.source, it.rarity, it.gender, it.characterId) },
    restore = { CostumeFilters(it[0], it[1], it[2], it[3], it[4]) }
)

private fun encodeDetailPathItem(item: CatalogItem): String = listOf(item.type.name, item.id, item.title).joinToString("\u001f")
private fun decodeDetailPathItem(value: String): CatalogItem? {
    val parts = value.split("\u001f")
    val type = parts.firstOrNull()?.let { typeName -> CatalogType.entries.firstOrNull { it.name == typeName } } ?: return null
    val id = parts.getOrNull(1).orEmpty().takeIf(String::isNotBlank) ?: return null
    return CatalogItem(id, type, parts.getOrNull(2).orEmpty().ifBlank { "图鉴条目" })
}

internal fun catalogShouldClearPersistedDetail(
    firstDataLoad: Boolean,
    savedListContext: String? = null,
    activeListContext: String? = null
): Boolean = !firstDataLoad || (savedListContext != null && savedListContext != activeListContext)
internal fun catalogShouldRestoreDetail(firstDataLoad: Boolean, noActiveDetail: Boolean, savedDetailId: String?): Boolean =
    firstDataLoad && noActiveDetail && !savedDetailId.isNullOrBlank()
internal fun catalogShouldHandleNavigation(handledToken: String?, nextToken: String): Boolean = handledToken != nextToken
internal fun catalogCanRestoreListAnchor(totalItems: Int, savedIndex: Int): Boolean = totalItems > savedIndex
internal fun catalogRestoreIntentAfterLoad(currentIntent: Boolean, loadSucceeded: Boolean): Boolean =
    currentIntent && !loadSucceeded
internal fun catalogListContext(
    region: String,
    type: CatalogType,
    query: String,
    page: Int,
    pageSize: Int,
    filters: CostumeFilters
): String = listOf(region, type.name, query, page, pageSize, filters.partType, filters.source, filters.rarity, filters.gender, filters.characterId)
    .joinToString("\u001f")

@Composable
private fun CatalogItemMetadata(
    item: CatalogItem,
    character: String? = item.character,
    attribute: String? = item.attribute,
    rarity: String? = item.rarity
) {
    val values = if (item.type == CatalogType.CARDS) {
        listOfNotNull(character, attribute?.let { "属性：${playerAttributeLabel(it)}" }, rarity?.let { "星级 $it" })
    } else if (item.type == CatalogType.COSTUMES) {
        listOfNotNull(
            item.partTypes.takeIf { it.isNotEmpty() }?.joinToString(" / ", transform = ::costumePartTypeLabel),
            item.source?.let { "来源：${costumeSourceLabel(it)}" },
            item.category?.let { "类型：${costumeTypeLabel(it)}" },
            rarity?.let { "稀有度：${costumeRarityLabel(it)}" }
        )
    } else {
        listOfNotNull(
            item.subtitle?.let { catalogCategoryLabel(item.type, it) },
            item.category?.takeUnless { it == item.subtitle }?.let { catalogCategoryLabel(item.type, it) },
            rarity?.let { "稀有度 $it" }
        )
    }
    if (values.isNotEmpty()) Text(values.joinToString(" · "), style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun DetailDescription(item: CatalogItem) {
    item.description?.let { Text(it) }
    if (item.startAt != null || item.endAt != null) {
        Text("开放时间：${item.startAt ?: "-"} ～ ${item.endAt ?: "-"}", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun CatalogDataStatus(
    data: CatalogPage,
    technicalDetailsExpanded: Boolean,
    onToggleTechnicalDetails: () -> Unit
) {
    Text("共 ${data.total} 项 · ${catalogSourceStatusLabel(data.sourceStatus)}", style = MaterialTheme.typography.bodySmall)
    val technicalDetails = listOfNotNull(
        data.sourceStatus?.let { "资料状态：$it" },
        data.syncedAt?.let { "同步时间：$it" },
        data.masterVersion?.let { "资料版本：$it" },
        data.source?.let { "资料来源：$it" },
        data.unavailableReason?.let { "说明：$it" }
    )
    if (technicalDetails.isNotEmpty()) {
        P3TextButton(onClick = onToggleTechnicalDetails) {
            Text(if (technicalDetailsExpanded) "收起技术信息" else "查看技术信息")
        }
        if (technicalDetailsExpanded) {
            technicalDetails.forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

internal fun catalogSourceStatusLabel(value: String?): String = when (value) {
    "fresh", "ready", "ok" -> "资料已同步"
    "stale-refreshing" -> "资料正在更新"
    "missing-data" -> "部分资料尚未同步"
    "source-unavailable" -> "资料来源暂时不可用"
    "empty" -> "当前暂无可用资料"
    null, "" -> "资料状态待确认"
    else -> "资料状态待确认"
}

internal fun catalogCategoryLabel(type: CatalogType, value: String): String =
    if (type == CatalogType.GACHAS) when (value) {
        "normal" -> "普通卡池"
        "ceil" -> "卡池资料"
        else -> value
    } else value

private fun catalogCategoryLabel(kind: RelatedKind, value: String): String =
    if (kind == RelatedKind.GACHA) catalogCategoryLabel(CatalogType.GACHAS, value) else value

internal fun costumePartTypeLabel(value: String): String = when (value.lowercase()) {
    "body" -> "衣装"
    "hair" -> "发型"
    "head" -> "头饰"
    else -> value
}

internal fun costumeSourceLabel(value: String): String = when (value.lowercase()) {
    "card" -> "卡牌"
    "shop" -> "商店"
    "other" -> "其他"
    else -> value
}

internal fun costumeTypeLabel(value: String): String = when (value.lowercase()) {
    "normal" -> "普通"
    else -> value
}

internal fun costumeRarityLabel(value: String): String = when (value.lowercase()) {
    "normal" -> "常驻"
    "rare" -> "稀有"
    else -> value
}

internal fun costumeGenderLabel(value: String): String = when (value.lowercase()) {
    "female" -> "女性"
    "male" -> "男性"
    else -> value
}

internal fun playerAttributeLabel(value: String): String = when (value.lowercase()) {
    "cool" -> "冷酷"
    "cute" -> "可爱"
    "happy" -> "活力"
    "mysterious" -> "神秘"
    "pure" -> "纯真"
    else -> value
}

internal fun CostumeFilters.activeCount(): Int = listOf(partType, source, rarity, gender, characterId)
    .count(String::isNotBlank)

@Composable
private fun SectionTitle(text: String) {
    Divider()
    Text(text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
}

@Composable
private fun ErrorCard(message: String, onRetry: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(message, color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
            P3Button(onClick = onRetry) { Text("重试") }
        }
    }
}

@Composable
private fun PaginationRow(page: Int, totalPages: Int, onPrevious: () -> Unit, onNext: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        P3OutlinedButton(onClick = onPrevious, enabled = page > 1) { Text("上一页") }
        Text("第 $page / $totalPages 页", modifier = Modifier.padding(top = 12.dp))
        P3OutlinedButton(onClick = onNext, enabled = page < totalPages) { Text("下一页") }
    }
}
