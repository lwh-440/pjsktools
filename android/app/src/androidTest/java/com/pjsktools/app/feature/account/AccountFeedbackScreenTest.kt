package com.pjsktools.app.feature.account

import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performScrollTo
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Rule
import org.junit.Test

class AccountFeedbackScreenTest {
    @get:Rule val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test fun registrationCodeSuccessAndFailureStayNearTheEntryAction() {
        val controller = controllerFor(AccountScenario.CODE_FEEDBACK)
        composeRule.setContent { MaterialTheme { AccountFeatureScreen("http://fixture/", controller = controller) } }
        composeRule.waitUntil { controller.state.value.initialized }
        composeRule.onNodeWithText("注册").performClick()
        composeRule.textField("邮箱").performTextInput("ok@example.test")
        composeRule.scrollTo("获取验证码")
        composeRule.onNodeWithText("获取验证码").performClick()
        composeRule.waitUntil { controller.state.value.registrationCode != null }
        composeRule.scrollTo("验证码已发送，5 分钟内有效")
        composeRule.onNodeWithText("验证码已发送，5 分钟内有效").assertIsDisplayed()

        composeRule.scrollTo("邮箱")
        composeRule.textField("邮箱").performTextClearance()
        composeRule.textField("邮箱").performTextInput("fail@example.test")
        composeRule.scrollTo("获取验证码")
        composeRule.onNodeWithText("获取验证码").performClick()
        composeRule.waitUntil { controller.state.value.error == "模拟验证码失败" }
        composeRule.scrollTo("模拟验证码失败")
        composeRule.onNodeWithText("模拟验证码失败").assertIsDisplayed()
    }

    @Test fun savingARecordWithAnExpiredSessionReturnsToLoginWithTheReasonVisible() {
        val fixture = FixtureInterceptor(AccountScenario.FAVORITE_401)
        val controller = controllerFor(AccountScenario.FAVORITE_401, StoredAccountSession("access", "refresh"), fixture)
        composeRule.setContent { MaterialTheme { AccountFeatureScreen("http://fixture/", controller = controller) } }
        composeRule.waitUntil { controller.state.value.profile != null }
        composeRule.scrollTo("目标 ID")
        composeRule.textField("目标 ID").performTextInput("123")
        composeRule.textField("名称").performTextInput("验收收藏")
        composeRule.scrollTo("保存收藏")
        composeRule.onNodeWithText("保存收藏").assertIsDisplayed().assertIsEnabled().performClick()
        composeRule.waitUntil { fixture.favoriteWriteRequests > 0 }
        composeRule.waitUntil {
            !controller.state.value.isAuthenticated && controller.state.value.error == "登录状态已失效，请重新登录"
        }
        composeRule.scrollTo("登录状态已失效，请重新登录")
        composeRule.onNodeWithText("登录状态已失效，请重新登录").assertIsDisplayed()
    }

    @Test fun selectingAnotherUidKeepsTheDefaultUidAndExistingPlayerRecordsAvailable() {
        val controller = controllerFor(AccountScenario.BINDING_SELECTION, StoredAccountSession("access", "refresh"))
        composeRule.setContent { MaterialTheme { AccountFeatureScreen("http://fixture/", controller = controller) } }
        composeRule.waitUntil {
            controller.state.value.profile != null && controller.state.value.selectedBinding?.id == "binding-jp"
        }
        check(controller.state.value.profile?.bindings?.firstOrNull { it.isDefault }?.id == "binding-jp")
        check(controller.state.value.profile?.favorites?.size == 1)
        check(controller.state.value.profile?.scores?.size == 1)
        check(controller.state.value.profile?.deckConfigs?.size == 1)

        composeRule.scrollTo("EN 候选")
        composeRule.onNode(
            hasClickAction() and hasAnyDescendant(hasText("EN 候选")),
            useUnmergedTree = true
        ).performClick()
        composeRule.waitUntil {
            controller.state.value.selectedBinding?.id == "binding-en" &&
                controller.state.value.profileAnalysis?.nickname == "EN 资料" && !controller.state.value.busy
        }

        check(controller.state.value.profile?.bindings?.firstOrNull { it.isDefault }?.id == "binding-jp")
        composeRule.scrollTo("当前使用")
        composeRule.onNodeWithText("当前使用").assertIsDisplayed()
        composeRule.scrollTo("保留收藏 · jp/song")
        composeRule.onNodeWithText("保留收藏 · jp/song").assertIsDisplayed()
        composeRule.scrollTo("1 EXPERT · clear · 123")
        composeRule.onNodeWithText("1 EXPERT · clear · 123").assertIsDisplayed()
        composeRule.scrollTo("保留卡组 · 1 张")
        composeRule.onNodeWithText("保留卡组 · 1 张").assertIsDisplayed()
    }

