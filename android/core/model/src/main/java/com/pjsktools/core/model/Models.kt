package com.pjsktools.core.model

enum class Region(val id: String, val displayName: String) {
    JP("jp", "日服"), EN("en", "国际服"), TW("tw", "繁中服"), KR("kr", "韩服"), CN("cn", "国服");
    companion object { fun fromId(id: String?) = entries.firstOrNull { it.id == id } }
}

enum class ThemeMode { SYSTEM, LIGHT, DARK }
enum class Availability { MATCHED, NOT_RELEASED, MISSING_DATA, CACHE_STALE, SOURCE_UNAVAILABLE }
enum class ContentPhase { LOADING, CONTENT, EMPTY, REFRESHING, STALE, OFFLINE, PARTIAL, UNAVAILABLE, ERROR }
enum class FilterMetadataStatus { LOADING, CONTENT, OFFLINE, UNAVAILABLE, ERROR }

data class SourceHealth(
    val status: String = "unknown",
    val updatedAt: String? = null,
    val unavailableReason: String? = null,
    val warnings: List<String> = emptyList(),
    val primarySource: String? = null,
    val fallbackLine: String? = null,
    val latestUpdatedAt: String? = null,
    val cacheUpdatedAt: String? = null,
    val errors: List<String> = emptyList()
)
data class CacheInfo(val key: String, val updatedAtMillis: Long, val itemCount: Int)
data class Page<T>(
    val items: List<T>,
    val page: Int,
    val pageSize: Int,
    val total: Int,
    val totalPages: Int,
    val hasNextPage: Boolean,
    val filterMeta: CatalogFilterMeta = CatalogFilterMeta(),
    val filterStatus: FilterMetadataStatus = if (filterMeta.groups.isEmpty() && filterMeta.toggles.isEmpty()) FilterMetadataStatus.LOADING else FilterMetadataStatus.CONTENT,
    val filterMessage: String? = null
)
data class DataResult<T>(val data: T? = null, val phase: ContentPhase = ContentPhase.LOADING, val message: String? = null, val updatedAtMillis: Long? = null)
data class ListScrollAnchor(val itemId: String?, val index: Int, val offset: Int)

