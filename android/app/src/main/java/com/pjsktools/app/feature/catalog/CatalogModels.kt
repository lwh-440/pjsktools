package com.pjsktools.app.feature.catalog

enum class CatalogType(val apiName: String, val displayName: String) {
    SONGS("songs", "歌曲"), CARDS("cards", "卡牌"), GACHAS("gachas", "卡池"),
    HONORS("honors", "称号"), MATERIALS("materials", "素材"), COSTUMES("costumes", "服装"),
    STAMPS("stamps", "贴图"), COMICS("comics", "漫画")
}

data class CatalogItem(
    val id: String,
    val type: CatalogType,
    val title: String,
    val subtitle: String? = null,
    val description: String? = null,
    val category: String? = null,
    val rarity: String? = null,
    val startAt: String? = null,
    val endAt: String? = null,
    val assetUrls: List<String> = emptyList()
)

data class CatalogPage(
    val items: List<CatalogItem>, val page: Int, val pageSize: Int, val total: Int, val totalPages: Int,
    val source: String? = null, val sourceStatus: String? = null, val unavailableReason: String? = null,
    val syncedAt: String? = null, val masterVersion: String? = null
)

data class SongDifficulty(val difficulty: String, val playLevel: Int?, val totalNoteCount: Int?)
data class ChartAsset(
    val difficulty: String,
    val imageCandidates: List<String>,
    val susUrl: String? = null,
    val unavailableReason: String? = null
)

enum class RelatedKind { SONG, CARD, EVENT, GACHA, DISPLAY_ONLY }
data class RelatedItem(val id: String, val title: String, val subtitle: String? = null, val kind: RelatedKind)
data class CatalogNavigationTarget(val kind: RelatedKind, val id: String, val title: String)

data class CostumeFilters(
    val partType: String = "", val source: String = "", val rarity: String = "",
    val gender: String = "", val characterId: String = ""
)

sealed interface CatalogDetail { val item: CatalogItem; val assetUrls: List<String> }

data class SongCatalogDetail(
    override val item: CatalogItem,
    override val assetUrls: List<String>,
    val unit: String?, val durationSeconds: Int?, val bpm: Double?, val categories: List<String>,
    val difficulties: List<SongDifficulty>, val charts: List<ChartAsset>,
    val relatedEvents: List<RelatedItem>, val vocals: List<RelatedItem>
) : CatalogDetail

data class SkillDetail(
    val id: String, val name: String?, val descriptionsByLevel: Map<Int, String>,
    val missingFields: List<String> = emptyList()
)

data class CardCatalogDetail(
    override val item: CatalogItem,
    override val assetUrls: List<String>,
    val character: String?, val rarity: Int?, val attribute: String?,
    val normalImageCandidates: List<String>, val afterTrainingImageCandidates: List<String>,
    val skill: SkillDetail?, val specialTrainingSkill: SkillDetail?,
    val relatedEvents: List<RelatedItem>, val relatedGachas: List<RelatedItem>
) : CatalogDetail

data class CostumeDetail(
    val partTypes: List<String>, val source: String?, val rarity: String?, val gender: String?,
    val designer: String?, val characterIds: List<String>, val partVariants: Map<String, List<String>>,
    val extraParts: List<CostumeExtraPart>
)

data class CostumeExtraPart(
    val characterId: String?, val partType: String?, val variants: List<String>
)

data class CollectionCatalogDetail(
    override val item: CatalogItem,
    override val assetUrls: List<String>,
    val costume: CostumeDetail? = null,
    val relatedCards: List<RelatedItem> = emptyList()
) : CatalogDetail
