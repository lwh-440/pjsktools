package com.pjsktools.core.database

import androidx.room.Entity
import androidx.room.Index

@Entity(tableName = "events", primaryKeys = ["region", "id"])
data class EventEntity(val region: String, val id: String, val name: String, val eventType: String?, val startAt: String, val endAt: String, val storyOutline: String?, val bannerUrl: String?, val facetsJson: String = "{}")

@Entity(tableName = "event_details", primaryKeys = ["region", "eventId"])
data class EventDetailEntity(val region: String, val eventId: String, val payloadJson: String)

@Entity(tableName = "event_analytics", primaryKeys = ["region", "eventId", "windowKey"])
data class EventAnalyticsEntity(val region: String, val eventId: String, val windowKey: String, val payloadJson: String)

@Entity(tableName = "live_ranking_snapshots", primaryKeys = ["region", "eventId", "boardType", "characterKey"])
data class LiveRankingSnapshotEntity(val region: String, val eventId: String, val boardType: String, val characterKey: Int, val payloadJson: String, val updatedAtMillis: Long)

@Entity(tableName = "ranking_details", primaryKeys = ["region", "eventId", "boardType", "characterKey", "rank"])
data class RankingDetailEntity(val region: String, val eventId: String, val boardType: String, val characterKey: Int, val rank: Int, val payloadJson: String, val updatedAtMillis: Long)

@Entity(tableName = "rankings", primaryKeys = ["region", "eventId", "board", "rank"])
data class RankingEntity(
    val region: String, val eventId: String, val board: String, val rank: Int, val score: Long, val userId: String?,
    val name: String?, val updatedAt: String?, val leaderImageUrl: String?, val hourlyGrowth: Double? = null,
    val leaderCardId: Int? = null, val leaderCardLevel: Int? = null, val leaderCardMasterRank: Int? = null,
    val leaderImageCandidatesJson: String = "[]", val leaderCharacterImageCandidatesJson: String = "[]", val leaderCharacterId: Int? = null
)

@Entity(tableName = "ranking_history", primaryKeys = ["region", "eventId", "sampleType", "rank", "sampledAt"])
data class RankingHistoryEntity(val region: String, val eventId: String, val sampleType: String, val rank: Int, val score: Long, val sampledAt: String)

@Entity(tableName = "forecasts", primaryKeys = ["region", "eventId", "rank"])
data class ForecastEntity(val region: String, val eventId: String, val rank: Int, val currentScore: Long?, val hourlyGrowth: Double?, val forecast1h: Long?, val forecast3h: Long?, val forecastEnd: Long?, val confidence: String?)

@Entity(tableName = "songs", primaryKeys = ["region", "id"])
data class SongEntity(
    val region: String, val id: String, val title: String, val unit: String, val durationSeconds: Int?,
    val categoriesJson: String, val jacketUrl: String?, val lyricist: String? = null,
    val composer: String? = null, val arranger: String? = null, val bpm: Double? = null,
    val publishedAt: String? = null, val jacketCandidatesJson: String = "[]",
    val facetsJson: String = "{}"
)

@Entity(tableName = "song_difficulties", primaryKeys = ["region", "songId", "difficulty"])
data class SongDifficultyEntity(val region: String, val songId: String, val difficulty: String, val difficultyId: String?, val level: Int?, val notes: Int?, val svgUrl: String?, val pngUrl: String?, val viewerSvgUrl: String? = null)

@Entity(tableName = "cards", primaryKeys = ["region", "id"])
data class CardEntity(
    val region: String, val id: String, val title: String, val character: String, val characterId: String?,
    val rarity: Int, val attribute: String, val unit: String?, val normalThumbnailUrl: String?,
    val normalUrl: String?, val trainedUrl: String?, val skillName: String?, val skillDescription: String?,
    val normalThumbnailCandidatesJson: String = "[]", val facetsJson: String = "{}"
)

@Entity(tableName = "song_details", primaryKeys = ["region", "songId"])
data class SongDetailEntity(val region: String, val songId: String, val payloadJson: String)

@Entity(tableName = "card_details", primaryKeys = ["region", "cardId"])
data class CardDetailEntity(val region: String, val cardId: String, val payloadJson: String)

@Entity(tableName = "player_profiles", primaryKeys = ["region", "userId"])
data class PlayerProfileEntity(val region: String, val userId: String, val nickname: String, val rank: Int, val comment: String?, val titlesJson: String, val updatedAt: String?, val source: String?)

@Entity(tableName = "cache_metadata", primaryKeys = ["region", "cacheKey"])
data class CacheMetadataEntity(val region: String, val cacheKey: String, val updatedAtMillis: Long, val itemCount: Int, val sourceStatus: String? = null, val message: String? = null)

@Entity(
    tableName = "catalog_items",
    primaryKeys = ["region", "type", "id"],
    indices = [Index(value = ["region", "type"]), Index(value = ["region", "type", "name"])]
)
data class CatalogItemEntity(
    val region: String, val type: String, val id: String, val name: String,
    val category: String?, val rarity: String?, val characterId: Int?, val searchText: String,
    val payloadJson: String
)

@Entity(
    tableName = "catalog_facets",
    primaryKeys = ["region", "type", "itemId", "facetKey", "facetValue"],
    indices = [Index(value = ["region", "type", "facetKey", "facetValue"])]
)
data class CatalogFacetEntity(val region: String, val type: String, val itemId: String, val facetKey: String, val facetValue: String)

@Entity(tableName = "catalog_details", primaryKeys = ["region", "type", "id"], indices = [Index(value = ["region", "type"])])
data class CatalogDetailEntity(val region: String, val type: String, val id: String, val payloadJson: String)

@Entity(
    tableName = "catalog_filter_metadata",
    primaryKeys = ["region", "type", "queryFingerprint"],
    indices = [Index(value = ["region", "type", "updatedAtMillis"])]
)
data class CatalogFilterMetadataEntity(
    val region: String,
    val type: String,
    val queryFingerprint: String,
    val payloadJson: String,
    val masterVersion: String?,
    val updatedAtMillis: Long,
    val sourceStatus: String?,
    val message: String?
)

data class CatalogFacetCount(val facetKey: String, val facetValue: String, val count: Int)

@Entity(
    tableName = "favorite_folders",
    primaryKeys = ["accountId", "id"],
    indices = [Index(value = ["accountId"])]
)
data class FavoriteFolderEntity(
    val accountId: String,
    val id: String,
    val name: String,
    val description: String?,
    val itemCount: Int,
    val version: String?
)

@Entity(
    tableName = "favorites",
    primaryKeys = ["accountId", "id"],
    indices = [
        Index(value = ["accountId"]),
        Index(value = ["accountId", "type", "region", "targetId"], unique = true)
    ]
)
data class FavoriteEntity(
    val accountId: String,
    val id: String,
    val type: String,
    val region: String,
    val targetId: String,
    val label: String?,
    val folderIdsJson: String,
    val targetJson: String?,
    val createdAt: String,
    val updatedAt: String,
    val version: String?
)
