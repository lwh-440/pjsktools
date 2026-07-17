package com.pjsktools.core.network

import android.util.Log
import androidx.room.withTransaction
import com.pjsktools.api.generated.EventFullDetailDto
import com.pjsktools.api.generated.ForecastDto
import com.pjsktools.api.generated.CatalogFilterMetaDto
import com.pjsktools.api.generated.RankingHistoryDto
import com.pjsktools.api.generated.RankingHistorySummaryDto
import com.pjsktools.api.generated.LiveRankingDto
import com.pjsktools.api.generated.RankingPlayerDetailDto
import com.pjsktools.core.database.*
import com.pjsktools.core.common.AppDispatchers
import com.pjsktools.core.model.*
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import retrofit2.HttpException
import java.io.IOException
import java.math.BigDecimal
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

private const val STATUS_FRESH = 5 * 60_000L
private const val EVENT_FRESH = 5 * 60_000L
private const val RANKING_FRESH = 30_000L
private const val CATALOG_FRESH = 24 * 60 * 60_000L
private const val DETAIL_FRESH = 7 * 24 * 60 * 60_000L
private const val PLAYER_FRESH = 10 * 60_000L

private fun Throwable.phase(hasCache: Boolean) = when (this) { is IOException -> if (hasCache) ContentPhase.OFFLINE else ContentPhase.ERROR; is HttpException -> if (code() == 404 || code() == 503) ContentPhase.UNAVAILABLE else ContentPhase.ERROR; else -> ContentPhase.ERROR }
private fun Throwable.safeMessage() = when (this) { is CatalogVersionChangedException -> "\u76ee\u5f55\u6570\u636e\u5728\u540c\u6b65\u671f\u95f4\u53d1\u751f\u53d8\u5316\uff0c\u5df2\u4fdd\u7559\u539f\u6709\u7f13\u5b58"; is IOException -> "\u7f51\u7edc\u8fde\u63a5\u4e0d\u53ef\u7528"; is HttpException -> "\u670d\u52a1\u5668\u8fd4\u56de ${code()}"; else -> "\u6682\u65f6\u65e0\u6cd5\u52a0\u8f7d" }

private class CatalogVersionChangedException(kind: CatalogKind, page: Int, expected: String, actual: String) :
    IllegalStateException("Catalog ${kind.apiName} changed at page $page (expected $expected, actual $actual)")

@Serializable
private data class ForecastCachePayload(
    val forecast: ForecastDto,
    val history: RankingHistoryDto,
    val summary: RankingHistorySummaryDto
)

private data class CachedFilterMetadata(
    val meta: CatalogFilterMeta,
    val updatedAtMillis: Long,
    val sourceStatus: String?,
    val message: String?
)

private fun CatalogFilterState.fingerprintPart() = buildString {
    selected.toSortedMap().forEach { (key, values) -> append(key).append('=').append(values.sorted().joinToString(",")).append(';') }
    toggles.toSortedMap().forEach { (key, value) -> append(key).append('=').append(value).append(';') }
}

private fun EventQuery.filterFingerprint() = "q=${text.trim()}|sort=$sort|${filters.fingerprintPart()}"
private fun SongQuery.filterFingerprint() = "q=${text.trim()}|sort=$sort|unit=${unit.orEmpty()}|category=${category.orEmpty()}|${filters.fingerprintPart()}"
private fun CardQuery.filterFingerprint() = "q=${text.trim()}|sort=$sort|character=${characterId ?: ""}|attribute=${attribute.orEmpty()}|rarity=${rarity.orEmpty()}|unit=${unit.orEmpty()}|${filters.fingerprintPart()}"
private fun CatalogQuery.filterFingerprint() = "q=${text.trim()}|sort=$sort|category=${category.orEmpty()}|rarity=${rarity.orEmpty()}|character=${characterId ?: ""}|part=${partType.orEmpty()}|source=${source.orEmpty()}|gender=${gender.orEmpty()}|${filters.fingerprintPart()}"

private suspend fun PublicDataDao.cachedFilterMetadata(json: Json, region: Region, type: String, fingerprint: String, baseUrl: String): CachedFilterMetadata? =
    (getCatalogFilterMetadata(region.id, type, fingerprint) ?: getLatestCatalogFilterMetadata(region.id, type))?.let { entity ->
        runCatching { json.decodeFromString<CatalogFilterMetaDto>(entity.payloadJson).domain(baseUrl) }.getOrNull()?.let {
            CachedFilterMetadata(it, entity.updatedAtMillis, entity.sourceStatus, entity.message)
        }
    }

private suspend fun PublicDataDao.saveFilterMetadata(
    json: Json,
    region: Region,
    type: String,
    fingerprint: String,
    meta: CatalogFilterMetaDto,
    masterVersion: String?,
    sourceStatus: String?,
    message: String?
) {
    upsertCatalogFilterMetadata(CatalogFilterMetadataEntity(region.id, type, fingerprint, json.encodeToString(meta), masterVersion, System.currentTimeMillis(), sourceStatus, message))
    trimCatalogFilterMetadata(region.id, type)
}

private fun filterStatus(sourceStatus: String?, hasMeta: Boolean) = when {
    sourceStatus in setOf("source-unavailable", "missing-data", "not-released") -> FilterMetadataStatus.UNAVAILABLE
    hasMeta -> FilterMetadataStatus.CONTENT
    else -> FilterMetadataStatus.LOADING
}

private fun <T> Page<T>.withFilterMetadata(cached: CachedFilterMetadata?): Page<T> = if (cached == null) this else copy(
    filterMeta = cached.meta,
    filterStatus = filterStatus(cached.sourceStatus, cached.meta.groups.isNotEmpty() || cached.meta.toggles.isNotEmpty()),
    filterMessage = cached.message
)

private fun <T> Page<T>.withFilterFailure(message: String, offline: Boolean): Page<T> = copy(
    filterStatus = if (offline) FilterMetadataStatus.OFFLINE else FilterMetadataStatus.ERROR,
    filterMessage = message
)

abstract class BaseRepository(protected val api: ApiContractAdapter, protected val dao: PublicDataDao, protected val database: PjskDatabase, protected val environment: ApiEnvironment) {
    protected suspend fun stale(region: Region, key: String, ttl: Long) = dao.getMetadata(region.id, key)?.let { System.currentTimeMillis() - it.updatedAtMillis >= ttl } ?: true
    protected fun metadata(region: Region, key: String, count: Int) = CacheMetadataEntity(region.id, key, System.currentTimeMillis(), count)
}

@Singleton class StatusRepositoryImpl @Inject constructor(api: ApiContractAdapter, dao: PublicDataDao, db: PjskDatabase, env: ApiEnvironment, private val json: Json) : BaseRepository(api, dao, db, env), StatusRepository {
    override fun observe(region: Region, refresh: Boolean): Flow<DataResult<Pair<RuntimeStatus, EventSummary?>>> = flow {
        val cachedEvent = dao.getEvents(region.id).firstOrNull()
        if (cachedEvent != null) emit(DataResult(RuntimeStatus() to cachedEvent.domain(json), ContentPhase.STALE)) else emit(DataResult(phase = ContentPhase.LOADING))
        try {
            val status = api.getRuntimeStatus(); val event = api.getCurrentEvent(region.id).domain(environment.apiBaseUrl)
            dao.upsertEvents(listOf(event.entity(region, json))); dao.upsertMetadata(metadata(region, "status", 1))
            emit(DataResult(RuntimeStatus(status.updatedAt, status.cachedPlayers, status.cachedRankingTop100 + status.cachedRankingBorders) to event, ContentPhase.CONTENT, updatedAtMillis = System.currentTimeMillis()))
        } catch (error: Throwable) { emit(DataResult(cachedEvent?.let { RuntimeStatus() to it.domain(json) }, error.phase(cachedEvent != null), error.safeMessage())) }
    }
}