data class RuntimeStatus(val updatedAt: String? = null, val cachedPlayers: Int = 0, val cachedRankings: Int = 0)
data class EventSummary(
    val id: String, val name: String, val eventType: String? = null, val startAt: String, val endAt: String,
    val storyOutline: String? = null, val bannerUrl: String? = null, val facets: List<CatalogItemFacet> = emptyList(),
    val eventUnit: String? = null, val aggregateAt: String? = null, val rankingAnnounceAt: String? = null,
    val bonusCharacterIds: List<String> = emptyList(), val bonusAttributes: List<String> = emptyList()
)
data class EventQuery(
    val text: String = "",
    val sort: String = "id-desc",
    val page: Int = 1,
    val pageSize: Int = 24,
    val filters: CatalogFilterState = CatalogFilterState()
)
data class RankingEntry(
    val rank: Int, val score: Long, val userId: String? = null, val name: String? = null, val updatedAt: String? = null,
    val leaderImageUrl: String? = null, val hourlyGrowth: Double? = null, val leaderCardId: Int? = null,
    val leaderCardLevel: Int? = null, val leaderCardMasterRank: Int? = null,
    val leaderImageCandidates: List<String> = emptyList(), val leaderCharacterImageCandidates: List<String> = emptyList(),
    val leaderCharacterId: Int? = null
)
data class RankingHistoryPoint(val rank: Int, val score: Long, val sampledAt: String, val sampleType: String? = null)
data class ForecastLine(
    val rank: Int, val currentScore: Long? = null, val hourlyGrowth: Double? = null, val forecast1h: Long? = null,
    val forecast3h: Long? = null, val forecastEnd: Long? = null, val confidence: String? = null,
    val updatedAt: String? = null, val sampleCount: Int = 0, val sampleSpanHours: Double? = null,
    val confidenceReason: String? = null, val unavailableReason: String? = null
)
enum class ForecastWindow(val apiHours: Int?) { ALL(null), ONE_HOUR(1), THREE_HOURS(3), SIX_HOURS(6) }
data class ForecastWindowSummary(val lineCount: Int = 0, val maxSampleCount: Int = 0, val maxSampleSpanHours: Double = 0.0, val confidence: String = "unavailable")
data class HistorySummaryLine(
    val rank: Int, val sampleType: String? = null, val sampleCount: Int = 0, val latestScore: Long? = null,
    val latestSampledAt: String? = null, val firstSampledAt: String? = null, val sampleSpanHours: Double? = null,
    val speedPerHour: Double? = null, val confidence: String? = null, val confidenceReason: String? = null
)
data class ForecastDashboard(
    val eventId: String, val selectedWindow: ForecastWindow, val lines: List<ForecastLine>,
    val windows: Map<ForecastWindow, List<ForecastLine>>, val summaries: Map<ForecastWindow, ForecastWindowSummary>,
    val history: List<RankingHistoryPoint>, val historySummary: List<HistorySummaryLine>, val sampleCount: Int = 0,
    val generatedAt: String? = null, val source: String? = null, val warnings: List<String> = emptyList(),
    val unavailableReason: String? = null, val retentionRecommendation: String? = null,
    val sourceHealth: SourceHealth = SourceHealth()
)
data class LiveRankingSnapshot(
    val event: EventSummary?, val top100: List<RankingEntry>, val borders: List<RankingEntry>,
    val updatedAt: String? = null, val sourceHealth: SourceHealth = SourceHealth(),
    val boardType: String = "overall", val gameCharacterId: Int? = null, val worldLinkCharacters: List<WorldLinkCharacter> = emptyList(),
    val worldLinkAvailable: Boolean = false, val warnings: List<String> = emptyList()
)
data class WorldLinkCharacter(val id: Int, val name: String, val imageCandidates: List<String> = emptyList())
data class RankingTracePoint(val score: Long, val timestamp: Long? = null, val sampledAt: String? = null, val rank: Int? = null)
data class RankingNeighbor(val rank: Int, val score: Long, val userId: String? = null, val name: String? = null)
data class RankingProfileHonor(val seq: Int? = null, val type: String? = null, val honorId: Int? = null, val level: Int? = null, val bondsViewType: String? = null)
data class RankingPlayerDetail(
    val entry: RankingEntry, val profileWord: String? = null, val intervalSeconds: Int? = null,
    val growth1h: Double? = null, val churn1h: Int? = null, val churn20min: Int? = null, val churn48h: Int? = null,
    val rankHourlyGrowth: Double? = null, val observedPtUpdates: Int? = null, val churnStatus: String? = null,
    val churnUpdatedAt: String? = null, val hourlyChurn: List<ChurnHour> = emptyList(),
    val recentScoreChanges: List<ScoreChange> = emptyList(), val parkingPeriods: List<ParkingPeriod> = emptyList(),
    val profileHonors: List<RankingProfileHonor> = emptyList(),
    val playerTrace: List<RankingTracePoint> = emptyList(), val lineTrace: List<RankingTracePoint> = emptyList(),
    val previous: RankingNeighbor? = null, val next: RankingNeighbor? = null
)
data class ChurnHour(val hour: String, val count: Int)
data class ScoreChange(val timestamp: Long, val delta: Double)
data class ParkingPeriod(val startTime: Long? = null, val sinceMs: Long? = null, val endTime: Long? = null, val durationSeconds: Int? = null)
data class EventDetail(
    val event: EventSummary, val relatedSongs: List<SongSummary> = emptyList(),
    val relatedCards: List<CardSummary> = emptyList(), val relatedGachas: List<CatalogEntry> = emptyList()
)
data class ScoreControlInput(
    val eventId: String, val targetRank: Int, val currentPt: Long, val targetPt: Long,
    val remainingMinutes: Int, val ptPerRun: Long, val availableRuns: Int? = null, val bindingId: String? = null
)
data class ScoreControlResult(
    val remainingPt: Long, val adjustedPtPerRun: Long, val requiredRuns: Int?, val requiredPtPerHour: Long?,
    val requiredRunsPerHour: Double?, val feasible: Boolean, val targetBorder: RankingEntry? = null,
    val formulaVersion: String? = null, val warnings: List<String> = emptyList()
)
data class EventPointEstimate(
    val estimatedPt: Long, val remainingPt: Long? = null, val estimatedRunsToTarget: Int? = null,
    val formulaVersion: String? = null, val officialFieldsUsed: List<String> = emptyList(),
    val estimatedFieldsUsed: List<String> = emptyList(), val missingFields: List<String> = emptyList(),
    val warnings: List<String> = emptyList(), val calculationTrace: List<String> = emptyList()
)
data class EventDashboard(val current: EventSummary?, val events: Page<EventSummary>, val top100: Page<RankingEntry>, val borders: Page<RankingEntry>, val history: List<RankingHistoryPoint>, val forecast: List<ForecastLine>, val health: SourceHealth = SourceHealth())

