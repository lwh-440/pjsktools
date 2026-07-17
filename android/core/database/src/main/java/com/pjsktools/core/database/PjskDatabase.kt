package com.pjsktools.core.database

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.Upsert
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import javax.inject.Singleton

@Dao
interface PublicDataDao {
    @Query("SELECT * FROM events WHERE region = :region ORDER BY startAt DESC") fun observeEvents(region: String): Flow<List<EventEntity>>
    @Query("SELECT * FROM events WHERE region = :region ORDER BY startAt DESC") suspend fun getEvents(region: String): List<EventEntity>
    @Upsert suspend fun upsertEvents(items: List<EventEntity>)
    @Query("DELETE FROM events WHERE region = :region") suspend fun deleteEvents(region: String)
    @Query("SELECT * FROM event_details WHERE region = :region AND eventId = :eventId") suspend fun getEventDetail(region: String, eventId: String): EventDetailEntity?
    @Upsert suspend fun upsertEventDetail(item: EventDetailEntity)
    @Query("DELETE FROM event_details WHERE region = :region") suspend fun clearEventDetails(region: String)
    @Query("SELECT * FROM event_analytics WHERE region = :region AND eventId = :eventId AND windowKey = :windowKey") suspend fun getEventAnalytics(region: String, eventId: String, windowKey: String): EventAnalyticsEntity?
    @Upsert suspend fun upsertEventAnalytics(item: EventAnalyticsEntity)
    @Query("DELETE FROM event_analytics WHERE region = :region") suspend fun clearEventAnalytics(region: String)

    @Query("SELECT * FROM live_ranking_snapshots WHERE region = :region AND eventId = :eventId AND boardType = :boardType AND characterKey = :characterKey") suspend fun getLiveRankingSnapshot(region: String, eventId: String, boardType: String, characterKey: Int): LiveRankingSnapshotEntity?
    @Upsert suspend fun upsertLiveRankingSnapshot(item: LiveRankingSnapshotEntity)
    @Query("DELETE FROM live_ranking_snapshots WHERE region = :region") suspend fun clearLiveRankingSnapshots(region: String)

    @Query("SELECT * FROM ranking_details WHERE region = :region AND eventId = :eventId AND boardType = :boardType AND characterKey = :characterKey AND rank = :rank") suspend fun getRankingDetail(region: String, eventId: String, boardType: String, characterKey: Int, rank: Int): RankingDetailEntity?
    @Upsert suspend fun upsertRankingDetail(item: RankingDetailEntity)
    @Query("DELETE FROM ranking_details WHERE region = :region") suspend fun clearRankingDetails(region: String)

    @Query("SELECT * FROM rankings WHERE region = :region AND eventId = :eventId AND board = :board ORDER BY rank") suspend fun getRankings(region: String, eventId: String, board: String): List<RankingEntity>
    @Upsert suspend fun upsertRankings(items: List<RankingEntity>)
    @Query("DELETE FROM rankings WHERE region = :region AND eventId = :eventId AND board = :board") suspend fun deleteRankings(region: String, eventId: String, board: String)

    @Query("SELECT * FROM ranking_history WHERE region = :region AND eventId = :eventId ORDER BY sampledAt") suspend fun getHistory(region: String, eventId: String): List<RankingHistoryEntity>
    @Upsert suspend fun upsertHistory(items: List<RankingHistoryEntity>)
    @Query("DELETE FROM ranking_history WHERE region = :region AND eventId = :eventId") suspend fun deleteHistory(region: String, eventId: String)

    @Query("SELECT * FROM forecasts WHERE region = :region AND eventId = :eventId ORDER BY rank") suspend fun getForecasts(region: String, eventId: String): List<ForecastEntity>
    @Upsert suspend fun upsertForecasts(items: List<ForecastEntity>)
    @Query("DELETE FROM forecasts WHERE region = :region AND eventId = :eventId") suspend fun deleteForecasts(region: String, eventId: String)

