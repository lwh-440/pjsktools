package com.pjsktools.app.feature.account

data class AccountSession(val accessToken: String, val refreshToken: String, val expiresInSeconds: Long? = null, val user: AccountUser)
data class AccountUser(val id: String, val email: String? = null, val nickname: String? = null, val avatarUrl: String? = null, val createdAt: String? = null)
data class OAuthAccount(val id: String, val provider: String, val nickname: String? = null, val avatarUrl: String? = null, val createdAt: String? = null)
data class PublicPlayerProfile(val nickname: String? = null, val rank: Int? = null, val comment: String? = null, val source: String? = null, val rawJson: String? = null)

data class PlayerBinding(
    val id: String, val region: String, val playerUid: String,
    val displayName: String? = null, val isDefault: Boolean = false, val note: String? = null,
    val publicProfile: PublicPlayerProfile? = null, val refreshedAt: String? = null,
    val createdAt: String? = null, val updatedAt: String? = null
) {
    val title: String get() = displayName?.takeIf(String::isNotBlank)
        ?: publicProfile?.nickname?.takeIf(String::isNotBlank) ?: playerUid
}

data class CompletenessSection(val ready: Boolean, val missingFields: List<String> = emptyList())
data class BindingSummary(
    val bindingId: String, val inventoryCount: Int = 0, val uploadedPlayerDataKinds: List<String> = emptyList(),
    val playerDataKinds: List<String> = emptyList(), val completenessJson: String? = null
)
data class FavoriteRecord(val id: String, val type: String, val region: String, val targetId: String, val label: String)
data class ScoreRecord(val id: String, val region: String, val songId: String, val difficulty: String, val clearStatus: String, val score: Int, val targetScore: Int? = null, val note: String? = null)
data class DeckConfig(val id: String, val bindingId: String? = null, val region: String, val name: String, val eventId: String? = null, val leaderCardId: String? = null, val cardIds: List<String>, val note: String? = null)
data class FavoriteInput(val type: String, val region: String, val targetId: String, val label: String)
data class ScoreInput(val id: String? = null, val region: String, val songId: String, val difficulty: String, val clearStatus: String, val score: Int, val targetScore: Int? = null, val note: String? = null)
data class DeckConfigInput(val id: String? = null, val bindingId: String? = null, val region: String, val name: String, val eventId: String? = null, val leaderCardId: String? = null, val cardIds: List<String>, val note: String? = null)
data class ToolContext(val inventoryCount: Int, val playerDataKinds: List<String>, val warnings: List<String>, val completenessJson: String, val rawJson: String)
data class ProfileAnalysis(val nickname: String?, val rank: Int?, val comment: String?, val rawJson: String)
data class DeckRecommendation(val rawJson: String)
data class QqAuthStart(val state: String, val authorizeUrl: String, val expiresInSeconds: Long? = null)
val PlayerDataKinds = listOf("area-items", "character-ranks", "music-results", "materials", "honors", "profile-honors", "challenge-live", "world-bloom-support", "mysekai-canvas", "mysekai-gates", "mysekai-fixtures")
data class PlayerAssetWorkspace(
    val kind: String = PlayerDataKinds.first(), val editorJson: String = "[]", val cardsJson: String = "[]",
    val validationJson: String? = null, val importPayload: String = "{}", val importReviewJson: String? = null,
    val exportJson: String? = null, val completenessJson: String? = null
)
data class MeProfile(
    val user: AccountUser, val oauthAccounts: List<OAuthAccount> = emptyList(),
    val bindings: List<PlayerBinding> = emptyList(), val bindingSummaries: List<BindingSummary> = emptyList(),
    val favorites: List<FavoriteRecord> = emptyList(), val scores: List<ScoreRecord> = emptyList(),
    val deckConfigs: List<DeckConfig> = emptyList()
) { fun summaryFor(bindingId: String) = bindingSummaries.firstOrNull { it.bindingId == bindingId } }

data class RegistrationCodeResult(val sent: Boolean, val expiresInSeconds: Long? = null, val developmentCode: String? = null)
data class NewPlayerBinding(val region: String, val playerUid: String, val displayName: String = "", val note: String = "", val isDefault: Boolean = false)
enum class AccountEntryMode { LOGIN, REGISTER }

data class AccountUiState(
    val initialized: Boolean = false, val busy: Boolean = false, val operationBindingId: String? = null,
    val session: AccountSession? = null, val profile: MeProfile? = null, val selectedBindingId: String? = null,
    val entryMode: AccountEntryMode = AccountEntryMode.LOGIN, val message: String? = null,
    val error: String? = null, val registrationCode: RegistrationCodeResult? = null,
    val profileAnalysis: ProfileAnalysis? = null, val toolContext: ToolContext? = null,
    val deckRecommendation: DeckRecommendation? = null, val assets: PlayerAssetWorkspace = PlayerAssetWorkspace(),
    val qqAuthStart: QqAuthStart? = null
) {
    val isAuthenticated get() = session != null
    val selectedBinding: PlayerBinding? get() = profile?.bindings?.firstOrNull { it.id == selectedBindingId }
        ?: profile?.bindings?.firstOrNull { it.isDefault } ?: profile?.bindings?.firstOrNull()
}

class AccountApiException(val statusCode: Int, message: String) : Exception(message)
