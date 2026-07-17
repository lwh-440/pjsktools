package com.pjsktools.core.network

import com.pjsktools.api.generated.CatalogAssetDto
import com.pjsktools.api.generated.CatalogItemDto
import com.pjsktools.api.generated.CatalogFilterGroupDto
import com.pjsktools.api.generated.CatalogFilterMetaDto
import com.pjsktools.api.generated.CatalogFilterOptionDto
import com.pjsktools.core.model.CatalogKind
import com.pjsktools.core.model.CostumeEntry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogMapperTest {
    @Test fun mapsGeneratedCostumeDtoAndKeepsAssetsOnBackendHost() {
        val dto = CatalogItemDto(
            id = "12",
            type = CatalogKind.COSTUME.apiName,
            name = "Costume",
            assets = CatalogAssetDto(
                imageUrl = "https://upstream.example/costume.png",
                imageCandidates = listOf(
                    "/api/assets/proxy?url=one",
                    "https://upstream.example/two.png"
                )
            ),
            costumeNumber = 12,
            partTypes = listOf("body")
        )

        val mapped = dto.domain("http://10.0.2.2:4000/")

        assertTrue(mapped is CostumeEntry)
        assertEquals(12, (mapped as CostumeEntry).costumeNumber)
        assertTrue(mapped.data.assets.imageUrl!!.startsWith("http://10.0.2.2:4000/api/assets/resolve?url="))
        assertTrue(mapped.data.assets.imageCandidates.all { it.startsWith("http://10.0.2.2:4000/api/") })
    }

    @Test fun filterIconsAreResolvedThroughTheBackend() {
        val meta = CatalogFilterMetaDto(
            groups = listOf(
                CatalogFilterGroupDto(
                    key = "characterIds",
                    label = "Characters",
                    options = listOf(
                        CatalogFilterOptionDto(
                            value = "1",
                            label = "Character 1",
                            count = 5,
                            iconCandidates = listOf("https://upstream.example/character.png")
                        )
                    )
                )
            )
        )

        val icon = meta.domain("http://10.0.2.2:4000/").groups.single().options.single().iconCandidates.single()

        assertTrue(icon.startsWith("http://10.0.2.2:4000/api/assets/resolve?url="))
    }
}
