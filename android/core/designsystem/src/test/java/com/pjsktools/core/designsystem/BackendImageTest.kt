package com.pjsktools.core.designsystem

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import com.pjsktools.core.model.CatalogAsset
import com.pjsktools.core.model.CatalogKind

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
    fun catalogCandidatesUseTypeSpecificPriority() {
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
            catalogListImageCandidates(CatalogKind.MATERIAL, assets)
        )
        assertEquals(
            listOf("banner", "image", "thumbnail", "logo", "screen", "fallback"),
            catalogDetailImageCandidates(CatalogKind.GACHA, assets)
        )
        assertEquals(
            listOf("degree", "image", "thumbnail", "fallback"),
            catalogDetailImageCandidates(CatalogKind.HONOR, assets)
        )
        assertEquals(61f / 26f, catalogImageAspectRatio(CatalogKind.GACHA))
        assertEquals(4.75f, catalogImageAspectRatio(CatalogKind.HONOR))
    }
}
