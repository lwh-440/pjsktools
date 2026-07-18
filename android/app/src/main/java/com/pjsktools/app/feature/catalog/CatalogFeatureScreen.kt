package com.pjsktools.app.feature.catalog

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
import androidx.compose.material3.Button
import androidx.compose.material3.Card
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive

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
    var costumeFilters by remember { mutableStateOf(CostumeFilters()) }
    var pageData by remember { mutableStateOf<CatalogPage?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var selectedItem by remember { mutableStateOf<CatalogItem?>(null) }
    var detailRequest by remember { mutableStateOf<CatalogItem?>(null) }
    var detailStack by remember { mutableStateOf<List<CatalogDetail>>(emptyList()) }
    var detail by remember { mutableStateOf<CatalogDetail?>(null) }
    var detailLoading by remember { mutableStateOf(false) }
    var detailError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(searchInput) {
        delay(350)
        val next = searchInput.trim()
        if (query != next) {
            query = next
            page = 1
        }
    }
    LaunchedEffect(region, type, query, page, pageSize, costumeFilters, reloadKey) {
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
            loading = false
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (failure: Throwable) {
            currentCoroutineContext().ensureActive()
            error = failure.message ?: "图鉴加载失败"
            loading = false
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
            detail?.let { detailStack = detailStack + it }
            selectedItem = item
            detail = null
            detailRequest = item
        }
    }

    val openRelated: (CatalogNavigationTarget) -> Unit = { target ->
        val item = target.toCatalogItemOrNull()
        if (item == null) {
            onNavigateRelated(target)
        } else {
            detail?.let { detailStack = detailStack + it }
            selectedItem = item
            detail = null
            detailRequest = item
        }
    }
    val closeDetail: () -> Unit = {
        val parent = detailStack.lastOrNull()
        if (parent == null) {
            selectedItem = null
            detail = null
            detailRequest = null
        } else {
            detailStack = detailStack.dropLast(1)
            selectedItem = parent.item
            detail = parent
            detailRequest = null
        }
    }

    Column(modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("图鉴资料", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(CatalogType.entries) { option ->
                FilterChip(
                    selected = option == type,
                    onClick = { type = option; page = 1 },
                    label = { Text(option.displayName) }
                )
            }
        }
        OutlinedTextField(
            value = searchInput,
            onValueChange = { searchInput = it },
            label = { Text("搜索名称、角色、分类或 ID") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            trailingIcon = { if (searchInput.isNotEmpty()) TextButton(onClick = { searchInput = "" }) { Text("清除") } }
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(listOf(24, 48, 96)) { size ->
                FilterChip(
                    selected = pageSize == size,
                    onClick = { pageSize = size; page = 1 },
                    label = { Text("每页 $size") }
                )
            }
        }
        if (type == CatalogType.COSTUMES) {
            CostumeFilterPanel(
                value = costumeFilters,
                onChange = { costumeFilters = it; page = 1 }
            )
        }
        when {
            loading -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator() }
            error != null -> ErrorCard(error.orEmpty()) { reloadKey++ }
            else -> pageData?.let { data ->
                Text(
                    listOfNotNull(
                        "共 ${data.total} 项",
                        data.sourceStatus?.let { "数据状态：$it" },
                        data.syncedAt?.let { "同步：$it" },
                        data.masterVersion?.let { "版本：$it" },
                        data.source?.let { "来源：$it" },
                        data.unavailableReason
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }

        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
            items(rows, key = { "${it.type.apiName}:${it.id}" }) { item ->
                CatalogItemCard(baseUrl, item) {
                    detailStack = emptyList()
                    selectedItem = item
                    detail = null
                    detailRequest = item
                }
            }
            item {
                pageData?.let { data ->
                    PaginationRow(
                        page = data.page,
                        totalPages = data.totalPages,
                        onPrevious = { page = (data.page - 1).coerceAtLeast(1) },
                        onNext = { page = (data.page + 1).coerceAtMost(data.totalPages) }
                    )
                }
                Spacer(Modifier.height(6.dp))
            }
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
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            RemoteCatalogImage(
                baseUrl = baseUrl,
                candidates = item.assetUrls,
                contentDescription = item.title,
                aspectRatio = catalogImageAspectRatio(item.type)
            )
            Text(item.title, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            item.subtitle?.let { Text(it) }
            Text("ID ${item.id}", style = MaterialTheme.typography.bodySmall)
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
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${selected.title} · 详情", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                TextButton(onClick = onClose) { Text("关闭") }
            }
            when {
                loading -> CircularProgressIndicator()
                error != null -> Column {
                    Text(error, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry) { Text("重试详情") }
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
    var selectedChart by remember(detail.item.id) { mutableStateOf<ChartAsset?>(null) }
    detail.item.description?.let { Text(it) }
    if (detail.item.startAt != null || detail.item.endAt != null) {
        Text("开放时间：${detail.item.startAt ?: "-"} ～ ${detail.item.endAt ?: "-"}")
    }
    when (detail) {
        is SongCatalogDetail -> {
            RemoteCatalogImage(baseUrl, detail.assetUrls, detail.item.title, heightDp = 220)
            Text(listOfNotNull(detail.unit, detail.durationSeconds?.let { "${it}s" }, detail.bpm?.let { "BPM $it" }).joinToString(" · "))
            if (detail.categories.isNotEmpty()) Text("分类：${detail.categories.joinToString(" / ")}")
            SectionTitle("谱面")
            detail.difficulties.forEach { difficulty ->
                val chart = detail.charts.firstOrNull { it.difficulty.equals(difficulty.difficulty, ignoreCase = true) }
                OutlinedButton(onClick = { selectedChart = chart }, enabled = chart != null) {
                    Text("${difficulty.difficulty.uppercase()} · Lv.${difficulty.playLevel ?: "-"} · ${difficulty.totalNoteCount ?: "-"} notes")
                }
            }
            selectedChart?.let { chart ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("${chart.difficulty.uppercase()} 真实谱面", fontWeight = FontWeight.Bold)
                            TextButton(onClick = { selectedChart = null }) { Text("收起") }
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
            Text(listOfNotNull(detail.character, detail.rarity?.let { "星级 $it" }, detail.attribute).joinToString(" · "))
            SectionTitle("特训前")
            RemoteCatalogImage(baseUrl, detail.normalImageCandidates, "${detail.item.title} 特训前", heightDp = 300)
            if ((detail.rarity ?: 0) >= 3) {
                SectionTitle("特训后")
                RemoteCatalogImage(baseUrl, detail.afterTrainingImageCandidates, "${detail.item.title} 特训后", heightDp = 300)
            }
            SkillBlock("技能", detail.skill)
            SkillBlock("特训后技能", detail.specialTrainingSkill)
            RelatedItems("相关活动", detail.relatedEvents, onNavigateRelated)
            RelatedItems("相关卡池", detail.relatedGachas, onNavigateRelated)
        }
        is CollectionCatalogDetail -> {
            RemoteCatalogImage(
                baseUrl, detail.assetUrls, detail.item.title,
                aspectRatio = catalogImageAspectRatio(detail.item.type)
            )
            Text(listOfNotNull(detail.item.category, detail.item.rarity).joinToString(" · "))
            detail.costume?.let { costume ->
                SectionTitle("服装信息")
                Text("部件：${costume.partTypes.joinToString(" / ").ifBlank { "缺失" }}")
                Text("来源：${costume.source ?: "未知"} · 稀有度：${costume.rarity ?: "未知"}")
                Text("性别：${costume.gender ?: "未知"}${costume.designer?.let { " · 设计：$it" }.orEmpty()}")
                if (costume.characterIds.isNotEmpty()) Text("适用角色：${costume.characterIds.joinToString("、")}")
                costume.partVariants.forEach { (part, variants) -> Text("$part：${variants.joinToString("、")}") }
                costume.extraParts.forEach { extra ->
                    Text("${extra.partType ?: "extra"} / 角色 ${extra.characterId ?: "-"}：${extra.variants.joinToString("、")}")
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
        val label = "${entry.title}${entry.subtitle?.let { value -> " · $value" }.orEmpty()} · ID ${entry.id}"
        if (entry.kind == RelatedKind.DISPLAY_ONLY) {
            Text(label)
        } else {
            TextButton(onClick = { onNavigateRelated(CatalogNavigationTarget(entry.kind, entry.id, entry.title)) }) {
                Text(label)
            }
        }
    }
}

@Composable
private fun CostumeFilterPanel(value: CostumeFilters, onChange: (CostumeFilters) -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("服装筛选", fontWeight = FontWeight.Bold)
            OutlinedTextField(value.partType, { onChange(value.copy(partType = it)) }, label = { Text("部件：body / hair / head") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value.source, { onChange(value.copy(source = it)) }, label = { Text("来源：card / shop / other") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value.rarity, { onChange(value.copy(rarity = it)) }, label = { Text("稀有度：rare / normal") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value.gender, { onChange(value.copy(gender = it)) }, label = { Text("性别：female / male") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(
                value.characterId,
                { next -> onChange(value.copy(characterId = next.filter(Char::isDigit))) },
                label = { Text("角色 ID") }, singleLine = true, modifier = Modifier.fillMaxWidth()
            )
            TextButton(onClick = { onChange(CostumeFilters()) }) { Text("清除服装筛选") }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Divider()
    Text(text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
}

@Composable
private fun ErrorCard(message: String, onRetry: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(message, color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
            Button(onClick = onRetry) { Text("重试") }
        }
    }
}

@Composable
private fun PaginationRow(page: Int, totalPages: Int, onPrevious: () -> Unit, onNext: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        OutlinedButton(onClick = onPrevious, enabled = page > 1) { Text("上一页") }
        Text("第 $page / $totalPages 页", modifier = Modifier.padding(top = 12.dp))
        OutlinedButton(onClick = onNext, enabled = page < totalPages) { Text("下一页") }
    }
}
