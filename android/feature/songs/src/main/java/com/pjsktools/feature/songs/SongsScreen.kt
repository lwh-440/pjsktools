@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.pjsktools.feature.songs

import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.activity.compose.BackHandler
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Fullscreen
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.outlined.RestartAlt
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Sort
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pjsktools.core.designsystem.BackendImage
import com.pjsktools.core.designsystem.CatalogFilterSheet
import com.pjsktools.core.designsystem.FavoriteFolderSheet
import com.pjsktools.core.designsystem.ResultContent
import com.pjsktools.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SongsUiState(
    val query: SongQuery = SongQuery(),
    val result: DataResult<Page<SongSummary>> = DataResult(),
    val selectedId: String? = null,
    val region: Region = Region.JP
)

@HiltViewModel
class SongsViewModel @Inject constructor(
    private val repository: SongsRepository,
    preferences: RegionPreferencesRepository,
    authRepository: AuthRepository,
    private val favoriteRepository: FavoriteRepository,
    private val savedState: SavedStateHandle
) : ViewModel() {
    private val region = preferences.selectedRegion.filterNotNull().stateIn(viewModelScope, SharingStarted.Eagerly, Region.JP)
    val signedIn = authRepository.state.map { it is AuthState.SignedIn }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)
    val favorites = combine(region, favoriteRepository.favorites) { selectedRegion, items ->
        items.filter { it.type == FavoriteType.SONG && it.region == selectedRegion }.associateBy { it.targetId }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())
    val folders = favoriteRepository.folders.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    private val query = MutableStateFlow(SongQuery(text = savedState["song_query"] ?: "", page = savedState["song_page"] ?: 1))
    private val refresh = MutableStateFlow(0)
    private val selected = MutableStateFlow<String?>(savedState["song_id"])
    private val anchors = ScrollAnchorStore(encoded = savedState["song_scroll_anchors"] ?: emptyList())
    private var consumedScrollReset = 0
    private var activatedScrollReset = 0
    private val result = combine(region, refresh) { selectedRegion, token -> selectedRegion to token }
        .flatMapLatest { (selectedRegion, token) -> query.flatMapLatest { repository.observe(selectedRegion, it, token > 0) } }
    private val displayState = combine(query, selected, result) { currentQuery, id, data -> SongsUiState(currentQuery, data, id) }
    val state = combine(displayState, region) { current, selectedRegion -> current.copy(region = selectedRegion) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SongsUiState())
    val detail = combine(region, selected.filterNotNull()) { selectedRegion, id -> selectedRegion to id }
        .flatMapLatest { (selectedRegion, id) -> repository.observeDetail(selectedRegion, id) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DataResult())

    fun search(value: String) { query.value = query.value.copy(text = value, page = 1); savedState["song_query"] = value }
    fun category(value: String?) { query.value = query.value.copy(category = value, unit = null, page = 1) }
    fun filter(key: String, value: String) {
        val selected = query.value.filters.selected.toMutableMap()
        val values = selected[key].orEmpty().toMutableSet()
        if (!values.add(value)) values.remove(value)
        if (values.isEmpty()) selected.remove(key) else selected[key] = values
        query.value = query.value.copy(filters = query.value.filters.copy(selected = selected), page = 1)
    }
    fun toggle(key: String, enabled: Boolean) {
        query.value = query.value.copy(filters = query.value.filters.copy(toggles = query.value.filters.toggles + (key to enabled)), page = 1)
    }
    fun clearFilters() { query.value = query.value.copy(category = null, unit = null, filters = CatalogFilterState(), page = 1) }
    fun sort(value: String) { query.value = query.value.copy(sort = value, page = 1) }
    fun page(delta: Int) { val next = (query.value.page + delta).coerceAtLeast(1); query.value = query.value.copy(page = next); savedState["song_page"] = next }
    fun select(id: String?) { selected.value = id; savedState["song_id"] = id }
    fun refresh() { refresh.value++ }
    fun addFavorite(song: SongSummary) = viewModelScope.launch { favoriteRepository.add(FavoriteType.SONG, region.value, song.id, song.title) }
    fun saveFolders(favorite: Favorite, ids: Set<String>) = viewModelScope.launch { favoriteRepository.setFolders(favorite, ids) }
    fun removeFavorite(favorite: Favorite) = viewModelScope.launch { favoriteRepository.remove(favorite) }
    fun anchor(region: Region, query: SongQuery) = anchors.get(query.scrollKey(region))
    fun saveAnchor(region: Region, query: SongQuery, anchor: ListScrollAnchor) { savedState["song_scroll_anchors"] = anchors.put(query.scrollKey(region), anchor) }
    fun consumeScrollReset(token: Int): Boolean {
        if (token <= consumedScrollReset || token <= 0) return false
        consumedScrollReset = token
        return true
    }
    fun activateCatalog(token: Int) {
        if (token <= activatedScrollReset || token <= 0) return
        activatedScrollReset = token
        select(null)
        query.value = query.value.copy(page = 1)
        savedState["song_page"] = 1
    }
}

