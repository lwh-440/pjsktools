@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.pjsktools.feature.cards

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
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
import com.pjsktools.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CardsUiState(
    val query: CardQuery = CardQuery(),
    val result: DataResult<Page<CardSummary>> = DataResult(),
    val selectedId: String? = null,
    val region: Region = Region.JP
)

@HiltViewModel
class CardsViewModel @Inject constructor(
    private val repository: CardsRepository,
    preferences: RegionPreferencesRepository,
    authRepository: AuthRepository,
    private val favoriteRepository: FavoriteRepository,
    private val savedState: SavedStateHandle
) : ViewModel() {
    private val region = preferences.selectedRegion.filterNotNull().stateIn(viewModelScope, SharingStarted.Eagerly, Region.JP)
    val signedIn = authRepository.state.map { it is AuthState.SignedIn }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)
    val favorites = combine(region, favoriteRepository.favorites) { selectedRegion, items ->
        items.filter { it.type == FavoriteType.CARD && it.region == selectedRegion }.associateBy { it.targetId }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())
    val folders = favoriteRepository.folders.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    private val query = MutableStateFlow(CardQuery(text = savedState["card_query"] ?: "", page = savedState["card_page"] ?: 1))
    private val selected = MutableStateFlow<String?>(savedState["card_id"])
    private val refresh = MutableStateFlow(0)
    private val anchors = ScrollAnchorStore(encoded = savedState["card_scroll_anchors"] ?: emptyList())
    private var consumedScrollReset = 0
    private var activatedScrollReset = 0
    private val result = combine(region, refresh) { selectedRegion, token -> selectedRegion to token }
        .flatMapLatest { (selectedRegion, token) -> query.flatMapLatest { repository.observe(selectedRegion, it, token > 0) } }
    private val displayState = combine(query, selected, result) { currentQuery, id, data -> CardsUiState(currentQuery, data, id) }
    val state = combine(displayState, region) { current, selectedRegion -> current.copy(region = selectedRegion) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), CardsUiState())
    val detail = combine(region, selected.filterNotNull()) { selectedRegion, id -> selectedRegion to id }
        .flatMapLatest { (selectedRegion, id) -> repository.observeDetail(selectedRegion, id) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DataResult())

    fun search(value: String) { query.value = query.value.copy(text = value, page = 1); savedState["card_query"] = value }
    fun attribute(value: String?) { query.value = query.value.copy(attribute = value, page = 1) }
    fun rarity(value: String?) { query.value = query.value.copy(rarity = value, page = 1) }
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
    fun clearFilters() { query.value = query.value.copy(attribute = null, rarity = null, characterId = null, unit = null, filters = CatalogFilterState(), page = 1) }
    fun sort(value: String) { query.value = query.value.copy(sort = value, page = 1) }
    fun page(delta: Int) { val next = (query.value.page + delta).coerceAtLeast(1); query.value = query.value.copy(page = next); savedState["card_page"] = next }
    fun select(id: String?) { selected.value = id; savedState["card_id"] = id }
    fun refresh() { refresh.value++ }
    fun addFavorite(card: CardSummary) = viewModelScope.launch { favoriteRepository.add(FavoriteType.CARD, region.value, card.id, card.title) }
    fun saveFolders(favorite: Favorite, ids: Set<String>) = viewModelScope.launch { favoriteRepository.setFolders(favorite, ids) }
    fun removeFavorite(favorite: Favorite) = viewModelScope.launch { favoriteRepository.remove(favorite) }
    fun anchor(region: Region, query: CardQuery) = anchors.get(query.scrollKey(region))
    fun saveAnchor(region: Region, query: CardQuery, anchor: ListScrollAnchor) { savedState["card_scroll_anchors"] = anchors.put(query.scrollKey(region), anchor) }
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
        savedState["card_page"] = 1
    }
}

