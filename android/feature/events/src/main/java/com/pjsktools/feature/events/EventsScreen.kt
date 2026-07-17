@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.pjsktools.feature.events

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewModelScope
import com.pjsktools.core.designsystem.BackendImage
import com.pjsktools.core.designsystem.CatalogFilterSheet
import com.pjsktools.core.designsystem.FavoriteFolderSheet
import com.pjsktools.core.designsystem.ResultContent
import com.pjsktools.core.designsystem.orderedImageCandidates
import com.pjsktools.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.inject.Inject

enum class EventsPage { CURRENT, FORECAST, HISTORY }
enum class RankingTraceMode { PLAYER, LINE }

data class EventNavigationTarget(val type: FavoriteType, val id: String)

@HiltViewModel
class EventsViewModel @Inject constructor(
    private val repository: EventsRepository,
    private val bindingsRepository: PlayerBindingRepository,
    private val favoriteRepository: FavoriteRepository,
    authRepository: AuthRepository,
    preferences: RegionPreferencesRepository,
    private val savedState: SavedStateHandle
) : ViewModel() {
    private val region = preferences.selectedRegion.filterNotNull().stateIn(viewModelScope, SharingStarted.Eagerly, Region.JP)
    private val contentRefresh = MutableStateFlow(0)
    private val liveRefresh = MutableStateFlow(0)
    val query = MutableStateFlow(EventQuery(text = savedState["events_query"] ?: "", pageSize = 100))
    val selectedPage = MutableStateFlow(savedState.get<String>("events_page")?.let { runCatching { EventsPage.valueOf(it) }.getOrNull() } ?: EventsPage.CURRENT)
    val window = MutableStateFlow(savedState.get<String>("events_window")?.let { runCatching { ForecastWindow.valueOf(it) }.getOrNull() } ?: ForecastWindow.ALL)
    val selectedEventId = MutableStateFlow<String?>(null)
    val selectedBoard = MutableStateFlow(savedState["events_board"] ?: "overall")
    val worldLinkCharacterId = MutableStateFlow<Int?>(savedState["events_world_link_character"])
    val selectedRank = MutableStateFlow<Int?>(savedState["events_rank"])
    val traceMode = MutableStateFlow(savedState.get<String>("events_trace_mode")?.let { runCatching { RankingTraceMode.valueOf(it) }.getOrNull() } ?: RankingTraceMode.PLAYER)
    private val historyEventId = MutableStateFlow<String?>(savedState["events_history_id"])
    val selectedHistoryEventId = historyEventId.asStateFlow()

    val signedIn = authRepository.state.map { it is AuthState.SignedIn }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)
    val bindings = bindingsRepository.bindings.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val favorites = combine(region, favoriteRepository.favorites) { selectedRegion, items ->
        items.filter { it.region == selectedRegion && it.type == FavoriteType.EVENT }.associateBy { it.targetId }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())
    val folders = favoriteRepository.folders.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val planResult = MutableStateFlow<ScoreControlResult?>(null)
    val estimateResult = MutableStateFlow<EventPointEstimate?>(null)
    val planMessage = MutableStateFlow<String?>(null)

    val state = combine(region, contentRefresh, query) { r, token, q -> Triple(r, token, q) }
        .flatMapLatest { (r, token, q) -> repository.observe(r, q, token > 0) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DataResult())
    val live = combine(region, liveRefresh, selectedBoard, worldLinkCharacterId) { r, token, board, character -> LiveRequest(r, token, board, character) }
        .flatMapLatest { request ->
            if (request.board == "worldlink" && request.characterId == null) flowOf(DataResult(phase = ContentPhase.EMPTY))
            else repository.observeLiveRanking(request.region, request.refresh > 0, request.board, request.characterId)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DataResult())
    val forecast = combine(region, selectedEventId.filterNotNull(), window, contentRefresh) { r, eventId, selectedWindow, token -> Quad(r, eventId, selectedWindow, token) }
        .flatMapLatest { repository.observeForecast(it.region, it.eventId, it.window, it.refresh > 0) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DataResult())
    val historyDetail = combine(region, historyEventId, contentRefresh) { r, id, token -> Triple(r, id, token) }
        .flatMapLatest { (r, id, token) -> if (id == null) flowOf(DataResult<EventDetail>(phase = ContentPhase.EMPTY)) else repository.observeEventDetail(r, id, token > 0) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DataResult())
    val rankingDetail = combine(region, selectedEventId.filterNotNull(), selectedRank, selectedBoard, worldLinkCharacterId) { r, eventId, rank, _, character -> RankingRequest(r, eventId, rank, character) }
        .flatMapLatest { if (it.rank == null) flowOf(DataResult<RankingPlayerDetail>(phase = ContentPhase.EMPTY)) else repository.observeRankingDetail(it.region, it.eventId, it.rank, it.characterId) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DataResult())

    init {
        viewModelScope.launch { live.mapNotNull { it.data?.event?.id }.collect { selectedEventId.value = it } }
        viewModelScope.launch { signedIn.filter { it }.collect { bindingsRepository.refresh(); favoriteRepository.refresh() } }
    }

    fun refreshCurrent() { liveRefresh.value++ }
    fun refreshContent() { contentRefresh.value++ }
    fun setPage(value: EventsPage) { selectedPage.value = value; savedState["events_page"] = value.name; if (value != EventsPage.CURRENT) closeRankDetail() }
    fun setWindow(value: ForecastWindow) { window.value = value; savedState["events_window"] = value.name; planResult.value = null }
    fun selectEvent(id: String?) { historyEventId.value = id; savedState["events_history_id"] = id }
    fun selectRank(rank: Int) { selectedRank.value = rank; savedState["events_rank"] = rank }
    fun closeRankDetail() { selectedRank.value = null; savedState["events_rank"] = null }
    fun setTraceMode(value: RankingTraceMode) { traceMode.value = value; savedState["events_trace_mode"] = value.name }
    fun setBoard(value: String) { selectedBoard.value = value; savedState["events_board"] = value; closeRankDetail(); if (value == "overall") setWorldLinkCharacter(null) }
    fun setWorldLinkCharacter(value: Int?) { worldLinkCharacterId.value = value; savedState["events_world_link_character"] = value; closeRankDetail() }
    fun search(value: String) { savedState["events_query"] = value; query.value = query.value.copy(text = value, page = 1) }
    fun filter(key: String, value: String) {
        val selected = query.value.filters.selected.toMutableMap(); val values = selected[key].orEmpty().toMutableSet()
        if (!values.add(value)) values.remove(value); if (values.isEmpty()) selected.remove(key) else selected[key] = values
        query.value = query.value.copy(filters = query.value.filters.copy(selected = selected), page = 1)
    }
    fun toggle(key: String, value: Boolean) { query.value = query.value.copy(filters = query.value.filters.copy(toggles = query.value.filters.toggles + (key to value)), page = 1) }
    fun clearFilters() { query.value = query.value.copy(filters = CatalogFilterState(), page = 1) }
    fun addFavorite(event: EventSummary) = viewModelScope.launch { favoriteRepository.add(FavoriteType.EVENT, region.value, event.id, event.name) }
    fun removeFavorite(favorite: Favorite) = viewModelScope.launch { favoriteRepository.remove(favorite) }
    fun saveFolders(favorite: Favorite, folderIds: Set<String>) = viewModelScope.launch { favoriteRepository.setFolders(favorite, folderIds) }
    fun calculatePlan(input: ScoreControlInput) = viewModelScope.launch {
        planMessage.value = null; planResult.value = null
        repository.calculatePlan(region.value, input).onSuccess { planResult.value = it }.onFailure { planMessage.value = it.message }
    }
    fun estimate(eventId: String, bindingId: String, currentPt: Long, targetPt: Long) = viewModelScope.launch {
        planMessage.value = null; estimateResult.value = null
        repository.estimateBoundPt(region.value, eventId, bindingId, currentPt, targetPt).onSuccess { estimateResult.value = it }.onFailure { planMessage.value = it.message }
    }
    fun createBinding(uid: String, displayName: String, isDefault: Boolean) = viewModelScope.launch {
        bindingsRepository.create(region.value, uid, displayName.ifBlank { null }, isDefault).onSuccess { bindingsRepository.refresh() }.onFailure { planMessage.value = it.message }
    }

    private data class Quad(val region: Region, val eventId: String, val window: ForecastWindow, val refresh: Int)
    private data class LiveRequest(val region: Region, val refresh: Int, val board: String, val characterId: Int?)
    private data class RankingRequest(val region: Region, val eventId: String, val rank: Int?, val characterId: Int?)
}

