package com.pjsktools.app.feature.shell

data class HomeDashboard(
    val regions: List<ShellRegion>,
    val songCount: Int,
    val cardCount: Int,
    val currentEvent: ShellEvent?,
    val topRanks: List<ShellRanking>,
    val updatedAt: String?,
    val warnings: List<String>
)

data class ShellRegion(val id: String, val name: String)
data class ShellEvent(val id: String, val name: String, val startAt: String?, val endAt: String?)
data class ShellRanking(val rank: Int, val userId: String?, val name: String, val score: Long)

data class PublicProfile(
    val region: String,
    val userId: String,
    val nickname: String,
    val rank: Int?,
    val comment: String?,
    val titles: List<String>,
    val source: String?,
    val rawJson: String
)

data class ShareCard(
    val type: String,
    val id: String,
    val title: String,
    val summary: String?,
    val imageUrl: String
)

enum class DeckCandidateMode(val label: String) {
    MANUAL("手动参数"), CARDS("Card IDs"), SAVED("保存卡组")
}

data class DeckCompareCandidateDraft(
    val id: String,
    val name: String,
    val mode: DeckCandidateMode = DeckCandidateMode.MANUAL,
    val power: String = "",
    val effectiveness: String = "",
    val cardIds: String = "",
    val deckConfigId: String = ""
)

data class SavedDeckOption(val id: String, val name: String, val cardIds: List<String> = emptyList())
data class DeckCompareAccountContext(
    val accessToken: String,
    val bindingId: String,
    val region: String,
    val savedDecks: List<SavedDeckOption> = emptyList()
)

data class DeckCompareForm(
    val musicId: String = "",
    val difficulty: String = "expert",
    val liveType: String = "multi",
    val scoreMode: String = "aggregate",
    val boost: String = "0",
    val eventBonusPercent: String = "0",
    val skill15Strategy: String = "expected",
    val skill6Mode: String = "team-average",
    val exactSkills: String = "",
    val teammatePower: String = "200000",
    val teammateEffectiveness: String = "200"
)

data class DeckCompareResult(
    val formulaId: String?,
    val scoreMode: String?,
    val multiLiveVersion: String?,
    val liveExactVersion: String?,
    val winnerByScore: String?,
    val winnerByEventPoint: String?,
    val scoreDelta: Double?,
    val eventPointDelta: Double?,
    val comparisons: List<DeckComparison>,
    val missingFields: List<String>,
    val estimatedFields: List<String>,
    val traceSummary: List<Pair<String, String>>,
    val rawJson: String
)

data class DeckComparison(
    val id: String,
    val name: String,
    val source: String?,
    val power: Double?,
    val effectiveness: Double?,
    val score: Double?,
    val eventPoint: Double?,
    val status: String?,
    val missingFields: List<String>
)

data class DeckCompareHistoryItem(
    val id: String,
    val createdAt: String,
    val region: String,
    val musicId: String,
    val difficulty: String,
    val scoreMode: String,
    val candidates: List<String>,
    val winnerByScore: String?,
    val winnerByEventPoint: String?,
    val scoreDelta: Double?,
    val eventPointDelta: Double?
)

enum class ShellShortcut(val label: String) {
    SONGS("歌曲"), CARDS("卡牌"), GACHAS("卡池"), TOOLS("计算工具"), DECK_COMPARE("卡组比较"), MYSEKAI("MySekai")
}

enum class ShellCachePolicy(val label: String, val description: String) {
    CACHE_THEN_REFRESH("先缓存后刷新", "优先展示同区缓存，随后向服务器校验更新。"),
    NETWORK_FIRST("网络优先", "先请求服务器；失败时才允许读取同区缓存。"),
    NETWORK_ONLY("仅网络", "不使用本地数据缓存，每次都请求服务器。")
}

data class ShellSettings(
    val apiBaseUrl: String,
    val defaultRegion: String,
    val cachePolicy: ShellCachePolicy
)

data class CacheClearResult(
    val message: String,
    val remainingSizeLabel: String
)