@Singleton class EventsRepositoryImpl @Inject constructor(api: ApiContractAdapter, dao: PublicDataDao, db: PjskDatabase, env: ApiEnvironment, private val json: Json, private val dispatchers: AppDispatchers) : BaseRepository(api, dao, db, env), EventsRepository {
    private val liveRankingMutex = Mutex()
    override fun observe(region: Region, query: EventQuery, refresh: Boolean) = flow {
        val filterKey = query.filterFingerprint()
        val cachedFilter = dao.cachedFilterMetadata(json, region, "events", filterKey, environment.apiBaseUrl)
        val cachedEvents = dao.getEvents(region.id); val current = cachedEvents.firstOrNull { it.id != "none" }
        val cached = current?.let { buildCached(region, localEvents(cachedEvents, query).withFilterMetadata(cachedFilter), it.id) }
        if (cached != null) emit(DataResult(cached, ContentPhase.STALE)) else emit(DataResult(phase = ContentPhase.LOADING))
        if (!refresh && cached != null && !stale(region, "events", EVENT_FRESH) && !stale(region, "ranking:${current.id}", RANKING_FRESH)) {
            if (cachedFilter != null) {
                emit(DataResult(cached, ContentPhase.CONTENT)); return@flow
            }
            try {
                val metadataPage = api.getEventCatalog(region.id, 1, 1, query.text.ifBlank { null }, query.sort, query.filters)
                dao.saveFilterMetadata(json, region, "events", filterKey, metadataPage.filterMeta, null, metadataPage.sourceHealth?.status, metadataPage.sourceHealth?.unavailableReason)
                emit(DataResult(cached.copy(events = cached.events.copy(filterMeta = metadataPage.filterMeta.domain(environment.apiBaseUrl), filterStatus = filterStatus(metadataPage.sourceHealth?.status, metadataPage.filterMeta.groups.isNotEmpty() || metadataPage.filterMeta.toggles.isNotEmpty()), filterMessage = metadataPage.sourceHealth?.unavailableReason)), ContentPhase.CONTENT))
            } catch (error: Throwable) {
                emit(DataResult(cached.copy(events = cached.events.withFilterFailure(error.safeMessage(), error is IOException)), ContentPhase.CONTENT))
            }
            return@flow
        }
        try {
            val eventPage = api.getEventCatalog(region.id, query.page, query.pageSize, query.text.ifBlank { null }, query.sort, query.filters)
            val currentDto = api.getCurrentEvent(region.id); val currentDomain = currentDto.domain(environment.apiBaseUrl)
            val events = eventPage.items.map { it.domain(environment.apiBaseUrl) }.let { list -> if (list.none { it.id == currentDomain.id }) listOf(currentDomain) + list else list }
            val eventId = currentDomain.id
            val top = api.getRankingTop100(region.id, eventId); val borders = api.getRankingBorders(region.id, eventId)
            val history = runCatching { api.getRankingHistory(region.id, eventId) }.getOrNull(); val forecast = runCatching { api.getRankingForecast(region.id, eventId) }.getOrNull()
            database.withTransaction {
                if (query.text.isBlank() && query.filters.activeCount == 0 && query.page == 1) {
                    dao.replaceEvents(region.id, events.map { it.entity(region, json) }, metadata(region, "events", eventPage.total))
                } else {
                    dao.upsertEvents(events.map { it.entity(region, json) })
                }
                dao.replaceRankings(region.id, eventId, "top100", top.items.map { it.domain(environment.apiBaseUrl).entity(region, eventId, "top100", json) }, metadata(region, "ranking:$eventId", top.total + borders.total))
                dao.replaceRankings(region.id, eventId, "border", borders.items.map { it.domain(environment.apiBaseUrl).entity(region, eventId, "border", json) }, metadata(region, "ranking:$eventId", top.total + borders.total))
                dao.deleteHistory(region.id, eventId); dao.upsertHistory(history?.items?.map { it.entity(region, eventId) }.orEmpty())
                dao.deleteForecasts(region.id, eventId); dao.upsertForecasts(forecast?.lines?.map { it.entity(region, eventId) }.orEmpty())
                dao.saveFilterMetadata(json, region, "events", filterKey, eventPage.filterMeta, null, eventPage.sourceHealth?.status, eventPage.sourceHealth?.unavailableReason)
            }
            val page = Page(events, eventPage.page, eventPage.pageSize, eventPage.total, eventPage.totalPages, eventPage.hasNextPage, eventPage.filterMeta.domain(environment.apiBaseUrl), filterStatus(eventPage.sourceHealth?.status, eventPage.filterMeta.groups.isNotEmpty() || eventPage.filterMeta.toggles.isNotEmpty()), eventPage.sourceHealth?.unavailableReason)
            emit(DataResult(buildCached(region, page, eventId), ContentPhase.CONTENT, updatedAtMillis = System.currentTimeMillis()))
        } catch (error: Throwable) { emit(DataResult(cached, error.phase(cached != null), error.safeMessage())) }
    }
    override fun observeLiveRanking(region: Region, refresh: Boolean, boardType: String, worldLinkCharacterId: Int?) = flow {
        val boardKey = if (boardType == "worldlink") "worldlink:${worldLinkCharacterId ?: "missing"}" else "overall"
        val topBoard = "top100:$boardKey"
        val borderBoard = "border:$boardKey"
        val cachedEvent = dao.getEvents(region.id).firstOrNull { it.id != "none" }
        val cached = cachedEvent?.let { event ->
            dao.getLiveRankingSnapshot(region.id, event.id, boardType, worldLinkCharacterId ?: 0)?.payloadJson
                ?.let { payload -> runCatching { json.decodeFromString<LiveRankingDto>(payload).domain(environment.apiBaseUrl) }.getOrNull() }
                ?: LiveRankingSnapshot(
                    event.domain(json),
                    dao.getRankings(region.id, event.id, topBoard).map { it.domain(json) },
                    dao.getRankings(region.id, event.id, borderBoard).map { it.domain(json) },
                    updatedAt = dao.getMetadata(region.id, "ranking:${event.id}:$boardKey")?.updatedAtMillis?.toString(),
                    boardType = boardType,
                    gameCharacterId = worldLinkCharacterId
                )
        }
        if (cached != null) emit(DataResult(cached, ContentPhase.STALE)) else emit(DataResult(phase = ContentPhase.LOADING))
        if (!refresh && cached != null && !stale(region, "ranking:${cached.event?.id}:$boardKey", RANKING_FRESH)) {
            emit(DataResult(cached, ContentPhase.CONTENT))
            return@flow
        }
        try {
            val snapshotDto = liveRankingMutex.withLock { api.getLiveRanking(region.id, boardType, worldLinkCharacterId) }
            val snapshot = snapshotDto.domain(environment.apiBaseUrl)
            val eventId = snapshot.event?.id
            if (eventId != null) database.withTransaction {
                snapshot.event?.let { dao.upsertEvents(listOf(it.entity(region, json))) }
                dao.replaceRankings(region.id, eventId, topBoard, snapshot.top100.map { it.entity(region, eventId, topBoard, json) }, metadata(region, "ranking:$eventId:$boardKey", snapshot.top100.size + snapshot.borders.size))
                dao.replaceRankings(region.id, eventId, borderBoard, snapshot.borders.map { it.entity(region, eventId, borderBoard, json) }, metadata(region, "ranking:$eventId:$boardKey", snapshot.top100.size + snapshot.borders.size))
                dao.upsertLiveRankingSnapshot(LiveRankingSnapshotEntity(region.id, eventId, snapshot.boardType, worldLinkCharacterId ?: 0, json.encodeToString(snapshotDto), System.currentTimeMillis()))
            }
            emit(DataResult(snapshot, ContentPhase.CONTENT, updatedAtMillis = System.currentTimeMillis()))
        } catch (error: Throwable) {
            emit(DataResult(cached, error.phase(cached != null), error.safeMessage()))
        }
    }
    override fun observeForecast(region: Region, eventId: String, window: ForecastWindow, refresh: Boolean) = flow {
        val cacheKey = "forecast:${window.name}"
        val cached = dao.getEventAnalytics(region.id, eventId, cacheKey)?.payloadJson?.let { payload ->
            runCatching {
                json.decodeFromString<ForecastCachePayload>(payload).let { cachedPayload ->
                    cachedPayload.forecast.domain(window, cachedPayload.history, cachedPayload.summary)
                }
            }.getOrNull()
        }
        if (cached != null) emit(DataResult(cached, ContentPhase.STALE)) else emit(DataResult(phase = ContentPhase.LOADING))
        if (!refresh && cached != null && !stale(region, "$cacheKey:$eventId", EVENT_FRESH)) {
            emit(DataResult(cached, ContentPhase.CONTENT))
            return@flow
        }
        try {
            val forecast = api.getRankingForecast(region.id, eventId, window.apiHours)
            val history = api.getRankingHistory(region.id, eventId, "border", window.apiHours)
            val summary = api.getRankingHistorySummary(region.id, eventId, "border", window.apiHours)
            val dashboard = forecast.domain(window, history, summary)
            database.withTransaction {
                dao.upsertEventAnalytics(EventAnalyticsEntity(region.id, eventId, cacheKey, json.encodeToString<ForecastCachePayload>(ForecastCachePayload(forecast, history, summary))))
                dao.upsertMetadata(metadata(region, "$cacheKey:$eventId", dashboard.lines.size))
            }
            emit(DataResult(dashboard, if (dashboard.unavailableReason == null) ContentPhase.CONTENT else ContentPhase.UNAVAILABLE, dashboard.unavailableReason, System.currentTimeMillis()))
        } catch (error: Throwable) { emit(DataResult(cached, error.phase(cached != null), error.safeMessage())) }
    }
    override fun observeEventDetail(region: Region, eventId: String, refresh: Boolean) = flow {
        val cached = dao.getEventDetail(region.id, eventId)?.payloadJson?.let { payload ->
            runCatching { json.decodeFromString<EventFullDetailDto>(payload).domain(environment.apiBaseUrl) }.getOrNull()
        }
        if (cached != null) emit(DataResult(cached, ContentPhase.STALE)) else emit(DataResult(phase = ContentPhase.LOADING))
        if (!refresh && cached != null && !stale(region, "event:$eventId", DETAIL_FRESH)) {
            emit(DataResult(cached, ContentPhase.CONTENT))
            return@flow
        }
        try {
            val detailDto = api.getFullEventDetail(region.id, eventId)
            val detail = detailDto.domain(environment.apiBaseUrl)
            database.withTransaction {
                dao.upsertEventDetail(EventDetailEntity(region.id, eventId, json.encodeToString<EventFullDetailDto>(detailDto)))
                dao.upsertEvents(listOf(detail.event.entity(region, json)))
                dao.upsertMetadata(metadata(region, "event:$eventId", 1))
            }
            emit(DataResult(detail, ContentPhase.CONTENT, updatedAtMillis = System.currentTimeMillis()))
        } catch (error: Throwable) { emit(DataResult(cached, error.phase(cached != null), error.safeMessage())) }
    }
    override fun observeRankingDetail(region: Region, eventId: String, rank: Int, worldLinkCharacterId: Int?) = flow {
        val boardType = if (worldLinkCharacterId == null) "overall" else "worldlink"
        val characterKey = worldLinkCharacterId ?: 0
        val cachedEntity = dao.getRankingDetail(region.id, eventId, boardType, characterKey, rank)
        val cached = cachedEntity?.payloadJson?.let { runCatching { json.decodeFromString<RankingPlayerDetailDto>(it).domain(environment.apiBaseUrl) }.getOrNull() }
        if (cached != null) emit(DataResult(cached, ContentPhase.STALE, updatedAtMillis = cachedEntity.updatedAtMillis)) else emit(DataResult(phase = ContentPhase.LOADING))
        if (cached != null && System.currentTimeMillis() - cachedEntity.updatedAtMillis <= RANKING_FRESH) {
            emit(DataResult(cached, ContentPhase.CONTENT, updatedAtMillis = cachedEntity.updatedAtMillis)); return@flow
        }
        try {
            val detailDto = api.getRankingPlayerDetail(region.id, eventId, rank, boardType, worldLinkCharacterId)
            val detail = detailDto.domain(environment.apiBaseUrl)
            val now = System.currentTimeMillis()
            dao.upsertRankingDetail(RankingDetailEntity(region.id, eventId, boardType, characterKey, rank, json.encodeToString(detailDto), now))
            emit(DataResult(detail, ContentPhase.CONTENT, updatedAtMillis = now))
        } catch (error: Throwable) { emit(DataResult(cached, error.phase(cached != null), error.safeMessage())) }
    }
    override suspend fun calculatePlan(region: Region, input: ScoreControlInput) = runCatching {
        api.calculateScoreControl(
            com.pjsktools.api.generated.ScoreControlRequest(
                BigDecimal.valueOf(input.currentPt), BigDecimal.valueOf(input.targetPt), BigDecimal.valueOf(input.remainingMinutes.toLong()),
                com.pjsktools.api.generated.RegionId.entries.first { it.value == region.id }, input.bindingId, input.eventId,
                input.targetRank, BigDecimal.valueOf(input.ptPerRun), input.availableRuns
            )
        ).domain(environment.apiBaseUrl)
    }
    override suspend fun estimateBoundPt(region: Region, eventId: String, bindingId: String, currentPt: Long, targetPt: Long) = runCatching {
        api.estimateEventPoint(
            com.pjsktools.api.generated.EventPointEstimateRequest(
                com.pjsktools.api.generated.RegionId.entries.first { it.value == region.id }, bindingId, eventId,
                currentPt = BigDecimal.valueOf(currentPt), targetPt = BigDecimal.valueOf(targetPt)
            )
        ).domain()
    }
    private suspend fun localEvents(events: List<EventEntity>, query: EventQuery): Page<EventSummary> = withContext(dispatchers.default) {
        val cached = events.map { it.domain(json) }
        var filtered = cached.filter {
            (query.text.isBlank() || "${it.id} ${it.name}".contains(query.text, true)) && it.facets.matches(query.filters)
        }
        filtered = when (query.sort) {
            "id-asc" -> filtered.sortedBy { it.id.toLongOrNull() }
            "name-asc" -> filtered.sortedBy { it.name }
            "name-desc" -> filtered.sortedByDescending { it.name }
            else -> filtered.sortedByDescending { it.id.toLongOrNull() }
        }
        val totalPages = maxOf(1, (filtered.size + query.pageSize - 1) / query.pageSize)
        Page(filtered.drop((query.page - 1) * query.pageSize).take(query.pageSize), query.page.coerceAtMost(totalPages), query.pageSize, filtered.size, totalPages, query.page < totalPages, cached.facetMeta { it.facets })
    }
    private suspend fun buildCached(region: Region, events: Page<EventSummary>, eventId: String): EventDashboard {
        val top = dao.getRankings(region.id, eventId, "top100").map { it.domain(json) }; val borders = dao.getRankings(region.id, eventId, "border").map { it.domain(json) }
        return EventDashboard(events.items.firstOrNull { it.id == eventId }, events, Page(top, 1, 100, top.size, 1, false), Page(borders, 1, 100, borders.size, 1, false), dao.getHistory(region.id, eventId).map { it.domain() }, dao.getForecasts(region.id, eventId).map { it.domain() })
    }
}