@Composable
fun SongsScreen(
    scrollResetToken: Int = 0,
    onLogin: () -> Unit = {},
    openDetailId: String? = null,
    onDetailOpened: () -> Unit = {},
    viewModel: SongsViewModel = hiltViewModel()
) {
    LaunchedEffect(scrollResetToken, openDetailId) {
        viewModel.activateCatalog(scrollResetToken)
        openDetailId?.let {
            viewModel.select(it)
            onDetailOpened()
        }
    }
    val state by viewModel.state.collectAsState()
    val detail by viewModel.detail.collectAsState()
    val favorites by viewModel.favorites.collectAsState()
    val folders by viewModel.folders.collectAsState()
    val signedIn by viewModel.signedIn.collectAsState()
    var organizingId by rememberSaveable { mutableStateOf<String?>(null) }
    val favoriteAction: (SongSummary) -> Unit = { song ->
        if (!signedIn) onLogin()
        else if (song.id in favorites) organizingId = song.id
        else viewModel.addFavorite(song)
    }
    BackHandler(enabled = state.selectedId != null) { viewModel.select(null) }
    BoxWithConstraints {
        val expanded = maxWidth >= 840.dp
        Row(Modifier.fillMaxSize()) {
            if (!expanded && state.selectedId != null) SongDetailPane(state.region, detail, viewModel::select, Modifier.fillMaxSize(), favorite = state.selectedId in favorites, onFavorite = favoriteAction)
            else SongsList(state, viewModel, scrollResetToken, favorites.keys, favoriteAction, Modifier.weight(if (expanded) .48f else 1f))
            if (expanded) {
                VerticalDivider()
                Box(Modifier.weight(.52f)) {
                    if (state.selectedId == null) Text(stringResource(R.string.songs_select_detail), Modifier.padding(24.dp))
                    else SongDetailPane(state.region, detail, { viewModel.select(null) }, Modifier.fillMaxSize(), false, state.selectedId in favorites, favoriteAction)
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
private fun SongsList(state: SongsUiState, viewModel: SongsViewModel, scrollResetToken: Int, favoriteIds: Set<String>, onFavorite: (SongSummary) -> Unit, modifier: Modifier) {
    val pageItems = state.result.data?.items.orEmpty()
    val savedAnchor = remember(state.region, state.query) { viewModel.anchor(state.region, state.query) }
    val initialIndex = savedAnchor?.itemId?.let { id -> pageItems.indexOfFirst { it.id == id }.takeIf { it >= 0 } } ?: savedAnchor?.index ?: 0
    val listState = rememberLazyListState(initialIndex.coerceAtMost((pageItems.size - 1).coerceAtLeast(0)), savedAnchor?.offset ?: 0)
    LaunchedEffect(pageItems, state.region, state.query, scrollResetToken) {
        if (pageItems.isEmpty()) return@LaunchedEffect
        if (viewModel.consumeScrollReset(scrollResetToken)) {
            listState.scrollToItem(0)
            viewModel.saveAnchor(state.region, state.query, ListScrollAnchor(pageItems.first().id, 0, 0))
            return@LaunchedEffect
        }
        val anchor = viewModel.anchor(state.region, state.query) ?: return@LaunchedEffect
        val index = anchor.itemId?.let { id -> pageItems.indexOfFirst { it.id == id }.takeIf { it >= 0 } } ?: anchor.index
        listState.scrollToItem(index.coerceIn(0, pageItems.lastIndex), anchor.offset)
    }
    LaunchedEffect(listState, pageItems, state.region, state.query) {
        if (pageItems.isEmpty()) return@LaunchedEffect
        snapshotFlow { listState.firstVisibleItemIndex to listState.firstVisibleItemScrollOffset }.distinctUntilChanged().debounce(150).collect { (index, offset) ->
            viewModel.saveAnchor(state.region, state.query, ListScrollAnchor(pageItems.getOrNull(index)?.id, index, offset))
        }
    }
    Column(modifier) {
        var sortOpen by remember { mutableStateOf(false) }
        var filtersOpen by remember { mutableStateOf(false) }
        TopAppBar(title = { Text(stringResource(R.string.songs_title)) }, actions = {
            BadgedBox(badge = { if (state.query.filters.activeCount > 0) Badge { Text(state.query.filters.activeCount.toString()) } }) {
                IconButton({ filtersOpen = true }) { Icon(Icons.Outlined.FilterList, stringResource(R.string.songs_filters)) }
            }
            Box { IconButton({ sortOpen = true }) { Icon(Icons.Outlined.Sort, stringResource(R.string.songs_sort)) }
                DropdownMenu(sortOpen, { sortOpen = false }) {
                    listOf("published-desc" to R.string.songs_sort_newest, "published-asc" to R.string.songs_sort_oldest, "name-asc" to R.string.songs_sort_name).forEach { (value, label) ->
                        DropdownMenuItem({ Text(stringResource(label)) }, { viewModel.sort(value); sortOpen = false })
                    }
                }
            }
            IconButton(viewModel::refresh) { Icon(Icons.Outlined.Refresh, stringResource(R.string.songs_refresh)) }
        })
        OutlinedTextField(state.query.text, viewModel::search, Modifier.fillMaxWidth().padding(horizontal = 12.dp), label = { Text(stringResource(R.string.songs_search)) }, singleLine = true)
        Row(Modifier.horizontalScroll(androidx.compose.foundation.rememberScrollState()).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf<String?>(null, "mv", "mv_2d").forEach { category ->
                FilterChip(state.query.category == category, { viewModel.category(category) }, { Text(songCategoryLabel(category)) })
            }
        }
        ResultContent(state.result, Modifier.weight(1f), viewModel::refresh) { page ->
            LazyColumn(state = listState) {
                items(page.items, key = { it.id }) { song ->
                    ListItem(
                        headlineContent = { Text(song.title) },
                        supportingContent = { Text(stringResource(R.string.songs_item_meta, song.categories.joinToString(" / ") { songCategoryLabel(it) }.ifBlank { songCategoryLabel(song.unit) }, song.publishedAt?.take(10) ?: "-", song.id)) },
                        leadingContent = { BackendImage(song.jacketCandidates.ifEmpty { listOfNotNull(song.jacketUrl) }, null, "${state.region.id}:songs:${song.id}:list", Modifier.size(56.dp), ContentScale.Crop) },
                        trailingContent = {
                            IconButton({ onFavorite(song) }) {
                                Icon(if (song.id in favoriteIds) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder, stringResource(R.string.songs_favorite))
                            }
                        },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp).clickable { viewModel.select(song.id) }
                    )
                    HorizontalDivider()
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            OutlinedButton({ viewModel.page(-1) }, enabled = state.query.page > 1) { Text(stringResource(R.string.songs_previous)) }
            Text("${state.result.data?.page ?: state.query.page} / ${state.result.data?.totalPages ?: 1}", Modifier.padding(top = 12.dp))
            OutlinedButton({ viewModel.page(1) }, enabled = state.result.data?.hasNextPage == true) { Text(stringResource(R.string.songs_next)) }
        }
        if (filtersOpen) {
            CatalogFilterSheet(
                meta = state.result.data?.filterMeta ?: CatalogFilterMeta(),
                state = state.query.filters,
                status = state.result.data?.filterStatus ?: FilterMetadataStatus.LOADING,
                message = state.result.data?.filterMessage,
                resultCount = state.result.data?.total,
                title = stringResource(R.string.songs_filters),
                clearLabel = stringResource(R.string.songs_filter_clear),
                doneLabel = stringResource(R.string.songs_filter_done),
                unavailableLabel = stringResource(R.string.songs_filter_unavailable),
                onOption = viewModel::filter,
                onToggle = viewModel::toggle,
                onClear = viewModel::clearFilters,
                onRetry = viewModel::refresh,
                onDismiss = { filtersOpen = false }
            )
        }
    }
}

@Composable
private fun SongDetailPane(region: Region, result: DataResult<SongDetail>, close: (String?) -> Unit, modifier: Modifier, showClose: Boolean = true, favorite: Boolean = false, onFavorite: (SongSummary) -> Unit = {}) {
    Column(modifier) {
        TopAppBar(
            title = { Text(stringResource(R.string.songs_detail)) },
            navigationIcon = { if (showClose) IconButton({ close(null) }) { Icon(Icons.Outlined.Close, stringResource(R.string.songs_close)) } },
            actions = {
                result.data?.song?.let { song ->
                    IconButton({ onFavorite(song) }) {
                        Icon(if (favorite) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder, stringResource(R.string.songs_favorite))
                    }
                }
            }
        )
        ResultContent(result, Modifier.weight(1f)) { detail ->
            val orderedNames = listOf("easy", "normal", "hard", "expert", "master", "append")
            val available = (detail.difficulties.map { it.name } + detail.charts.map { it.difficulty }).distinct().sortedBy { orderedNames.indexOf(it.lowercase()).let { index -> if (index < 0) Int.MAX_VALUE else index } }
            var selectedDifficulty by remember(detail.song.id) { mutableStateOf(available.firstOrNull { it.equals("master", true) } ?: available.firstOrNull()) }
            val selectedChart = detail.charts.firstOrNull { it.difficulty.equals(selectedDifficulty, true) }
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        BackendImage(detail.song.jacketCandidates.ifEmpty { listOfNotNull(detail.song.jacketUrl) }, null, "${region.id}:songs:${detail.song.id}:detail", Modifier.size(120.dp), ContentScale.Crop)
                        Column {
                            Text(detail.song.title, style = MaterialTheme.typography.headlineSmall)
                            Text(detail.song.categories.joinToString(" / ") { songCategoryLabel(it) }.ifBlank { songCategoryLabel(detail.song.unit) })
                            Text(stringResource(R.string.songs_published, detail.song.publishedAt?.take(10) ?: "-"))
                            detail.song.durationSeconds?.let { Text(stringResource(R.string.songs_duration, it / 60, it % 60)) }
                            detail.bpm?.let { Text("BPM ${it.toInt()}") }
                            detail.lyricist?.let { Text(stringResource(R.string.songs_lyricist, it)) }
                            detail.composer?.let { Text(stringResource(R.string.songs_composer, it)) }
                            detail.arranger?.let { Text(stringResource(R.string.songs_arranger, it)) }
                        }
                    }
                }
                item { Text(stringResource(R.string.songs_difficulties), style = MaterialTheme.typography.titleMedium) }
                item {
                    Row(Modifier.horizontalScroll(androidx.compose.foundation.rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        available.forEach { name ->
                            val difficulty = detail.difficulties.firstOrNull { it.name.equals(name, true) }
                            FilterChip(selectedDifficulty == name, { selectedDifficulty = name }, { Text("${name.uppercase()} ${difficulty?.level?.let { "Lv.$it" } ?: ""}") })
                        }
                    }
                }
                item {
                    Text(stringResource(R.string.songs_chart), style = MaterialTheme.typography.titleMedium)
                    if (selectedChart == null || selectedChart.imageCandidates.isEmpty()) Text(stringResource(R.string.songs_chart_unavailable))
                    else ZoomableChart(selectedChart.imageCandidates, "${region.id}:songs:${detail.song.id}:chart:${selectedChart.difficulty}")
                }
            }
        }
    }
}

@Composable
private fun ZoomableChart(candidates: List<String?>, cacheKey: String) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var fullscreen by remember { mutableStateOf(false) }
    fun reset() { scale = 1f; offset = Offset.Zero }
    @Composable fun Canvas(modifier: Modifier) { Surface(modifier, tonalElevation = 1.dp) {
        BackendImage(
            candidates,
            stringResource(R.string.songs_chart_description),
            cacheKey,
            Modifier.fillMaxSize().pointerInput(Unit) {
                detectTransformGestures { _, pan, zoom, _ -> scale = (scale * zoom).coerceIn(.6f, 3f); offset += pan }
            }.graphicsLayer(scaleX = scale, scaleY = scale, translationX = offset.x, translationY = offset.y),
            ContentScale.Fit
        )
    } }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            IconButton({ reset() }) { Icon(Icons.Outlined.RestartAlt, stringResource(R.string.songs_chart_reset)) }
            IconButton({ fullscreen = true }) { Icon(Icons.Outlined.Fullscreen, stringResource(R.string.songs_chart_fullscreen)) }
        }
        Canvas(Modifier.fillMaxWidth().height(420.dp))
    }
    if (fullscreen) Dialog(onDismissRequest = { fullscreen = false }, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) { Box(Modifier.fillMaxSize()) {
            Canvas(Modifier.fillMaxSize().padding(top = 56.dp))
            Row(Modifier.align(Alignment.TopEnd).padding(8.dp)) {
                IconButton({ reset() }) { Icon(Icons.Outlined.RestartAlt, stringResource(R.string.songs_chart_reset)) }
                IconButton({ fullscreen = false }) { Icon(Icons.Outlined.Close, stringResource(R.string.songs_close)) }
            }
        } }
    }
}

private fun songCategoryLabel(value: String?): String = when (value) {
    null -> "\u5168\u90E8\u7C7B\u522B"
    "mv" -> "MV"
    "mv_2d" -> "2D MV"
    else -> value
}
