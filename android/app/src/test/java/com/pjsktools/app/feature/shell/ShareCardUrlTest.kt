package com.pjsktools.app.feature.shell

import org.junit.Assert.assertEquals
import org.junit.Test

class ShareCardUrlTest {
    @Test
    fun generatedShareImageUsesANewCacheKeyWithoutChangingItsRoute() {
        assertEquals(
            "/api/share/cards/event/217.png?region=jp&refresh=42",
            refreshedShareImageUrl("/api/share/cards/event/217.png?region=jp", 42)
        )
        assertEquals(
            "https://api.example.test/card.png?refresh=42",
            refreshedShareImageUrl("https://api.example.test/card.png", 42)
        )
    }
}
