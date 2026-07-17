// Compatibility DTOs for GeneratedApiBridge. Feature modules must not use these types.
package com.pjsktools.api.generated

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable data class SourceHealthDto(val status: String? = null, val syncedAt: String? = null, val updatedAt: String? = null, val unavailableReason: String? = null, val warnings: List<String> = emptyList(), val primarySource: String? = null, val fallbackLine: String? = null, val latestUpdatedAt: String? = null, val cacheUpdatedAt: String? = null, val errors: List<String> = emptyList())
@Serializable data class RuntimeStatusDto(val updatedAt: String? = null, val cachedPlayers: Int = 0, val cachedRankingTop100: Int = 0, val cachedRankingBorders: Int = 0)
@Serializable data class AssetCandidatesDto(val jacketUrl: String? = null, val bannerUrl: String? = null, val normalUrl: String? = null, val afterTrainingUrl: String? = null, val normalThumbnailUrl: String? = null, val afterTrainingThumbnailUrl: String? = null, val imageCandidates: List<String> = emptyList(), val normalImageCandidates: List<String> = emptyList(), val normalThumbnailCandidates: List<String> = emptyList(), val afterTrainingImageCandidates: List<String> = emptyList(), val afterTrainingThumbnailCandidates: List<String> = emptyList())
@Serializable data class CatalogItemFacetDto(val key: String, val values: List<String> = emptyList())
@Serializable data class CatalogFilterOptionDto(val value: String, val label: String, val count: Int, val iconKey: String? = null, val iconCandidates: List<String> = emptyList(), val color: String? = null)
@Serializable data class CatalogFilterGroupDto(val key: String, val label: String, val match: String = "any", val options: List<CatalogFilterOptionDto> = emptyList())
@Serializable data class CatalogFilterToggleDto(val key: String, val label: String, val value: Boolean)
@Serializable data class CatalogFilterMetaDto(val groups: List<CatalogFilterGroupDto> = emptyList(), val toggles: List<CatalogFilterToggleDto> = emptyList())
@Serializable data class RegionDto(val id: String, val name: String, val repository: String)
@Serializable data class EventSummaryDto(val id: String, val name: String, val eventType: String? = null, val eventUnit: String? = null, val bonusCharacterIds: List<String> = emptyList(), val bonusAttributes: List<String> = emptyList(), val startAt: String, val endAt: String, val aggregateAt: String? = null, val rankingAnnounceAt: String? = null, val storyOutline: String? = null, val assets: AssetCandidatesDto? = null, val facets: List<CatalogItemFacetDto> = emptyList())
@Serializable data class RankingEntryDto(val rank: Int, val score: Long, val userId: String? = null, val name: String? = null, val updatedAt: String? = null, val hourlyGrowth: Double? = null, val leaderCardId: Int? = null, val leaderCardLevel: Int? = null, val leaderCardMasterRank: Int? = null, val leaderCardImageUrl: String? = null, val leaderCardImageCandidates: List<String> = emptyList(), val leaderCharacterImageCandidates: List<String> = emptyList(), val leaderCharacterId: Int? = null)
@Serializable data class RankingHistorySampleDto(val rank: Int, val score: Long, val sampledAt: String, val sampleType: String? = null)
@Serializable data class RankingHistoryDto(val region: String, val eventId: String, val items: List<RankingHistorySampleDto>, val sampleCount: Int, val unavailableReason: String? = null, val warnings: List<String> = emptyList())
@Serializable data class RankingHistoryLineDto(val rank: Int, val sampleType: String? = null, val sampleCount: Int = 0, val latestScore: Long? = null, val latestSampledAt: String? = null, val firstSampledAt: String? = null, val sampleSpanHours: Double? = null, val speedPerHour: Double? = null, val confidence: String? = null, val confidenceReason: String? = null)
@Serializable data class RankingHistorySummaryDto(val region: String, val eventId: String, val lines: List<RankingHistoryLineDto> = emptyList(), val unavailableReason: String? = null, val warnings: List<String> = emptyList(), val retentionRecommendation: String? = null)
@Serializable data class ForecastLineDto(val rank: Int, val currentScore: Long? = null, val hourlyGrowth: Double? = null, val forecast1h: Long? = null, val forecast3h: Long? = null, val forecastEnd: Long? = null, val confidence: String? = null, val updatedAt: String? = null, val sampleCount: Int = 0, val sampleSpanHours: Double? = null, val confidenceReason: String? = null, val unavailableReason: String? = null)
@Serializable data class ForecastWindowSummaryDto(val lineCount: Int = 0, val maxSampleCount: Int = 0, val maxSampleSpanHours: Double = 0.0, val confidence: String = "unavailable")
@Serializable data class ForecastWindowsDto(val all: List<ForecastLineDto> = emptyList(), @SerialName("1h") val oneHour: List<ForecastLineDto> = emptyList(), @SerialName("3h") val threeHours: List<ForecastLineDto> = emptyList(), @SerialName("6h") val sixHours: List<ForecastLineDto> = emptyList())
@Serializable data class ForecastWindowSummariesDto(val all: ForecastWindowSummaryDto = ForecastWindowSummaryDto(), @SerialName("1h") val oneHour: ForecastWindowSummaryDto = ForecastWindowSummaryDto(), @SerialName("3h") val threeHours: ForecastWindowSummaryDto = ForecastWindowSummaryDto(), @SerialName("6h") val sixHours: ForecastWindowSummaryDto = ForecastWindowSummaryDto())
@Serializable data class ForecastDto(val region: String, val eventId: String, val lines: List<ForecastLineDto>, val windows: ForecastWindowsDto? = null, val windowSummaries: ForecastWindowSummariesDto? = null, val sampleCount: Int = 0, val generatedAt: String? = null, val source: String? = null, val sourceHealth: SourceHealthDto? = null, val unavailableReason: String? = null, val warnings: List<String> = emptyList(), val retentionRecommendation: String? = null)
@Serializable data class WorldLinkCharacterDto(val id: Int, val name: String, val imageCandidates: List<String> = emptyList())
@Serializable data class LiveRankingDto(val eventId: String? = null, val currentEvent: EventSummaryDto? = null, val top100: List<RankingEntryDto> = emptyList(), val borderLines: List<RankingEntryDto> = emptyList(), val updatedAt: String? = null, val sourceHealth: SourceHealthDto? = null, val boardType: String? = null, val gameCharacterId: Int? = null, val worldLinkCharacters: List<WorldLinkCharacterDto> = emptyList(), val worldLinkAvailable: Boolean = false, val warnings: List<String> = emptyList())
@Serializable data class EventRelationsDto(val relatedSongs: List<SongSummaryDto> = emptyList(), val relatedCards: List<CardSummaryDto> = emptyList(), val relatedGachas: List<CatalogItemDto> = emptyList())
@Serializable data class EventFullDetailDto(val region: String, val event: EventSummaryDto, val assets: AssetCandidatesDto, val relations: EventRelationsDto)
@Serializable data class RankingTracePointDto(val score: Long, val timestamp: Long? = null, val sampledAt: String? = null, val rank: Int? = null)
@Serializable data class RankingNeighborDto(val rank: Int, val score: Long, val userId: String? = null, val name: String? = null)
@Serializable data class ChurnHourDto(val hour: String, val count: Int)
@Serializable data class ScoreChangeDto(val timestamp: Long, val delta: Double)
@Serializable data class ParkingPeriodDto(val startTime: Long? = null, val sinceMs: Long? = null, val endTime: Long? = null, val durationSeconds: Int? = null)
@Serializable data class RankingProfileHonorDto(val seq: Int? = null, val profileHonorType: String? = null, val honorId: Int? = null, val honorLevel: Int? = null, val bondsHonorViewType: String? = null)
@Serializable data class RankingPlayerDetailDto(val rank: Int, val score: Long, val userId: String? = null, val name: String? = null, val updatedAt: String? = null, val hourlyGrowth: Double? = null, val leaderCardId: Int? = null, val leaderCardLevel: Int? = null, val leaderCardMasterRank: Int? = null, val leaderCardImageUrl: String? = null, val leaderCardImageCandidates: List<String> = emptyList(), val leaderCharacterImageCandidates: List<String> = emptyList(), val leaderCharacterId: Int? = null, val profileWord: String? = null, val profileHonors: List<RankingProfileHonorDto> = emptyList(), val intervalSeconds: Int? = null, val growth1h: Double? = null, val rankHourlyGrowth: Double? = null, val churn1h: Int? = null, val churn20min: Int? = null, val churn48h: Int? = null, val observedPtUpdates: Int? = null, val churnStatus: String? = null, val churnUpdatedAt: String? = null, val hourlyChurn: List<ChurnHourDto> = emptyList(), val recentScoreChanges: List<ScoreChangeDto> = emptyList(), val parkingPeriods: List<ParkingPeriodDto> = emptyList(), val playerTrace: List<RankingTracePointDto> = emptyList(), val lineTrace: List<RankingTracePointDto> = emptyList(), val previous: RankingNeighborDto? = null, val next: RankingNeighborDto? = null)
@Serializable data class ScoreControlResultDto(val remainingPt: Double, val adjustedPtPerRun: Double, val requiredRuns: Int? = null, val requiredPtPerHour: Int? = null, val requiredRunsPerHour: Double? = null, val feasible: Boolean, val sharedFormulaVersion: String? = null, val targetBorder: RankingEntryDto? = null, val warnings: List<String> = emptyList())
@Serializable data class EventPointEstimateResultDto(val estimatedPt: Double, val remainingPt: Double? = null, val estimatedRunsToTarget: Int? = null, val sharedFormulaVersion: String? = null, val officialFieldsUsed: List<String> = emptyList(), val estimatedFieldsUsed: List<String> = emptyList(), val missingFields: List<String> = emptyList(), val warnings: List<String> = emptyList(), val calculationTrace: List<String> = emptyList())
@Serializable data class PlayerBindingDto(val id: String, val region: String, val playerUid: String, val displayName: String? = null, val isDefault: Boolean = false, val note: String? = null, val refreshedAt: String? = null, val version: String? = null)
@Serializable data class PlayerBindingPageDto(val items: List<PlayerBindingDto> = emptyList())
@Serializable data class DifficultyDto(val id: String? = null, val difficulty: String, val playLevel: Int? = null, val totalNoteCount: Int? = null)
@Serializable data class SongSummaryDto(val id: String, val title: String, val unit: String, val durationSeconds: Int? = null, val categories: List<String> = emptyList(), val publishedAt: String? = null, val assets: AssetCandidatesDto? = null, val facets: List<CatalogItemFacetDto> = emptyList())
@Serializable data class SongDto(val id: String, val title: String, val unit: String, val durationSeconds: Int? = null, val categories: List<String> = emptyList(), val publishedAt: String? = null, val assets: AssetCandidatesDto? = null, val difficultyDetails: List<DifficultyDto> = emptyList(), val lyricist: String? = null, val composer: String? = null, val arranger: String? = null, val bpm: Double? = null)
@Serializable data class ChartDetailDto(val region: String, val musicId: String, val title: String, val difficulty: String, val playLevel: Int? = null, val totalNoteCount: Int? = null, val chartSvgUrl: String? = null, val sekaiViewerChartSvgUrl: String? = null, val chartPngUrl: String? = null)
@Serializable data class SongDetailDto(val region: String, val music: SongDto, val assets: AssetCandidatesDto, val charts: List<ChartDetailDto> = emptyList())
@Serializable data class CardSummaryDto(val id: String, val title: String, val character: String, val characterId: String? = null, val rarity: Int, val attribute: String, val characterUnit: String? = null, val supportUnit: String? = null, val assets: AssetCandidatesDto? = null, val facets: List<CatalogItemFacetDto> = emptyList())
@Serializable data class SkillFormatTraceDto(val status: String? = null, val missingFields: List<String> = emptyList(), val unresolvedPlaceholders: List<String> = emptyList())
@Serializable data class CardSkillDto(val id: String, val name: String? = null, val description: String? = null, val formattedDescriptions: Map<String, String> = emptyMap(), val skillFormatTrace: SkillFormatTraceDto? = null)
@Serializable data class CardDto(val id: String, val title: String, val character: String, val characterId: String? = null, val rarity: Int, val attribute: String, val characterUnit: String? = null, val supportUnit: String? = null, val assets: AssetCandidatesDto? = null, val skill: CardSkillDto? = null, val specialTrainingSkill: CardSkillDto? = null)
@Serializable data class CardRelationItemDto(val id: String, val name: String? = null)
@Serializable data class CardRelationsDto(val relatedEvents: List<CardRelationItemDto> = emptyList(), val relatedGachas: List<CardRelationItemDto> = emptyList())
@Serializable data class CardDetailDto(val region: String, val card: CardDto, val assets: AssetCandidatesDto, val relations: CardRelationsDto? = null)
@Serializable data class PlayerProfileDto(val region: String, val userId: String, val nickname: String, val rank: Int, val comment: String? = null, val titles: List<String> = emptyList(), val updatedAt: String, val source: String)
@Serializable data class SongPageDto(val items: List<SongSummaryDto>, val page: Int, val pageSize: Int, val total: Int, val totalPages: Int, val hasNextPage: Boolean, val hasPreviousPage: Boolean, val region: String? = null, val type: String? = null, val masterVersion: String? = null, val sourceHealth: SourceHealthDto? = null, val filterMeta: CatalogFilterMetaDto = CatalogFilterMetaDto())
@Serializable data class CardPageDto(val items: List<CardSummaryDto>, val page: Int, val pageSize: Int, val total: Int, val totalPages: Int, val hasNextPage: Boolean, val hasPreviousPage: Boolean, val region: String? = null, val type: String? = null, val masterVersion: String? = null, val sourceHealth: SourceHealthDto? = null, val filterMeta: CatalogFilterMetaDto = CatalogFilterMetaDto())
@Serializable data class EventPageDto(val items: List<EventSummaryDto>, val page: Int, val pageSize: Int, val total: Int, val totalPages: Int, val hasNextPage: Boolean, val hasPreviousPage: Boolean, val sourceHealth: SourceHealthDto? = null, val filterMeta: CatalogFilterMetaDto = CatalogFilterMetaDto())
@Serializable data class RankingEntryPageDto(val items: List<RankingEntryDto>, val page: Int, val pageSize: Int, val total: Int, val totalPages: Int, val hasNextPage: Boolean, val hasPreviousPage: Boolean)

