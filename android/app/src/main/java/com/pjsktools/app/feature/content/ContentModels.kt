package com.pjsktools.app.feature.content

enum class ContentSection(val label: String) {
    INFORMATION("公告资讯"),
    EXCHANGES("兑换所"),
    MISSIONS("任务"),
    VIRTUAL_LIVES("Virtual Live"),
    LIVE2D("Live2D"),
    MYSEKAI("MySekai"),
    STORIES("故事")
}

sealed interface ContentNavigationTarget {
    data class ExternalUrl(val url: String) : ContentNavigationTarget
    data class Event(val id: String) : ContentNavigationTarget
    data class Card(val id: String) : ContentNavigationTarget
}

data class ContentPage<T>(
    val items: List<T>,
    val page: Int = 1,
    val pageSize: Int = items.size.coerceAtLeast(1),
    val total: Int = items.size,
    val totalPages: Int = 1,
    val capabilityStatus: String? = null,
    val warnings: List<String> = emptyList(),
    val unavailableReason: String? = null,
    val facets: Map<String, List<String>> = emptyMap(),
    val sourceHealth: Map<String, String> = emptyMap(),
    val syncedAt: String? = null,
    val unavailableCollections: List<String> = emptyList(),
    val lookupDiagnostics: Map<String, String> = emptyMap()
)

data class InformationItem(
    val id: String,
    val title: String,
    val type: String? = null,
    val tag: String? = null,
    val startAt: Long? = null,
    val endAt: Long? = null,
    val imageCandidates: List<String> = emptyList()
)

data class InformationDetail(
    val item: InformationItem,
    val detailKind: String? = null,
    val embedStatus: String? = null,
    val embeddedDetailUrl: String? = null,
    val detailUrl: String? = null,
    val warnings: List<String> = emptyList()
)

data class ResourceItem(
    val type: String,
    val id: String? = null,
    val name: String,
    val quantity: Int? = null,
    val imageCandidates: List<String> = emptyList(),
    val lookupStatus: String? = null
)

data class ExchangeItem(
    val id: String,
    val name: String,
    val summaryId: String? = null,
    val summaryName: String? = null,
    val category: String? = null,
    val status: String? = null,
    val refreshCycle: String? = null,
    val exchangeLimit: Int? = null,
    val startAt: Long? = null,
    val endAt: Long? = null,
    val rewards: List<ResourceItem> = emptyList(),
    val costs: List<ResourceItem> = emptyList(),
    val imageCandidates: List<String> = emptyList()
)

data class ExchangeDetail(
    val item: ExchangeItem,
    val summaryName: String? = null,
    val siblings: List<ExchangeItem> = emptyList(),
    val capabilityStatus: String? = null,
    val sourceHealth: Map<String, String> = emptyMap(),
    val syncedAt: String? = null,
    val lookupDiagnostics: Map<String, String> = emptyMap()
)

data class MissionStage(val seq: Int, val requirement: Int?, val exp: Int?, val quantity: Int?)

data class MissionItem(
    val id: String,
    val kind: String,
    val type: String,
    val sentence: String,
    val seq: Int? = null,
    val category: String? = null,
    val characterId: String? = null,
    val requirement: Int? = null,
    val maxRequirement: Int? = null,
    val characterName: String? = null,
    val stages: List<MissionStage> = emptyList(),
    val rewards: List<ResourceItem> = emptyList(),
    val lookupStatus: String? = null,
    val missingFields: List<String> = emptyList()
)

data class VirtualLiveItem(
    val id: String,
    val name: String,
    val type: String? = null,
    val startAt: Long? = null,
    val endAt: Long? = null,
    val imageCandidates: List<String> = emptyList(),
    val scheduleCount: Int = 0,
    val setlistCount: Int = 0,
    val rewardCount: Int = 0
)

data class VirtualLiveStep(
    val index: Int,
    val seq: Int,
    val type: String,
    val label: String,
    val imageCandidates: List<String> = emptyList()
)

