package com.pjsktools.app

import org.junit.Assert.assertTrue
import org.junit.Test

class EnvironmentContractTest {
    @Test
    fun apiBaseUrlMustEndWithSlash() {
        assertTrue(BuildConfig.API_BASE_URL.endsWith("/"))
    }
}
