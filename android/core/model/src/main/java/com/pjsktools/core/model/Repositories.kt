package com.pjsktools.core.model

import kotlinx.coroutines.flow.Flow

interface ApiEnvironment { val apiBaseUrl: String; val buildType: String }

interface RegionPreferencesRepository {
    val selectedRegion: Flow<Region?>
    val themeMode: Flow<ThemeMode>
    suspend fun selectRegion(region: Region)
    suspend fun setTheme(mode: ThemeMode)
}

interface StatusRepository { fun observe(region: Region, refresh: Boolean = false): Flow<DataResult<Pair<RuntimeStatus, EventSummary?>>> }
interface EventsRepository {
    fun observe(region: Region, query: EventQuery = EventQuery(), refresh: Boolean = false): Flow<DataResult<EventDashboard>>
    fun observeLiveRanking(region: Region, refresh: Boolean = false, boardType: String = "overall", worldLinkCharacterId: Int? = null): Flow<DataResult<LiveRankingSnapshot>>
    fun observeForecast(region: Region, eventId: String, window: ForecastWindow, refresh: Boolean = false): Flow<DataResult<ForecastDashboard>>
    fun observeEventDetail(region: Region, eventId: String, refresh: Boolean = false): Flow<DataResult<EventDetail>>
    fun observeRankingDetail(region: Region, eventId: String, rank: Int, worldLinkCharacterId: Int? = null): Flow<DataResult<RankingPlayerDetail>>
    suspend fun calculatePlan(region: Region, input: ScoreControlInput): Result<ScoreControlResult>
    suspend fun estimateBoundPt(region: Region, eventId: String, bindingId: String, currentPt: Long, targetPt: Long): Result<EventPointEstimate>
}
interface SongsRepository {
    fun observe(region: Region, query: SongQuery, refresh: Boolean = false): Flow<DataResult<Page<SongSummary>>>
    fun observeDetail(region: Region, id: String, refresh: Boolean = false): Flow<DataResult<SongDetail>>
}
interface CardsRepository {
    fun observe(region: Region, query: CardQuery, refresh: Boolean = false): Flow<DataResult<Page<CardSummary>>>
    fun observeDetail(region: Region, id: String, refresh: Boolean = false): Flow<DataResult<CardDetail>>
}
interface PlayerRepository { fun observe(region: Region, uid: String, refresh: Boolean = false): Flow<DataResult<PlayerProfile>> }
interface CacheManagementRepository {
    fun observeCacheInfo(region: Region): Flow<List<CacheInfo>>
    suspend fun clearPublicCache(region: Region)
}

interface CollectionsRepository {
    fun observe(region: Region, kind: CatalogKind, query: CatalogQuery, refresh: Boolean = false): Flow<DataResult<Page<CatalogEntry>>>
    fun observeDetail(region: Region, kind: CatalogKind, id: String, refresh: Boolean = false): Flow<DataResult<CatalogDetail>>
    fun observeFacets(region: Region, kind: CatalogKind): Flow<List<CatalogFacet>>
    suspend fun refreshCatalog(region: Region, kind: CatalogKind)
}