data class VirtualLiveEvent(
    val id: String,
    val type: String,
    val time: Double? = null,
    val text: String? = null,
    val characterId: String? = null,
    val voiceUrl: String? = null,
    val motionKey: String? = null,
    val facialKey: String? = null,
    val bodyCostume3dId: String? = null
)

data class VirtualLiveStepDetail(
    val index: Int,
    val type: String,
    val playbackStatus: String? = null,
    val unavailableReason: String? = null,
    val warnings: List<String> = emptyList(),
    val events: List<VirtualLiveEvent> = emptyList(),
    val queue: List<PlaybackEntry> = emptyList()
)

data class PlaybackEntry(
    val type: String,
    val label: String,
    val url: String,
    val time: Double? = null
)

data class PlaybackState(
    val status: String? = null,
    val episodeId: String? = null,
    val unavailableReason: String? = null,
    val warnings: List<String> = emptyList(),
    val queue: List<PlaybackEntry> = emptyList(),
    val textSnippets: List<String> = emptyList(),
    val mediaImages: List<String> = emptyList(),
    val diagnostics: List<String> = emptyList(),
    val actions: List<ScenarioAction> = emptyList()
)

data class ScenarioAction(
    val index: Int,
    val type: String,
    val speaker: String? = null,
    val body: String? = null,
    val effectName: String? = null
)

data class VirtualLiveDetail(
    val live: VirtualLiveItem,
    val schedules: List<String>,
    val characters: List<String>,
    val rewards: List<ResourceItem>,
    val steps: List<VirtualLiveStep>,
    val readinessStatus: String? = null,
    val capabilityStatus: String? = null
)

data class Live2dItem(
    val id: String,
    val name: String,
    val modelPath: String? = null,
    val characterId: Int? = null,
    val costumeType: String? = null,
    val regionReferenceStatus: String? = null,
    val playbackStatus: String? = null,
    val motionCount: Int = 0,
    val expressionCount: Int = 0,
    val textureCount: Int = 0
)

data class Live2dDetail(
    val model: Live2dItem,
    val playbackStatus: String? = null,
    val unavailableReason: String? = null,
    val model3Url: String? = null,
    val textureUrls: List<String> = emptyList(),
    val motionUrls: List<String> = emptyList(),
    val expressionUrls: List<String> = emptyList(),
    val runtimeRequirements: List<String> = emptyList()
)

enum class MysekaiKind(val apiName: String, val label: String) {
    FIXTURES("fixtures", "家具"), MATERIALS("materials", "素材"), BLUEPRINTS("blueprints", "蓝图")
}

data class MysekaiItem(
    val id: String,
    val kind: MysekaiKind,
    val name: String,
    val description: String? = null,
    val category: String? = null,
    val rarity: String? = null,
    val imageCandidates: List<String> = emptyList()
)

data class MysekaiCost(val quantity: Int?, val material: MysekaiItem?)

data class MysekaiDetail(
    val item: MysekaiItem,
    val blueprintCount: Int = 0,
    val costs: List<MysekaiCost> = emptyList(),
    val relatedFixtureCount: Int = 0
)

data class StoryItem(
    val id: String,
    val storyType: String,
    val name: String,
    val description: String? = null,
    val unit: String? = null,
    val relatedId: String? = null,
    val startAt: Long? = null,
    val chapterCount: Int = 0,
    val episodeCount: Int = 0,
    val imageCandidates: List<String> = emptyList(),
    val imageStatus: String? = null
)

data class StoryChapter(
    val id: String,
    val title: String,
    val chapterTitle: String? = null,
    val scenarioStatus: String? = null
)

data class StoryDetail(
    val storyId: String,
    val storyType: String,
    val title: String,
    val description: String? = null,
    val imageCandidates: List<String> = emptyList(),
    val chapters: List<StoryChapter> = emptyList(),
    val playbackHasScenario: Boolean = false,
    val unavailableReason: String? = null
)
