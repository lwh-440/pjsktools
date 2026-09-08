package com.pjsktools.app.feature.content

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ContentStateRestoreTest {
    @Test
    fun initialEffectsKeepRestoredFiltersAndDetailWhileActualChangesResetThem() {
        assertFalse(contentShouldResetForSection(firstEffect = true))
        assertFalse(contentShouldResetForRegion(firstEffect = true))
        assertTrue(contentShouldResetForSection(firstEffect = false))
        assertTrue(contentShouldResetForRegion(firstEffect = false))
    }

    @Test
    fun initialSectionUsesTheSameFilterAndSortAsARealSectionChange() {
        assertEquals(MysekaiKind.FIXTURES.name, defaultFilter(ContentSection.MYSEKAI))
        assertEquals("region-referenced", defaultFilter(ContentSection.LIVE2D))
        assertEquals("time-desc", defaultSort(ContentSection.STORIES))
    }

    @Test
    fun listAnchorWaitsForItemsAfterAnInitiallyEmptyReload() {
        assertFalse(contentCanRestoreListAnchor(totalItems = 4, savedIndex = 15))
        assertTrue(contentCanRestoreListAnchor(totalItems = 28, savedIndex = 15))
    }
}
