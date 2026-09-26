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
        assertEquals(
            listOf("https://storage.example/thumb.webp", "https://backup.example/thumb.webp"),
            value.toHttpUrl().queryParameterValues("url")
        )
    }
    @Test fun keepsTheTwelfthFallbackCandidateReachable() {
        val value = resolveAssetUrl("http://10.0.2.2:4000/", listOf(
            "https://haruki.example/primary.png",
            "https://legacy-a.example/second.webp",
            "https://legacy-b.example/third.webp",
            "https://legacy-c.example/fourth.webp",
            "https://legacy-d.example/fifth.webp",
            "https://legacy-e.example/sixth.webp",
            "https://legacy-f.example/seventh.webp",
            "https://legacy-g.example/eighth.webp",
            "https://legacy-h.example/ninth.webp",
            "https://legacy-i.example/tenth.webp",
            "https://legacy-j.example/eleventh.webp",
            "https://legacy-k.example/twelfth.webp"
        ))
        assertEquals(12, value!!.toHttpUrl().queryParameterValues("url").size)
    }
}
