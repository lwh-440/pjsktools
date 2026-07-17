package com.pjsktools.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotEquals
import org.junit.Test

class ScrollAnchorStoreTest {
    @Test fun keepsOnlyTheMostRecentAnchors() {
        val store = ScrollAnchorStore(2)
        store.put("first", ListScrollAnchor("1", 1, 2))
        store.put("second", ListScrollAnchor("2", 2, 3))
        val encoded = store.put("third", ListScrollAnchor("3", 3, 4))
        val restored = ScrollAnchorStore(2, encoded)
        assertNull(restored.get("first"))
        assertEquals("2", restored.get("second")?.itemId)
        assertEquals(4, restored.get("third")?.offset)
    }

    @Test fun filterSelectionsArePartOfTheScrollAnchorKey() {
        val base = SongQuery()
        val filtered = base.copy(
            filters = CatalogFilterState(
                selected = mapOf("musicTags" to setOf("vocaloid", "unit")),
                toggles = mapOf("usableOnly" to true)
            )
        )

        assertNotEquals(base.scrollKey(Region.JP), filtered.scrollKey(Region.JP))
        assertEquals(3, filtered.filters.activeCount)
    }

    @Test fun filterKeyIsStableAcrossMapAndSetOrder() {
        val first = CatalogQuery(filters = CatalogFilterState(selected = linkedMapOf(
            "units" to linkedSetOf("leo_need", "mmj"),
            "rarities" to setOf("4", "3")
        )))
        val second = CatalogQuery(filters = CatalogFilterState(selected = linkedMapOf(
            "rarities" to setOf("3", "4"),
            "units" to linkedSetOf("mmj", "leo_need")
        )))

        assertEquals(first.scrollKey(Region.EN, CatalogKind.COSTUME), second.scrollKey(Region.EN, CatalogKind.COSTUME))
    }
}
