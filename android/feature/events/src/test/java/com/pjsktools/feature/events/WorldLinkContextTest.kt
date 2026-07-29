package com.pjsktools.feature.events

import com.pjsktools.core.model.WorldLinkCharacter
import com.pjsktools.core.model.Region
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WorldLinkContextTest {
    private val characters = listOf(
        WorldLinkCharacter(5, "角色 5"),
        WorldLinkCharacter(8, "角色 8")
    )

    @Test
    fun controlsRequireConfirmedWorldBloomData() {
        assertTrue(shouldShowWorldLinkControls("world_bloom", true, characters))
        assertFalse(shouldShowWorldLinkControls("marathon", true, characters))
        assertFalse(shouldShowWorldLinkControls(null, true, characters))
        assertFalse(shouldShowWorldLinkControls("world_bloom", false, characters))
        assertFalse(shouldShowWorldLinkControls("world_bloom", true, emptyList()))
    }

    @Test
    fun staleCharacterSelectionNeverCrossesIntoAnotherContext() {
        assertEquals(8, resolveWorldLinkCharacterId(8, characters))
        assertEquals(5, resolveWorldLinkCharacterId(99, characters))
        assertEquals(null, resolveWorldLinkCharacterId(99, emptyList()))
    }

    @Test
    fun regionSwitchCannotReusePreviousWorldLinkCharacter() {
        assertEquals(
            RegionSafeWorldLinkContext("worldlink", 5),
            resolveRegionSafeWorldLinkContext(Region.JP, Region.JP, "worldlink", 5)
        )
        assertEquals(
            RegionSafeWorldLinkContext("overall", null),
            resolveRegionSafeWorldLinkContext(Region.EN, Region.JP, "worldlink", 5)
        )
    }
}