@Singleton class SongsRepositoryImpl @Inject constructor(api: ApiContractAdapter, dao: PublicDataDao, db: PjskDatabase, env: ApiEnvironment, private val json: Json, private val dispatchers: AppDispatchers) : BaseRepository(api, dao, db, env), SongsRepository {
    private val syncScope = CoroutineScope(SupervisorJob() + dispatchers.io)
    private val syncJobs = ConcurrentHashMap<String, Deferred<Unit>>()
    override fun observe(region: Region, query: SongQuery, refresh: Boolean) = flow {
        val filterKey = query.filterFingerprint()
        val cachedFilter = dao.cachedFilterMetadata(json, region, "songs", filterKey, environment.apiBaseUrl)
        val local = localPage(region, query).withFilterMetadata(cachedFilter); if (local.items.isNotEmpty()) emit(DataResult(local, ContentPhase.STALE)) else emit(DataResult(phase = ContentPhase.LOADING))
        if (query.text.isNotBlank() || query.filters.activeCount > 0) {
            try {
                val remote = api.getSongCatalog(region.id, query.page, query.pageSize, query.text.ifBlank { null }, query.sort, query.unit, query.category, query.filters)
                dao.saveFilterMetadata(json, region, "songs", filterKey, remote.filterMeta, remote.masterVersion, remote.sourceHealth?.status, remote.sourceHealth?.unavailableReason)
                emit(DataResult(Page(remote.items.map { it.domain(environment.apiBaseUrl) }, remote.page, remote.pageSize, remote.total, remote.totalPages, remote.hasNextPage, remote.filterMeta.domain(environment.apiBaseUrl), filterStatus(remote.sourceHealth?.status, remote.filterMeta.groups.isNotEmpty() || remote.filterMeta.toggles.isNotEmpty()), remote.sourceHealth?.unavailableReason), ContentPhase.CONTENT))
                if (stale(region, "songs", CATALOG_FRESH)) syncScope.launch { runCatching { syncCatalog(region) } }
                return@flow
            } catch (error: Throwable) {
                if (local.items.isNotEmpty()) {
                    emit(DataResult(local, ContentPhase.OFFLINE, error.safeMessage()))
                    return@flow
                }
            }
        }
        if (!refresh && local.items.isNotEmpty() && !stale(region, "songs", CATALOG_FRESH)) {
            if (cachedFilter != null) { emit(DataResult(local, ContentPhase.CONTENT)); return@flow }
            try {
                val metadataPage = api.getSongCatalog(region.id, 1, 1, query.text.ifBlank { null }, query.sort, query.unit, query.category, query.filters)
                dao.saveFilterMetadata(json, region, "songs", filterKey, metadataPage.filterMeta, metadataPage.masterVersion, metadataPage.sourceHealth?.status, metadataPage.sourceHealth?.unavailableReason)
                emit(DataResult(local.copy(filterMeta = metadataPage.filterMeta.domain(environment.apiBaseUrl), filterStatus = filterStatus(metadataPage.sourceHealth?.status, metadataPage.filterMeta.groups.isNotEmpty() || metadataPage.filterMeta.toggles.isNotEmpty()), filterMessage = metadataPage.sourceHealth?.unavailableReason), ContentPhase.CONTENT))
            } catch (error: Throwable) { emit(DataResult(local.withFilterFailure(error.safeMessage(), error is IOException), ContentPhase.CONTENT)) }
            return@flow
        }
        var partial: Page<SongSummary>? = null
        try {
            if (local.items.isEmpty()) {
                val first = api.getSongCatalog(region.id, 1, query.pageSize, query.text.ifBlank { null }, query.sort, query.unit, query.category, query.filters)
                dao.saveFilterMetadata(json, region, "songs", filterKey, first.filterMeta, first.masterVersion, first.sourceHealth?.status, first.sourceHealth?.unavailableReason)
                partial = Page(first.items.map { it.domain(environment.apiBaseUrl) }, first.page, first.pageSize, first.total, first.totalPages, first.hasNextPage, first.filterMeta.domain(environment.apiBaseUrl), filterStatus(first.sourceHealth?.status, first.filterMeta.groups.isNotEmpty() || first.filterMeta.toggles.isNotEmpty()), first.sourceHealth?.unavailableReason)
                emit(DataResult(partial, ContentPhase.PARTIAL, "\u76ee\u5f55\u8865\u5145\u4e2d"))
            }
            syncCatalog(region); emit(DataResult(localPage(region, query), ContentPhase.CONTENT, updatedAtMillis = System.currentTimeMillis()))
        } catch (error: Throwable) { val fallback = local.takeIf { it.items.isNotEmpty() } ?: partial; emit(DataResult(fallback, if (fallback != null) ContentPhase.PARTIAL else error.phase(false), error.safeMessage())) }
    }
    override fun observeDetail(region: Region, id: String, refresh: Boolean) = flow {
        val cached = dao.getSongDetail(region.id, id)?.toDomain(json); if (cached != null) emit(DataResult(cached, ContentPhase.STALE)) else emit(DataResult(phase = ContentPhase.LOADING))
        if (!refresh && cached != null && !stale(region, "song:$id", DETAIL_FRESH)) { emit(DataResult(cached, ContentPhase.CONTENT)); return@flow }
        try { val detail = api.getSongDetail(region.id, id).domain(environment.apiBaseUrl); val (song, difficulties) = detail.entities(region, json); database.withTransaction { dao.upsertSongs(listOf(song)); dao.deleteDifficulties(region.id, id); dao.upsertDifficulties(difficulties); dao.upsertSongDetail(detail.toDetailEntity(region, json)); dao.upsertMetadata(metadata(region, "song:$id", 1)) }; emit(DataResult(detail, ContentPhase.CONTENT, updatedAtMillis = System.currentTimeMillis())) } catch (error: Throwable) { emit(DataResult(cached, error.phase(cached != null), error.safeMessage())) }
    }
    private suspend fun localPage(region: Region, query: SongQuery): Page<SongSummary> = withContext(dispatchers.default) { val cached = dao.getSongs(region.id).map { it.domain(json) }; var all = cached.filter { (query.text.isBlank() || "${it.id} ${it.title} ${it.categories.joinToString()}".contains(query.text, true)) && (query.unit == null || it.unit == query.unit) && (query.category == null || query.category in it.categories) && it.facets.matches(query.filters) }; all = when (query.sort) { "published-asc" -> all.sortedWith(compareBy<SongSummary> { it.publishedAt ?: "" }.thenBy { it.id.toLongOrNull() }); "name-asc" -> all.sortedBy { it.title }; "name-desc" -> all.sortedByDescending { it.title }; "id-asc" -> all.sortedBy { it.id.toLongOrNull() }; "id-desc" -> all.sortedByDescending { it.id.toLongOrNull() }; else -> all.sortedWith(compareByDescending<SongSummary> { it.publishedAt ?: "" }.thenByDescending { it.id.toLongOrNull() }) }; val from = ((query.page - 1) * query.pageSize).coerceAtMost(all.size); val items = all.drop(from).take(query.pageSize); val totalPages = maxOf(1, (all.size + query.pageSize - 1) / query.pageSize); Page(items, query.page.coerceAtMost(totalPages), query.pageSize, all.size, totalPages, query.page < totalPages, cached.facetMeta { it.facets }) }
    private suspend fun syncCatalog(region: Region) {
        val job = synchronized(syncJobs) { syncJobs[region.id]?.takeIf { it.isActive } ?: syncScope.async { syncCatalogNow(region) }.also { syncJobs[region.id] = it } }
        try { job.await() } finally { if (job.isCompleted) syncJobs.remove(region.id, job) }
    }
    private suspend fun syncCatalogNow(region: Region) {
        var lastError: Throwable? = null
        repeat(2) { attempt ->
            try {
                val first = api.getSongCatalog(region.id, 1, 100, null, "id-asc", null, null)
                val semaphore = Semaphore(3)
                val remaining = coroutineScope { (2..first.totalPages).map { pageNumber -> async { semaphore.withPermit { api.getSongCatalog(region.id, pageNumber, 100, null, "id-asc", null, null) } } }.awaitAll() }
                check(remaining.all { it.masterVersion == first.masterVersion }) { "Song catalog version changed during sync" }
                val all = first.items + remaining.flatMap { it.items }
                val items = all.map { it.domain(environment.apiBaseUrl) }
                database.withTransaction {
                    dao.replaceSongs(region.id, items.map { it.entity(region, json) }, metadata(region, "songs", items.size))
                    dao.saveFilterMetadata(json, region, "songs", SongQuery().filterFingerprint(), first.filterMeta, first.masterVersion, first.sourceHealth?.status, first.sourceHealth?.unavailableReason)
                }
                return
            } catch (error: Throwable) {
                lastError = error
                if (attempt == 1) throw error
            }
        }
        throw lastError ?: IllegalStateException("Song catalog sync failed")
    }
}