@Composable
fun EventsScreen(
    onLogin: () -> Unit = {},
    onOpenRelated: (EventNavigationTarget) -> Unit = {},
    viewModel: EventsViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState(); val live by viewModel.live.collectAsState(); val forecast by viewModel.forecast.collectAsState()
    val historyDetail by viewModel.historyDetail.collectAsState(); val rankingDetail by viewModel.rankingDetail.collectAsState()
    val query by viewModel.query.collectAsState(); val page by viewModel.selectedPage.collectAsState(); val window by viewModel.window.collectAsState()
    val board by viewModel.selectedBoard.collectAsState(); val signedIn by viewModel.signedIn.collectAsState(); val favorites by viewModel.favorites.collectAsState()
    val folders by viewModel.folders.collectAsState(); val traceMode by viewModel.traceMode.collectAsState()
    val selectedHistoryEventId by viewModel.selectedHistoryEventId.collectAsState()
    val lifecycleOwner = LocalLifecycleOwner.current
    var inForeground by remember { mutableStateOf(lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    var showFilters by rememberSaveable { mutableStateOf(false) }; var organizingId by rememberSaveable { mutableStateOf<String?>(null) }
    var countdown by remember { mutableIntStateOf(10) }
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, _ -> inForeground = lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) }
        lifecycleOwner.lifecycle.addObserver(observer); onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(page, inForeground) {
        countdown = 10
        if (page == EventsPage.CURRENT && inForeground) while (true) {
            delay(1_000); countdown--
            if (countdown <= 0) { viewModel.refreshCurrent(); countdown = 10 }
        }
    }
    val favoriteAction: (EventSummary) -> Unit = { event ->
        if (!signedIn) onLogin() else if (event.id in favorites) organizingId = event.id else viewModel.addFavorite(event)
    }
    Scaffold(topBar = {
        TopAppBar(title = { Text(stringResource(R.string.events_title)) }, actions = {
            if (page == EventsPage.HISTORY) IconButton({ showFilters = true }) { Icon(Icons.Outlined.FilterList, stringResource(R.string.events_filters)) }
            IconButton(if (page == EventsPage.CURRENT) viewModel::refreshCurrent else viewModel::refreshContent) { Icon(Icons.Outlined.Refresh, stringResource(R.string.events_refresh)) }
        })
    }) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            PrimaryTabRow(selectedTabIndex = page.ordinal) {
                EventsPage.entries.forEach { item -> Tab(page == item, { viewModel.setPage(item) }, text = { Text(stringResource(item.labelResource())) }) }
            }
            when (page) {
                EventsPage.CURRENT -> CurrentRankingPage(live, rankingDetail, board, traceMode, countdown, viewModel)
                EventsPage.FORECAST -> ForecastPage(forecast, window, viewModel, signedIn, onLogin)
                EventsPage.HISTORY -> HistoryPage(state, historyDetail, selectedHistoryEventId, query, favorites.keys, favoriteAction, viewModel, onOpenRelated)
            }
        }
    }
    if (showFilters) CatalogFilterSheet(
        meta = state.data?.events?.filterMeta ?: CatalogFilterMeta(), state = query.filters,
        status = state.data?.events?.filterStatus ?: FilterMetadataStatus.LOADING, message = state.data?.events?.filterMessage,
        resultCount = state.data?.events?.total, title = stringResource(R.string.events_filters), clearLabel = stringResource(R.string.events_clear_filters),
        doneLabel = stringResource(R.string.events_done), unavailableLabel = stringResource(R.string.events_filters_unavailable),
        onOption = viewModel::filter, onToggle = viewModel::toggle, onClear = viewModel::clearFilters,
        onRetry = viewModel::refreshContent, onDismiss = { showFilters = false }
    )
    organizingId?.let(favorites::get)?.let { favorite ->
        FavoriteFolderSheet(favorite, folders, false, { organizingId = null }, { viewModel.saveFolders(favorite, it); organizingId = null }, { viewModel.removeFavorite(favorite); organizingId = null })
    }
}

