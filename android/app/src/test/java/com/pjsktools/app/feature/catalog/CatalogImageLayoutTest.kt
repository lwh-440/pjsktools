package com.pjsktools.app.feature.catalog

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CatalogImageLayoutTest {
    @Test
    fun wideCatalogImagesUseTheirNativeRatios() {
        assertEquals(61f / 26f, catalogImageAspectRatio(CatalogType.GACHAS))
        assertEquals(4.75f, catalogImageAspectRatio(CatalogType.HONORS))
        assertEquals(1.8f, catalogImageAspectRatio(CatalogType.COMICS))
        assertNull(catalogImageAspectRatio(CatalogType.CARDS))
    }
}
