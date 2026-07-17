@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.pjsktools.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.pjsktools.app.R
import com.pjsktools.core.model.CatalogKind
import com.pjsktools.core.model.AuthRepository
import com.pjsktools.core.model.AuthState
import com.pjsktools.core.model.Favorite
import com.pjsktools.core.model.FavoriteRepository
import com.pjsktools.core.model.FavoriteType
import com.pjsktools.core.model.Region
import com.pjsktools.core.model.RegionPreferencesRepository
import com.pjsktools.core.model.ThemeMode
import com.pjsktools.core.model.WorkbenchDestination
import com.pjsktools.feature.cards.CardsScreen
import com.pjsktools.feature.account.AccountScreen
import com.pjsktools.feature.collections.CollectionsScreen
import com.pjsktools.feature.events.EventNavigationTarget
import com.pjsktools.feature.events.EventsScreen
import com.pjsktools.feature.home.HomeScreen
import com.pjsktools.feature.favorites.FavoritesScreen
import com.pjsktools.feature.onboarding.OnboardingScreen
import com.pjsktools.feature.player.PlayerScreen
import com.pjsktools.feature.settings.SettingsScreen
import com.pjsktools.feature.songs.SongsScreen
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AppUiState(val region: Region? = null, val themeMode: ThemeMode = ThemeMode.SYSTEM, val initialized: Boolean = true)
@HiltViewModel class AppViewModel @Inject constructor(
    private val preferences: RegionPreferencesRepository
) : ViewModel() {
    val state = combine(preferences.selectedRegion, preferences.themeMode) { region, theme -> AppUiState(region, theme, true) }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppUiState())
    fun selectRegion(region: Region) = viewModelScope.launch { preferences.selectRegion(region) }
}

private enum class TopDestination(val route: String, val label: String, val icon: ImageVector) {
    HOME("home", "首页", Icons.Outlined.Home), EVENTS("events", "活动", Icons.Outlined.EmojiEvents), CATALOG("catalog", "图鉴", Icons.Outlined.GridView), PLAYER("player", "玩家", Icons.Outlined.PersonSearch), SETTINGS("settings", "设置", Icons.Outlined.Settings)
}

private object AppRoute {
    const val ACCOUNT = "account"
    const val FAVORITES = "favorites"
}

private data class CatalogNavigationTarget(val kind: FavoriteType, val id: String)

@HiltViewModel
class CatalogHeaderViewModel @Inject constructor(
    authRepository: AuthRepository,
    favoritesRepository: FavoriteRepository
) : ViewModel() {
    val count = combine(authRepository.state, favoritesRepository.favorites) { auth, favorites ->
        if (auth is AuthState.SignedIn) favorites.size else 0
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)
}

@Composable fun PjskToolsApp(viewModel: AppViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsState()
    if (!state.initialized) { Box(Modifier.fillMaxSize()) { CircularProgressIndicator(Modifier.align(androidx.compose.ui.Alignment.Center)) }; return }
    if (state.region == null) { OnboardingScreen(onDone = {}) ; return }
    AppNavigation(region = state.region!!, onSelectRegion = viewModel::selectRegion)
}

@Composable private fun AppNavigation(region: Region, onSelectRegion: (Region) -> Unit) {
    key(region) {
        val controller = rememberNavController(); val backStack by controller.currentBackStackEntryAsState(); val current = backStack?.destination?.route
        BoxWithConstraints { val expanded = maxWidth >= 840.dp
            if (expanded) Row(Modifier.fillMaxSize()) {
                NavigationRail { Spacer(Modifier.height(12.dp)); TopDestination.entries.forEach { destination -> NavigationRailItem(current == destination.route, { controller.navigateTop(destination.route) }, { Icon(destination.icon, destination.label) }, label = { Text(destination.label) }) } }
                VerticalDivider(); AppNavHost(controller, onSelectRegion, Modifier.weight(1f))
            } else Scaffold(bottomBar = { NavigationBar { TopDestination.entries.forEach { destination -> NavigationBarItem(current == destination.route, { controller.navigateTop(destination.route) }, { Icon(destination.icon, destination.label) }, label = { Text(destination.label) }) } } }) { padding -> AppNavHost(controller, onSelectRegion, Modifier.padding(padding)) }
        }
    }
}

