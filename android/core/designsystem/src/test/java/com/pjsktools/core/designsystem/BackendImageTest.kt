package com.pjsktools.core.designsystem

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import com.pjsktools.core.model.CatalogAsset

class BackendImageTest {
    @Test
    fun candidatesKeepPriorityAndRemoveBlankDuplicates() {
        assertEquals(
            listOf("https://backend/banner", "https://backend/fallback"),
            orderedImageCandidates(
                listOf("https://backend/banner", null, " "),
                listOf("https://backend/banner", "https://backend/fallback")
            )
        )
    }

    @Test
    fun failedCandidatesAdvanceUntilTheListIsExhausted() {
        assertEquals(1, nextCandidateIndex(0, 2))
        assertEquals(2, nextCandidateIndex(1, 2))
        assertNull(nextCandidateIndex(2, 2))
    }

    @Test
    fun catalogCandidatesMatchWebListAndDetailPriority() {
        val assets = CatalogAsset(
            imageUrl = "image",
            thumbnailUrl = "thumbnail",
            bannerUrl = "banner",
            logoUrl = "logo",
            screenUrl = "screen",
            degreeMainUrl = "degree",
            imageCandidates = listOf("fallback")
        )

        assertEquals(
            listOf("image", "thumbnail", "banner", "logo", "degree", "fallback"),
            catalogListImageCandidates(assets)
        )
        assertEquals(
            listOf("screen", "image", "thumbnail", "banner", "logo", "degree", "fallback"),
            catalogDetailImageCandidates(assets)
        )
    }
}
