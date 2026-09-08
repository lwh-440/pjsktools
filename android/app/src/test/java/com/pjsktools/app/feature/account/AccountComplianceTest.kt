package com.pjsktools.app.feature.account

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountComplianceTest {
    @Test fun qqStartCarriesEncodedRedirectAndCurrentLegalAcceptance() {
        val path = qqAuthStartPath(
            "pjsktools://auth/qq",
            LegalDocumentVersions("2026-08-04+privacy", "2026-08-04/terms"),
            true
        )

        assertTrue(path.startsWith("/api/auth/qq/start?"))
        assertTrue(path.contains("redirectTo=pjsktools%3A%2F%2Fauth%2Fqq"))
        assertTrue(path.contains("privacyVersion=2026-08-04%2Bprivacy"))
        assertTrue(path.contains("termsVersion=2026-08-04%2Fterms"))
        assertTrue(path.contains("ageConfirmed=true"))
    }

    @Test fun qqLoginConsentRequiresEveryUncheckedByDefaultChoice() {
        listOf(
            Triple(false, false, false),
            Triple(true, false, true),
            Triple(false, true, true),
            Triple(true, true, false)
        ).forEach { (privacy, terms, age) ->
            assertTrue(runCatching { requireQqLoginConsent(privacy, terms, age) }.isFailure)
        }
        requireQqLoginConsent(true, true, true)
    }

    @Test fun qqStartWithoutLegalDataCannotInventAcceptance() {
        val path = qqAuthStartPath("pjsktools://auth/qq", null, false)
        assertFalse(path.contains("privacyVersion="))
        assertFalse(path.contains("termsVersion="))
        assertFalse(path.contains("ageConfirmed="))
    }

    @Test fun privateCacheCleanerScopesEveryPrivateStoreToCurrentAccount() = runBlocking {
        val roomAccounts = mutableListOf<String>()
        val previewAccounts = mutableListOf<String>()
        val cleaner = PrivateAccountCacheCoordinator(
            clearRoom = { roomAccounts += it },
            clearHarukiPreview = { previewAccounts += it }
        )

        cleaner.clearForAccount("account-a")

        assertEquals(listOf("account-a"), roomAccounts)
        assertEquals(listOf("account-a"), previewAccounts)
        assertFalse(roomAccounts.contains("account-b"))
        assertFalse(previewAccounts.contains("account-b"))
    }

    @Test fun privateCacheCleanerRefusesMissingAccountBeforeAnyDeletion() = runBlocking {
        var called = false
        val cleaner = PrivateAccountCacheCoordinator({ called = true }, { called = true })

        assertTrue(runCatching { cleaner.clearForAccount("") }.isFailure)
        assertFalse(called)
    }

    @Test fun controllerAccountResolutionFailsClosedWithoutEitherUserId() {
        assertEquals("profile-account", resolvePrivateAccountId("profile-account", "session-account"))
        assertEquals("session-account", resolvePrivateAccountId("", "session-account"))
        assertEquals(null, resolvePrivateAccountId(null, ""))
    }

    @Test fun deletionMessageReportsPartialCacheFailureAccurately() {
        assertTrue(deletionCacheMessage(null).contains("当前账号私有缓存已清除"))
        val partial = deletionCacheMessage(IllegalStateException("preview failure"))
        assertTrue(partial.contains("账号已注销"))
        assertTrue(partial.contains("部分本机私有缓存可能仍留存"))
    }

    @Test fun qqLinkNeverUsesFirstLoginConsentGate() {
        assertTrue(qqLoginConsentRequired(QqMobileFlow.LOGIN))
        assertFalse(qqLoginConsentRequired(QqMobileFlow.LINK))
    }

    @Test fun aNewActionClearsThePreviousActionsFeedbackBeforeItRuns() {
        val favoriteSuccess = AccountUiState(
            feedbackTarget = AccountFeedbackTarget.FAVORITES,
            message = "收藏已保存"
        )

        val registrationRequest = favoriteSuccess.forActionFeedback(AccountFeedbackTarget.AUTH)

        assertEquals(AccountFeedbackTarget.AUTH, registrationRequest.feedbackTarget)
        assertEquals(null, registrationRequest.message)
        assertEquals(null, registrationRequest.error)
    }

    @Test fun expiredSessionMovesARecordActionsFeedbackBackToTheLoginSurface() {
        val expired = AccountUiState(
            session = AccountSession("access", "refresh", user = AccountUser("user")),
            feedbackTarget = AccountFeedbackTarget.FAVORITES,
            message = "收藏已保存"
        ).expiredSessionFeedback()

        assertEquals(AccountFeedbackTarget.AUTH, expired.feedbackTarget)
        assertEquals("登录状态已失效，请重新登录", expired.error)
        assertEquals(null, expired.session)
    }
}
