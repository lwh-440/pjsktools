package com.pjsktools.core.network

import com.pjsktools.api.generated.AndroidApi
import com.pjsktools.api.generated.CatalogAssets
import com.pjsktools.api.generated.Forecast
import com.pjsktools.api.generated.GachaItem
import com.pjsktools.api.generated.GachaPage
import com.pjsktools.api.generated.RegionId
import java.lang.reflect.Proxy
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Converter
import retrofit2.Response
import retrofit2.Retrofit

class GeneratedApiBridgeTest {
    @Test fun generatedPageTranscodesToRepositoryDto() = runBlocking {
        val generatedPage = GachaPage(
            items = listOf(
                GachaItem(
                    id = "10",
                    type = "gachas",
                    name = "Test Gacha",
                    relatedCardIds = listOf("101"),
                    assets = CatalogAssets(
                        imageCandidates = listOf("/api/assets/proxy?url=banner"),
                        bannerUrl = "/api/assets/proxy?url=banner"
                    ),
                    gachaType = "limited"
                )
            ),
            page = 1,
            pageSize = 100,
            total = 1,
            totalPages = 1,
            hasNextPage = false,
            hasPreviousPage = false,
            region = RegionId.JP,
            type = "gachas",
            masterVersion = "fixture-v1"
        )
        val generated = Proxy.newProxyInstance(
            AndroidApi::class.java.classLoader,
            arrayOf(AndroidApi::class.java)
        ) { _, method, _ ->
            when (method.name) {
                "getGachaCatalog" -> Response.success(generatedPage)
                else -> error("Unexpected generated API call: ${method.name}")
            }
        } as AndroidApi
        val bridge = GeneratedApiBridge(
            generated,
            Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }
        )

        val page = bridge.getGachaCatalog("jp", 1, 100, sort = "id-desc")

        assertEquals("fixture-v1", page.masterVersion)
        assertEquals("limited", page.items.single().gachaType)
        assertTrue(page.items.single().assets.bannerUrl!!.startsWith("/api/assets/proxy"))
    }

    @Test fun generatedEnumsUseContractValuesInQueryParameters() {
        val retrofit = Retrofit.Builder().baseUrl("http://localhost/").build()
        val converter = GeneratedEnumStringConverterFactory.stringConverter(
            AndroidApi.SortGetGachaCatalog::class.java,
            emptyArray(),
            retrofit
        )
        assertNotNull(converter)
        @Suppress("UNCHECKED_CAST")
        assertEquals(
            "id-desc",
            (converter as Converter<Any, String>).convert(AndroidApi.SortGetGachaCatalog.ID_MINUS_DESC)
        )
    }

    @Test fun allForecastWindowOmitsWindowHours() = runBlocking {
        var capturedWindow: Any? = Unit
        val generated = Proxy.newProxyInstance(
            AndroidApi::class.java.classLoader,
            arrayOf(AndroidApi::class.java)
        ) { _, method, arguments ->
            when (method.name) {
                "getRankingForecast" -> {
                    capturedWindow = arguments?.getOrNull(2)
                    Response.success(Forecast(region = RegionId.JP, eventId = "1", lines = emptyList()))
                }
                else -> error("Unexpected generated API call: ${method.name}")
            }
        } as AndroidApi
        val bridge = GeneratedApiBridge(
            generated,
            Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }
        )

        bridge.getRankingForecast("jp", "1", null)

        assertEquals(null, capturedWindow)
    }
}