@Composable
private fun CurrentRankingPage(
    result: DataResult<LiveRankingSnapshot>, detail: DataResult<RankingPlayerDetail>, board: String,
    traceMode: RankingTraceMode, countdown: Int, viewModel: EventsViewModel
) {
    val selectedRank by viewModel.selectedRank.collectAsState(); val selectedCharacter by viewModel.worldLinkCharacterId.collectAsState()
    val listState = rememberLazyListState()
    BackHandler(selectedRank != null, viewModel::closeRankDetail)
    ResultContent(result, Modifier.fillMaxSize(), viewModel::refreshCurrent) { snapshot ->
        BoxWithConstraints {
            val expanded = maxWidth >= 840.dp
            if (!expanded && selectedRank != null) RankingDetailPage(detail, traceMode, viewModel)
            else Row(Modifier.fillMaxSize()) {
                RankingList(snapshot, board, selectedCharacter, countdown, viewModel, listState, Modifier.weight(if (expanded) .56f else 1f))
                if (expanded) {
                    VerticalDivider()
                    Box(Modifier.weight(.44f)) {
                        if (selectedRank == null) Text(stringResource(R.string.events_select_ranking), Modifier.padding(24.dp))
                        else RankingDetailPage(detail, traceMode, viewModel, showBack = false)
                    }
                }
            }
        }
    }
}

@Composable
private fun RankingList(snapshot: LiveRankingSnapshot, board: String, selectedCharacter: Int?, countdown: Int, viewModel: EventsViewModel, listState: LazyListState, modifier: Modifier) {
    var search by rememberSaveable { mutableStateOf("") }
    val visible = remember(snapshot.top100, search) {
        snapshot.top100.filter { search.isBlank() || "${it.rank} ${it.name} ${it.userId}".contains(search, true) }
    }
    LazyColumn(modifier, state = listState, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            val event = snapshot.event
            event?.bannerUrl?.let { BackendImage(listOf(it), event.name, "event:${event.id}:ranking", Modifier.fillMaxWidth().aspectRatio(3.2f), ContentScale.Crop) }
            Text(event?.name ?: stringResource(R.string.events_empty), style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusPill(sourceHealthLabel(snapshot.sourceHealth), Modifier.weight(1f))
                StatusPill(stringResource(R.string.events_refresh_countdown, countdown), Modifier.weight(1f))
            }
            Text(stringResource(R.string.events_updated, formatTime(snapshot.updatedAt)), color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (snapshot.warnings.isNotEmpty()) AssistChip(onClick = {}, label = { Text(snapshot.warnings.first(), maxLines = 2) }, leadingIcon = { Icon(Icons.Outlined.Info, null) })
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 8.dp)) {
                SegmentedButton(board == "overall", { viewModel.setBoard("overall") }, SegmentedButtonDefaults.itemShape(0, 2)) { Text(stringResource(R.string.events_overall)) }
                SegmentedButton(board == "worldlink", { viewModel.setBoard("worldlink") }, SegmentedButtonDefaults.itemShape(1, 2), enabled = snapshot.worldLinkAvailable) { Text(stringResource(R.string.events_world_link)) }
            }
            if (board == "worldlink") WorldLinkSelector(snapshot.worldLinkCharacters, selectedCharacter, viewModel::setWorldLinkCharacter)
        }
        if (board == "worldlink" && selectedCharacter == null) item { Text(stringResource(R.string.events_world_link_prompt), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        else {
            item { SectionTitle(stringResource(R.string.events_borders), snapshot.borders.size) }
            item { BorderGrid(snapshot.borders, viewModel::selectRank) }
            item {
                SectionTitle(stringResource(R.string.events_top), visible.size)
                OutlinedTextField(search, { search = it }, Modifier.fillMaxWidth(), leadingIcon = { Icon(Icons.Outlined.Search, null) }, label = { Text(stringResource(R.string.events_ranking_search)) }, singleLine = true)
            }
            items(visible, key = { "${snapshot.boardType}:${snapshot.gameCharacterId}:${it.rank}" }) { entry -> RankingRow(entry, viewModel::selectRank) }
        }
    }
}

@Composable private fun WorldLinkSelector(characters: List<WorldLinkCharacter>, selected: Int?, onSelect: (Int?) -> Unit) {
    if (characters.isEmpty()) { Text(stringResource(R.string.events_world_link_no_characters), color = MaterialTheme.colorScheme.onSurfaceVariant); return }
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        characters.forEach { character ->
            FilterChip(selected == character.id, { onSelect(character.id) }, label = { Text(character.name) }, leadingIcon = {
                BackendImage(character.imageCandidates, null, "worldlink:${character.id}", Modifier.size(28.dp), ContentScale.Crop)
            })
        }
    }
}

@Composable private fun BorderGrid(entries: List<RankingEntry>, onClick: (Int) -> Unit) {
    if (entries.isEmpty()) { Text(stringResource(R.string.events_no_borders), color = MaterialTheme.colorScheme.onSurfaceVariant); return }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        entries.chunked(2).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            row.forEach { entry -> ElevatedCard(Modifier.weight(1f).clickable { onClick(entry.rank) }) { Column(Modifier.padding(12.dp)) {
                Text("T${entry.rank}", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Text("${number(entry.score)} PT", style = MaterialTheme.typography.titleMedium)
                Text(entry.hourlyGrowth?.let { "+${number(it)}/h" } ?: "-", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(formatTime(entry.updatedAt), style = MaterialTheme.typography.labelSmall)
            } } }
            if (row.size == 1) Spacer(Modifier.weight(1f))
        } }
    }
}