private fun androidx.navigation.NavHostController.navigateTop(route: String) = navigate(route) { popUpTo(graph.findStartDestination().id) { saveState = true }; launchSingleTop = true; restoreState = true }

@Composable private fun AppNavHost(
    controller: androidx.navigation.NavHostController,
    onSelectRegion: (Region) -> Unit,
    modifier: Modifier
) {
    var catalogTarget by remember { mutableStateOf<CatalogNavigationTarget?>(null) }
    NavHost(controller, TopDestination.HOME.route, modifier) {
        composable(TopDestination.HOME.route) { HomeScreen(onOpen = { destination ->
            when (destination) {
                WorkbenchDestination.CURRENT_EVENT, WorkbenchDestination.FORECAST, WorkbenchDestination.HISTORY -> controller.navigate(TopDestination.EVENTS.route)
                WorkbenchDestination.SONGS, WorkbenchDestination.CARDS, WorkbenchDestination.GACHAS, WorkbenchDestination.HONORS, WorkbenchDestination.MATERIALS, WorkbenchDestination.COSTUMES, WorkbenchDestination.STAMPS, WorkbenchDestination.COMICS -> controller.navigate(TopDestination.CATALOG.route)
                WorkbenchDestination.PLAYER -> controller.navigate(TopDestination.PLAYER.route)
                WorkbenchDestination.FAVORITES -> controller.navigate(AppRoute.FAVORITES)
                WorkbenchDestination.SETTINGS -> controller.navigate(TopDestination.SETTINGS.route)
            }
        }) }
        composable(TopDestination.EVENTS.route) {
            EventsScreen(
                onLogin = { controller.navigate(AppRoute.ACCOUNT) },
                onOpenRelated = { target ->
                    catalogTarget = target.catalogTarget()
                    controller.navigateTop(TopDestination.CATALOG.route)
                }
            )
        }
        composable(TopDestination.CATALOG.route) {
            CatalogScreen(
                onFavorites = { controller.navigate(AppRoute.FAVORITES) },
                onLogin = { controller.navigate(AppRoute.ACCOUNT) },
                navigationTarget = catalogTarget,
                onTargetOpened = { catalogTarget = null }
            )
        }
        composable(TopDestination.PLAYER.route) { PlayerScreen() }
        composable(TopDestination.SETTINGS.route) { SettingsScreen() }
        composable(AppRoute.FAVORITES) {
            FavoritesScreen(
                onBack = controller::popBackStack,
                onLogin = { controller.navigate(AppRoute.ACCOUNT) },
                onOpen = { favorite ->
                    onSelectRegion(favorite.region)
                    controller.navigateTop(TopDestination.CATALOG.route)
                }
            )
        }
        composable(AppRoute.ACCOUNT) {
            AccountScreen(
                onBack = controller::popBackStack,
                onSignedIn = controller::popBackStack
            )
        }
    }
}

