package com.pjsktools.feature.collections

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Sort
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pjsktools.core.designsystem.BackendImage
import com.pjsktools.core.designsystem.CatalogFilterSheet
import com.pjsktools.core.designsystem.FavoriteFolderSheet
import com.pjsktools.core.designsystem.ResultContent
import com.pjsktools.core.designsystem.catalogDetailImageCandidates
import com.pjsktools.core.designsystem.catalogImageAspectRatio
import com.pjsktools.core.designsystem.catalogListImageCandidates
import com.pjsktools.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CollectionsUiState(
    val kind: CatalogKind = CatalogKind.GACHA, val query: CatalogQuery = CatalogQuery(),
    val result: DataResult<Page<CatalogEntry>> = DataResult(), val facets: List<CatalogFacet> = emptyList(),
    val selectedId: String? = null, val region: Region = Region.JP
)

@HiltViewModel
class CollectionsViewModel @Inject constructor(
    private val repository: CollectionsRepository,
    preferences: RegionPreferencesRepository,
    authRepository: AuthRepository,
    private val favoriteRepository: FavoriteRepository,
    private val savedState: SavedStateHandle
) : ViewModel() {
    private val kind = MutableStateFlow(CatalogKind.GACHA)
    private val queries = mutableMapOf<CatalogKind, CatalogQuery>()
    private val query = MutableStateFlow(CatalogQuery(sort = "start-desc"))
    private val selected = MutableStateFlow<String?>(null)
    private val refresh = MutableStateFlow(0)
    private val anchors = ScrollAnchorStore(encoded = savedState["catalog_scroll_anchors"] ?: emptyList())
    private var consumedScrollReset = 0
    private var activatedScrollReset = 0
    private val region = preferences.selectedRegion.filterNotNull().stateIn(viewModelScope, SharingStarted.Eagerly, Region.JP)
    val signedIn = authRepository.state.map { it is AuthState.SignedIn }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)
    val favorites = combine(region, kind, favoriteRepository.favorites) { selectedRegion, selectedKind, items ->
        val type = selectedKind.favoriteType()
        items.filter { it.type == type && it.region == selectedRegion }.associateBy { it.targetId }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())
    val folders = favoriteRepository.folders.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    private val result = combine(region, kind, query, refresh) { r, k, q, token -> arrayOf(r, k, q, token) }
        .flatMapLatest { values -> repository.observe(values[0] as Region, values[1] as CatalogKind, values[2] as CatalogQuery, (values[3] as Int) > 0) }
    private val facets = combine(region, kind) { r, k -> r to k }.flatMapLatest { (r, k) -> repository.observeFacets(r, k) }
    private val displayState = combine(kind, query, result, facets, selected) { k, q, data, facetRows, id -> CollectionsUiState(k, q, data, facetRows, id) }
    val state = combine(displayState, region) { current, selectedRegion -> current.copy(region = selectedRegion) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), CollectionsUiState())
    val detail = combine(region, kind, selected) { r, k, id -> Triple(r, k, id) }.flatMapLatest { (r, k, id) ->
        if (id == null) flowOf(DataResult<CatalogDetail>()) else repository.observeDetail(r, k, id)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DataResult())

    fun selectKind(next: CatalogKind) {
        if (next == kind.value) return
        queries[kind.value] = query.value
        kind.value = next; query.value = queries[next] ?: defaultQuery(next); select(null)
    }
    fun search(value: String) { query.value = query.value.copy(text = value, page = 1) }
    fun sort(value: String) { query.value = query.value.copy(sort = value, page = 1) }
    fun clearFilters() { query.value = query.value.copy(category = null, rarity = null, characterId = null, partType = null, source = null, gender = null, filters = CatalogFilterState(), page = 1) }
    fun filter(key: String, value: String?) { query.value = when (key) {
        else -> {
            val selected = query.value.filters.selected.toMutableMap()
            val values = selected[key].orEmpty().toMutableSet()
            if (value != null && !values.add(value)) values.remove(value)
            if (values.isEmpty()) selected.remove(key) else selected[key] = values
            query.value.copy(
                category = null, rarity = null, characterId = null, partType = null, source = null, gender = null,
                filters = query.value.filters.copy(selected = selected), page = 1
            )
        }
    } }
    fun toggle(key: String, enabled: Boolean) {
        query.value = query.value.copy(
            filters = query.value.filters.copy(toggles = query.value.filters.toggles + (key to enabled)),
            page = 1
        )
    }
    fun page(delta: Int) { query.value = query.value.copy(page = (query.value.page + delta).coerceAtLeast(1)) }
    fun select(id: String?) { selected.value = id; savedState["catalog_detail_id"] = id }
    fun refresh() { refresh.value += 1 }
    fun addFavorite(item: CatalogEntry) = viewModelScope.launch { favoriteRepository.add(item.data.kind.favoriteType(), region.value, item.data.id, item.data.name) }
    fun saveFolders(favorite: Favorite, ids: Set<String>) = viewModelScope.launch { favoriteRepository.setFolders(favorite, ids) }
    fun removeFavorite(favorite: Favorite) = viewModelScope.launch { favoriteRepository.remove(favorite) }
    fun anchor(region: Region, kind: CatalogKind, query: CatalogQuery) = anchors.get(query.scrollKey(region, kind))
    fun saveAnchor(region: Region, kind: CatalogKind, query: CatalogQuery, anchor: ListScrollAnchor) { savedState["catalog_scroll_anchors"] = anchors.put(query.scrollKey(region, kind), anchor) }
    fun consumeScrollReset(token: Int): Boolean {
        if (token <= consumedScrollReset || token <= 0) return false
        consumedScrollReset = token
        return true
    }
    fun activateCatalog(next: CatalogKind, token: Int) {
        selectKind(next)
        if (token <= activatedScrollReset || token <= 0) return
        activatedScrollReset = token
        select(null)
        query.value = query.value.copy(page = 1)
    }

    private fun defaultQuery(kind: CatalogKind) = CatalogQuery(sort = if (kind == CatalogKind.GACHA) "start-desc" else "id-desc")
}

