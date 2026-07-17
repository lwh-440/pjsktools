package com.pjsktools.core.network

import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ImageHttpClientTest {
    private val backend = "http://10.0.2.2:4000/".toHttpUrl()

    @Test
    fun allowsOnlyTheConfiguredBackendOrigin() {
        assertTrue(isAllowedBackendUrl(backend, "http://10.0.2.2:4000/api/assets/proxy?url=x".toHttpUrl()))
        assertFalse(isAllowedBackendUrl(backend, "https://10.0.2.2:4000/api/assets/proxy?url=x".toHttpUrl()))
        assertFalse(isAllowedBackendUrl(backend, "http://example.com:4000/image.png".toHttpUrl()))
        assertFalse(isAllowedBackendUrl(backend, "http://10.0.2.2:5000/image.png".toHttpUrl()))
    }
}