    @Query("SELECT * FROM songs WHERE region = :region ORDER BY CAST(id AS INTEGER)") suspend fun getSongs(region: String): List<SongEntity>
    @Query("SELECT * FROM songs WHERE region = :region AND id = :id") suspend fun getSong(region: String, id: String): SongEntity?
    @Upsert suspend fun upsertSongs(items: List<SongEntity>)
    @Query("DELETE FROM songs WHERE region = :region") suspend fun deleteSongs(region: String)
    @Query("SELECT * FROM song_difficulties WHERE region = :region AND songId = :songId") suspend fun getDifficulties(region: String, songId: String): List<SongDifficultyEntity>
    @Upsert suspend fun upsertDifficulties(items: List<SongDifficultyEntity>)
    @Query("DELETE FROM song_difficulties WHERE region = :region AND songId = :songId") suspend fun deleteDifficulties(region: String, songId: String)
    @Query("SELECT * FROM song_details WHERE region = :region AND songId = :songId") suspend fun getSongDetail(region: String, songId: String): SongDetailEntity?
    @Upsert suspend fun upsertSongDetail(item: SongDetailEntity)
    @Query("DELETE FROM song_details WHERE region = :region") suspend fun clearSongDetails(region: String)

    @Query("SELECT * FROM cards WHERE region = :region ORDER BY CAST(id AS INTEGER) DESC") suspend fun getCards(region: String): List<CardEntity>
    @Query("SELECT * FROM cards WHERE region = :region AND id = :id") suspend fun getCard(region: String, id: String): CardEntity?
    @Upsert suspend fun upsertCards(items: List<CardEntity>)
    @Query("DELETE FROM cards WHERE region = :region") suspend fun deleteCards(region: String)
    @Query("SELECT * FROM card_details WHERE region = :region AND cardId = :cardId") suspend fun getCardDetail(region: String, cardId: String): CardDetailEntity?
    @Upsert suspend fun upsertCardDetail(item: CardDetailEntity)
    @Query("DELETE FROM card_details WHERE region = :region") suspend fun clearCardDetails(region: String)

    @Query("SELECT * FROM player_profiles WHERE region = :region AND userId = :uid") suspend fun getPlayer(region: String, uid: String): PlayerProfileEntity?
    @Upsert suspend fun upsertPlayer(item: PlayerProfileEntity)

    @Query("SELECT * FROM catalog_items WHERE region = :region AND type = :type ORDER BY CAST(id AS INTEGER) DESC") suspend fun getCatalogItems(region: String, type: String): List<CatalogItemEntity>
    @Query("SELECT * FROM catalog_items WHERE region = :region AND type = :type AND id = :id") suspend fun getCatalogItem(region: String, type: String, id: String): CatalogItemEntity?
    @Upsert suspend fun upsertCatalogItems(items: List<CatalogItemEntity>)
    @Query("DELETE FROM catalog_items WHERE region = :region AND type = :type") suspend fun deleteCatalogItems(region: String, type: String)
    @Upsert suspend fun upsertCatalogFacets(items: List<CatalogFacetEntity>)
    @Query("DELETE FROM catalog_facets WHERE region = :region AND type = :type") suspend fun deleteCatalogFacets(region: String, type: String)
    @Query("SELECT facetKey, facetValue, COUNT(*) AS count FROM catalog_facets WHERE region = :region AND type = :type GROUP BY facetKey, facetValue ORDER BY facetKey, facetValue") fun observeCatalogFacets(region: String, type: String): Flow<List<CatalogFacetCount>>
    @Query("SELECT * FROM catalog_details WHERE region = :region AND type = :type AND id = :id") suspend fun getCatalogDetail(region: String, type: String, id: String): CatalogDetailEntity?
    @Upsert suspend fun upsertCatalogDetail(item: CatalogDetailEntity)
    @Query("DELETE FROM catalog_details WHERE region = :region") suspend fun clearCatalogDetails(region: String)
    @Query("SELECT * FROM catalog_filter_metadata WHERE region = :region AND type = :type AND queryFingerprint = :queryFingerprint") suspend fun getCatalogFilterMetadata(region: String, type: String, queryFingerprint: String): CatalogFilterMetadataEntity?
    @Query("SELECT * FROM catalog_filter_metadata WHERE region = :region AND type = :type ORDER BY updatedAtMillis DESC LIMIT 1") suspend fun getLatestCatalogFilterMetadata(region: String, type: String): CatalogFilterMetadataEntity?
    @Upsert suspend fun upsertCatalogFilterMetadata(item: CatalogFilterMetadataEntity)
    @Query("DELETE FROM catalog_filter_metadata WHERE region = :region AND type = :type AND queryFingerprint NOT IN (SELECT queryFingerprint FROM catalog_filter_metadata WHERE region = :region AND type = :type ORDER BY updatedAtMillis DESC LIMIT 24)") suspend fun trimCatalogFilterMetadata(region: String, type: String)
    @Query("DELETE FROM catalog_filter_metadata WHERE region = :region") suspend fun clearCatalogFilterMetadata(region: String)
    @Query("DELETE FROM catalog_items WHERE region = :region") suspend fun clearCatalogItems(region: String)
    @Query("DELETE FROM catalog_facets WHERE region = :region") suspend fun clearCatalogFacets(region: String)

