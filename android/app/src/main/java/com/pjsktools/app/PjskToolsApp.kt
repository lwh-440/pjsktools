package com.pjsktools.app

import android.net.Uri
import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DrawerDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.DrawerValue
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.pjsktools.core.designsystem.SekaiInk
import com.pjsktools.core.designsystem.SekaiPink
import com.pjsktools.core.designsystem.SekaiTeal
import com.pjsktools.core.designsystem.SekaiYellow
import com.pjsktools.app.core.AppSection
import com.pjsktools.app.core.ApiOrigin
import com.pjsktools.app.core.ShellApiOrigins
import com.pjsktools.app.feature.account.AccountFeatureScreen
import com.pjsktools.app.feature.account.rememberAccountFeatureController
import com.pjsktools.app.feature.catalog.CatalogFeatureScreen
import com.pjsktools.app.feature.catalog.CatalogNavigationTarget
import com.pjsktools.app.feature.catalog.CatalogType
import com.pjsktools.app.feature.catalog.RelatedKind
import com.pjsktools.app.feature.catalog.clearCatalogImageCache
import com.pjsktools.app.feature.content.ContentFeatureScreen
import com.pjsktools.app.feature.content.ContentNavigationTarget
import com.pjsktools.app.feature.content.ContentSection
import com.pjsktools.app.feature.events.EventsToolsFeatureScreen
import com.pjsktools.app.feature.events.EventsToolsSection
import com.pjsktools.app.feature.events.EventRelatedKind
import com.pjsktools.app.feature.events.EventsAccountContext
import com.pjsktools.app.feature.account.FavoriteInput
import com.pjsktools.app.feature.shell.AboutFeatureScreen
import com.pjsktools.app.feature.shell.DeckCompareAccountContext
import com.pjsktools.app.feature.shell.DeckCompareFeatureScreen
import com.pjsktools.app.feature.shell.HomeFeatureScreen
import com.pjsktools.app.feature.shell.PublicProfileFeatureScreen
import com.pjsktools.app.feature.shell.SavedDeckOption
import com.pjsktools.app.feature.shell.SettingsFeatureScreen
import com.pjsktools.app.feature.shell.ShareFeatureScreen
import com.pjsktools.app.feature.shell.ShellCachePolicy
import com.pjsktools.app.feature.shell.ShellSettings
import com.pjsktools.app.feature.shell.ShellShortcut
import com.pjsktools.app.feature.shell.clearShellHttpCaches
import kotlinx.coroutines.launch

private const val ShellPreferencesName = "pjsktools-shell-settings"

