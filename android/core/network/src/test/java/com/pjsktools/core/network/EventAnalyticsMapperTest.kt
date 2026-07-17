package com.pjsktools.core.network

import com.pjsktools.api.generated.ChurnHourDto
import com.pjsktools.api.generated.ParkingPeriodDto
import com.pjsktools.api.generated.RankingPlayerDetailDto
import com.pjsktools.api.generated.RankingProfileHonorDto
import com.pjsktools.api.generated.RankingTracePointDto
import com.pjsktools.api.generated.ScoreChangeDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EventAnalyticsMapperTest {
    @Test
    fun rankingDetailKeepsImagesHonorsAndRealActivitySamples() {
        val detail = RankingPlayerDetailDto(
            rank = 12,
            score = 12_345_678,
            leaderCardId = 321,
            leaderCardLevel = 60,
            leaderCardMasterRank = 5,
            leaderCardImageCandidates = listOf("https://assets.example/leader.png"),
            leaderCharacterImageCandidates = listOf("https://assets.example/character.png"),
            leaderCharacterId = 7,
            profileHonors = listOf(RankingProfileHonorDto(seq = 1, profileHonorType = "normal", honorId = 44, honorLevel = 10)),
            hourlyChurn = listOf(ChurnHourDto("2026-07-17T00:00:00Z", 8)),
            recentScoreChanges = listOf(ScoreChangeDto(1_752_710_400_000, 1_234.0)),
            parkingPeriods = listOf(ParkingPeriodDto(startTime = 1_752_710_400_000, durationSeconds = 600)),
            playerTrace = listOf(RankingTracePointDto(score = 12_300_000, timestamp = 1_752_710_400_000, rank = 12)),
            lineTrace = listOf(RankingTracePointDto(score = 11_900_000, timestamp = 1_752_710_400_000, rank = 12))
        ).domain("http://10.0.2.2:4000/")

        assertEquals(321, detail.entry.leaderCardId)
        assertEquals(7, detail.entry.leaderCharacterId)
        assertTrue(detail.entry.leaderImageCandidates.all { it.startsWith("http://10.0.2.2:4000/api/") })
        assertEquals(44, detail.profileHonors.single().honorId)
        assertEquals(8, detail.hourlyChurn.single().count)
        assertEquals(1_234.0, detail.recentScoreChanges.single().delta, 0.0)
        assertEquals(600, detail.parkingPeriods.single().durationSeconds)
        assertEquals(12_300_000, detail.playerTrace.single().score)
        assertEquals(11_900_000, detail.lineTrace.single().score)
    }
}
