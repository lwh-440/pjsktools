package com.pjsktools.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ApiOriginTest {
    @Test fun canonicalOriginsShareOnlyTheirOwnSessionNamespace() {
        val a = ApiOrigin.normalize("https://api-a.example:443/", false)
        val b = ApiOrigin.normalize("https://api-b.example/", false)
        assertEquals("https://api-a.example", a)
        assertNotEquals(ApiOrigin.namespace(a), ApiOrigin.namespace(b))
        assertEquals(ApiOrigin.namespace(a), ApiOrigin.namespace(ApiOrigin.normalize("https://api-a.example", false)))
    }

    @Test fun switchingBackToAnOriginSelectsTheSameNamespace() {
        val first = ApiOrigin.namespace(ApiOrigin.normalize("https://api-a.example", false))
        ApiOrigin.namespace(ApiOrigin.normalize("https://api-b.example", false))
        val restored = ApiOrigin.namespace(ApiOrigin.normalize("https://api-a.example/", false))
        assertEquals(first, restored)
    }

    @Test fun remoteHttpCredentialsPathsQueriesAndFragmentsFailClosed() {
        listOf(
            "http://evil.example", "https://user:pass@api.example", "https://api.example/v1",
            "https://api.example?x=1", "https://api.example#fragment"
        ).forEach { value -> assertThrows(IllegalArgumentException::class.java) { ApiOrigin.normalize(value, false) } }
        assertEquals("http://10.0.2.2:4000", ApiOrigin.normalize("http://10.0.2.2:4000/", true))
    }

    @Test fun releaseWithoutConfigurationFailsClosed() {
        val result = ApiOrigin.resolve(null, "", false)
        assertEquals(null, result.origin)
        assertEquals(false, result.isAvailable)
    }

    @Test fun blankStorageUsesVariantConfigurationButInvalidStorageNeverDoes() {
        assertEquals("https://build.example", ApiOrigin.resolve("", "https://build.example", false).origin)
        assertEquals(null, ApiOrigin.resolve("not a url", "https://build.example", false).origin)
    }

    @Test fun releaseRejectsHttpAndInvalidStoredValuesWithoutFallback() {
        listOf("http://10.0.2.2:4000", "not a url", "https://api.example/path").forEach { stored ->
            val result = ApiOrigin.resolve(stored, "https://build.example", false)
            assertEquals(null, result.origin)
            assertEquals(stored, result.editableValue)
        }
    }

    @Test fun releaseAcceptsConfiguredHttps() {
        assertEquals("https://api.example", ApiOrigin.resolve(null, "https://api.example/", false).origin)
        assertEquals("https://saved.example", ApiOrigin.resolve("https://saved.example/", "", false).origin)
    }

    @Test fun releaseTemporaryHttpAllowsOnlyTheConfiguredHost() {
        assertEquals(
            "http://api-host.example",
            ApiOrigin.normalize("http://api-host.example/", false, "api-host.example")
        )
        assertThrows(IllegalArgumentException::class.java) {
            ApiOrigin.normalize("http://other-host.example", false, "api-host.example")
        }
        assertThrows(IllegalArgumentException::class.java) {
            ApiOrigin.normalize("http://evil.example", false, "api-host.example")
        }
    }

    @Test fun debugDefaultsToEmulatorAndAllowsLocalHttp() {
        assertEquals(ApiOrigin.DEBUG_EMULATOR_DEFAULT, ApiOrigin.resolve(null, "", true).origin)
        assertEquals(ApiOrigin.DEBUG_EMULATOR_DEFAULT, ApiOrigin.resolve(null, ApiOrigin.DEBUG_EMULATOR_DEFAULT, true).origin)
    }
}