@Singleton class CardsRepositoryImpl @Inject constructor(
    api: ApiContractAdapter,
    dao: PublicDataDao,
    db: PjskDatabase,
    env: ApiEnvironment,
    private val json: Json,
    private val dispatchers: AppDispatchers
) : BaseRepository(api, dao, db, env), CardsRepository {
    private val syncScope = CoroutineScope(SupervisorJob() + dispatchers.io)
    private val syncJobs = ConcurrentHashMap<String, Deferred<Unit>>()

    override fun observe(region: Region, query: CardQuery, refresh: Boolean) = flow {
        val filterKey = query.filterFingerprint()
        val cachedFilter = dao.cachedFilterMetadata(json, region, "cards", filterKey, environment.apiBaseUrl)
        val local = localPage(region, query).withFilterMetadata(cachedFilter)
        if (local.items.isNotEmpty()) emit(DataResult(local, ContentPhase.STALE)) else emit(DataResult(phase = ContentPhase.LOADING))

        if (query.text.isNotBlank() || query.filters.activeCount > 0) {
            try {
                val remote = fetchPage(region, query, query.page, query.pageSize)
                saveFilter(region, filterKey, remote)
                emit(DataResult(remote.domainPage(environment.apiBaseUrl), ContentPhase.CONTENT))
                if (stale(region, "cards", CATALOG_FRESH)) syncScope.launch { runCatching { syncCatalog(region) } }
                return@flow
            } catch (error: Throwable) {
                if (local.items.isNotEmpty()) {
                    emit(DataResult(local.withFilterFailure(error.safeMessage(), error is IOException), ContentPhase.OFFLINE, error.safeMessage()))
                    return@flow
                }
            }
        }

        if (!refresh && local.items.isNotEmpty() && !stale(region, "cards", CATALOG_FRESH)) {
            if (cachedFilter != null) emit(DataResult(local, ContentPhase.CONTENT))
            else try {
                val metadataPage = fetchPage(region, query, 1, 1)
                saveFilter(region, filterKey, metadataPage)
                emit(DataResult(local.withRemoteFilter(metadataPage), ContentPhase.CONTENT))
            } catch (error: Throwable) {
                emit(DataResult(local.withFilterFailure(error.safeMessage(), error is IOException), ContentPhase.CONTENT))
            }
            return@flow
        }

        var partial: Page<CardSummary>? = null
        try {
            if (local.items.isEmpty()) {
                val first = fetchPage(region, query, 1, query.pageSize)
                saveFilter(region, filterKey, first)
                partial = first.domainPage(environment.apiBaseUrl)
                emit(DataResult(partial, ContentPhase.PARTIAL, "\u76ee\u5f55\u8865\u5145\u4e2d"))
            }
            syncCatalog(region)
            emit(DataResult(localPage(region, query).withFilterMetadata(dao.cachedFilterMetadata(json, region, "cards", filterKey, environment.apiBaseUrl)), ContentPhase.CONTENT, updatedAtMillis = System.currentTimeMillis()))
        } catch (error: Throwable) {
            val fallback = local.takeIf { it.items.isNotEmpty() } ?: partial
            emit(DataResult(fallback, if (fallback != null) ContentPhase.PARTIAL else error.phase(false), error.safeMessage()))
        }
    }

    override fun observeDetail(region: Region, id: String, refresh: Boolean) = flow {
        val cached = dao.getCardDetail(region.id, id)?.toDomain(json)
        if (cached != null) emit(DataResult(cached, ContentPhase.STALE)) else emit(DataResult(phase = ContentPhase.LOADING))
        if (!refresh && cached != null && !stale(region, "card:$id", DETAIL_FRESH)) { emit(DataResult(cached, ContentPhase.CONTENT)); return@flow }
        try {
            val detail = api.getCardDetail(region.id, id).domain(environment.apiBaseUrl)
            database.withTransaction {
                dao.upsertCards(listOf(detail.card.entity(region, json)))
                dao.upsertCardDetail(detail.toDetailEntity(region, json))
                dao.upsertMetadata(metadata(region, "card:$id", 1))
            }
            emit(DataResult(detail, ContentPhase.CONTENT, updatedAtMillis = System.currentTimeMillis()))
        } catch (error: Throwable) { emit(DataResult(cached, error.phase(cached != null), error.safeMessage())) }
    }

    private suspend fun fetchPage(region: Region, query: CardQuery, page: Int, pageSize: Int) = api.getCardCatalog(
        region.id, page, pageSize, query.text.ifBlank { null }, query.sort, query.characterId, query.attribute, query.rarity, query.unit, query.filters
    )

    private suspend fun saveFilter(region: Region, key: String, page: com.pjsktools.api.generated.CardPageDto) =
        dao.saveFilterMetadata(json, region, "cards", key, page.filterMeta, page.masterVersion, page.sourceHealth?.status, page.sourceHealth?.unavailableReason)

    private fun com.pjsktools.api.generated.CardPageDto.domainPage(baseUrl: String) = Page(
        items.map { it.domain(baseUrl) }, page, pageSize, total, totalPages, hasNextPage, filterMeta.domain(baseUrl),
        filterStatus(sourceHealth?.status, filterMeta.groups.isNotEmpty() || filterMeta.toggles.isNotEmpty()), sourceHealth?.unavailableReason
    )

    private fun Page<CardSummary>.withRemoteFilter(page: com.pjsktools.api.generated.CardPageDto) = copy(
        filterMeta = page.filterMeta.domain(environment.apiBaseUrl),
        filterStatus = filterStatus(page.sourceHealth?.status, page.filterMeta.groups.isNotEmpty() || page.filterMeta.toggles.isNotEmpty()),
        filterMessage = page.sourceHealth?.unavailableReason
    )

    private suspend fun localPage(region: Region, query: CardQuery): Page<CardSummary> = withContext(dispatchers.default) {
        val cached = dao.getCards(region.id).map { it.summary(json) }
        var all = cached.filter {
            (query.text.isBlank() || "${it.id} ${it.title} ${it.character}".contains(query.text, true)) &&
                (query.characterId == null || it.characterId == query.characterId.toString()) &&
                (query.attribute == null || it.attribute == query.attribute) &&
                (query.rarity == null || it.rarity.toString() == query.rarity) &&
                (query.unit == null || it.unit == query.unit) && it.facets.matches(query.filters)
        }
        all = when (query.sort) {
            "id-asc" -> all.sortedBy { it.id.toLongOrNull() }
            "name-asc" -> all.sortedBy { it.title }
            "rarity-desc" -> all.sortedWith(compareByDescending<CardSummary> { it.rarity }.thenByDescending { it.id.toLongOrNull() })
            else -> all.sortedByDescending { it.id.toLongOrNull() }
        }
        val totalPages = maxOf(1, (all.size + query.pageSize - 1) / query.pageSize)
        Page(all.drop((query.page - 1) * query.pageSize).take(query.pageSize), query.page.coerceAtMost(totalPages), query.pageSize, all.size, totalPages, query.page < totalPages, cached.facetMeta { it.facets })
    }

    private suspend fun syncCatalog(region: Region) {
        val job = synchronized(syncJobs) { syncJobs[region.id]?.takeIf { it.isActive } ?: syncScope.async { syncCatalogNow(region) }.also { syncJobs[region.id] = it } }
        try { job.await() } finally { if (job.isCompleted) syncJobs.remove(region.id, job) }
    }

    private suspend fun syncCatalogNow(region: Region) {
        var lastError: Throwable? = null
        repeat(2) { attempt ->
            try {
                val query = CardQuery()
                val first = fetchPage(region, query, 1, 100)
                val semaphore = Semaphore(3)
                val remaining = coroutineScope { (2..first.totalPages).map { pageNumber -> async { semaphore.withPermit { fetchPage(region, query, pageNumber, 100) } } }.awaitAll() }
                check(remaining.all { it.masterVersion == first.masterVersion }) { "Card catalog version changed during sync" }
                val items = (first.items + remaining.flatMap { it.items }).map { it.domain(environment.apiBaseUrl) }
                database.withTransaction {
                    dao.replaceCards(region.id, items.map { it.entity(region, json) }, metadata(region, "cards", items.size))
                    saveFilter(region, query.filterFingerprint(), first)
                }
                return
            } catch (error: Throwable) {
                lastError = error
                if (attempt == 1) throw error
            }
        }
        throw lastError ?: IllegalStateException("Card catalog sync failed")
    }
}

