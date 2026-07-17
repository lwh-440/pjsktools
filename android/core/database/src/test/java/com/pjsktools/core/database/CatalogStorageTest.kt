package com.pjsktools.core.database

import com.pjsktools.core.model.CatalogAsset
import com.pjsktools.core.model.CatalogEntryData
import com.pjsktools.core.model.CatalogKind
import com.pjsktools.core.model.CostumeColorVariant
import com.pjsktools.core.model.CostumeEntry
import com.pjsktools.core.model.CostumePart
import com.pjsktools.core.model.Region
import com.pjsktools.core.model.CardDetail
import com.pjsktools.core.model.CardSkill
import com.pjsktools.core.model.CardSummary
import com.pjsktools.core.model.ChartPreview
import com.pjsktools.core.model.Difficulty
import com.pjsktools.core.model.SongDetail
import com.pjsktools.core.model.SongSummary
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogStorageTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun strongTypedCostumeRoundTripsThroughRoomStorage() {
        val entry = CostumeEntry(
            data = CatalogEntryData(
                id = "42",
                kind = CatalogKind.COSTUME,
                name = "Stage Costume",
                category = "live",
                rarity = "rare",
                source = "event",
                gender = "female",
                partTypes = listOf("body", "head"),
                characterIds = listOf(1, 2),
                assets = CatalogAsset(imageUrl = "/api/assets/proxy?url=costume"),
                parts = listOf(CostumePart("body", listOf(CostumeColorVariant(1, "default", "costume_42"))))
            ),
            costumeNumber = 42
        )

        val restored = entry.toEntity(Region.JP, json).toDomain(json)

        assertEquals(entry, restored)
    }

    @Test fun facetsRemainRegionAndCatalogScoped() {
        val entry = CostumeEntry(
            CatalogEntryData(
                id = "7",
                kind = CatalogKind.COSTUME,
                name = "Test",
                category = "shop",
                rarity = "normal",
                characterIds = listOf(3),
                partTypes = listOf("body")
            )
        )

        val facets = entry.facets(Region.EN)

        assertTrue(facets.all { it.region == Region.EN.id && it.type == CatalogKind.COSTUME.apiName })
        assertTrue(facets.any { it.facetKey == "character" && it.facetValue == "3" })
        assertTrue(facets.any { it.facetKey == "partType" && it.facetValue == "body" })
    }

    @Test fun songAndCardDetailsKeepIndependentCandidates() {
        val song = SongDetail(
            SongSummary("10", "Song", "mv", publishedAt = "2026-01-01T00:00:00Z", jacketCandidates = listOf("jacket-a", "jacket-b")),
            difficulties = listOf(Difficulty(name = "master", level = 31)),
            charts = listOf(ChartPreview("master", 31, 1200, "main.svg", "viewer.svg", "fallback.png"))
        )
        val card = CardDetail(
            CardSummary("20", "Card", "Character", rarity = 4, attribute = "cool", normalThumbnailCandidates = listOf("thumb-a", "thumb-b")),
            normalCandidates = listOf("normal-a", "normal-b"),
            trainedCandidates = listOf("trained-a", "trained-b"),
            skill = CardSkill("30", formattedDescriptions = mapOf(1 to "Lv1", 4 to "Lv4"))
        )

        assertEquals(song, song.toDetailEntity(Region.JP, json).toDomain(json))
        assertEquals(card, card.toDetailEntity(Region.JP, json).toDomain(json))
    }

    @Test fun rankingSnapshotAndDetailKeysIsolateBoardCharacterAndRegion() {
        val overall = LiveRankingSnapshotEntity("jp", "100", "overall", 0, "{}", 1)
        val worldLink = LiveRankingSnapshotEntity("jp", "100", "worldlink", 7, "{}", 1)
        val anotherRegion = LiveRankingSnapshotEntity("en", "100", "overall", 0, "{}", 1)
        val playerDetail = RankingDetailEntity("jp", "100", "overall", 0, 12, "{}", 1)
        val lineDetail = RankingDetailEntity("jp", "100", "worldlink", 7, 12, "{}", 1)

        assertTrue(overall != worldLink)
        assertTrue(overall != anotherRegion)
        assertTrue(playerDetail != lineDetail)
    }
}
