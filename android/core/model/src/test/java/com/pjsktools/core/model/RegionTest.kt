package com.pjsktools.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RegionTest {
    @Test fun parsesEverySupportedRegion() { Region.entries.forEach { assertEquals(it, Region.fromId(it.id)) } }
    @Test fun rejectsImplicitFallback() { assertNull(Region.fromId("unknown")); assertNull(Region.fromId(null)) }

    @Test fun parsesEveryTypedCatalogWithoutFallback() {
        CatalogKind.entries.forEach { assertEquals(it, CatalogKind.fromApiName(it.apiName)) }
        assertNull(CatalogKind.fromApiName("unknown"))
    }
}