@Singleton class CollectionsRepositoryImpl @Inject constructor(
    api: ApiContractAdapter, dao: PublicDataDao, db: PjskDatabase, env: ApiEnvironment, private val json: Json, private val dispatchers: AppDispatchers
) : BaseRepository(api, dao, db, env), CollectionsRepository {
    private val syncScope = CoroutineScope(SupervisorJob() + dispatchers.io)
    private val syncJobs = ConcurrentHashMap<String, Deferred<Unit>>()

    override fun observe(region: Region, kind: CatalogKind, query: CatalogQuery, refresh: Boolean) = flow {
        val filterKey = query.filterFingerprint()
        val cachedFilter = dao.cachedFilterMetadata(json, region, kind.apiName, filterKey, environment.apiBaseUrl)
        val local = localPage(region, kind, query).withFilterMetadata(cachedFilter)
        if (local.items.isNotEmpty()) emit(DataResult(local, ContentPhase.STALE)) else emit(DataResult(phase = ContentPhase.LOADING))
        if (query.text.isNotBlank() || query.filters.activeCount > 0) {
            try {
                val remote = fetchPage(region, kind, query.page, query.pageSize, query)
                saveFilter(region, kind, filterKey, remote)
                emit(DataResult(remote.domainPage(environment.apiBaseUrl), ContentPhase.CONTENT))
                if (stale(region, "catalog:${kind.apiName}", CATALOG_FRESH)) syncScope.launch { runCatching { syncCatalog(region, kind) } }
                return@flow
            } catch (error: Throwable) {
                if (local.items.isNotEmpty()) {
                    emit(DataResult(local, ContentPhase.OFFLINE, error.safeMessage()))
                    return@flow
                }
            }
        }
        if (!refresh && local.items.isNotEmpty() && !stale(region, "catalog:${kind.apiName}", CATALOG_FRESH)) {
            if (cachedFilter != null) emit(DataResult(local, ContentPhase.CONTENT))
            else try {
                val metadataPage = fetchPage(region, kind, 1, 1, query)
                saveFilter(region, kind, filterKey, metadataPage)
                emit(DataResult(local.withRemoteFilter(metadataPage), ContentPhase.CONTENT))
            } catch (error: Throwable) {
                emit(DataResult(local.withFilterFailure(error.safeMessage(), error is IOException), ContentPhase.CONTENT))
            }
            return@flow
        }
        var partial: Page<CatalogEntry>? = null
        try {
            if (local.items.isEmpty()) {
                val first = fetchPage(region, kind, 1, query.pageSize, query)
                saveFilter(region, kind, filterKey, first)
                val items = first.items.map { it.domain(environment.apiBaseUrl) }
                partial = first.domainPage(environment.apiBaseUrl)
                emit(DataResult(partial, ContentPhase.PARTIAL, "\u76ee\u5f55\u8865\u5145\u4e2d"))
            }
            syncCatalog(region, kind)
            emit(DataResult(localPage(region, kind, query).withFilterMetadata(dao.cachedFilterMetadata(json, region, kind.apiName, filterKey, environment.apiBaseUrl)), ContentPhase.CONTENT, updatedAtMillis = System.currentTimeMillis()))
        } catch (error: Throwable) {
            val fallback = local.takeIf { it.items.isNotEmpty() } ?: partial
            emit(DataResult(fallback, if (fallback != null) ContentPhase.PARTIAL else error.phase(false), error.safeMessage()))
        }
    }

    override fun observeDetail(region: Region, kind: CatalogKind, id: String, refresh: Boolean) = flow {
        val cached = dao.getCatalogDetail(region.id, kind.apiName, id)?.toDomain(json)
        if (cached != null) emit(DataResult(cached, ContentPhase.STALE)) else emit(DataResult(phase = ContentPhase.LOADING))
        if (!refresh && cached != null && !stale(region, "catalog:${kind.apiName}:$id", DETAIL_FRESH)) {
            emit(DataResult(cached, ContentPhase.CONTENT)); return@flow
        }
        try {
            val detail = fetchDetail(region, kind, id).domain(environment.apiBaseUrl)
            database.withTransaction {
                dao.upsertCatalogItems(listOf(detail.item.toEntity(region, json)))
                dao.upsertCatalogDetail(detail.toEntity(region, json))
                dao.upsertMetadata(metadata(region, "catalog:${kind.apiName}:$id", 1))
            }
            emit(DataResult(detail, ContentPhase.CONTENT, updatedAtMillis = System.currentTimeMillis()))
        } catch (error: Throwable) {
            emit(DataResult(cached, error.phase(cached != null), error.safeMessage()))
        }
    }

    override fun observeFacets(region: Region, kind: CatalogKind): Flow<List<CatalogFacet>> =
        dao.observeCatalogFacets(region.id, kind.apiName).map { rows -> rows.map { CatalogFacet(it.facetKey, it.facetValue, it.count) } }

    override suspend fun refreshCatalog(region: Region, kind: CatalogKind) = syncCatalog(region, kind)

    private suspend fun syncCatalog(region: Region, kind: CatalogKind) {
        val key = "${region.id}:${kind.apiName}"
        val job = synchronized(syncJobs) { syncJobs[key]?.takeIf { it.isActive } ?: syncScope.async { syncCatalogNow(region, kind) }.also { syncJobs[key] = it } }
        try { job.await() } finally { if (job.isCompleted) syncJobs.remove(key, job) }
    }

    private suspend fun syncCatalogNow(region: Region, kind: CatalogKind) {
        var lastError: Throwable? = null
        repeat(2) { attempt ->
            try {
                val first = fetchPage(region, kind, 1)
                val version = first.masterVersion ?: throw IllegalStateException("Catalog ${kind.apiName} page 1 has no version")
                val semaphore = Semaphore(3)
                val remaining = coroutineScope { (2..first.totalPages).map { pageNumber -> async { semaphore.withPermit { fetchPage(region, kind, pageNumber) } } }.awaitAll() }
                remaining.forEachIndexed { index, page ->
                    val pageVersion = page.masterVersion ?: throw IllegalStateException("Catalog ${kind.apiName} page ${index + 2} has no version")
                    if (version != pageVersion) throw CatalogVersionChangedException(kind, index + 2, version, pageVersion)
                }
                val all = first.items + remaining.flatMap { it.items }
                val items = all.map { it.domain(environment.apiBaseUrl) }
                database.withTransaction {
                    dao.replaceCatalog(region.id, kind.apiName, items.map { it.toEntity(region, json) }, items.flatMap { it.facets(region) }, metadata(region, "catalog:${kind.apiName}", items.size))
                    saveFilter(region, kind, defaultQuery(kind).filterFingerprint(), first)
                }
                return
            } catch (error: Throwable) {
                if (error is CatalogVersionChangedException) Log.w("CatalogSync", error.message.orEmpty())
                lastError = error
                if (attempt == 1) throw error
            }
        }
        throw lastError ?: IllegalStateException("Catalog sync failed")
    }

    private suspend fun fetchPage(region: Region, kind: CatalogKind, page: Int, pageSize: Int = 100, query: CatalogQuery? = null) = when (kind) {
        CatalogKind.GACHA -> api.getGachaCatalog(region.id, page, pageSize, query?.text?.ifBlank { null }, query?.sort ?: "start-desc", query?.category, query?.rarity, query?.characterId, query?.partType, query?.source, query?.gender, query?.filters ?: CatalogFilterState())
        CatalogKind.HONOR -> api.getHonorCatalog(region.id, page, pageSize, query?.text?.ifBlank { null }, query?.sort ?: "id-desc", query?.category, query?.rarity, query?.characterId, query?.partType, query?.source, query?.gender, query?.filters ?: CatalogFilterState())
        CatalogKind.MATERIAL -> api.getMaterialCatalog(region.id, page, pageSize, query?.text?.ifBlank { null }, query?.sort ?: "id-desc", query?.category, query?.rarity, query?.characterId, query?.partType, query?.source, query?.gender, query?.filters ?: CatalogFilterState())
        CatalogKind.COSTUME -> api.getCostumeCatalog(region.id, page, pageSize, query?.text?.ifBlank { null }, query?.sort ?: "id-desc", query?.category, query?.rarity, query?.characterId, query?.partType, query?.source, query?.gender, query?.filters ?: CatalogFilterState())
        CatalogKind.STAMP -> api.getStampCatalog(region.id, page, pageSize, query?.text?.ifBlank { null }, query?.sort ?: "id-desc", query?.category, query?.rarity, query?.characterId, query?.partType, query?.source, query?.gender, query?.filters ?: CatalogFilterState())
        CatalogKind.COMIC -> api.getComicCatalog(region.id, page, pageSize, query?.text?.ifBlank { null }, query?.sort ?: "id-desc", query?.category, query?.rarity, query?.characterId, query?.partType, query?.source, query?.gender, query?.filters ?: CatalogFilterState())
    }
    private suspend fun fetchDetail(region: Region, kind: CatalogKind, id: String) = when (kind) {
        CatalogKind.GACHA -> api.getGachaCatalogItem(region.id, id)
        CatalogKind.HONOR -> api.getHonorCatalogItem(region.id, id)
        CatalogKind.MATERIAL -> api.getMaterialCatalogItem(region.id, id)
        CatalogKind.COSTUME -> api.getCostumeCatalogItem(region.id, id)
        CatalogKind.STAMP -> api.getStampCatalogItem(region.id, id)
        CatalogKind.COMIC -> api.getComicCatalogItem(region.id, id)
    }

    private fun defaultQuery(kind: CatalogKind) = CatalogQuery(sort = if (kind == CatalogKind.GACHA) "start-desc" else "id-desc")

    private suspend fun saveFilter(region: Region, kind: CatalogKind, key: String, page: com.pjsktools.api.generated.CatalogPageDto) =
        dao.saveFilterMetadata(json, region, kind.apiName, key, page.filterMeta, page.masterVersion, page.sourceHealth?.status, page.unavailableReason ?: page.sourceHealth?.unavailableReason)

    private fun com.pjsktools.api.generated.CatalogPageDto.domainPage(baseUrl: String) = Page(
        items.map { it.domain(baseUrl) }, page, pageSize, total, totalPages, hasNextPage, filterMeta.domain(baseUrl),
        filterStatus(sourceHealth?.status, filterMeta.groups.isNotEmpty() || filterMeta.toggles.isNotEmpty()), unavailableReason ?: sourceHealth?.unavailableReason
    )

    private fun Page<CatalogEntry>.withRemoteFilter(page: com.pjsktools.api.generated.CatalogPageDto) = copy(
        filterMeta = page.filterMeta.domain(environment.apiBaseUrl),
        filterStatus = filterStatus(page.sourceHealth?.status, page.filterMeta.groups.isNotEmpty() || page.filterMeta.toggles.isNotEmpty()),
        filterMessage = page.unavailableReason ?: page.sourceHealth?.unavailableReason
    )

    private suspend fun localPage(region: Region, kind: CatalogKind, query: CatalogQuery): Page<CatalogEntry> = withContext(dispatchers.default) {
        var items = dao.getCatalogItems(region.id, kind.apiName).map { it.toDomain(json) }.filter { entry ->
            val d = entry.data
            (query.text.isBlank() || listOfNotNull(d.id, d.name, d.title, d.description).joinToString(" ").contains(query.text, true)) &&
                (query.category == null || d.category == query.category) && (query.rarity == null || d.rarity == query.rarity) &&
                (query.characterId == null || d.characterId == query.characterId || query.characterId in d.characterIds) &&
                (query.partType == null || query.partType in d.partTypes) && (query.source == null || d.source == query.source) &&
                (query.gender == null || d.gender == query.gender) && d.facets.matches(query.filters)
        }
        items = when (query.sort) {
            "start-desc" -> items.sortedWith(compareBy<CatalogEntry> { it.data.startAt.isNullOrBlank() }.thenByDescending { it.data.startAt }.thenByDescending { it.data.id.toLongOrNull() })
            "start-asc" -> items.sortedWith(compareBy<CatalogEntry> { it.data.startAt.isNullOrBlank() }.thenBy { it.data.startAt }.thenBy { it.data.id.toLongOrNull() })
            "id-asc" -> items.sortedBy { it.data.id.toLongOrNull() ?: Long.MAX_VALUE }
            "name-asc" -> items.sortedBy { it.data.name }
            "name-desc" -> items.sortedByDescending { it.data.name }
            else -> items.sortedByDescending { it.data.id.toLongOrNull() ?: Long.MIN_VALUE }
        }
        val totalPages = maxOf(1, (items.size + query.pageSize - 1) / query.pageSize)
        val safePage = query.page.coerceIn(1, totalPages)
        Page(items.drop((safePage - 1) * query.pageSize).take(query.pageSize), safePage, query.pageSize, items.size, totalPages, safePage < totalPages)
    }
}