/* Replaced by the complete catalog navigator below.
@Composable private fun CatalogScreen() { var tab by rememberSaveable { mutableIntStateOf(0) }; Column(Modifier.fillMaxSize()) { TabRow(tab) { Tab(tab == 0, { tab = 0 }, text = { Text("歌曲") }, icon = { Icon(Icons.Outlined.MusicNote, null) }); Tab(tab == 1, { tab = 1 }, text = { Text("卡牌") }, icon = { Icon(Icons.Outlined.Style, null) }) }; if (tab == 0) SongsScreen() else CardsScreen() } }
*/
@Composable
private fun CatalogScreen(
    onFavorites: () -> Unit,
    onLogin: () -> Unit,
    navigationTarget: CatalogNavigationTarget? = null,
    onTargetOpened: () -> Unit = {},
    viewModel: CatalogHeaderViewModel = hiltViewModel()
) {
    val favoriteCount by viewModel.count.collectAsState()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var mediaTab by rememberSaveable { mutableIntStateOf(0) }
    var scrollResetToken by rememberSaveable { mutableIntStateOf(0) }
    val labels = listOf(R.string.catalog_song, R.string.catalog_card, R.string.catalog_gacha, R.string.catalog_honor, R.string.catalog_material, R.string.catalog_costume, R.string.catalog_stamp_comic)
    LaunchedEffect(navigationTarget) {
        when (navigationTarget?.kind) {
            FavoriteType.SONG -> tab = 0
            FavoriteType.CARD -> tab = 1
            FavoriteType.GACHA -> tab = 2
            FavoriteType.HONOR -> tab = 3
            FavoriteType.MATERIAL -> tab = 4
            FavoriteType.COSTUME -> tab = 5
            FavoriteType.STAMP -> { tab = 6; mediaTab = 0 }
            FavoriteType.COMIC -> { tab = 6; mediaTab = 1 }
            else -> Unit
        }
    }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(stringResource(R.string.catalog_title)) },
            actions = {
                BadgedBox(
                    badge = {
                        if (favoriteCount > 0) Badge { Text(favoriteCount.coerceAtMost(99).toString()) }
                    }
                ) {
                    IconButton(onFavorites) {
                        Icon(Icons.Outlined.FavoriteBorder, stringResource(R.string.catalog_favorites))
                    }
                }
            }
        )
        ScrollableTabRow(selectedTabIndex = tab, edgePadding = 8.dp) {
            labels.forEachIndexed { index, label -> Tab(selected = tab == index, onClick = { if (tab != index) { tab = index; scrollResetToken++ } }, text = { Text(stringResource(label)) }) }
        }
        when (tab) {
            0 -> SongsScreen(scrollResetToken, onLogin, navigationTarget?.takeIf { it.kind == FavoriteType.SONG }?.id, onTargetOpened)
            1 -> CardsScreen(scrollResetToken, onLogin, navigationTarget?.takeIf { it.kind == FavoriteType.CARD }?.id, onTargetOpened)
            2 -> CollectionsScreen(CatalogKind.GACHA, scrollResetToken, onLogin, navigationTarget?.takeIf { it.kind == FavoriteType.GACHA }?.id, onTargetOpened)
            3 -> CollectionsScreen(CatalogKind.HONOR, scrollResetToken, onLogin, navigationTarget?.takeIf { it.kind == FavoriteType.HONOR }?.id, onTargetOpened)
            4 -> CollectionsScreen(CatalogKind.MATERIAL, scrollResetToken, onLogin, navigationTarget?.takeIf { it.kind == FavoriteType.MATERIAL }?.id, onTargetOpened)
            5 -> CollectionsScreen(CatalogKind.COSTUME, scrollResetToken, onLogin, navigationTarget?.takeIf { it.kind == FavoriteType.COSTUME }?.id, onTargetOpened)
            else -> Column(Modifier.fillMaxSize()) {
                TabRow(selectedTabIndex = mediaTab) {
                    Tab(selected = mediaTab == 0, onClick = { if (mediaTab != 0) { mediaTab = 0; scrollResetToken++ } }, text = { Text(stringResource(R.string.catalog_stamp)) })
                    Tab(selected = mediaTab == 1, onClick = { if (mediaTab != 1) { mediaTab = 1; scrollResetToken++ } }, text = { Text(stringResource(R.string.catalog_comic)) })
                }
                val mediaKind = if (mediaTab == 0) CatalogKind.STAMP else CatalogKind.COMIC
                val favoriteType = if (mediaTab == 0) FavoriteType.STAMP else FavoriteType.COMIC
                CollectionsScreen(mediaKind, scrollResetToken, onLogin, navigationTarget?.takeIf { it.kind == favoriteType }?.id, onTargetOpened)
            }
        }
    }
}

private fun EventNavigationTarget.catalogTarget() = CatalogNavigationTarget(type, id)