    @Query("SELECT * FROM favorites WHERE accountId = :accountId ORDER BY updatedAt DESC") fun observeFavorites(accountId: String): Flow<List<FavoriteEntity>>
    @Query("SELECT * FROM favorite_folders WHERE accountId = :accountId ORDER BY name COLLATE NOCASE") fun observeFavoriteFolders(accountId: String): Flow<List<FavoriteFolderEntity>>
    @Upsert suspend fun upsertFavorites(items: List<FavoriteEntity>)
    @Upsert suspend fun upsertFavoriteFolders(items: List<FavoriteFolderEntity>)
    @Query("DELETE FROM favorites WHERE accountId = :accountId") suspend fun deleteFavorites(accountId: String)
    @Query("DELETE FROM favorite_folders WHERE accountId = :accountId") suspend fun deleteFavoriteFolders(accountId: String)
    @Query("DELETE FROM favorites WHERE accountId = :accountId AND id = :id") suspend fun deleteFavorite(accountId: String, id: String)
    @Query("DELETE FROM favorite_folders WHERE accountId = :accountId AND id = :id") suspend fun deleteFavoriteFolder(accountId: String, id: String)

    @Query("SELECT * FROM cache_metadata WHERE region = :region ORDER BY cacheKey") fun observeMetadata(region: String): Flow<List<CacheMetadataEntity>>
    @Query("SELECT * FROM cache_metadata WHERE region = :region AND cacheKey = :key") suspend fun getMetadata(region: String, key: String): CacheMetadataEntity?
    @Upsert suspend fun upsertMetadata(item: CacheMetadataEntity)

    @Query("DELETE FROM events WHERE region = :region") suspend fun clearEventCache(region: String)
    @Query("DELETE FROM rankings WHERE region = :region") suspend fun clearRankingCache(region: String)
    @Query("DELETE FROM ranking_history WHERE region = :region") suspend fun clearHistoryCache(region: String)
    @Query("DELETE FROM forecasts WHERE region = :region") suspend fun clearForecastCache(region: String)
    @Query("DELETE FROM song_difficulties WHERE region = :region") suspend fun clearDifficultyCache(region: String)
    @Query("DELETE FROM player_profiles WHERE region = :region") suspend fun clearPlayerCache(region: String)
    @Query("DELETE FROM cache_metadata WHERE region = :region") suspend fun clearMetadata(region: String)

    @Transaction
    suspend fun replaceEvents(region: String, items: List<EventEntity>, metadata: CacheMetadataEntity) { deleteEvents(region); upsertEvents(items); upsertMetadata(metadata) }
    @Transaction
    suspend fun replaceRankings(region: String, eventId: String, board: String, items: List<RankingEntity>, metadata: CacheMetadataEntity) { deleteRankings(region, eventId, board); upsertRankings(items); upsertMetadata(metadata) }
    @Transaction
    suspend fun replaceSongs(region: String, items: List<SongEntity>, metadata: CacheMetadataEntity) { deleteSongs(region); upsertSongs(items); upsertMetadata(metadata) }
    @Transaction
    suspend fun replaceCards(region: String, items: List<CardEntity>, metadata: CacheMetadataEntity) { deleteCards(region); upsertCards(items); upsertMetadata(metadata) }
    @Transaction
    suspend fun replaceCatalog(region: String, type: String, items: List<CatalogItemEntity>, facets: List<CatalogFacetEntity>, metadata: CacheMetadataEntity) {
        deleteCatalogItems(region, type); deleteCatalogFacets(region, type); upsertCatalogItems(items); upsertCatalogFacets(facets); upsertMetadata(metadata)
    }
    @Transaction
    suspend fun replaceFavorites(accountId: String, favorites: List<FavoriteEntity>, folders: List<FavoriteFolderEntity>) {
        deleteFavorites(accountId); deleteFavoriteFolders(accountId)
        upsertFavorites(favorites); upsertFavoriteFolders(folders)
    }
    @Transaction
    suspend fun clearPrivateAccount(accountId: String) {
        deleteFavorites(accountId); deleteFavoriteFolders(accountId)
    }
    @Transaction
    suspend fun clearRegion(region: String) { clearEventCache(region); clearEventDetails(region); clearEventAnalytics(region); clearLiveRankingSnapshots(region); clearRankingDetails(region); clearRankingCache(region); clearHistoryCache(region); clearForecastCache(region); deleteSongs(region); clearDifficultyCache(region); clearSongDetails(region); clearPlayerCache(region); deleteCards(region); clearCardDetails(region); clearCatalogItems(region); clearCatalogFacets(region); clearCatalogDetails(region); clearCatalogFilterMetadata(region); clearMetadata(region) }
}