@Singleton class PlayerRepositoryImpl @Inject constructor(api: ApiContractAdapter, dao: PublicDataDao, db: PjskDatabase, env: ApiEnvironment) : BaseRepository(api, dao, db, env), PlayerRepository {
    override fun observe(region: Region, uid: String, refresh: Boolean) = flow { val cached=dao.getPlayer(region.id,uid)?.domain(); if(cached!=null) emit(DataResult(cached,ContentPhase.STALE)) else emit(DataResult(phase=ContentPhase.LOADING)); if(!refresh&&cached!=null&&!stale(region,"player:$uid",PLAYER_FRESH)){emit(DataResult(cached,ContentPhase.CONTENT));return@flow}; try{val dto=if(refresh)api.refreshPlayerProfile(region.id,uid)else api.getPlayerProfile(region.id,uid); val entity=dto.entity();dao.upsertPlayer(entity);dao.upsertMetadata(metadata(region,"player:$uid",1));emit(DataResult(entity.domain(),ContentPhase.CONTENT,updatedAtMillis=System.currentTimeMillis()))}catch(error:Throwable){emit(DataResult(cached,error.phase(cached!=null),error.safeMessage()))} }
}

@Singleton class CacheManagementRepositoryImpl @Inject constructor(private val dao: PublicDataDao) : CacheManagementRepository { override fun observeCacheInfo(region: Region): Flow<List<CacheInfo>> = dao.observeMetadata(region.id).map { list -> list.map { CacheInfo(it.cacheKey,it.updatedAtMillis,it.itemCount) } }; override suspend fun clearPublicCache(region: Region)=dao.clearRegion(region.id) }