enum class WorkbenchDestination { CURRENT_EVENT, FORECAST, HISTORY, SONGS, CARDS, GACHAS, HONORS, MATERIALS, COSTUMES, STAMPS, COMICS, PLAYER, FAVORITES, SETTINGS }
data class WorkbenchItem(val id: String, val title: String, val subtitle: String, val destination: WorkbenchDestination? = null, val available: Boolean = destination != null)
data class WorkbenchGroup(val title: String, val items: List<WorkbenchItem>)
data class HomeWorkbench(
    val region: Region, val runtime: RuntimeStatus, val currentEvent: EventSummary?, val topThree: List<RankingEntry>,
    val songCount: Int, val cardCount: Int, val signedIn: Boolean, val favoriteCount: Int, val groups: List<WorkbenchGroup>
)

data class Difficulty(val id: String? = null, val name: String, val level: Int? = null, val notes: Int? = null)
data class ChartPreview(
    val difficulty: String, val level: Int? = null, val notes: Int? = null,
    val svgUrl: String? = null, val viewerSvgUrl: String? = null, val pngUrl: String? = null
) {
    val imageCandidates get() = listOfNotNull(svgUrl, viewerSvgUrl, pngUrl).distinct()
}
data class SongSummary(
    val id: String, val title: String, val unit: String, val durationSeconds: Int? = null,
    val categories: List<String> = emptyList(), val publishedAt: String? = null,
    val jacketUrl: String? = null, val jacketCandidates: List<String> = emptyList(),
    val facets: List<CatalogItemFacet> = emptyList()
)
data class SongDetail(val song: SongSummary, val lyricist: String? = null, val composer: String? = null, val arranger: String? = null, val bpm: Double? = null, val difficulties: List<Difficulty> = emptyList(), val charts: List<ChartPreview> = emptyList())

data class CardSummary(
    val id: String, val title: String, val character: String, val characterId: String? = null,
    val rarity: Int, val attribute: String, val unit: String? = null,
    val normalThumbnailUrl: String? = null, val normalThumbnailCandidates: List<String> = emptyList(),
    val facets: List<CatalogItemFacet> = emptyList()
)
data class CardSkill(
    val id: String, val name: String? = null, val template: String? = null,
    val formattedDescriptions: Map<Int, String> = emptyMap(), val status: String? = null,
    val missingFields: List<String> = emptyList()
)
data class RelatedCatalogItem(val id: String, val name: String? = null)
data class CardDetail(
    val card: CardSummary,
    val normalUrl: String? = null, val normalCandidates: List<String> = emptyList(),
    val trainedUrl: String? = null, val trainedCandidates: List<String> = emptyList(),
    val skill: CardSkill? = null, val specialTrainingSkill: CardSkill? = null,
    val relatedEvents: List<RelatedCatalogItem> = emptyList(), val relatedGachas: List<RelatedCatalogItem> = emptyList()
)
data class PlayerProfile(val region: Region, val userId: String, val nickname: String, val rank: Int, val comment: String? = null, val titles: List<String> = emptyList(), val updatedAt: String? = null, val source: String? = null)