@Composable private fun RankingRow(entry: RankingEntry, onClick: (Int) -> Unit) {
    val candidates = orderedImageCandidates(entry.leaderImageCandidates, entry.leaderCharacterImageCandidates, listOf(entry.leaderImageUrl))
    ListItem(
        headlineContent = { Text(entry.name ?: stringResource(R.string.events_unknown_player), maxLines = 1, overflow = TextOverflow.Ellipsis) },
        overlineContent = { Text("#${entry.rank}  ${entry.userId ?: ""}", maxLines = 1) },
        supportingContent = { Text("${entry.hourlyGrowth?.let { "+${number(it)}/h" } ?: "-"}  ·  ${formatTime(entry.updatedAt)}") },
        leadingContent = { BackendImage(candidates, entry.name, "ranking:${entry.rank}:${entry.userId}:leader", Modifier.size(52.dp), ContentScale.Crop) },
        trailingContent = { Text(number(entry.score), style = MaterialTheme.typography.titleMedium) },
        modifier = Modifier.fillMaxWidth().clickable { onClick(entry.rank) }
    )
    HorizontalDivider()
}

@Composable private fun RankingDetailPage(result: DataResult<RankingPlayerDetail>, mode: RankingTraceMode, viewModel: EventsViewModel, showBack: Boolean = true) {
    ResultContent(result, Modifier.fillMaxSize(), viewModel::refreshCurrent) { detail ->
        val trace = if (mode == RankingTraceMode.PLAYER) detail.playerTrace else detail.lineTrace
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                if (showBack) IconButton(viewModel::closeRankDetail) { Icon(Icons.Outlined.ArrowBack, stringResource(R.string.events_back)) }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (mode == RankingTraceMode.PLAYER) BackendImage(orderedImageCandidates(detail.entry.leaderImageCandidates, detail.entry.leaderCharacterImageCandidates, listOf(detail.entry.leaderImageUrl)), detail.entry.name, "ranking-detail:${detail.entry.rank}", Modifier.size(76.dp), ContentScale.Crop)
                    else Box(Modifier.size(76.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) { Text("T${detail.entry.rank}", style = MaterialTheme.typography.titleLarge) }
                    Column {
                        Text(if (mode == RankingTraceMode.PLAYER) detail.entry.name ?: stringResource(R.string.events_unknown_player) else "T${detail.entry.rank} ${stringResource(R.string.events_line)}", style = MaterialTheme.typography.headlineSmall)
                        Text("${number(detail.entry.score)} PT", style = MaterialTheme.typography.titleLarge)
                        Text(stringResource(R.string.events_sample_time, formatTime(detail.entry.updatedAt)))
                    }
                }
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                    SegmentedButton(mode == RankingTraceMode.PLAYER, { viewModel.setTraceMode(RankingTraceMode.PLAYER) }, SegmentedButtonDefaults.itemShape(0, 2)) { Text(stringResource(R.string.events_player_trace)) }
                    SegmentedButton(mode == RankingTraceMode.LINE, { viewModel.setTraceMode(RankingTraceMode.LINE) }, SegmentedButtonDefaults.itemShape(1, 2)) { Text(stringResource(R.string.events_line_trace)) }
                }
            }
            item { MetricGrid(detail, mode) }
            if (mode == RankingTraceMode.PLAYER) item {
                Text(detail.profileWord?.ifBlank { stringResource(R.string.events_no_signature) } ?: stringResource(R.string.events_no_signature), color = MaterialTheme.colorScheme.onSurfaceVariant)
                detail.entry.leaderCardId?.let { Text(stringResource(R.string.events_leader_card_detail, it, detail.entry.leaderCardLevel ?: 0, detail.entry.leaderCardMasterRank ?: 0), style = MaterialTheme.typography.bodySmall) }
                if (detail.profileHonors.isNotEmpty()) {
                    Text(stringResource(R.string.events_profile_honors), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
                    detail.profileHonors.sortedBy { it.seq ?: Int.MAX_VALUE }.forEach { honor ->
                        honor.honorId?.let { Text(stringResource(R.string.events_profile_honor_item, it, honor.level ?: 0), style = MaterialTheme.typography.bodySmall) }
                    }
                }
            }
            item { TraceChart(trace, stringResource(if (mode == RankingTraceMode.PLAYER) R.string.events_player_trace else R.string.events_line_trace)) }
            if (mode == RankingTraceMode.PLAYER && detail.hourlyChurn.isNotEmpty()) item { ChurnHeatmap(detail.hourlyChurn) }
            if (mode == RankingTraceMode.PLAYER && detail.recentScoreChanges.isNotEmpty()) item { ScoreChanges(detail.recentScoreChanges) }
            if (mode == RankingTraceMode.PLAYER && detail.parkingPeriods.isNotEmpty()) item { ParkingPeriods(detail.parkingPeriods) }
            item {
                SectionTitle(stringResource(R.string.events_trace_samples), trace.size)
                trace.takeLast(24).reversed().forEach { point -> ListItem(headlineContent = { Text("${number(point.score)} PT") }, supportingContent = { Text(formatTraceTime(point)) }, trailingContent = { Text(point.rank?.let { "#$it" } ?: "") }) }
            }
            item {
                SectionTitle(stringResource(R.string.events_neighbors), listOfNotNull(detail.previous, detail.next).size)
                detail.previous?.let { NeighborRow(stringResource(R.string.events_previous), it, viewModel::selectRank) }
                detail.next?.let { NeighborRow(stringResource(R.string.events_next), it, viewModel::selectRank) }
            }
        }
    }
}

@Composable private fun MetricGrid(detail: RankingPlayerDetail, mode: RankingTraceMode) {
    val hasChurn = mode == RankingTraceMode.PLAYER && detail.churn1h != null && detail.churnStatus in listOf("fresh", "stale-refreshing")
    val metrics = if (mode == RankingTraceMode.LINE) listOf(
        stringResource(R.string.events_speed_label) to (detail.rankHourlyGrowth?.let { "+${number(it)} PT/h" } ?: "-"),
        stringResource(R.string.events_interval) to detail.intervalSeconds?.let { "${it / 60} min" }.orEmpty(),
        stringResource(R.string.events_updates_1h) to (detail.observedPtUpdates ?: 0).toString()
    ) else listOf(
        stringResource(R.string.events_speed_label) to (detail.growth1h?.let { "+${number(it)} PT/h" } ?: "-"),
        stringResource(if (hasChurn) R.string.events_churn_1h else R.string.events_updates_1h) to
            (if (hasChurn) detail.churn1h?.toString() else detail.observedPtUpdates?.toString()).orEmpty(),
        stringResource(if (hasChurn) R.string.events_churn_48h else R.string.events_interval) to
            (if (hasChurn) detail.churn48h?.toString() else detail.intervalSeconds?.let { "${it / 60} min" }) .orEmpty()
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { metrics.chunked(2).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        row.forEach { (label, value) -> ElevatedCard(Modifier.weight(1f)) { Column(Modifier.padding(12.dp)) { Text(label, style = MaterialTheme.typography.labelMedium); Text(value, style = MaterialTheme.typography.titleMedium) } } }
        if (row.size == 1) Spacer(Modifier.weight(1f))
    } } }
}