    private fun androidx.compose.ui.test.junit4.AndroidComposeTestRule<*, *>.textField(label: String) =
        onNode(hasSetTextAction() and hasAnyDescendant(hasText(label)), useUnmergedTree = true)

    private fun androidx.compose.ui.test.junit4.AndroidComposeTestRule<*, *>.scrollTo(text: String) {
        onNode(hasScrollAction()).performScrollToNode(hasText(text))
        onNodeWithText(text, useUnmergedTree = true).performScrollTo()
    }

    private fun controllerFor(
        scenario: AccountScenario,
        stored: StoredAccountSession? = null,
        fixture: FixtureInterceptor = FixtureInterceptor(scenario)
    ): AccountFeatureController {
        val store = MemoryStore(stored)
        val client = OkHttpClient.Builder().addInterceptor(fixture).build()
        return AccountFeatureController(
            repository = AccountRepository("http://fixture/", store, client),
            harukiGateway = GeneratedHarukiGateway("http://fixture/", client),
            privateCacheCleaner = object : PrivateAccountCacheCleaner {
                override suspend fun clearForAccount(accountId: String) = Unit
            }
        )
    }
}

private enum class AccountScenario { CODE_FEEDBACK, FAVORITE_401, BINDING_SELECTION }

private class MemoryStore(private var value: StoredAccountSession?) : AccountSessionStore {
    override fun load() = value
    override fun save(session: StoredAccountSession) { value = session }
    override fun clear() { value = null }
}

private class FixtureInterceptor(private val scenario: AccountScenario) : Interceptor {
    private var codeRequests = 0
    @Volatile var favoriteWriteRequests = 0
        private set
    override fun intercept(chain: Interceptor.Chain): Response {
        val path = chain.request().url.encodedPath
        if (path == "/api/me/favorites" && chain.request().method == "POST") favoriteWriteRequests += 1
        val (code, payload) = when (path) {
            "/api/legal/current" -> 200 to """{"privacyVersion":"2026-08-04","termsVersion":"2026-08-04","minimumAge":14}"""
            "/api/auth/email-code/start" -> if (++codeRequests == 1) {
                200 to """{"sent":true,"expiresIn":300,"resendAfter":0}"""
            } else {
                500 to """{"message":"模拟验证码失败"}"""
            }
            "/api/me/legal-acceptances" -> 200 to """{"required":false}"""
            "/api/me/profile" -> if (scenario == AccountScenario.BINDING_SELECTION) {
                200 to """{
                    "user":{"id":"fixture-user","email":"fixture@example.test"},
                    "bindings":[
                        {"id":"binding-jp","region":"jp","playerUid":"100","displayName":"JP 默认","isDefault":true},
                        {"id":"binding-en","region":"en","playerUid":"200","displayName":"EN 候选","isDefault":false}
                    ],
                    "bindingSummaries":[
                        {"binding":{"id":"binding-jp"},"inventoryCount":12,"playerData":[{"kind":"profile"}],"completeness":{"uploadedPlayerDataKinds":["profile"]}},
                        {"binding":{"id":"binding-en"},"inventoryCount":8,"playerData":[],"completeness":{"uploadedPlayerDataKinds":[]}}
                    ],
                    "favorites":[{"id":"fav","type":"song","region":"jp","targetId":"1","label":"保留收藏"}],
                    "scores":[{"id":"score","region":"jp","songId":"1","difficulty":"expert","clearStatus":"clear","score":123,"note":"保留成绩"}],
                    "deckConfigs":[{"id":"deck","bindingId":"binding-jp","region":"jp","name":"保留卡组","cardIds":["1"]}]
                }"""
            } else {
                200 to """{"user":{"id":"fixture-user","email":"fixture@example.test"},"bindings":[],"favorites":[],"scores":[],"deckConfigs":[]}"""
            }
            "/api/me/player-bindings/binding-jp/profile-analysis" -> 200 to """{"profileSummary":{"nickname":"JP 资料","rank":1}}"""
            "/api/me/player-bindings/binding-en/profile-analysis" -> 200 to """{"profileSummary":{"nickname":"EN 资料","rank":2}}"""
            "/api/me/player-bindings/binding-jp/tool-context", "/api/me/player-bindings/binding-en/tool-context" ->
                200 to """{"inventoryCount":0,"playerDataKinds":[],"toolContextWarnings":[],"completeness":{}}"""
            "/api/me/favorites", "/api/auth/refresh" -> 401 to """{"message":"expired"}"""
            else -> 404 to """{"message":"unexpected fixture route: $path"}"""
        }
        return Response.Builder()
            .request(chain.request())
            .protocol(Protocol.HTTP_1_1)
            .code(code)
            .message(if (code in 200..299) "OK" else "Fixture failure")
            .body(payload.toResponseBody("application/json".toMediaType()))
            .build()
    }
}
