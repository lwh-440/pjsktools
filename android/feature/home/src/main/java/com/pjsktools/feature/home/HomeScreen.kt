@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.pjsktools.feature.home

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pjsktools.core.designsystem.ResultContent
import com.pjsktools.core.designsystem.SectionTitle
import com.pjsktools.core.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val statusRepository: StatusRepository,
    private val eventsRepository: EventsRepository,
    private val songsRepository: SongsRepository,
    private val cardsRepository: CardsRepository,
    private val preferences: RegionPreferencesRepository,
    authRepository: AuthRepository,
    favoritesRepository: FavoriteRepository
) : ViewModel() {
    private val refresh = MutableStateFlow(0)
    private val region = preferences.selectedRegion.filterNotNull()
    val signedIn = authRepository.state.map { it is AuthState.SignedIn }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)
    val favoriteCount = favoritesRepository.favorites.map { it.size }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)
    val state = combine(region, refresh) { selected, token -> selected to token }
        .flatMapLatest { (selected, token) ->
            combine(
                statusRepository.observe(selected, token > 0),
                eventsRepository.observeLiveRanking(selected, token > 0),
                songsRepository.observe(selected, SongQuery(pageSize = 1), false),
                cardsRepository.observe(selected, CardQuery(pageSize = 1), false)
            ) { status, ranking, songs, cards -> HomeState(selected, status, ranking, songs, cards) }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    fun refresh() { refresh.value++ }
}

data class HomeState(
    val region: Region,
    val status: DataResult<Pair<RuntimeStatus, EventSummary?>>,
    val ranking: DataResult<LiveRankingSnapshot>,
    val songs: DataResult<Page<SongSummary>>,
    val cards: DataResult<Page<CardSummary>>
)

@Composable
fun HomeScreen(onOpen: (WorkbenchDestination) -> Unit = {}, viewModel: HomeViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState()
    val signedIn by viewModel.signedIn.collectAsState()
    val favoriteCount by viewModel.favoriteCount.collectAsState()
    Scaffold(topBar = {
        TopAppBar(
            title = { Text(stringResource(R.string.home_title)) },
            actions = { IconButton(onClick = viewModel::refresh) { Icon(Icons.Outlined.Refresh, stringResource(R.string.home_refresh)) } }
        )
    }) { padding ->
        val current = state
        if (current == null) {
            CircularProgressIndicator(Modifier.padding(padding).padding(24.dp))
        } else {
            val statusData = current.status.data
            val rankingData = current.ranking.data
            val groups = workbenchGroups(signedIn, favoriteCount)
            LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 180.dp),
                modifier = Modifier.padding(padding).fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("${current.region.displayName} · ${stringResource(R.string.home_workbench)}", style = MaterialTheme.typography.titleMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            MetricCard(stringResource(R.string.home_cached_players), statusData?.first?.cachedPlayers?.toString() ?: "-", Modifier.weight(1f))
                            MetricCard(stringResource(R.string.home_song_count), current.songs.data?.total?.toString() ?: "-", Modifier.weight(1f))
                            MetricCard(stringResource(R.string.home_card_count), current.cards.data?.total?.toString() ?: "-", Modifier.weight(1f))
                        }
                        statusData?.second?.let { event ->
                            ElevatedCard(Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(stringResource(R.string.home_current_event), style = MaterialTheme.typography.labelLarge)
                                    Text(event.name, style = MaterialTheme.typography.titleLarge)
                                    Text("${event.startAt} - ${event.endAt}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    rankingData?.top100?.take(3)?.forEach { entry ->
                                        Text("#${entry.rank}  ${entry.name ?: entry.userId ?: "-"}  ${entry.score}")
                                    }
                                    TextButton(onClick = { onOpen(WorkbenchDestination.CURRENT_EVENT) }) { Text(stringResource(R.string.home_open_ranking)) }
                                }
                            }
                        }
                        Text(
                            if (signedIn) stringResource(R.string.home_signed_in, favoriteCount) else stringResource(R.string.home_signed_out),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        SectionTitle(stringResource(R.string.home_tools))
                    }
                }
                groups.forEach { group ->
                    item(span = { androidx.compose.foundation.lazy.grid.GridItemSpan(maxLineSpan) }) { Text(group.title, style = MaterialTheme.typography.titleSmall) }
                    items(group.items, key = { it.id }) { item ->
                        OutlinedCard(onClick = { item.destination?.let(onOpen) }, enabled = item.available) {
                            Column(Modifier.padding(14.dp)) {
                                Text(item.title, style = MaterialTheme.typography.titleMedium)
                                Text(item.subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun workbenchGroups(signedIn: Boolean, favoriteCount: Int) = listOf(
    WorkbenchGroup("活动工具", listOf(
        WorkbenchItem("current", "当前分数线", "实时档线与排名", WorkbenchDestination.CURRENT_EVENT),
        WorkbenchItem("forecast", "预测线", "趋势与目标规划", WorkbenchDestination.FORECAST),
        WorkbenchItem("history", "往期活动", "活动详情与历史", WorkbenchDestination.HISTORY)
    )),
    WorkbenchGroup("图鉴", listOf(
        WorkbenchItem("songs", "歌曲", "歌曲与谱面", WorkbenchDestination.SONGS),
        WorkbenchItem("cards", "卡牌", "卡面与技能", WorkbenchDestination.CARDS),
        WorkbenchItem("gacha", "卡池", "卡池资料", WorkbenchDestination.GACHAS),
        WorkbenchItem("honor", "称号", "称号资料", WorkbenchDestination.HONORS),
        WorkbenchItem("material", "素材", "素材资料", WorkbenchDestination.MATERIALS),
        WorkbenchItem("costume", "服装", "服装资料", WorkbenchDestination.COSTUMES),
        WorkbenchItem("stamp", "贴图", "贴图资料", WorkbenchDestination.STAMPS),
        WorkbenchItem("comic", "漫画", "漫画资料", WorkbenchDestination.COMICS)
    )),
    WorkbenchGroup("账户与工具", listOf(
        WorkbenchItem("player", "玩家查询", "公开 UID 资料", WorkbenchDestination.PLAYER),
        WorkbenchItem("favorites", "我的收藏", "$favoriteCount 项收藏", WorkbenchDestination.FAVORITES, signedIn),
        WorkbenchItem("settings", "设置", "区服、缓存与主题", WorkbenchDestination.SETTINGS),
        WorkbenchItem("score", "控分工具", "开发中"),
        WorkbenchItem("deck", "卡组比较", "开发中"),
        WorkbenchItem("story", "故事与 Live", "开发中")
    ))
)

@Composable private fun MetricCard(label: String, value: String, modifier: Modifier) {
    ElevatedCard(modifier) { Column(Modifier.padding(14.dp)) { Text(value, style = MaterialTheme.typography.headlineSmall); Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
}