@Composable private fun TraceChart(points: List<RankingTracePoint>, label: String) {
    val sorted = points.sortedBy { it.timestamp ?: parseTime(it.sampledAt) }
    val lineColor = MaterialTheme.colorScheme.primary
    Card(Modifier.fillMaxWidth().semantics { contentDescription = "$label, ${points.size} samples" }) {
        if (sorted.size < 2) Text(stringResource(R.string.events_trace_insufficient), Modifier.padding(24.dp))
        else Canvas(Modifier.fillMaxWidth().height(220.dp).padding(20.dp)) {
            val scores = sorted.map { it.score.toFloat() }; val min = scores.minOrNull() ?: 0f; val max = (scores.maxOrNull() ?: 1f).coerceAtLeast(min + 1)
            val path = Path()
            sorted.forEachIndexed { index, point ->
                val x = size.width * index / (sorted.lastIndex.coerceAtLeast(1)).toFloat(); val y = size.height * (1f - (point.score - min) / (max - min))
                if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            drawPath(path, lineColor, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 5f))
        }
    }
}

@Composable private fun ChurnHeatmap(hours: List<ChurnHour>) {
    Column { SectionTitle(stringResource(R.string.events_churn_heatmap), hours.size); hours.takeLast(48).chunked(12).forEach { row -> Row(Modifier.fillMaxWidth()) {
        row.forEach { hour -> val alpha = (.12f + hour.count.coerceAtMost(20) / 24f).coerceAtMost(.95f); Box(Modifier.weight(1f).aspectRatio(1f).padding(1.dp).background(MaterialTheme.colorScheme.primary.copy(alpha = alpha), RoundedCornerShape(2.dp)), contentAlignment = Alignment.Center) { Text(hour.count.toString(), style = MaterialTheme.typography.labelSmall) } }
    } } }
}

@Composable private fun ScoreChanges(changes: List<ScoreChange>) { Column { SectionTitle(stringResource(R.string.events_recent_changes), changes.size); changes.takeLast(24).reversed().forEach { ListItem(headlineContent = { Text(formatEpoch(it.timestamp)) }, trailingContent = { Text("+${number(it.delta)} PT", color = MaterialTheme.colorScheme.primary) }) } } }
@Composable private fun ParkingPeriods(periods: List<ParkingPeriod>) { Column { SectionTitle(stringResource(R.string.events_parking_periods), periods.size); periods.takeLast(12).reversed().forEach { period -> ListItem(headlineContent = { Text(formatEpoch(period.startTime ?: period.sinceMs)) }, supportingContent = { Text(period.endTime?.let(::formatEpoch) ?: stringResource(R.string.events_still_parking)) }, trailingContent = { Text(period.durationSeconds?.let { "${it / 60} min" } ?: "-") }) } } }
@Composable private fun NeighborRow(label: String, item: RankingNeighbor, onClick: (Int) -> Unit) { ListItem(headlineContent = { Text("$label  #${item.rank} ${item.name.orEmpty()}") }, trailingContent = { Text(number(item.score)) }, modifier = Modifier.clickable { onClick(item.rank) }) }

@Composable
private fun ForecastPage(result: DataResult<ForecastDashboard>, window: ForecastWindow, viewModel: EventsViewModel, signedIn: Boolean, onLogin: () -> Unit) {
    val bindings by viewModel.bindings.collectAsState(); val plan by viewModel.planResult.collectAsState(); val estimate by viewModel.estimateResult.collectAsState(); val message by viewModel.planMessage.collectAsState()
    var targetRank by rememberSaveable { mutableStateOf("100") }; var currentPt by rememberSaveable { mutableStateOf("0") }; var targetPt by rememberSaveable { mutableStateOf("0") }
    var minutes by rememberSaveable { mutableStateOf("60") }; var ptPerRun by rememberSaveable { mutableStateOf("1000") }; var runs by rememberSaveable { mutableStateOf("") }
    var selectedBinding by rememberSaveable { mutableStateOf<String?>(null) }; var showBindingForm by rememberSaveable { mutableStateOf(false) }; var bindingUid by rememberSaveable { mutableStateOf("") }; var bindingName by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(estimate?.estimatedPt) { estimate?.estimatedPt?.let { ptPerRun = it.toString() } }
    ResultContent(result, Modifier.fillMaxSize(), viewModel::refreshContent) { dashboard ->
        val summary = dashboard.summaries[window]
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) { ForecastWindow.entries.forEachIndexed { index, value -> SegmentedButton(window == value, { viewModel.setWindow(value) }, SegmentedButtonDefaults.itemShape(index, ForecastWindow.entries.size)) { Text(value.label()) } } }
                Text(stringResource(R.string.events_real_samples_only), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            }
            item { ForecastHealth(summary, dashboard) }
            if (dashboard.warnings.isNotEmpty()) item { Text(dashboard.warnings.take(3).joinToString(" / "), color = MaterialTheme.colorScheme.error) }
            item { HistoryTrendChart(dashboard.history, dashboard.lines) }
            item { SectionTitle(stringResource(R.string.events_history_samples), dashboard.historySummary.size) }
            items(dashboard.historySummary.take(12), key = { "${it.sampleType}:${it.rank}" }) { HistorySummaryCard(it) }
            item { SectionTitle(stringResource(R.string.events_forecast_lines), dashboard.lines.size) }
            items(dashboard.lines, key = { it.rank }) { ForecastLineCard(it) }
            item {
                PlanningCard(
                    signedIn, bindings, selectedBinding, onLogin, { selectedBinding = it }, showBindingForm, { showBindingForm = !showBindingForm },
                    bindingUid, { bindingUid = it }, bindingName, { bindingName = it }, { viewModel.createBinding(bindingUid, bindingName, false) },
                    targetRank, { value -> targetRank = value; dashboard.lines.find { it.rank.toString() == value }?.let { targetPt = (it.forecast3h ?: it.currentScore ?: 0).toString() } },
                    currentPt, { currentPt = it }, targetPt, { targetPt = it }, minutes, { minutes = it }, ptPerRun, { ptPerRun = it }, runs, { runs = it },
                    calculate = { viewModel.calculatePlan(ScoreControlInput(dashboard.eventId, targetRank.toIntOrNull() ?: 100, currentPt.toLongOrNull() ?: 0, targetPt.toLongOrNull() ?: 0, minutes.toIntOrNull() ?: 0, ptPerRun.toLongOrNull() ?: 0, runs.toIntOrNull(), selectedBinding)) },
                    estimate = selectedBinding?.let { binding -> { viewModel.estimate(dashboard.eventId, binding, currentPt.toLongOrNull() ?: 0, targetPt.toLongOrNull() ?: 0) } }, result = plan, estimateResult = estimate, message = message
                )
            }
        }
    }
}