data class SongQuery(
    val text: String = "",
    val unit: String? = null,
    val category: String? = null,
    val sort: String = "published-desc",
    val page: Int = 1,
    val pageSize: Int = 24,
    val filters: CatalogFilterState = CatalogFilterState()
)
data class CardQuery(
    val text: String = "",
    val characterId: Int? = null,
    val attribute: String? = null,
    val rarity: String? = null,
    val unit: String? = null,
    val sort: String = "id-desc",
    val page: Int = 1,
    val pageSize: Int = 24,
    val filters: CatalogFilterState = CatalogFilterState()
)

enum class CatalogKind(val apiName: String) {
    GACHA("gachas"), HONOR("honors"), MATERIAL("materials"), COSTUME("costumes"), STAMP("stamps"), COMIC("comics");
    companion object { fun fromApiName(value: String) = entries.firstOrNull { it.apiName == value } }
}

data class CatalogAsset(
    val imageUrl: String? = null, val thumbnailUrl: String? = null, val imageCandidates: List<String> = emptyList(),
    val logoUrl: String? = null, val bannerUrl: String? = null, val screenUrl: String? = null,
    val degreeMainUrl: String? = null, val degreeSubUrl: String? = null, val rankMainUrl: String? = null,
    val scrollUrl: String? = null, val frameUrl: String? = null
)
data class CostumeColorVariant(val colorId: Int? = null, val colorName: String? = null, val assetbundleName: String? = null)
data class CostumePart(val partType: String, val variants: List<CostumeColorVariant>)
data class CatalogEntryData(
    val id: String, val kind: CatalogKind, val name: String, val title: String? = null, val description: String? = null,
    val category: String? = null, val rarity: String? = null, val characterId: Int? = null,
    val startAt: String? = null, val endAt: String? = null, val relatedCardIds: List<String> = emptyList(),
    val assets: CatalogAsset = CatalogAsset(), val source: String? = null, val gender: String? = null,
    val designer: String? = null, val partTypes: List<String> = emptyList(), val characterIds: List<Int> = emptyList(),
    val parts: List<CostumePart> = emptyList(), val assetStatus: String? = null,
    val facets: List<CatalogItemFacet> = emptyList()
)
sealed interface CatalogEntry { val data: CatalogEntryData }
data class GachaEntry(override val data: CatalogEntryData, val gachaType: String? = null) : CatalogEntry
data class HonorEntry(override val data: CatalogEntryData, val honorRarity: String? = null, val groupId: Int? = null) : CatalogEntry
data class MaterialEntry(override val data: CatalogEntryData, val materialType: String? = null) : CatalogEntry
data class CostumeEntry(override val data: CatalogEntryData, val costumeNumber: Int? = null) : CatalogEntry
data class StampEntry(override val data: CatalogEntryData, val stampType: String? = null) : CatalogEntry
data class ComicEntry(override val data: CatalogEntryData, val comicType: String? = null) : CatalogEntry

data class CatalogDetail(val item: CatalogEntry, val relatedCards: List<CardSummary> = emptyList())
data class CatalogFacet(val key: String, val value: String, val count: Int)
data class CatalogQuery(
    val text: String = "", val category: String? = null, val rarity: String? = null, val characterId: Int? = null,
    val partType: String? = null, val source: String? = null, val gender: String? = null,
    val sort: String = "id-desc", val page: Int = 1, val pageSize: Int = 24,
    val filters: CatalogFilterState = CatalogFilterState()
)
