package com.pjsktools.core.database

import com.pjsktools.core.model.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable data class CatalogAssetStorage(
    val imageUrl: String? = null, val thumbnailUrl: String? = null, val imageCandidates: List<String> = emptyList(),
    val logoUrl: String? = null, val bannerUrl: String? = null, val screenUrl: String? = null,
    val degreeMainUrl: String? = null, val degreeSubUrl: String? = null, val rankMainUrl: String? = null,
    val scrollUrl: String? = null, val frameUrl: String? = null
)
@Serializable data class CostumeColorStorage(val colorId: Int? = null, val colorName: String? = null, val assetbundleName: String? = null)
@Serializable data class CostumePartStorage(val partType: String, val variants: List<CostumeColorStorage> = emptyList())
@Serializable data class CatalogItemStorage(
    val id: String, val kind: String, val name: String, val title: String? = null, val description: String? = null,
    val category: String? = null, val rarity: String? = null, val characterId: Int? = null,
    val startAt: String? = null, val endAt: String? = null, val relatedCardIds: List<String> = emptyList(),
    val assets: CatalogAssetStorage = CatalogAssetStorage(), val source: String? = null, val gender: String? = null,
    val designer: String? = null, val partTypes: List<String> = emptyList(), val characterIds: List<Int> = emptyList(),
    val parts: List<CostumePartStorage> = emptyList(), val assetStatus: String? = null,
    val subtype: String? = null, val groupId: Int? = null, val costumeNumber: Int? = null
)
@Serializable data class RelatedCardStorage(
    val id: String, val title: String, val character: String, val characterId: String? = null,
    val rarity: Int, val attribute: String, val unit: String? = null, val normalThumbnailUrl: String? = null
)
@Serializable data class CatalogDetailStorage(val item: CatalogItemStorage, val relatedCards: List<RelatedCardStorage> = emptyList())

@Serializable data class SongSummaryStorage(
    val id: String, val title: String, val unit: String, val durationSeconds: Int? = null,
    val categories: List<String> = emptyList(), val publishedAt: String? = null,
    val jacketUrl: String? = null, val jacketCandidates: List<String> = emptyList()
)
@Serializable data class DifficultyStorage(val id: String? = null, val name: String, val level: Int? = null, val notes: Int? = null)
@Serializable data class ChartStorage(val difficulty: String, val level: Int? = null, val notes: Int? = null, val svgUrl: String? = null, val viewerSvgUrl: String? = null, val pngUrl: String? = null)
@Serializable data class SongDetailStorage(
    val song: SongSummaryStorage, val lyricist: String? = null, val composer: String? = null,
    val arranger: String? = null, val bpm: Double? = null,
    val difficulties: List<DifficultyStorage> = emptyList(), val charts: List<ChartStorage> = emptyList()
)
@Serializable data class CardSummaryStorage(
    val id: String, val title: String, val character: String, val characterId: String? = null,
    val rarity: Int, val attribute: String, val unit: String? = null,
    val normalThumbnailUrl: String? = null, val normalThumbnailCandidates: List<String> = emptyList()
)
@Serializable data class CardSkillStorage(
    val id: String, val name: String? = null, val template: String? = null,
    val formattedDescriptions: Map<Int, String> = emptyMap(), val status: String? = null,
    val missingFields: List<String> = emptyList()
)
@Serializable data class RelatedCatalogStorage(val id: String, val name: String? = null)
@Serializable data class CardDetailStorage(
    val card: CardSummaryStorage, val normalUrl: String? = null, val normalCandidates: List<String> = emptyList(),
    val trainedUrl: String? = null, val trainedCandidates: List<String> = emptyList(),
    val skill: CardSkillStorage? = null, val specialTrainingSkill: CardSkillStorage? = null,
    val relatedEvents: List<RelatedCatalogStorage> = emptyList(), val relatedGachas: List<RelatedCatalogStorage> = emptyList()
)

private fun CatalogAsset.storage() = CatalogAssetStorage(imageUrl, thumbnailUrl, imageCandidates, logoUrl, bannerUrl, screenUrl, degreeMainUrl, degreeSubUrl, rankMainUrl, scrollUrl, frameUrl)
private fun CatalogAssetStorage.domain() = CatalogAsset(imageUrl, thumbnailUrl, imageCandidates, logoUrl, bannerUrl, screenUrl, degreeMainUrl, degreeSubUrl, rankMainUrl, scrollUrl, frameUrl)
private fun CatalogEntry.storage(): CatalogItemStorage {
    val d = data
    val subtype = when (this) { is GachaEntry -> gachaType; is HonorEntry -> honorRarity; is MaterialEntry -> materialType; is StampEntry -> stampType; is ComicEntry -> comicType; is CostumeEntry -> null }
    return CatalogItemStorage(d.id, d.kind.apiName, d.name, d.title, d.description, d.category, d.rarity, d.characterId, d.startAt, d.endAt, d.relatedCardIds, d.assets.storage(), d.source, d.gender, d.designer, d.partTypes, d.characterIds, d.parts.map { CostumePartStorage(it.partType, it.variants.map { v -> CostumeColorStorage(v.colorId, v.colorName, v.assetbundleName) }) }, d.assetStatus, subtype, (this as? HonorEntry)?.groupId, (this as? CostumeEntry)?.costumeNumber)
}
private fun CatalogItemStorage.domain(): CatalogEntry {
    val kind = requireNotNull(CatalogKind.fromApiName(kind))
    val data = CatalogEntryData(id, kind, name, title, description, category, rarity, characterId, startAt, endAt, relatedCardIds, assets.domain(), source, gender, designer, partTypes, characterIds, parts.map { CostumePart(it.partType, it.variants.map { v -> CostumeColorVariant(v.colorId, v.colorName, v.assetbundleName) }) }, assetStatus)
    return when (kind) {
        CatalogKind.GACHA -> GachaEntry(data, subtype); CatalogKind.HONOR -> HonorEntry(data, subtype, groupId)
        CatalogKind.MATERIAL -> MaterialEntry(data, subtype); CatalogKind.COSTUME -> CostumeEntry(data, costumeNumber)
        CatalogKind.STAMP -> StampEntry(data, subtype); CatalogKind.COMIC -> ComicEntry(data, subtype)
    }
}