@Database(entities = [EventEntity::class, EventDetailEntity::class, EventAnalyticsEntity::class, LiveRankingSnapshotEntity::class, RankingDetailEntity::class, RankingEntity::class, RankingHistoryEntity::class, ForecastEntity::class, SongEntity::class, SongDifficultyEntity::class, SongDetailEntity::class, CardEntity::class, CardDetailEntity::class, PlayerProfileEntity::class, CacheMetadataEntity::class, CatalogItemEntity::class, CatalogFacetEntity::class, CatalogDetailEntity::class, CatalogFilterMetadataEntity::class, FavoriteEntity::class, FavoriteFolderEntity::class], version = 7, exportSchema = true)
abstract class PjskDatabase : RoomDatabase() { abstract fun publicDataDao(): PublicDataDao }

val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS `catalog_items` (`region` TEXT NOT NULL, `type` TEXT NOT NULL, `id` TEXT NOT NULL, `name` TEXT NOT NULL, `category` TEXT, `rarity` TEXT, `characterId` INTEGER, `searchText` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`region`, `type`, `id`))")
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_catalog_items_region_type` ON `catalog_items` (`region`, `type`)")
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_catalog_items_region_type_name` ON `catalog_items` (`region`, `type`, `name`)")
        db.execSQL("CREATE TABLE IF NOT EXISTS `catalog_facets` (`region` TEXT NOT NULL, `type` TEXT NOT NULL, `itemId` TEXT NOT NULL, `facetKey` TEXT NOT NULL, `facetValue` TEXT NOT NULL, PRIMARY KEY(`region`, `type`, `itemId`, `facetKey`, `facetValue`))")
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_catalog_facets_region_type_facetKey_facetValue` ON `catalog_facets` (`region`, `type`, `facetKey`, `facetValue`)")
        db.execSQL("CREATE TABLE IF NOT EXISTS `catalog_details` (`region` TEXT NOT NULL, `type` TEXT NOT NULL, `id` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`region`, `type`, `id`))")
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_catalog_details_region_type` ON `catalog_details` (`region`, `type`)")
    }
}

val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE `songs` ADD COLUMN `publishedAt` TEXT")
        db.execSQL("ALTER TABLE `songs` ADD COLUMN `jacketCandidatesJson` TEXT NOT NULL DEFAULT '[]'")
        db.execSQL("ALTER TABLE `song_difficulties` ADD COLUMN `viewerSvgUrl` TEXT")
        db.execSQL("ALTER TABLE `cards` ADD COLUMN `normalThumbnailCandidatesJson` TEXT NOT NULL DEFAULT '[]'")
        db.execSQL("CREATE TABLE IF NOT EXISTS `song_details` (`region` TEXT NOT NULL, `songId` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`region`, `songId`))")
        db.execSQL("CREATE TABLE IF NOT EXISTS `card_details` (`region` TEXT NOT NULL, `cardId` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`region`, `cardId`))")
    }
}

