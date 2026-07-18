package com.pjsktools.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ShellApiOriginsTest {
    @Test fun firstInstallDebugDefaultReachesEveryShellBranch() {
        val resolution = ApiOrigin.resolve(null, "", true)
        val origins = ShellApiOrigins.from(requireNotNull(resolution.origin))

        assertEveryBranchUses(origins, ApiOrigin.DEBUG_EMULATOR_DEFAULT)
    }

    @Test fun releaseBuildConfigOriginIsCanonicalizedForEveryShellBranch() {
        val resolution = ApiOrigin.resolve(null, "https://api.example:443/", false)
        val origins = ShellApiOrigins.from(requireNotNull(resolution.origin))

        assertEveryBranchUses(origins, "https://api.example")
    }

    @Test fun savedOriginOverridesReleaseBuildConfigForEveryShellBranch() {
        val resolution = ApiOrigin.resolve(
            storedValue = "https://saved.example/",
            buildTimeValue = "https://build.example",
            debug = false
        )
        val origins = ShellApiOrigins.from(requireNotNull(resolution.origin))

        assertEveryBranchUses(origins, "https://saved.example")
    }

    private fun assertEveryBranchUses(origins: ShellApiOrigins, expected: String) {
        val branchOrigins = listOf(
            origins.core,
            origins.catalog,
            origins.events,
            origins.account,
            origins.content,
            origins.home,
            origins.profile,
            origins.deckCompare,
            origins.share
        )
        assertEquals(9, branchOrigins.size)
        assertTrue(branchOrigins.all { it == expected })
    }
}