@Serializable data class CatalogAssetDto(
    val imageUrl: String? = null, val thumbnailUrl: String? = null, val imageCandidates: List<String> = emptyList(),
    val logoUrl: String? = null, val bannerUrl: String? = null, val screenUrl: String? = null,
    val degreeMainUrl: String? = null, val degreeSubUrl: String? = null, val rankMainUrl: String? = null,
    val scrollUrl: String? = null, val frameUrl: String? = null, val source: String? = null
)
@Serializable data class CostumeColorVariantDto(val colorId: Int? = null, val colorName: String? = null, val assetbundleName: String? = null)
@Serializable data class CostumePartDto(val partType: String, val variants: List<CostumeColorVariantDto> = emptyList())
@Serializable data class CatalogItemDto(
    val id: String, val type: String, val name: String, val title: String? = null, val description: String? = null,
    val category: String? = null, val rarity: String? = null, val characterId: Int? = null,
    val startAt: String? = null, val endAt: String? = null, val relatedCardIds: List<String> = emptyList(),
    val assets: CatalogAssetDto = CatalogAssetDto(), val gachaType: String? = null, val honorRarity: String? = null,
    val groupId: Int? = null, val materialType: String? = null, val costumeNumber: Int? = null,
    val designer: String? = null, val gender: String? = null, val source: String? = null,
    val partTypes: List<String> = emptyList(), val characterIds: List<Int> = emptyList(),
    val parts: List<CostumePartDto> = emptyList(), val assetStatus: String? = null,
    val stampType: String? = null, val comicType: String? = null,
    val facets: List<CatalogItemFacetDto> = emptyList()
)
@Serializable data class CatalogPageDto(
    val items: List<CatalogItemDto>, val page: Int, val pageSize: Int, val total: Int, val totalPages: Int,
    val hasNextPage: Boolean, val hasPreviousPage: Boolean, val region: String? = null, val type: String? = null,
    val masterVersion: String? = null, val sourceHealth: SourceHealthDto? = null,
    val source: String? = null, val unavailableReason: String? = null,
    val filterMeta: CatalogFilterMetaDto = CatalogFilterMetaDto()
)
@Serializable data class CatalogDetailDto(
    val region: String, val type: String, val item: CatalogItemDto,
    val assets: CatalogAssetDto = CatalogAssetDto(), val relatedCards: List<CardSummaryDto> = emptyList()
)
typealias GachaPageDto = CatalogPageDto
typealias HonorPageDto = CatalogPageDto
typealias MaterialPageDto = CatalogPageDto
typealias CostumePageDto = CatalogPageDto
typealias StampPageDto = CatalogPageDto
typealias ComicPageDto = CatalogPageDto
