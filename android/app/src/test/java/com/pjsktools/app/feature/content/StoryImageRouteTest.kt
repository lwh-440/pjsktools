package com.pjsktools.app.feature.content

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StoryImageRouteTest {
    @Test
    fun storyPreviewKeepsTheBackendProxyInsteadOfRewrappingItsUpstream() {
        val proxy = "/api/assets/proxy?url=https%3A%2F%2Fsekai-assets.haruki.seiunx.com%2Fjp-assets%2Fondemand%2Fscenario%2Fbackground%2Fbg_a002201%2Fbg_a002201.png"

        assertEquals(
            "https://api.sekai-tools.cn/api/assets/proxy?url=https%3A%2F%2Fsekai-assets.haruki.seiunx.com%2Fjp-assets%2Fondemand%2Fscenario%2Fbackground%2Fbg_a002201%2Fbg_a002201.png",
            contentImageRequestUrl("https://api.sekai-tools.cn", listOf(proxy), useAssetResolver = false)
        )
    }

    @Test
    fun storyPreviewRejectsRawUpstreamAndOtherBackendRoutes() {
        assertNull(contentImageRequestUrl(
            "https://api.sekai-tools.cn",
            listOf("https://sekai-assets.haruki.seiunx.com/jp-assets/ondemand/scenario/background/bg_a002201/bg_a002201.png"),
            useAssetResolver = false
        ))
        assertNull(contentImageRequestUrl(
            "https://api.sekai-tools.cn",
            listOf("/api/master/jp/stories/cardEpisodes/1/full"),
            useAssetResolver = false
        ))
    }
}