@Composable
fun CardsScreen(
    scrollResetToken: Int = 0,
    onLogin: () -> Unit = {},
    openDetailId: String? = null,
    onDetailOpened: () -> Unit = {},
    viewModel: CardsViewModel = hiltViewModel()
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
    val favoriteAction: (CardSummary) -> Unit = { card ->
        if (!signedIn) onLogin()
        else if (card.id in favorites) organizingId = card.id
        else viewModel.addFavorite(card)
    }
    BackHandler(enabled = state.selectedId != null) { viewModel.select(null) }
    BoxWithConstraints {
        val expanded = maxWidth >= 840.dp
        Row(Modifier.fillMaxSize()) {
            if (!expanded && state.selectedId != null) CardDetailPane(state.region, detail, { viewModel.select(null) }, Modifier.fillMaxSize(), favorite = state.selectedId in favorites, onFavorite = favoriteAction)
            else CardsList(state, viewModel, scrollResetToken, favorites.keys, favoriteAction, Modifier.weight(if (expanded) .52f else 1f))
            if (expanded) {
                VerticalDivider()
                Box(Modifier.weight(.48f)) {
                    if (state.selectedId == null) Text(stringResource(R.string.cards_select_detail), Modifier.padding(24.dp))
                    else CardDetailPane(state.region, detail, { viewModel.select(null) }, Modifier.fillMaxSize(), false, state.selectedId in favorites, favoriteAction)
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
private fun CardsList(state: CardsUiState, viewModel: CardsViewModel, scrollResetToken: Int, favoriteIds: Set<String>, onFavorite: (CardSummary) -> Unit, modifier: Modifier) {
    val pageItems = state.result.data?.items.orEmpty()
    val savedAnchor = remember(state.region, state.query) { viewModel.anchor(state.region, state.query) }
    val initialIndex = savedAnchor?.itemId?.let { id -> pageItems.indexOfFirst { it.id == id }.takeIf { it >= 0 } } ?: savedAnchor?.index ?: 0
    val gridState = rememberLazyGridState(initialIndex.coerceAtMost((pageItems.size - 1).coerceAtLeast(0)), savedAnchor?.offset ?: 0)
    LaunchedEffect(pageItems, state.region, state.query, scrollResetToken) {
        if (pageItems.isEmpty()) return@LaunchedEffect
        if (viewModel.consumeScrollReset(scrollResetToken)) {
            gridState.scrollToItem(0)
            viewModel.saveAnchor(state.region, state.query, ListScrollAnchor(pageItems.first().id, 0, 0))
            return@LaunchedEffect
        }
        val anchor=viewModel.anchor(state.region,state.query)?:return@LaunchedEffect
        val index=anchor.itemId?.let{id->pageItems.indexOfFirst{it.id==id}.takeIf{it>=0}}?:anchor.index
        gridState.scrollToItem(index.coerceIn(0,pageItems.lastIndex),anchor.offset)
    }
    LaunchedEffect(gridState,pageItems,state.region,state.query){if(pageItems.isEmpty())return@LaunchedEffect;snapshotFlow{gridState.firstVisibleItemIndex to gridState.firstVisibleItemScrollOffset}.distinctUntilChanged().debounce(150).collect{(index,offset)->viewModel.saveAnchor(state.region,state.query,ListScrollAnchor(pageItems.getOrNull(index)?.id,index,offset))}}
    Column(modifier) {
        var sortOpen by remember { mutableStateOf(false) }
        var filtersOpen by remember { mutableStateOf(false) }
        TopAppBar(title = { Text(stringResource(R.string.cards_title)) }, actions = {
            BadgedBox(badge = { if (state.query.filters.activeCount > 0) Badge { Text(state.query.filters.activeCount.toString()) } }) {
                IconButton({ filtersOpen = true }) { Icon(Icons.Outlined.FilterList, stringResource(R.string.cards_filters)) }
            }
            Box { IconButton({ sortOpen = true }) { Icon(Icons.Outlined.Sort, stringResource(R.string.cards_sort)) }
                DropdownMenu(sortOpen, { sortOpen = false }) {
                    listOf("id-desc" to R.string.cards_sort_newest, "id-asc" to R.string.cards_sort_oldest, "name-asc" to R.string.cards_sort_name).forEach { (value, label) ->
                        DropdownMenuItem({ Text(stringResource(label)) }, { viewModel.sort(value); sortOpen = false })
                    }
                }
            }
            IconButton(viewModel::refresh) { Icon(Icons.Outlined.Refresh, stringResource(R.string.cards_refresh)) }
        })
        OutlinedTextField(state.query.text, viewModel::search, Modifier.fillMaxWidth().padding(horizontal = 12.dp), label = { Text(stringResource(R.string.cards_search)) }, singleLine = true)
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf<String?>(null, "cool", "cute", "happy", "mysterious", "pure").forEach { attribute ->
                FilterChip(state.query.attribute == attribute, { viewModel.attribute(attribute) }, { Text(attributeLabel(attribute)) })
            }
            listOf("2", "3", "4").forEach { rarity ->
                FilterChip(state.query.rarity == rarity, { viewModel.rarity(if (state.query.rarity == rarity) null else rarity) }, { Text(stringResource(R.string.cards_rarity, rarity)) })
            }
        }
        ResultContent(state.result, Modifier.weight(1f), viewModel::refresh) { page ->
            LazyVerticalGrid(GridCells.Adaptive(150.dp), state = gridState, contentPadding = PaddingValues(8.dp)) {
                items(page.items, key = { it.id }) { card ->
                    ElevatedCard(Modifier.padding(6.dp).clickable { viewModel.select(card.id) }) {
                        BackendImage(card.normalThumbnailCandidates.ifEmpty { listOfNotNull(card.normalThumbnailUrl) }, null, "${state.region.id}:cards:${card.id}:list", Modifier.fillMaxWidth().aspectRatio(1f), ContentScale.Crop)
                        Column(Modifier.padding(10.dp)) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(card.title, maxLines = 2, modifier = Modifier.weight(1f))
                                IconButton({ onFavorite(card) }) {
                                    Icon(if (card.id in favoriteIds) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder, stringResource(R.string.cards_favorite))
                                }
                            }
                            Text(stringResource(R.string.cards_item_meta, card.character, card.rarity, attributeLabel(card.attribute)), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            OutlinedButton({ viewModel.page(-1) }, enabled = state.query.page > 1) { Text(stringResource(R.string.cards_previous)) }
            Text("${state.result.data?.page ?: state.query.page} / ${state.result.data?.totalPages ?: 1}", Modifier.padding(top = 12.dp))
            OutlinedButton({ viewModel.page(1) }, enabled = state.result.data?.hasNextPage == true) { Text(stringResource(R.string.cards_next)) }
        }
        if (filtersOpen) {
            CatalogFilterSheet(
                meta = state.result.data?.filterMeta ?: CatalogFilterMeta(),
                state = state.query.filters,
                status = state.result.data?.filterStatus ?: FilterMetadataStatus.LOADING,
                message = state.result.data?.filterMessage,
                resultCount = state.result.data?.total,
                title = stringResource(R.string.cards_filters),
                clearLabel = stringResource(R.string.cards_filter_clear),
                doneLabel = stringResource(R.string.cards_filter_done),
                unavailableLabel = stringResource(R.string.cards_filter_unavailable),
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
private fun CardDetailPane(region: Region, result: DataResult<CardDetail>, close: () -> Unit, modifier: Modifier, showClose: Boolean = true, favorite: Boolean = false, onFavorite: (CardSummary) -> Unit = {}) {
    Column(modifier) {
        TopAppBar(
            title = { Text(stringResource(R.string.cards_detail)) },
            navigationIcon = { if (showClose) IconButton(close) { Icon(Icons.Outlined.Close, stringResource(R.string.cards_close)) } },
            actions = {
                result.data?.card?.let { card ->
                    IconButton({ onFavorite(card) }) {
                        Icon(if (favorite) Icons.Filled.Favorite else Icons.Outlined.FavoriteBorder, stringResource(R.string.cards_favorite))
                    }
                }
            }
        )
        ResultContent(result, Modifier.weight(1f)) { detail ->
            var trained by remember(detail.card.id) { mutableStateOf(false) }
            var level by remember(detail.card.id) { mutableIntStateOf(4) }
            val imageCandidates = if (trained) detail.trainedCandidates else detail.normalCandidates
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(detail.card.title, style = MaterialTheme.typography.headlineSmall)
                Text(stringResource(R.string.cards_detail_meta, detail.card.character, detail.card.rarity, attributeLabel(detail.card.attribute), unitLabel(detail.card.unit), detail.card.id))
                if (detail.trainedCandidates.isNotEmpty()) {
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        SegmentedButton(!trained, { trained = false }, SegmentedButtonDefaults.itemShape(0, 2)) { Text(stringResource(R.string.cards_normal)) }
                        SegmentedButton(trained, { trained = true }, SegmentedButtonDefaults.itemShape(1, 2)) { Text(stringResource(R.string.cards_trained)) }
                    }
                }
                BackendImage(imageCandidates.ifEmpty { listOfNotNull(if (trained) detail.trainedUrl else detail.normalUrl) }, null, "${region.id}:cards:${detail.card.id}:${if (trained) "trained" else "normal"}", Modifier.fillMaxWidth().aspectRatio(2338f / 1440f), ContentScale.Fit, showProgress = true)
                detail.skill?.let { skill ->
                    Text(skill.name ?: stringResource(R.string.cards_skill), style = MaterialTheme.typography.titleMedium)
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        (1..4).forEachIndexed { index, value -> SegmentedButton(level == value, { level = value }, SegmentedButtonDefaults.itemShape(index, 4)) { Text("Lv.$value") } }
                    }
                    Text(skill.formattedDescriptions[level] ?: skill.template ?: stringResource(R.string.cards_skill_missing, skill.missingFields.joinToString()))
                }
                detail.specialTrainingSkill?.let { skill ->
                    Text(stringResource(R.string.cards_training_skill), style = MaterialTheme.typography.titleMedium)
                    Text(skill.name.orEmpty())
                    Text(skill.formattedDescriptions[level] ?: skill.template ?: stringResource(R.string.cards_skill_missing, skill.missingFields.joinToString()))
                }
                RelatedSection(stringResource(R.string.cards_related_events), detail.relatedEvents)
                RelatedSection(stringResource(R.string.cards_related_gachas), detail.relatedGachas)
            }
        }
    }
}

@Composable private fun RelatedSection(title: String, items: List<RelatedCatalogItem>) {
    if (items.isEmpty()) return
    Text(title, style = MaterialTheme.typography.titleMedium)
    items.forEach { Text(it.name?.let { name -> "$name (ID ${it.id})" } ?: "ID ${it.id}") }
}

@Composable private fun attributeLabel(value: String?): String = when (value) {
    null -> stringResource(R.string.cards_all_attributes)
    "cool" -> stringResource(R.string.cards_attribute_cool)
    "cute" -> stringResource(R.string.cards_attribute_cute)
    "happy" -> stringResource(R.string.cards_attribute_happy)
    "mysterious" -> stringResource(R.string.cards_attribute_mysterious)
    "pure" -> stringResource(R.string.cards_attribute_pure)
    else -> value
}

@Composable private fun unitLabel(value: String?): String = when (value) {
    null -> stringResource(R.string.cards_unknown)
    "light_sound" -> "Leo/need"
    "idol" -> "MORE MORE JUMP!"
    "street" -> "Vivid BAD SQUAD"
    "theme_park" -> "Wonderlands x Showtime"
    "school_refusal" -> "25-ji, Nightcord de."
    "piapro" -> "VIRTUAL SINGER"
    else -> value
}
