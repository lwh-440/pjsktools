package com.pjsktools.core.network

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProxyUrlTest {
    @Test fun rewritesExternalAssetsThroughBackend() {
        val value = proxyUrl("http://10.0.2.2:4000/", "https://storage.example/card.png")
        assertTrue(value!!.startsWith("http://10.0.2.2:4000/api/assets/proxy?url="))
    }

    @Test fun preservesBackendUrls() {
        assertEquals("http://10.0.2.2:4000/api/image", proxyUrl("http://10.0.2.2:4000/", "/api/image"))
    }

    @Test fun combinesCandidatesIntoOneResolveRequest() {
        val value = resolveAssetUrl("http://10.0.2.2:4000/", listOf(
            "/api/assets/proxy?url=https%3A%2F%2Fstorage.example%2Fthumb.webp",
            "https://backup.example/thumb.webp",
            "https://backup.example/thumb.webp"
        ))
        assertTrue(value!!.startsWith("http://10.0.2.2:4000/api/assets/resolve?"))
        assertEquals(2, value.toHttpUrl().queryParameterValues("url").size)
    }
}
