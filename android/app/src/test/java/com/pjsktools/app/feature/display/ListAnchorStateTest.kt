package com.pjsktools.app.feature.display

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ListAnchorStateTest {
    @Test
    fun normalListScrollingUpdatesThePositionButInitialHeaderDoesNotReplaceIt() {
        val prior = SavedListAnchor(index = 18, offset = 6)
        val duringInitialHeader = recordVisibleListAnchor(prior, visibleIndex = 0, visibleOffset = 0, canRecord = false)
        val afterScroll = recordVisibleListAnchor(prior, visibleIndex = 31, visibleOffset = 12, canRecord = true)

        assertEquals(prior, duringInitialHeader)
        assertEquals(SavedListAnchor(index = 31, offset = 12), afterScroll)
        assertTrue(canRestoreSavedListAnchor(totalItems = 40, saved = afterScroll))
    }
}