@Composable private fun ForecastHealth(summary: ForecastWindowSummary?, dashboard: ForecastDashboard) { ElevatedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Text(stringResource(R.string.events_window_health), style = MaterialTheme.typography.titleMedium)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { MetricText(stringResource(R.string.events_lines), summary?.lineCount ?: dashboard.lines.size); MetricText(stringResource(R.string.events_max_samples), summary?.maxSampleCount ?: 0); MetricText(stringResource(R.string.events_confidence), summary?.confidence ?: "unavailable") }
    Text(stringResource(R.string.events_source_health, sourceHealthLabel(dashboard.sourceHealth), dashboard.sourceHealth.primarySource ?: dashboard.source ?: "-"), style = MaterialTheme.typography.bodySmall)
    dashboard.sourceHealth.fallbackLine?.let { Text(stringResource(R.string.events_fallback_source, it), style = MaterialTheme.typography.bodySmall) }
    dashboard.sourceHealth.cacheUpdatedAt?.let { Text(stringResource(R.string.events_cache_time, formatTime(it)), style = MaterialTheme.typography.bodySmall) }
    (dashboard.warnings + dashboard.sourceHealth.warnings).distinct().forEach { warning -> Text(warning, color = MaterialTheme.colorScheme.tertiary, style = MaterialTheme.typography.bodySmall) }
    Text(dashboard.retentionRecommendation ?: stringResource(R.string.events_real_samples_only), style = MaterialTheme.typography.bodySmall)
} } }
@Composable private fun MetricText(label: String, value: Any) { Column(horizontalAlignment = Alignment.CenterHorizontally) { Text(label, style = MaterialTheme.typography.labelSmall); Text(value.toString(), fontWeight = FontWeight.Bold) } }

@Composable private fun HistoryTrendChart(samples: List<RankingHistoryPoint>, lines: List<ForecastLine>) {
    val ranks = lines.take(6).map { it.rank }; val visible = samples.filter { it.rank in ranks }.sortedBy { parseTime(it.sampledAt) }
    Card(Modifier.fillMaxWidth().semantics { contentDescription = "${visible.size} real ranking history samples" }) {
        Column(Modifier.padding(12.dp)) {
            Text(stringResource(R.string.events_trend_chart), style = MaterialTheme.typography.titleMedium)
            if (visible.size < 2) Text(stringResource(R.string.events_trace_insufficient), Modifier.padding(vertical = 24.dp))
            else Canvas(Modifier.fillMaxWidth().height(240.dp).padding(12.dp)) {
                val times = visible.map { parseTime(it.sampledAt).toFloat() }; val scores = visible.map { it.score.toFloat() }
                val minTime = times.minOrNull() ?: 0f; val maxTime = (times.maxOrNull() ?: 1f).coerceAtLeast(minTime + 1); val minScore = scores.minOrNull() ?: 0f; val maxScore = (scores.maxOrNull() ?: 1f).coerceAtLeast(minScore + 1)
                val colors = listOf(Color(0xFF008577), Color(0xFF4E7B32), Color(0xFFB55A30), Color(0xFF6750A4), Color(0xFFC24678), Color(0xFF256B86))
                ranks.forEachIndexed { index, rank ->
                    val points = visible.filter { it.rank == rank }; if (points.size > 1) { val path = Path(); points.forEachIndexed { pointIndex, point ->
                        val x = size.width * ((parseTime(point.sampledAt).toFloat() - minTime) / (maxTime - minTime)); val y = size.height * (1f - (point.score - minScore) / (maxScore - minScore)); if (pointIndex == 0) path.moveTo(x, y) else path.lineTo(x, y)
                    }; drawPath(path, colors[index % colors.size], style = androidx.compose.ui.graphics.drawscope.Stroke(4f)) }
                }
            }
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) { ranks.forEach { Text("T$it") } }
        }
    }
}

@Composable private fun HistorySummaryCard(line: HistorySummaryLine) { OutlinedCard(Modifier.fillMaxWidth()) { Row(Modifier.padding(14.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
    Column { Text("T${line.rank}", fontWeight = FontWeight.Bold); Text("${number(line.latestScore)} PT"); Text(stringResource(R.string.events_sample_span, line.sampleCount, line.sampleSpanHours ?: 0.0), style = MaterialTheme.typography.bodySmall) }
    Column(horizontalAlignment = Alignment.End) { Text(line.speedPerHour?.let { "${number(it)} PT/h" } ?: "-"); Text(line.confidence ?: "unavailable"); Text(line.confidenceReason ?: formatTime(line.latestSampledAt), style = MaterialTheme.typography.labelSmall) }
} } }
@Composable private fun ForecastLineCard(line: ForecastLine) { OutlinedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text("T${line.rank}", style = MaterialTheme.typography.titleMedium); Text("${number(line.currentScore)} PT", fontWeight = FontWeight.Bold) }
    Text(stringResource(R.string.events_forecast_values, number(line.hourlyGrowth), number(line.forecast1h), number(line.forecast3h), number(line.forecastEnd)))
    Text(stringResource(R.string.events_sample_span, line.sampleCount, line.sampleSpanHours ?: 0.0), style = MaterialTheme.typography.bodySmall)
    Text(line.unavailableReason ?: line.confidenceReason ?: line.confidence ?: stringResource(R.string.events_insufficient), color = MaterialTheme.colorScheme.onSurfaceVariant)
} } }

