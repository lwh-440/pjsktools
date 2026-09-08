package com.pjsktools.app.feature.catalog

import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test

class CatalogFilterDisclosureTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun costumeFiltersStayCollapsedUntilTheUserExpandsThem() {
        composeRule.setContent {
            MaterialTheme {
                CatalogFeatureScreen(
                    baseUrl = "http://127.0.0.1:1/",
                    region = "jp",
                    initialType = CatalogType.COSTUMES,
                    onNavigateRelated = {}
                )
            }
        }

        composeRule.onNodeWithText("展开筛选").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("部件：body / hair / head").assertIsDisplayed()
        composeRule.onNodeWithText("收起筛选").performClick()
        composeRule.onNodeWithText("展开筛选").assertIsDisplayed()
    }
}