val MIGRATION_3_4 = object : Migration(3, 4) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE `events` ADD COLUMN `facetsJson` TEXT NOT NULL DEFAULT '{}'")
        db.execSQL("ALTER TABLE `songs` ADD COLUMN `facetsJson` TEXT NOT NULL DEFAULT '{}'")
        db.execSQL("ALTER TABLE `cards` ADD COLUMN `facetsJson` TEXT NOT NULL DEFAULT '{}'")
        db.execSQL("CREATE TABLE IF NOT EXISTS `favorite_folders` (`accountId` TEXT NOT NULL, `id` TEXT NOT NULL, `name` TEXT NOT NULL, `description` TEXT, `itemCount` INTEGER NOT NULL, `version` TEXT, PRIMARY KEY(`accountId`, `id`))")
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_favorite_folders_accountId` ON `favorite_folders` (`accountId`)")
        db.execSQL("CREATE TABLE IF NOT EXISTS `favorites` (`accountId` TEXT NOT NULL, `id` TEXT NOT NULL, `type` TEXT NOT NULL, `region` TEXT NOT NULL, `targetId` TEXT NOT NULL, `label` TEXT, `folderIdsJson` TEXT NOT NULL, `targetJson` TEXT, `createdAt` TEXT NOT NULL, `updatedAt` TEXT NOT NULL, `version` TEXT, PRIMARY KEY(`accountId`, `id`))")
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_favorites_accountId` ON `favorites` (`accountId`)")
        db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_favorites_accountId_type_region_targetId` ON `favorites` (`accountId`, `type`, `region`, `targetId`)")
    }
}

val MIGRATION_4_5 = object : Migration(4, 5) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS `event_details` (`region` TEXT NOT NULL, `eventId` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`region`, `eventId`))")
        db.execSQL("CREATE TABLE IF NOT EXISTS `event_analytics` (`region` TEXT NOT NULL, `eventId` TEXT NOT NULL, `windowKey` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, PRIMARY KEY(`region`, `eventId`, `windowKey`))")
        db.execSQL("ALTER TABLE `rankings` ADD COLUMN `hourlyGrowth` REAL")
        db.execSQL("ALTER TABLE `rankings` ADD COLUMN `leaderCardId` INTEGER")
        db.execSQL("ALTER TABLE `rankings` ADD COLUMN `leaderCardLevel` INTEGER")
        db.execSQL("ALTER TABLE `rankings` ADD COLUMN `leaderCardMasterRank` INTEGER")
    }
}

val MIGRATION_5_6 = object : Migration(5, 6) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS `catalog_filter_metadata` (`region` TEXT NOT NULL, `type` TEXT NOT NULL, `queryFingerprint` TEXT NOT NULL, `payloadJson` TEXT NOT NULL, `masterVersion` TEXT, `updatedAtMillis` INTEGER NOT NULL, `sourceStatus` TEXT, `message` TEXT, PRIMARY KEY(`region`, `type`, `queryFingerprint`))")
        db.execSQL("CREATE INDEX IF NOT EXISTS `index_catalog_filter_metadata_region_type_updatedAtMillis` ON `catalog_filter_metadata` (`region`, `type`, `updatedAtMillis`)")
        db.execSQL("DELETE FROM `cache_metadata` WHERE `cacheKey` IN ('events', 'songs', 'cards') OR `cacheKey` LIKE 'catalog:%'")
    }
}

val MIGRATION_6_7 = object : Migration(6, 7) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE `rankings` ADD COLUMN `leaderImageCandidatesJson` TEXT NOT NULL DEFAULT '[]'")
        db.execSQL("ALTER TABLE `rankings` ADD COLUMN `leaderCharacterImageCandidatesJson` TEXT NOT NULL DEFAULT '[]'")
        db.execSQL("ALTER TABLE `rankings` ADD COLUMN `leaderCharacterId` INTEGER")
        db.execSQL("CREATE TABLE IF NOT EXISTS `live_ranking_snapshots` (`region` TEXT NOT NULL, `eventId` TEXT NOT NULL, `boardType` TEXT NOT NULL, `characterKey` INTEGER NOT NULL, `payloadJson` TEXT NOT NULL, `updatedAtMillis` INTEGER NOT NULL, PRIMARY KEY(`region`, `eventId`, `boardType`, `characterKey`))")
        db.execSQL("CREATE TABLE IF NOT EXISTS `ranking_details` (`region` TEXT NOT NULL, `eventId` TEXT NOT NULL, `boardType` TEXT NOT NULL, `characterKey` INTEGER NOT NULL, `rank` INTEGER NOT NULL, `payloadJson` TEXT NOT NULL, `updatedAtMillis` INTEGER NOT NULL, PRIMARY KEY(`region`, `eventId`, `boardType`, `characterKey`, `rank`))")
    }
}

@Module @InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides @Singleton fun database(@ApplicationContext context: Context): PjskDatabase = Room.databaseBuilder(context, PjskDatabase::class.java, "pjsktools.db").addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7).build()
    @Provides fun dao(database: PjskDatabase): PublicDataDao = database.publicDataDao()
}