@Composable private fun PlanningCard(
    signedIn: Boolean, bindings: List<PlayerBindingSummary>, selectedBinding: String?, onLogin: () -> Unit, onBinding: (String?) -> Unit,
    showForm: Boolean, toggleForm: () -> Unit, uid: String, setUid: (String) -> Unit, name: String, setName: (String) -> Unit, create: () -> Unit,
    rank: String, setRank: (String) -> Unit, current: String, setCurrent: (String) -> Unit, target: String, setTarget: (String) -> Unit,
    minutes: String, setMinutes: (String) -> Unit, perRun: String, setPerRun: (String) -> Unit, runs: String, setRuns: (String) -> Unit,
    calculate: () -> Unit, estimate: (() -> Unit)?, result: ScoreControlResult?, estimateResult: EventPointEstimate?, message: String?
) { ElevatedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    Text(stringResource(R.string.events_planning), style = MaterialTheme.typography.titleMedium)
    if (!signedIn) { Text(stringResource(R.string.events_login_for_binding)); OutlinedButton(onLogin) { Text(stringResource(R.string.events_login)) } }
    else {
        Text(stringResource(R.string.events_binding_label)); Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) { bindings.forEach { binding -> FilterChip(selectedBinding == binding.id, { onBinding(if (selectedBinding == binding.id) null else binding.id) }, label = { Text(binding.displayName ?: binding.playerUid) }) } }
        OutlinedButton(toggleForm) { Text(stringResource(R.string.events_add_binding)) }
        if (showForm) { PlanField(stringResource(R.string.events_uid), uid, setUid); OutlinedTextField(name, setName, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.events_display_name)) }); Button(create, enabled = uid.length in 10..20) { Text(stringResource(R.string.events_save_binding)) } }
    }
    PlanField(stringResource(R.string.events_target_rank), rank, setRank); PlanField(stringResource(R.string.events_current_pt), current, setCurrent); PlanField(stringResource(R.string.events_target_pt), target, setTarget)
    PlanField(stringResource(R.string.events_remaining_minutes), minutes, setMinutes); PlanField(stringResource(R.string.events_pt_per_run), perRun, setPerRun); PlanField(stringResource(R.string.events_available_runs), runs, setRuns)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { Button(calculate, Modifier.weight(1f)) { Text(stringResource(R.string.events_calculate)) }; OutlinedButton({ estimate?.invoke() }, Modifier.weight(1f), enabled = estimate != null) { Text(stringResource(R.string.events_estimate_binding)) } }
    estimateResult?.let { Text(stringResource(R.string.events_estimated_pt, it.estimatedPt), color = MaterialTheme.colorScheme.primary) }; message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    result?.let { calculated -> Text(stringResource(R.string.events_plan_result, calculated.remainingPt, calculated.requiredRuns ?: 0, calculated.requiredRunsPerHour ?: 0.0, if (calculated.feasible) stringResource(R.string.events_feasible) else stringResource(R.string.events_not_feasible))) }
} } }
@Composable private fun PlanField(label: String, value: String, onValue: (String) -> Unit) { OutlinedTextField(value, { onValue(it.filter(Char::isDigit)) }, Modifier.fillMaxWidth(), label = { Text(label) }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), singleLine = true) }

@Composable private fun HistoryPage(
    state: DataResult<EventDashboard>, detail: DataResult<EventDetail>, selectedId: String?, query: EventQuery, favorites: Set<String>,
    favoriteAction: (EventSummary) -> Unit, viewModel: EventsViewModel, onOpenRelated: (EventNavigationTarget) -> Unit
) {
    val listState = rememberLazyListState()
    BackHandler(selectedId != null) { viewModel.selectEvent(null) }
    ResultContent(state, Modifier.fillMaxSize(), viewModel::refreshContent) { dashboard ->
        BoxWithConstraints {
            val expanded = maxWidth >= 840.dp
            if (!expanded && selectedId != null) EventDetailContent(detail, true, favorites, favoriteAction, { viewModel.selectEvent(null) }, onOpenRelated)
            else Row(Modifier.fillMaxSize()) {
                HistoryList(dashboard, query, favorites, favoriteAction, viewModel, listState, Modifier.weight(if (expanded) .52f else 1f))
                if (expanded) { VerticalDivider(); Box(Modifier.weight(.48f)) { if (selectedId == null) Text(stringResource(R.string.events_select_history), Modifier.padding(24.dp)) else EventDetailContent(detail, false, favorites, favoriteAction, { viewModel.selectEvent(null) }, onOpenRelated) } }
            }
        }
    }
}

@Composable private fun HistoryList(dashboard: EventDashboard, query: EventQuery, favorites: Set<String>, favoriteAction: (EventSummary) -> Unit, viewModel: EventsViewModel, listState: LazyListState, modifier: Modifier) {
    LaunchedEffect(query.text, query.filters, query.page, query.sort) { listState.scrollToItem(0) }
    LazyColumn(modifier, state = listState, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { OutlinedTextField(query.text, viewModel::search, Modifier.fillMaxWidth(), leadingIcon = { Icon(Icons.Outlined.Search, null) }, label = { Text(stringResource(R.string.events_search)) }, singleLine = true) }
        items(dashboard.events.items, key = { it.id }) { event ->
            ElevatedCard(Modifier.fillMaxWidth().clickable { viewModel.selectEvent(event.id) }) {
                Column {
                    event.bannerUrl?.let { BackendImage(listOf(it), event.name, "event:${event.id}:history", Modifier.fillMaxWidth().aspectRatio(3.2f), ContentScale.Crop) }
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) { Text(event.name, style = MaterialTheme.typography.titleMedium); Text("${event.eventType ?: stringResource(R.string.events_event)} · ${event.eventUnit ?: "-"}"); Text("${formatTime(event.startAt)} · ID ${event.id}", style = MaterialTheme.typography.bodySmall) }
                        IconButton({ favoriteAction(event) }) { Icon(if (event.id in favorites) Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder, stringResource(R.string.events_favorite)) }
                    }
                }
            }
        }
    }
}