@Module @InstallIn(SingletonComponent::class)
abstract class RepositoryBindings {
    @Binds abstract fun status(impl: StatusRepositoryImpl): StatusRepository
    @Binds abstract fun events(impl: EventsRepositoryImpl): EventsRepository
    @Binds abstract fun songs(impl: SongsRepositoryImpl): SongsRepository
    @Binds abstract fun cards(impl: CardsRepositoryImpl): CardsRepository
    @Binds abstract fun collections(impl: CollectionsRepositoryImpl): CollectionsRepository
    @Binds abstract fun player(impl: PlayerRepositoryImpl): PlayerRepository
    @Binds abstract fun cache(impl: CacheManagementRepositoryImpl): CacheManagementRepository
    @Binds abstract fun auth(impl: AccountRepositoryImpl): AuthRepository
    @Binds abstract fun favorites(impl: FavoriteRepositoryImpl): FavoriteRepository
    @Binds abstract fun playerBindings(impl: PlayerBindingRepositoryImpl): PlayerBindingRepository
}

private fun List<CatalogItemFacet>.matches(filters: CatalogFilterState): Boolean {
    if (filters.activeCount == 0) return true
    val valuesByKey = associate { it.key to it.values }
    val selectionsMatch = filters.selected.all { (key, selectedValues) ->
        if (selectedValues.isEmpty()) true
        else {
            val itemValues = valuesByKey[key].orEmpty()
            if (key == "bonusCharacterIds") itemValues.containsAll(selectedValues)
            else itemValues.any(selectedValues::contains)
        }
    }
    val togglesMatch = filters.toggles.all { (key, enabled) ->
        !enabled || valuesByKey[key].orEmpty().any { it.equals("true", true) || it == "1" }
    }
    return selectionsMatch && togglesMatch
}