fun CatalogEntry.toEntity(region: Region, json: Json): CatalogItemEntity {
    val d = data
    return CatalogItemEntity(region.id, d.kind.apiName, d.id, d.name, d.category, d.rarity, d.characterId, listOfNotNull(d.id, d.name, d.title, d.description, d.category, d.rarity, d.designer).joinToString(" ").lowercase(), json.encodeToString(storage()))
}
fun CatalogItemEntity.toDomain(json: Json): CatalogEntry = json.decodeFromString<CatalogItemStorage>(payloadJson).domain()
fun CatalogDetail.toEntity(region: Region, json: Json) = CatalogDetailEntity(region.id, item.data.kind.apiName, item.data.id, json.encodeToString(CatalogDetailStorage(item.storage(), relatedCards.map { RelatedCardStorage(it.id, it.title, it.character, it.characterId, it.rarity, it.attribute, it.unit, it.normalThumbnailUrl) })))
fun CatalogDetailEntity.toDomain(json: Json): CatalogDetail {
    val stored = json.decodeFromString<CatalogDetailStorage>(payloadJson)
    return CatalogDetail(stored.item.domain(), stored.relatedCards.map { CardSummary(it.id, it.title, it.character, it.characterId, it.rarity, it.attribute, it.unit, it.normalThumbnailUrl) })
}
fun CatalogEntry.facets(region: Region): List<CatalogFacetEntity> {
    val d = data
    val values = buildList {
        d.category?.let { add("category" to it) }; d.rarity?.let { add("rarity" to it) }; d.characterId?.let { add("character" to it.toString()) }
        d.source?.let { add("source" to it) }; d.gender?.let { add("gender" to it) }; d.partTypes.forEach { add("partType" to it) }; d.characterIds.forEach { add("character" to it.toString()) }
    }.distinct()
    return values.map { (key, value) -> CatalogFacetEntity(region.id, d.kind.apiName, d.id, key, value) }
}

private fun SongSummary.storage() = SongSummaryStorage(id, title, unit, durationSeconds, categories, publishedAt, jacketUrl, jacketCandidates)
private fun SongSummaryStorage.domain() = SongSummary(id, title, unit, durationSeconds, categories, publishedAt, jacketUrl, jacketCandidates)
fun SongDetail.toDetailEntity(region: Region, json: Json) = SongDetailEntity(region.id, song.id, json.encodeToString(SongDetailStorage(
    song.storage(), lyricist, composer, arranger, bpm,
    difficulties.map { DifficultyStorage(it.id, it.name, it.level, it.notes) },
    charts.map { ChartStorage(it.difficulty, it.level, it.notes, it.svgUrl, it.viewerSvgUrl, it.pngUrl) }
)))
fun SongDetailEntity.toDomain(json: Json): SongDetail = json.decodeFromString<SongDetailStorage>(payloadJson).let { stored ->
    SongDetail(stored.song.domain(), stored.lyricist, stored.composer, stored.arranger, stored.bpm,
        stored.difficulties.map { Difficulty(it.id, it.name, it.level, it.notes) },
        stored.charts.map { ChartPreview(it.difficulty, it.level, it.notes, it.svgUrl, it.viewerSvgUrl, it.pngUrl) })
}

private fun CardSummary.storage() = CardSummaryStorage(id, title, character, characterId, rarity, attribute, unit, normalThumbnailUrl, normalThumbnailCandidates)
private fun CardSummaryStorage.domain() = CardSummary(id, title, character, characterId, rarity, attribute, unit, normalThumbnailUrl, normalThumbnailCandidates)
private fun CardSkill.storage() = CardSkillStorage(id, name, template, formattedDescriptions, status, missingFields)
private fun CardSkillStorage.domain() = CardSkill(id, name, template, formattedDescriptions, status, missingFields)
fun CardDetail.toDetailEntity(region: Region, json: Json) = CardDetailEntity(region.id, card.id, json.encodeToString(CardDetailStorage(
    card.storage(), normalUrl, normalCandidates, trainedUrl, trainedCandidates,
    skill?.storage(), specialTrainingSkill?.storage(),
    relatedEvents.map { RelatedCatalogStorage(it.id, it.name) }, relatedGachas.map { RelatedCatalogStorage(it.id, it.name) }
)))
fun CardDetailEntity.toDomain(json: Json): CardDetail = json.decodeFromString<CardDetailStorage>(payloadJson).let { stored ->
    CardDetail(stored.card.domain(), stored.normalUrl, stored.normalCandidates, stored.trainedUrl, stored.trainedCandidates,
        stored.skill?.domain(), stored.specialTrainingSkill?.domain(),
        stored.relatedEvents.map { RelatedCatalogItem(it.id, it.name) }, stored.relatedGachas.map { RelatedCatalogItem(it.id, it.name) })
}