@Composable private fun EventDetailContent(
    result: DataResult<EventDetail>, showBack: Boolean, favorites: Set<String>, favoriteAction: (EventSummary) -> Unit,
    onBack: () -> Unit, onOpenRelated: (EventNavigationTarget) -> Unit
) { ResultContent(result, Modifier.fillMaxSize(), {}) { detail -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    item {
        if (showBack) IconButton(onBack) { Icon(Icons.Outlined.ArrowBack, stringResource(R.string.events_back_to_history)) }
        BackendImage(listOf(detail.event.bannerUrl), detail.event.name, "event:${detail.event.id}:detail", Modifier.fillMaxWidth().aspectRatio(3.2f), ContentScale.Crop, true)
        Row(Modifier.fillMaxWidth().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) { Text(detail.event.name, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f)); IconButton({ favoriteAction(detail.event) }) { Icon(if (detail.event.id in favorites) Icons.Outlined.Favorite else Icons.Outlined.FavoriteBorder, stringResource(R.string.events_favorite)) } }
        Text("${detail.event.eventType ?: stringResource(R.string.events_event)} · ${detail.event.eventUnit ?: "-"}")
    }
    item { EventTimeGrid(detail.event) }
    item { Text(detail.event.storyOutline ?: stringResource(R.string.events_story_unavailable), style = MaterialTheme.typography.bodyLarge) }
    if (detail.event.bonusCharacterIds.isNotEmpty() || detail.event.bonusAttributes.isNotEmpty()) item { ElevatedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp)) { Text(stringResource(R.string.events_bonus), style = MaterialTheme.typography.titleMedium); Text(stringResource(R.string.events_bonus_characters, detail.event.bonusCharacterIds.joinToString())); Text(stringResource(R.string.events_bonus_attributes, detail.event.bonusAttributes.joinToString())) } } }
    item { SectionTitle(stringResource(R.string.events_related_songs), detail.relatedSongs.size) }
    items(detail.relatedSongs, key = { "song:${it.id}" }) { song -> ListItem(headlineContent = { Text(song.title) }, supportingContent = { Text("${song.unit} · ID ${song.id}") }, leadingContent = { BackendImage(song.jacketCandidates, song.title, "event-song:${song.id}", Modifier.size(60.dp), ContentScale.Crop) }, modifier = Modifier.clickable { onOpenRelated(EventNavigationTarget(FavoriteType.SONG, song.id)) }) }
    item { SectionTitle(stringResource(R.string.events_related_cards), detail.relatedCards.size) }
    items(detail.relatedCards, key = { "card:${it.id}" }) { card -> ListItem(headlineContent = { Text(card.title) }, supportingContent = { Text("${card.character} · ${card.rarity}★ · ${card.attribute}") }, leadingContent = { BackendImage(card.normalThumbnailCandidates, card.title, "event-card:${card.id}", Modifier.size(60.dp), ContentScale.Crop) }, modifier = Modifier.clickable { onOpenRelated(EventNavigationTarget(FavoriteType.CARD, card.id)) }) }
    item { SectionTitle(stringResource(R.string.events_related_gachas), detail.relatedGachas.size) }
    items(detail.relatedGachas, key = { "gacha:${it.data.id}" }) { gacha -> ListItem(headlineContent = { Text(gacha.data.name) }, supportingContent = { Text("ID ${gacha.data.id}") }, leadingContent = { BackendImage(gacha.data.assets.imageCandidates, gacha.data.name, "event-gacha:${gacha.data.id}", Modifier.size(76.dp), ContentScale.Crop) }, modifier = Modifier.clickable { onOpenRelated(EventNavigationTarget(FavoriteType.GACHA, gacha.data.id)) }) }
} } }

@Composable private fun EventTimeGrid(event: EventSummary) { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    listOf(stringResource(R.string.events_start_time) to event.startAt, stringResource(R.string.events_end_time) to event.endAt, stringResource(R.string.events_aggregate_time) to event.aggregateAt, stringResource(R.string.events_ranking_announce_time) to event.rankingAnnounceAt).forEach { (label, value) -> if (value != null) ListItem(headlineContent = { Text(label) }, trailingContent = { Text(formatTime(value)) }) }
} }

@Composable private fun SectionTitle(title: String, count: Int) { Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f)); Text(count.toString(), color = MaterialTheme.colorScheme.onSurfaceVariant) } }
@Composable private fun StatusPill(text: String, modifier: Modifier = Modifier) { Surface(modifier, color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(6.dp)) { Text(text, Modifier.padding(horizontal = 8.dp, vertical = 5.dp), style = MaterialTheme.typography.labelMedium) } }

private fun EventsPage.labelResource() = when (this) { EventsPage.CURRENT -> R.string.events_current; EventsPage.FORECAST -> R.string.events_forecast_tab; EventsPage.HISTORY -> R.string.events_history_tab }
private fun ForecastWindow.label() = when (this) { ForecastWindow.ALL -> "全部"; ForecastWindow.ONE_HOUR -> "1H"; ForecastWindow.THREE_HOURS -> "3H"; ForecastWindow.SIX_HOURS -> "6H" }
private fun number(value: Number?): String = value?.let { NumberFormat.getNumberInstance().format(it) } ?: "-"
private fun parseTime(value: String?): Long = value?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrDefault(0L) } ?: 0L
private fun formatTime(value: String?): String = value?.let { runCatching { DateTimeFormatter.ofPattern("MM-dd HH:mm:ss").withZone(ZoneId.systemDefault()).format(Instant.parse(it)) }.getOrDefault(it) } ?: "-"
private fun formatEpoch(value: Long?): String { if (value == null || value <= 0) return "-"; val millis = if (value > 1_000_000_000_000L) value else value * 1000; return DateTimeFormatter.ofPattern("MM-dd HH:mm:ss").withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(millis)) }
private fun formatTraceTime(point: RankingTracePoint) = point.sampledAt?.let(::formatTime) ?: formatEpoch(point.timestamp)
private fun sourceHealthLabel(health: SourceHealth) = when (health.status) { "fresh" -> "已更新"; "stale-refreshing" -> "旧缓存刷新中"; "fallback-haruki" -> "备用数据"; "source-unavailable" -> "数据源不可用"; "no-active-event" -> "当前无活动"; else -> health.status }
