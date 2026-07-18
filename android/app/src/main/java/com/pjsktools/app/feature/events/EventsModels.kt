package com.pjsktools.app.feature.events

data class EventSummary(val id: String, val name: String, val eventType: String?, val startAt: String, val endAt: String, val storyOutline: String?)
data class RankingRow(
    val rank: Int, val userId: String?, val playerName: String, val score: Long, val growth: Long?, val updatedAt: String?,
    val leaderCardId: String? = null, val leaderCardLevel: Int? = null, val leaderCardMasterRank: Int? = null,
    val leaderImageCandidates: List<String> = emptyList(), val leaderAssetStatus: String? = null
)
data class BorderRow(val rank: Int, val score: Long, val updatedAt: String?)
data class RankingSourceHealth(val status: String?, val primarySource: String?, val fallbackLine: String?, val latestUpdatedAt: String?, val stale: Boolean, val errors: List<String>)
data class ForecastLine(val rank: Int, val currentScore: Long, val speedPerHour: Double?, val forecast1h: Long?, val forecast3h: Long?, val forecastEnd: Long?, val sampleCount: Int, val sampleSpanHours: Double?, val confidence: String?, val reason: String?)
data class HistorySummaryLine(val rank: Int, val sampleType: String?, val sampleCount: Int, val latestScore: Long?, val latestSampledAt: String?, val sampleSpanHours: Double?, val speedPerHour: Double?, val confidence: String?, val confidenceReason: String?)
data class RankingHistorySample(val rank: Int, val score: Long, val sampledAt: String, val sampleType: String?)
data class RankingTracePoint(val timestamp: Long, val rank: Int, val score: Long)
data class RankingPlayerDetail(
    val row: RankingRow,
    val profileWord: String?,
    val profileHonorCount: Int,
    val intervalSeconds: Int?,
    val inTop100Range: Boolean,
    val rankHourlyGrowth: Double?,
    val playerTrace: List<RankingTracePoint>,
    val rankTrace: List<RankingTracePoint>,
    val churnStatus: String?,
    val churn1h: Int?,
    val churn20min: Int?,
    val churn48h: Int?,
    val observedPtUpdates: Int?,
    val churnUpdatedAt: String?
)

enum class EventRelatedKind { SONG, CARD, GACHA }
data class EventRelatedItem(
    val id: String, val title: String, val subtitle: String?, val kind: EventRelatedKind,
    val imageCandidates: List<String> = emptyList()
)
data class FullEventDetail(
    val event: EventSummary,
    val bannerCandidates: List<String>,
    val relatedSongs: List<EventRelatedItem>,
    val relatedCards: List<EventRelatedItem>,
    val relatedGachas: List<EventRelatedItem>
)
data class EventNavigationTarget(val kind: EventRelatedKind, val id: String, val title: String)

data class RankingInsights(
    val experimental: Boolean,
    val sampleCount: Int,
    val lines: List<ForecastLine>,
    val historyLines: List<HistorySummaryLine>,
    val recentSamples: List<RankingHistorySample>,
    val retentionRecommendation: String?,
    val unavailableReason: String?,
    val warnings: List<String>
)

data class EventsDashboard(
    val currentEvent: EventSummary?,
    val events: List<EventSummary>,
    val top100: List<RankingRow>,
    val borders: List<BorderRow>,
    val updatedAt: String?,
    val sourceHealth: RankingSourceHealth?,
    val insights: RankingInsights?,
    val warnings: List<String>
)

data class ToolResult(
    val title: String,
    val highlights: List<Pair<String, String>>,
    val warnings: List<String>,
    val missingFields: List<String>,
    val estimatedFields: List<String> = emptyList(),
    val trace: List<String> = emptyList(),
    val readiness: List<String> = emptyList(),
    val rawJson: String
)
data class EventsAccountContext(val token: String, val bindingId: String, val region: String)
data class ScoreControlInput(val currentPt: Long, val targetPt: Long, val remainingMinutes: Double, val ptPerRun: Double, val availableRuns: Int?, val eventId: String? = null, val targetRank: Int? = null)
data class DeckRecommendInput(val ownedCardIds: List<String>, val eventId: String?, val target: String = "event", val limit: Int = 3)
data class NormalEventPlanInput(val eventId: String?, val musicId: String?, val difficulty: String, val currentPt: Long, val targetPt: Long, val remainingMinutes: Double, val boost: Double, val ownedCardIds: List<String>, val limit: Int = 5)

enum class EventsToolsSection(val label: String) {
    CURRENT("当前活动"), HISTORY("往期活动"), FORECAST("预测与历史"), TOOLS("计算工具")
}