/** Mobile shell that mirrors the web navigation groups while keeping feature state native. */
@Composable
fun PjskToolsApp(
    deepLink: Uri? = null,
    onDeepLinkConsumed: () -> Unit = {}
) {
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    val context = LocalContext.current
    val shellPreferences = remember(context.applicationContext) {
        context.applicationContext.getSharedPreferences(ShellPreferencesName, Context.MODE_PRIVATE)
    }
    var settings by remember(shellPreferences) { mutableStateOf(loadShellSettings(shellPreferences)) }
    val apiResolution = remember(settings.apiBaseUrl) {
        ApiOrigin.resolve(settings.apiBaseUrl.takeIf(String::isNotBlank), BuildConfig.API_BASE_URL, BuildConfig.DEBUG)
    }
    if (!apiResolution.isAvailable) {
        SettingsFeatureScreen(
            settings = settings,
            sessionLabel = "API unavailable",
            cacheSizeLabel = formatBytes(context.cacheDir.resolve("shell").directorySize()),
            onSave = { next -> settings = next; saveShellSettings(shellPreferences, next) },
            onClearCache = { targetRegion -> clearShellHttpCaches(context.cacheDir, targetRegion).also { if (targetRegion == null) clearCatalogImageCache() } },
            configurationError = apiResolution.error,
            modifier = Modifier.fillMaxSize()
        )
        return
    }
    val apiOrigins = remember(apiResolution.origin) {
        ShellApiOrigins.from(requireNotNull(apiResolution.origin))
    }
    var section by remember { mutableStateOf(AppSection.HOME) }
    var regions by remember { mutableStateOf<List<Region>>(emptyList()) }
    var region by remember { mutableStateOf(settings.defaultRegion) }
    var regionError by remember { mutableStateOf<String?>(null) }
    var catalogTarget by remember { mutableStateOf<CatalogNavigationTarget?>(null) }
    var eventTargetId by remember { mutableStateOf<String?>(null) }
    val api = remember(apiOrigins.core) { ApiClient(apiOrigins.core) }
    val accountController = rememberAccountFeatureController(apiOrigins.account)
    val accountState by accountController.state.collectAsState()

    LaunchedEffect(accountController) { accountController.initialize() }
    LaunchedEffect(deepLink, accountState.initialized) {
        if (deepLink != null && accountState.initialized) {
            section = AppSection.ACCOUNT
            accountController.handleQqCallback(deepLink)
            onDeepLinkConsumed()
        }
    }

    LaunchedEffect(api, apiOrigins.core) {
        runCatching { api.regions() }
            .onSuccess { available ->
                regions = available
                if (available.none { it.id == region } && available.isNotEmpty()) region = available.first().id
            }
            .onFailure { regionError = it.message ?: "区服列表加载失败" }
    }

    fun open(next: AppSection) {
        section = next
        catalogTarget = null
        if (next !in eventSections) eventTargetId = null
        scope.launch { drawerState.close() }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                drawerContainerColor = SekaiInk,
                drawerContentColor = androidx.compose.ui.graphics.Color.White
            ) {
                LazyColumn(Modifier.padding(horizontal = 14.dp, vertical = 20.dp)) {
                    item {
                        Text("PROJECT SEKAI", style = MaterialTheme.typography.labelMedium, color = SekaiTeal)
                        Text("游戏工具台", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        Row(Modifier.padding(top = 12.dp, bottom = 4.dp)) {
                            Box(Modifier.width(34.dp).height(4.dp).background(SekaiTeal))
                            Box(Modifier.width(22.dp).height(4.dp).background(SekaiPink))
                            Box(Modifier.width(16.dp).height(4.dp).background(SekaiYellow))
                        }
                    }
                    AppSection.grouped.forEach { (group, entries) ->
                        item {
                            Text(
                                group.uppercase(),
                                modifier = Modifier.padding(top = 20.dp, start = 12.dp, bottom = 6.dp),
                                style = MaterialTheme.typography.labelSmall,
                                color = androidx.compose.ui.graphics.Color(0xFF9DB0B8)
                            )
                        }
                        entries.forEach { item ->
                            item {
                                NavigationDrawerItem(
                                    label = { Text(item.label) },
                                    selected = section == item,
                                    onClick = { open(item) },
                                    colors = NavigationDrawerItemDefaults.colors(
                                        selectedContainerColor = androidx.compose.ui.graphics.Color.White.copy(alpha = 0.12f),
                                        selectedTextColor = androidx.compose.ui.graphics.Color.White,
                                        unselectedTextColor = androidx.compose.ui.graphics.Color(0xFFCBD8DC)
                                    )
                                )
                            }
                        }
                    }
                }
            }
        }
    ) {
        Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 2.dp,
                shadowElevation = 3.dp
            ) {
                Column {
                    Row(Modifier.fillMaxWidth().height(4.dp)) {
                        Box(Modifier.weight(5f).fillMaxSize().background(SekaiTeal))
                        Box(Modifier.weight(2f).fillMaxSize().background(SekaiPink))
                        Box(Modifier.weight(1f).fillMaxSize().background(SekaiYellow))
                    }
                    Column(
                        Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            FilledTonalButton(
                                onClick = { scope.launch { drawerState.open() } },
                                contentPadding = ButtonDefaults.TextButtonContentPadding
                            ) { Text("功能") }
                            Column(Modifier.padding(start = 12.dp).weight(1f)) {
                                Text(
                                    "PROJECT SEKAI · ${region.uppercase()}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.primary
                                )
                                Text(
                                    section.label,
                                    style = MaterialTheme.typography.titleLarge,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                        Row(
                            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            (regions.ifEmpty { listOf(Region(region, region.uppercase())) }).forEach { item ->
                                val selected = item.id == region
                                TextButton(
                                    onClick = { region = item.id },
                                    enabled = !selected,
                                    colors = ButtonDefaults.textButtonColors(
                                        containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else androidx.compose.ui.graphics.Color.Transparent,
                                        contentColor = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                                        disabledContainerColor = MaterialTheme.colorScheme.primary,
                                        disabledContentColor = MaterialTheme.colorScheme.onPrimary
                                    )
                                ) { Text(item.id.uppercase(), fontWeight = FontWeight.Bold) }
                            }
                        }
                        regionError?.let {
                            Surface(
                                color = MaterialTheme.colorScheme.errorContainer,
                                contentColor = MaterialTheme.colorScheme.onErrorContainer,
                                shape = MaterialTheme.shapes.small
                            ) {
                                Text(it, modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (section) {
                    AppSection.SONGS, AppSection.CARDS, AppSection.GACHAS, AppSection.HONORS,
                    AppSection.MATERIALS, AppSection.COSTUMES, AppSection.STAMPS -> key(section, region, catalogTarget) {
                        CatalogFeatureScreen(
                            baseUrl = apiOrigins.catalog,
                            region = region,
                            modifier = Modifier.fillMaxSize(),
                            initialType = section.catalogType(),
                            navigationTarget = catalogTarget,
                            onNavigateRelated = { target ->
                                when (target.kind) {
                                    RelatedKind.EVENT -> {
                                        eventTargetId = target.id
                                        section = AppSection.HISTORY_EVENTS
                                    }
                                    RelatedKind.CARD, RelatedKind.GACHA, RelatedKind.SONG -> {
                                        catalogTarget = target
                                        section = target.kind.section()
                                    }
                                    RelatedKind.DISPLAY_ONLY -> Unit
                                }
                            }
                        )
                    }
                    AppSection.CURRENT_EVENT, AppSection.FORECAST, AppSection.HISTORY_EVENTS, AppSection.TOOLS ->
                        key(section, region, eventTargetId) {
                            EventsToolsFeatureScreen(
                                baseUrl = apiOrigins.events,
                                region = region,
                                modifier = Modifier.fillMaxSize(),
                                initialSection = section.eventsSection(),
                                eventTargetId = eventTargetId,
                                accountContext = accountState.session?.let { session ->
                                    accountState.selectedBinding?.let { binding ->
                                        EventsAccountContext(session.accessToken, binding.id, binding.region)
                                    }
                                },
                                onEventTargetConsumed = { eventTargetId = null },
                                onRelatedNavigate = { target ->
                                    val kind = when (target.kind) {
                                        EventRelatedKind.SONG -> RelatedKind.SONG
                                        EventRelatedKind.CARD -> RelatedKind.CARD
                                        EventRelatedKind.GACHA -> RelatedKind.GACHA
                                    }
                                    catalogTarget = CatalogNavigationTarget(kind, target.id, target.title)
                                    section = kind.section()
                                }
                            )
                        }
                    AppSection.ACCOUNT -> AccountFeatureScreen(
                        baseUrl = apiOrigins.account,
                        modifier = Modifier.fillMaxSize(),
                        controller = accountController,
                        onBindingSelected = { binding -> binding?.let { region = it.region } }
                    )
                    AppSection.INFORMATION, AppSection.EXCHANGES, AppSection.MISSIONS,
                    AppSection.VIRTUAL_LIVES, AppSection.LIVE2D, AppSection.MYSEKAI, AppSection.STORIES ->
                        key(section, region) {
                            ContentFeatureScreen(
                                baseUrl = apiOrigins.content,
                                webRuntimeBaseUrl = BuildConfig.WEB_RUNTIME_BASE_URL,
                                region = region,
                                initialSection = section.contentSection(),
                                modifier = Modifier.fillMaxSize(),
                                onNavigate = { target ->
                                    when (target) {
                                        is ContentNavigationTarget.Event -> {
                                            eventTargetId = target.id
                                            section = AppSection.HISTORY_EVENTS
                                        }
                                        is ContentNavigationTarget.Card -> {
                                            catalogTarget = CatalogNavigationTarget(RelatedKind.CARD, target.id, target.id)
                                            section = AppSection.CARDS
                                        }
                                        is ContentNavigationTarget.ExternalUrl -> uriHandler.openUri(target.url)
                                    }
                                }
                            )
                        }
                    AppSection.HOME -> HomeFeatureScreen(
                        baseUrl = apiOrigins.home,
                        region = region,
                        cachePolicy = settings.cachePolicy,
                        isAuthenticated = accountState.isAuthenticated,
                        accountLabel = accountState.selectedBinding?.let { "${it.region.uppercase()} · ${it.title}" }
                            ?: accountState.session?.user?.email,
                        onRegionChange = { region = it },
                        onOpenAccount = { section = AppSection.ACCOUNT },
                        onOpenCurrentEvent = { section = AppSection.CURRENT_EVENT },
                        onShortcut = { shortcut -> section = shortcut.section() },
                        modifier = Modifier.fillMaxSize()
                    )
                    AppSection.PROFILE -> PublicProfileFeatureScreen(
                        baseUrl = apiOrigins.profile,
                        region = region,
                        cachePolicy = settings.cachePolicy,
                        isAuthenticated = accountState.isAuthenticated,
                        initialUid = accountState.selectedBinding?.playerUid.orEmpty(),
                        onFavorite = { profile -> scope.launch {
                            accountController.addFavorite(FavoriteInput("player", profile.region, profile.userId, profile.nickname))
                        } },
                        onOpenFullAnalysis = { profile ->
                            accountState.profile?.bindings?.firstOrNull { it.region == profile.region && it.playerUid == profile.userId }
                                ?.let { binding -> scope.launch { accountController.selectBinding(binding.id) } }
                            section = AppSection.ACCOUNT
                        },
                        onOpenLogin = { section = AppSection.ACCOUNT },
                        modifier = Modifier.fillMaxSize()
                    )
                    AppSection.DECK_COMPARE -> DeckCompareFeatureScreen(
                        baseUrl = apiOrigins.deckCompare,
                        region = region,
                        cachePolicy = settings.cachePolicy,
                        account = accountState.session?.let { session -> accountState.selectedBinding?.let { binding ->
                            DeckCompareAccountContext(
                                session.accessToken, binding.id, binding.region,
                                accountState.profile?.deckConfigs.orEmpty()
                                    .filter { it.region == binding.region && (it.bindingId == null || it.bindingId == binding.id) }
                                    .map { SavedDeckOption(it.id, it.name, it.cardIds) }
                            )
                        } },
                        onOpenAccount = { section = AppSection.ACCOUNT },
                        modifier = Modifier.fillMaxSize()
                    )
                    AppSection.SHARE -> ShareFeatureScreen(
                        apiOrigins.share,
                        region,
                        settings.cachePolicy,
                        modifier = Modifier.fillMaxSize()
                    )
                    AppSection.SETTINGS -> SettingsFeatureScreen(
                        settings = settings,
                        sessionLabel = if (accountState.isAuthenticated) "已登录（${accountState.session?.user?.email ?: accountState.session?.user?.nickname ?: "QQ"}）" else "未登录",
                        cacheSizeLabel = formatBytes(context.cacheDir.resolve("shell").directorySize()),
                        onSave = { next ->
                            settings = next
                            region = next.defaultRegion
                            saveShellSettings(shellPreferences, next)
                        },
                        onClearCache = { targetRegion ->
                            clearShellHttpCaches(context.cacheDir, targetRegion).also {
                                if (targetRegion == null) clearCatalogImageCache()
                            }
                        },
                        modifier = Modifier.fillMaxSize()
                    )
                    AppSection.ABOUT -> AboutFeatureScreen(Modifier.fillMaxSize())
                }
            }
        }
    }
}

private val eventSections = setOf(AppSection.CURRENT_EVENT, AppSection.FORECAST, AppSection.HISTORY_EVENTS, AppSection.TOOLS)

private fun AppSection.catalogType() = when (this) {
    AppSection.SONGS -> CatalogType.SONGS
    AppSection.CARDS -> CatalogType.CARDS
    AppSection.GACHAS -> CatalogType.GACHAS
    AppSection.HONORS -> CatalogType.HONORS
    AppSection.MATERIALS -> CatalogType.MATERIALS
    AppSection.COSTUMES -> CatalogType.COSTUMES
    AppSection.STAMPS -> CatalogType.STAMPS
    else -> CatalogType.SONGS
}

private fun RelatedKind.section() = when (this) {
    RelatedKind.CARD -> AppSection.CARDS
    RelatedKind.GACHA -> AppSection.GACHAS
    RelatedKind.SONG -> AppSection.SONGS
    else -> AppSection.HISTORY_EVENTS
}

private fun AppSection.eventsSection() = when (this) {
    AppSection.CURRENT_EVENT -> EventsToolsSection.CURRENT
    AppSection.FORECAST -> EventsToolsSection.FORECAST
    AppSection.HISTORY_EVENTS -> EventsToolsSection.HISTORY
    else -> EventsToolsSection.TOOLS
}

private fun AppSection.contentSection() = when (this) {
    AppSection.INFORMATION -> ContentSection.INFORMATION
    AppSection.EXCHANGES -> ContentSection.EXCHANGES
    AppSection.MISSIONS -> ContentSection.MISSIONS
    AppSection.VIRTUAL_LIVES -> ContentSection.VIRTUAL_LIVES
    AppSection.LIVE2D -> ContentSection.LIVE2D
    AppSection.MYSEKAI -> ContentSection.MYSEKAI
    AppSection.STORIES -> ContentSection.STORIES
    else -> ContentSection.INFORMATION
}

private fun ShellShortcut.section() = when (this) {
    ShellShortcut.SONGS -> AppSection.SONGS
    ShellShortcut.CARDS -> AppSection.CARDS
    ShellShortcut.GACHAS -> AppSection.GACHAS
    ShellShortcut.TOOLS -> AppSection.TOOLS
    ShellShortcut.DECK_COMPARE -> AppSection.DECK_COMPARE
    ShellShortcut.MYSEKAI -> AppSection.MYSEKAI
}

private fun loadShellSettings(preferences: android.content.SharedPreferences): ShellSettings {
    val stored = preferences.getString("apiBaseUrl", null)
    val base = ApiOrigin.resolve(stored, BuildConfig.API_BASE_URL, BuildConfig.DEBUG).editableValue
    val region = preferences.getString("defaultRegion", "jp").orEmpty().takeIf { it in setOf("jp", "en", "tw", "kr", "cn") } ?: "jp"
    val policy = runCatching { ShellCachePolicy.valueOf(preferences.getString("cachePolicy", ShellCachePolicy.NETWORK_FIRST.name).orEmpty()) }
        .getOrDefault(ShellCachePolicy.NETWORK_FIRST)
    return ShellSettings(base, region, policy)
}

private fun saveShellSettings(preferences: android.content.SharedPreferences, settings: ShellSettings) {
    preferences.edit()
        .putString("apiBaseUrl", settings.apiBaseUrl)
        .putString("defaultRegion", settings.defaultRegion)
        .putString("cachePolicy", settings.cachePolicy.name)
        .apply()
}

private fun java.io.File.directorySize(): Long = walkTopDown().filter { it.isFile }.sumOf { it.length() }
private fun formatBytes(value: Long): String = when {
    value >= 1024L * 1024L -> "%.1f MB".format(value / 1024.0 / 1024.0)
    value >= 1024L -> "%.1f KB".format(value / 1024.0)
    else -> "$value B"
}
