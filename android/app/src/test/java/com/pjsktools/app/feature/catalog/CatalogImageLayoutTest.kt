package com.pjsktools.app.feature.catalog

import org.junit.Assert.assertEquals
import org.junit.Test

class CatalogImageLayoutTest {
    @Test
    fun wideCatalogImagesUseTheirNativeRatios() {
        assertEquals(1f, catalogListImageAspectRatio(CatalogType.SONGS))
        assertEquals(1f, catalogListImageAspectRatio(CatalogType.CARDS))
        assertEquals(61f / 26f, catalogListImageAspectRatio(CatalogType.GACHAS))
        assertEquals(4.75f, catalogListImageAspectRatio(CatalogType.HONORS))
        assertEquals(1.8f, catalogListImageAspectRatio(CatalogType.COMICS))
        assertEquals(1f, catalogListImageAspectRatio(CatalogType.MATERIALS))
        assertEquals(1f, catalogListImageAspectRatio(CatalogType.COSTUMES))
        assertEquals(1f, catalogListImageAspectRatio(CatalogType.STAMPS))
    }

    @Test
    fun costumeFilterSummaryCountsOnlyActiveFields() {
        assertEquals(0, CostumeFilters().activeCount())
        assertEquals(3, CostumeFilters(partType = "body", source = "shop", characterId = "10").activeCount())
    }

    @Test
    fun cardAttributesUsePlayerLabelsWithoutDiscardingUnknownValues() {
        assertEquals("冷酷", playerAttributeLabel("cool"))
        assertEquals("神秘", playerAttributeLabel("mysterious"))
        assertEquals("custom-attribute", playerAttributeLabel("custom-attribute"))
    }

    @Test
    fun catalogSourceStatesUsePlayerLabelsAndKeepUnknownStatesTechnical() {
        assertEquals("资料已同步", catalogSourceStatusLabel("fresh"))
        assertEquals("资料正在更新", catalogSourceStatusLabel("stale-refreshing"))
        assertEquals("部分资料尚未同步", catalogSourceStatusLabel("missing-data"))
        assertEquals("资料来源暂时不可用", catalogSourceStatusLabel("source-unavailable"))
        assertEquals("资料状态待确认", catalogSourceStatusLabel("future-state"))
    }

    @Test
    fun gachaCategoriesUseKnownPlayerLabels() {
        assertEquals("普通卡池", catalogCategoryLabel(CatalogType.GACHAS, "normal"))
        assertEquals("卡池资料", catalogCategoryLabel(CatalogType.GACHAS, "ceil"))
        assertEquals("future-category", catalogCategoryLabel(CatalogType.GACHAS, "future-category"))
    }

    @Test
    fun costumeMetadataUsesKnownPlayerLabelsWithoutDiscardingUnknownValues() {
        assertEquals("衣装", costumePartTypeLabel("body"))
        assertEquals("发型", costumePartTypeLabel("hair"))
        assertEquals("头饰", costumePartTypeLabel("head"))
        assertEquals("卡牌", costumeSourceLabel("card"))
        assertEquals("商店", costumeSourceLabel("shop"))
        assertEquals("普通", costumeTypeLabel("normal"))
        assertEquals("稀有", costumeRarityLabel("rare"))
        assertEquals("女性", costumeGenderLabel("female"))
        assertEquals("custom-part", costumePartTypeLabel("custom-part"))
    }

    @Test
    fun displayOnlyRelatedFallbackIsReadableWhileOtherFallbacksRemainExplicit() {
        assertEquals("演唱版本", relatedItemFallbackTitle(RelatedKind.DISPLAY_ONLY))
        assertEquals("未命名条目", relatedItemFallbackTitle(RelatedKind.CARD))
    }

    @Test
    fun musicVocalGeneratedTitleUsesReadableFallbackWithoutChangingRealTitles() {
        assertEquals(
            "演唱版本",
            relatedItemTitle(RelatedKind.DISPLAY_ONLY, "1847", "musicVocals 1847", "musicVocals")
        )
        assertEquals(
            "musicVocals 1847",
            relatedItemTitle(RelatedKind.DISPLAY_ONLY, "1847", "musicVocals 1847")
        )
        assertEquals(
            "バーチャル・シンガーver.",
            relatedItemTitle(RelatedKind.DISPLAY_ONLY, "1847", "バーチャル・シンガーver.", "musicVocals")
        )
    }
}
