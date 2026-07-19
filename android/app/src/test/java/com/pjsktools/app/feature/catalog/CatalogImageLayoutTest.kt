package com.pjsktools.app.feature.catalog

import org.junit.Assert.assertEquals
import org.junit.Test

class CatalogImageLayoutTest {
    @Test
    fun wideCatalogImagesUseTheirNativeRatios() {
        assertEquals(1f, catalogListImageAspectRatio(CatalogType.SONGS))
        assertEquals(1f, catalogListImageAspectRatio(CatalogType.CARDS))
        assertEquals(61f / 26f, catalogListImageAspectRatio(CatalogType.GACHAS))
        assertEquals(4.75f, catalogListImageAspectRatio(CatalogType.HONORS))
        assertEquals(1.8f, catalogListImageAspectRatio(CatalogType.COMICS))
        assertEquals(1f, catalogListImageAspectRatio(CatalogType.MATERIALS))
        assertEquals(1f, catalogListImageAspectRatio(CatalogType.COSTUMES))
        assertEquals(1f, catalogListImageAspectRatio(CatalogType.STAMPS))
    }
}