@Composable
fun CollectionsScreen(
    kind: CatalogKind,
    scrollResetToken: Int = 0,
    onLogin: () -> Unit = {},
    openDetailId: String? = null,
    onDetailOpened: () -> Unit = {},
    viewModel: CollectionsViewModel = hiltViewModel()
) {
    LaunchedEffect(kind, scrollResetToken, openDetailId) {
        viewModel.activateCatalog(kind, scrollResetToken)
        openDetailId?.let {
            viewModel.select(it)
            onDetailOpened()
        }
    }
    val state by viewModel.state.collectAsState(); val detail by viewModel.detail.collectAsState()
    val favorites by viewModel.favorites.collectAsState()
    val folders by viewModel.folders.collectAsState()
    val signedIn by viewModel.signedIn.collectAsState()
    var organizingId by rememberSaveable { mutableStateOf<String?>(null) }
    val favoriteAction: (CatalogEntry) -> Unit = { item ->
        if (!signedIn) onLogin()
        else if (item.data.id in favorites) organizingId = item.data.id
        else viewModel.addFavorite(item)
    }
    BackHandler(enabled = state.selectedId != null) { viewModel.select(null) }
    BoxWithConstraints {
        val expanded = maxWidth >= 840.dp
        Row(Modifier.fillMaxSize()) {
            if (!expanded && state.selectedId != null) CatalogDetailPane(state.region, detail, { viewModel.select(null) }, Modifier.fillMaxSize(), favorite = state.selectedId in favorites, onFavorite = favoriteAction)
            else CatalogListPane(state, viewModel, if (state.kind == kind) scrollResetToken else 0, favorites.keys, favoriteAction, Modifier.weight(if (expanded) .55f else 1f))
            if (expanded) {
                VerticalDivider(); Box(Modifier.weight(.45f)) {
                    if (state.selectedId == null) Text(stringResource(R.string.catalog_select_detail), Modifier.padding(24.dp))
                    else CatalogDetailPane(state.region, detail, { viewModel.select(null) }, Modifier.fillMaxSize(), showBack = false, favorite = state.selectedId in favorites, onFavorite = favoriteAction)
                }
            }
        }
    }
    organizingId?.let(favorites::get)?.let { favorite ->
        FavoriteFolderSheet(favorite, folders, false, { organizingId = null }, {
            viewModel.saveFolders(favorite, it); organizingId = null
        }, {
            viewModel.removeFavorite(favorite); organizingId = null
        })
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun CatalogListPane(state: CollectionsUiState, viewModel: CollectionsViewModel, scrollResetToken: Int, favoriteIds: Set<String>, onFavorite: (CatalogEntry) -> Unit, modifier: Modifier) {
    val pageItems = state.result.data?.items.orEmpty()
    val savedAnchor = remember(state.region, state.kind, state.query) { viewModel.anchor(state.region, state.kind, state.query) }
    val initialIndex = savedAnchor?.itemId?.let { id -> pageItems.indexOfFirst { it.data.id == id }.takeIf { it >= 0 } } ?: savedAnchor?.index ?: 0
    val gridState = rememberLazyGridState(initialIndex.coerceAtMost((pageItems.size - 1).coerceAtLeast(0)), savedAnchor?.offset ?: 0)
    LaunchedEffect(pageItems, state.region, state.kind, state.query, scrollResetToken) {
        if (pageItems.isEmpty()) return@LaunchedEffect
        if (viewModel.consumeScrollReset(scrollResetToken)) {
            gridState.scrollToItem(0)
            viewModel.saveAnchor(state.region, state.kind, state.query, ListScrollAnchor(pageItems.first().data.id, 0, 0))
            return@LaunchedEffect
        }
        val anchor=viewModel.anchor(state.region,state.kind,state.query)?:return@LaunchedEffect
        val index=anchor.itemId?.let{id->pageItems.indexOfFirst{it.data.id==id}.takeIf{it>=0}}?:anchor.index
        gridState.scrollToItem(index.coerceIn(0,pageItems.lastIndex),anchor.offset)
    }
    LaunchedEffect(gridState,pageItems,state.region,state.kind,state.query){if(pageItems.isEmpty())return@LaunchedEffect;snapshotFlow{gridState.firstVisibleItemIndex to gridState.firstVisibleItemScrollOffset}.distinctUntilChanged().debounce(150).collect{(index,offset)->viewModel.saveAnchor(state.region,state.kind,state.query,ListScrollAnchor(pageItems.getOrNull(index)?.data?.id,index,offset))}}
    Column(modifier) {
        var filtersOpen by remember { mutableStateOf(false) }
        var sortOpen by remember { mutableStateOf(false) }
        TopAppBar(title = { Text(kindTitle(state.kind)) }, actions = {
            IconButton({ filtersOpen = true }) { Icon(Icons.Outlined.FilterList, stringResource(R.string.catalog_filters)) }
            Box { IconButton({ sortOpen = true }) { Icon(Icons.Outlined.Sort, stringResource(R.string.catalog_sort)) }
                DropdownMenu(sortOpen, { sortOpen = false }) {
                    val options = if (state.kind == CatalogKind.GACHA) listOf("start-desc" to R.string.catalog_sort_newest, "start-asc" to R.string.catalog_sort_oldest, "name-asc" to R.string.catalog_sort_name) else listOf("id-desc" to R.string.catalog_sort_newest, "id-asc" to R.string.catalog_sort_oldest, "name-asc" to R.string.catalog_sort_name)
                    options.forEach { (value, label) -> DropdownMenuItem({ Text(stringResource(label)) }, { viewModel.sort(value); sortOpen = false }) }
                }
            }
            IconButton(viewModel::refresh) { Icon(Icons.Outlined.Refresh, stringResource(R.string.catalog_refresh)) }
        })
        OutlinedTextField(state.query.text, viewModel::search, Modifier.fillMaxWidth().padding(horizontal = 12.dp), label = { Text(stringResource(R.string.catalog_search)) }, singleLine = true)
        ActiveFilters(state, viewModel)
        ResultContent(state.result, Modifier.weight(1f), viewModel::refresh) { page ->
            if (page.items.isEmpty()) Text(stringResource(R.string.catalog_empty), Modifier.padding(24.dp))
            else LazyVerticalGrid(GridCells.Adaptive(if (state.kind == CatalogKind.GACHA) 220.dp else 150.dp), state = gridState, contentPadding = PaddingValues(8.dp)) {
                items(page.items, key = { "${it.data.kind.apiName}:${it.data.id}" }) { item ->
                    CatalogTile(
                        state.region,
                        item,
                        favorite = item.data.id in favoriteIds,
                        onFavorite = { onFavorite(item) },
                        onClick = { viewModel.select(item.data.id) }
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            OutlinedButton({ viewModel.page(-1) }, enabled = state.query.page > 1) { Text(stringResource(R.string.catalog_previous)) }
            Text("${state.result.data?.page ?: state.query.page} / ${state.result.data?.totalPages ?: 1}", Modifier.padding(top = 12.dp))
            OutlinedButton({ viewModel.page(1) }, enabled = state.result.data?.hasNextPage == true) { Text(stringResource(R.string.catalog_next)) }
        }
        if (filtersOpen) {
            val serverMeta = state.result.data?.filterMeta ?: CatalogFilterMeta()
            val localMeta = CatalogFilterMeta(groups = state.facets.groupBy { it.key }.map { (key, values) ->
                CatalogFilterGroup(
                    key = key,
                    label = facetKeyLabelPlain(key),
                    matchAll = false,
                    options = values.map { CatalogFilterOption(it.value, facetValueLabelPlain(it.value), it.count) }
                )
            })
            val meta = serverMeta.takeIf { it.groups.isNotEmpty() || it.toggles.isNotEmpty() } ?: localMeta
            val serverStatus = state.result.data?.filterStatus ?: FilterMetadataStatus.LOADING
            CatalogFilterSheet(
                meta = meta,
                state = state.query.filters,
                status = if (meta.groups.isNotEmpty() && serverStatus == FilterMetadataStatus.LOADING) FilterMetadataStatus.OFFLINE else serverStatus,
                message = state.result.data?.filterMessage,
                resultCount = state.result.data?.total,
                title = stringResource(R.string.catalog_filters),
                clearLabel = stringResource(R.string.catalog_clear_filters),
                doneLabel = stringResource(R.string.catalog_done),
                unavailableLabel = stringResource(R.string.catalog_filter_not_cached),
                onOption = viewModel::filter,
                onToggle = viewModel::toggle,
                onClear = viewModel::clearFilters,
                onRetry = viewModel::refresh,
                onDismiss = { filtersOpen = false }
            )
        }
    }
}

@Composable private fun ActiveFilters(state: CollectionsUiState, viewModel: CollectionsViewModel) {
    val active = state.query.filters.selected.flatMap { (key, values) -> values.map { key to it } }
    val toggles = state.query.filters.toggles.filterValues { it }.keys
    if (active.isEmpty() && toggles.isEmpty()) return
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        active.forEach { (key, value) ->
            AssistChip({ viewModel.filter(key, value) }, { Text(facetValueLabel(value)) })
        }
        toggles.forEach { key ->
            AssistChip({ viewModel.toggle(key, false) }, { Text(key) })
        }
        AssistChip(viewModel::clearFilters, { Text(stringResource(R.string.catalog_clear_filters)) })
    }
}

private fun facetValueLabelPlain(value: String) = when (value) {
    "male" -> "男性"
    "female" -> "女性"
    "common" -> "普通"
    else -> value
}

private fun facetKeyLabelPlain(value: String) = when (value) {
    "category" -> "分类"
    "rarities" -> "稀有度"
    "characterIds" -> "角色"
    "partTypes" -> "部件"
    "sources" -> "来源"
    "genders" -> "性别"
    else -> value
}

@Composable private fun CatalogTile(region: Region, item: CatalogEntry, favorite: Boolean, onFavorite: () -> Unit, onClick: () -> Unit) {
    val data = item.data
    val candidates = catalogListImageCandidates(data.kind, data.assets)
    ElevatedCard(Modifier.padding(6.dp).clickable(onClick = onClick)) {
        BackendImage(candidates, data.name, "${region.id}:${data.kind.apiName}:${data.id}:list", Modifier.fillMaxWidth().aspectRatio(catalogImageAspectRatio(data.kind)), if (data.kind in setOf(CatalogKind.GACHA, CatalogKind.HONOR, CatalogKind.COMIC)) ContentScale.Fit else ContentScale.Crop)
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(data.name, maxLines = 2, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                IconButton(onFavorite) {
                    Icon(if (favorite) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder, stringResource(R.string.catalog_favorite))
                }
            }
            Text(tileMeta(item), maxLines = 2, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable private fun CatalogDetailPane(region: Region, result: DataResult<CatalogDetail>, onBack: () -> Unit, modifier: Modifier, showBack: Boolean = true, favorite: Boolean = false, onFavorite: (CatalogEntry) -> Unit = {}) {
    ResultContent(result, modifier) { detail ->
        val data = detail.item.data
        val candidates = catalogDetailImageCandidates(data.kind, data.assets)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    if (showBack) IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, stringResource(R.string.catalog_back)) }
                    else Spacer(Modifier.size(48.dp))
                    IconButton({ onFavorite(detail.item) }) {
                        Icon(if (favorite) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder, stringResource(R.string.catalog_favorite))
                    }
                }
            }
            item { BackendImage(candidates, data.name, "${region.id}:${data.kind.apiName}:${data.id}:detail", Modifier.fillMaxWidth().aspectRatio(catalogImageAspectRatio(data.kind)), ContentScale.Fit, showProgress = true) }
            item { Text(data.name, style = MaterialTheme.typography.headlineSmall); Text(stringResource(R.string.catalog_id, data.id)); Text(data.description ?: stringResource(R.string.catalog_no_description)) }
            item { CatalogTypedMetadata(detail.item) }
            if (detail.relatedCards.isNotEmpty()) {
                item { Text(stringResource(R.string.catalog_related_cards), style = MaterialTheme.typography.titleMedium) }
                items(detail.relatedCards.size) { index -> val card = detail.relatedCards[index]; ListItem(headlineContent = { Text(card.title) }, supportingContent = { Text("${card.character} | ${card.rarity} star") }, leadingContent = { BackendImage(card.normalThumbnailCandidates.ifEmpty { listOfNotNull(card.normalThumbnailUrl) }, card.title, "${region.id}:cards:${card.id}:related", Modifier.size(56.dp)) }) }
            }
        }
    }
}

@Composable private fun CatalogTypedMetadata(item: CatalogEntry) {
    val d = item.data
    when (item) {
        is GachaEntry -> { item.gachaType?.let { Text(stringResource(R.string.catalog_type, facetValueLabel(it))) }; d.startAt?.let { Text(stringResource(R.string.catalog_period, it.take(10), d.endAt?.take(10) ?: "-")) } }
        is HonorEntry -> { item.honorRarity?.let { Text(stringResource(R.string.catalog_rarity, facetValueLabel(it))) }; item.groupId?.let { Text(stringResource(R.string.catalog_group, it)) } }
        is MaterialEntry -> item.materialType?.let { Text(stringResource(R.string.catalog_type, facetValueLabel(it))) }
        is CostumeEntry -> { if (d.partTypes.isNotEmpty()) Text(stringResource(R.string.catalog_parts, d.partTypes.joinToString(" / ") { facetValueLabel(it) })); d.source?.let { Text(stringResource(R.string.catalog_source, facetValueLabel(it))) }; d.designer?.let { Text(stringResource(R.string.catalog_designer, it)) }; if (d.characterIds.isNotEmpty()) Text(stringResource(R.string.catalog_characters, d.characterIds.joinToString())) }
        is StampEntry -> { item.stampType?.let { Text(stringResource(R.string.catalog_type, facetValueLabel(it))) }; d.characterId?.let { Text(stringResource(R.string.catalog_character_id, it)) } }
        is ComicEntry -> item.comicType?.let { Text(stringResource(R.string.catalog_category, facetValueLabel(it))) }
    }
}

@Composable private fun tileMeta(item: CatalogEntry): String = when (item) {
    is GachaEntry -> item.data.startAt?.take(10) ?: stringResource(R.string.catalog_id, item.data.id)
    is HonorEntry -> listOfNotNull(item.honorRarity?.let { facetValueLabel(it) }, item.data.category?.let { facetValueLabel(it) }).joinToString(" | ").ifBlank { stringResource(R.string.catalog_id, item.data.id) }
    is MaterialEntry -> item.materialType?.let { facetValueLabel(it) } ?: stringResource(R.string.catalog_id, item.data.id)
    is CostumeEntry -> listOfNotNull(item.data.partTypes.firstOrNull()?.let { facetValueLabel(it) }, item.data.source?.let { facetValueLabel(it) }, item.data.designer).joinToString(" | ").ifBlank { stringResource(R.string.catalog_id, item.data.id) }
    is StampEntry -> item.stampType?.let { facetValueLabel(it) } ?: stringResource(R.string.catalog_id, item.data.id)
    is ComicEntry -> item.comicType?.let { facetValueLabel(it) } ?: stringResource(R.string.catalog_id, item.data.id)
}

@Composable private fun facetKeyLabel(value: String) = when (value) { "category" -> stringResource(R.string.catalog_filter_category); "rarity" -> stringResource(R.string.catalog_filter_rarity); "character" -> stringResource(R.string.catalog_filter_character); "partType" -> stringResource(R.string.catalog_filter_part); "source" -> stringResource(R.string.catalog_filter_source); "gender" -> stringResource(R.string.catalog_filter_gender); else -> value }
private fun facetValueLabel(value: String) = when (value) { "body" -> "\u8EAB\u4F53"; "head" -> "\u5934\u90E8"; "male" -> "\u7537"; "female" -> "\u5973"; "normal" -> "\u666E\u901A"; "distribution" -> "\u53D1\u653E"; "event" -> "\u6D3B\u52A8"; "gacha" -> "\u5361\u6C60"; "shop" -> "\u5546\u5E97"; "mission" -> "\u4EFB\u52A1"; else -> value }

@Composable private fun kindTitle(kind: CatalogKind) = when (kind) {
    CatalogKind.GACHA -> stringResource(R.string.catalog_gacha); CatalogKind.HONOR -> stringResource(R.string.catalog_honor)
    CatalogKind.MATERIAL -> stringResource(R.string.catalog_material); CatalogKind.COSTUME -> stringResource(R.string.catalog_costume)
    CatalogKind.STAMP -> stringResource(R.string.catalog_stamp); CatalogKind.COMIC -> stringResource(R.string.catalog_comic)
}

private fun CatalogKind.favoriteType() = when (this) {
    CatalogKind.GACHA -> FavoriteType.GACHA
    CatalogKind.HONOR -> FavoriteType.HONOR
    CatalogKind.MATERIAL -> FavoriteType.MATERIAL
    CatalogKind.COSTUME -> FavoriteType.COSTUME
    CatalogKind.STAMP -> FavoriteType.STAMP
    CatalogKind.COMIC -> FavoriteType.COMIC
}