private fun <T> List<T>.facetMeta(facets: (T) -> List<CatalogItemFacet>): CatalogFilterMeta {
    val counts = mutableMapOf<String, MutableMap<String, Int>>()
    forEach { item ->
        facets(item).forEach { facet ->
            val values = counts.getOrPut(facet.key) { mutableMapOf() }
            facet.values.forEach { value -> values[value] = (values[value] ?: 0) + 1 }
        }
    }
    return CatalogFilterMeta(
        groups = counts.map { (key, values) ->
            CatalogFilterGroup(
                key = key,
                label = key.filterLabel(),
                matchAll = key == "bonusCharacterIds",
                options = values.entries.sortedByDescending { it.value }.map {
                    CatalogFilterOption(it.key, it.key.filterOptionLabel(), it.value)
                }
            )
        }
    )
}

private fun String.filterLabel() = when (this) {
    "categories" -> "\u6b4c\u66f2\u7c7b\u522b"
    "musicTags" -> "\u6b4c\u66f2\u6807\u7b7e"
    "characterIds", "bonusCharacterIds", "bannerCharacterIds" -> "\u89d2\u8272"
    "units", "eventUnits", "supportUnits" -> "\u7ec4\u5408"
    "attributes", "bonusAttributes" -> "\u5c5e\u6027"
    "rarities" -> "\u7a00\u6709\u5ea6"
    "eventTypes" -> "\u6d3b\u52a8\u7c7b\u578b"
    else -> this
}

private fun String.filterOptionLabel() = when (this.lowercase()) {
    "image" -> "\u9759\u6001\u5f71\u50cf"
    "mv_2d" -> "2D MV"
    "mv" -> "MV"
    "original" -> "\u539f\u521b\u6b4c\u66f2"
    "cute" -> "\u53ef\u7231"
    "cool" -> "\u5e05\u6c14"
    "pure" -> "\u7eaf\u771f"
    "happy" -> "\u6d3b\u529b"
    "mysterious" -> "\u795e\u79d8"
    "rarity_1", "1" -> "1 \u661f"
    "rarity_2", "2" -> "2 \u661f"
    "rarity_3", "3" -> "3 \u661f"
    "rarity_4", "4" -> "4 \u661f"
    "rarity_birthday", "birthday" -> "\u751f\u65e5"
    else -> this
}


