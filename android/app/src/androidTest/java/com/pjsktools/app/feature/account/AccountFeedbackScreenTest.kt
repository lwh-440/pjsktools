package com.pjsktools.app.feature.account

import androidx.activity.ComponentActivity
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performScrollToNode
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
        val controller = controllerFor(AccountScenario.FAVORITE_401, StoredAccountSession("access", "refresh"))
        composeRule.setContent { MaterialTheme { AccountFeatureScreen("http://fixture/", controller = controller) } }
        composeRule.waitUntil { controller.state.value.profile != null }
        composeRule.scrollTo("目标 ID")
        composeRule.textField("目标 ID").performTextInput("123")
        composeRule.textField("名称").performTextInput("验收收藏")
        composeRule.scrollTo("保存收藏")
        composeRule.onNodeWithText("保存收藏").performClick()
        composeRule.waitUntil {
            !controller.state.value.isAuthenticated && controller.state.value.error == "登录状态已失效，请重新登录"
        }
        composeRule.scrollTo("登录状态已失效，请重新登录")
        composeRule.onNodeWithText("登录状态已失效，请重新登录").assertIsDisplayed()
    }

    private fun androidx.compose.ui.test.junit4.AndroidComposeTestRule<*, *>.textField(label: String) =
        onNode(hasSetTextAction() and hasAnyDescendant(hasText(label)), useUnmergedTree = true)

    private fun androidx.compose.ui.test.junit4.AndroidComposeTestRule<*, *>.scrollTo(text: String) {
        onNode(hasScrollAction()).performScrollToNode(hasText(text))
    }

    private fun controllerFor(scenario: AccountScenario, stored: StoredAccountSession? = null): AccountFeatureController {
        val store = MemoryStore(stored)
        val client = OkHttpClient.Builder().addInterceptor(FixtureInterceptor(scenario)).build()
        return AccountFeatureController(
            repository = AccountRepository("http://fixture/", store, client),
            harukiGateway = GeneratedHarukiGateway("http://fixture/", client),
            privateCacheCleaner = object : PrivateAccountCacheCleaner {
                override suspend fun clearForAccount(accountId: String) = Unit
            }
        )
    }
}

private enum class AccountScenario { CODE_FEEDBACK, FAVORITE_401 }

private class MemoryStore(private var value: StoredAccountSession?) : AccountSessionStore {
    override fun load() = value
    override fun save(session: StoredAccountSession) { value = session }
    override fun clear() { value = null }
}

private class FixtureInterceptor(private val scenario: AccountScenario) : Interceptor {
    private var codeRequests = 0
    override fun intercept(chain: Interceptor.Chain): Response {
        val path = chain.request().url.encodedPath
        val (code, payload) = when (path) {
            "/api/legal/current" -> 200 to """{"privacyVersion":"2026-08-04","termsVersion":"2026-08-04","minimumAge":14}"""
            "/api/auth/email-code/start" -> if (++codeRequests == 1) {
                200 to """{"sent":true,"expiresIn":300,"resendAfter":0}"""
            } else {
                500 to """{"message":"模拟验证码失败"}"""
            }
            "/api/me/legal-acceptances" -> 200 to """{"required":false}"""
            "/api/me/profile" -> 200 to """{"user":{"id":"fixture-user","email":"fixture@example.test"},"bindings":[],"favorites":[],"scores":[],"deckConfigs":[]}"""
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
