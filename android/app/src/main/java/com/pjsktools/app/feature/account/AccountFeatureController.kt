package com.pjsktools.app.feature.account

import com.pjsktools.app.BuildConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** State owner that can be observed by Compose or called directly by a host screen. */
class AccountFeatureController(
    private val repository: AccountRepository,
    private val harukiGateway: HarukiConnectionGateway,
    private val harukiPreviewCache: HarukiPreviewCache? = null,
    private val privateCacheCleaner: PrivateAccountCacheCleaner
) {
    private val mutex = Mutex()
    private var pendingQqDeletionToken: String? = null
    private val mutableState = MutableStateFlow(AccountUiState())
    val state: StateFlow<AccountUiState> = mutableState.asStateFlow()

    suspend fun initialize() = mutex.withLock {
        if (state.value.initialized) return
        val legalDocuments = try {
            repository.currentLegalDocuments()
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            null
        }
        val stored = repository.sessionStore.load()
        if (stored == null) {
            update { it.copy(
                initialized = true,
                legalDocuments = legalDocuments,
                error = if (legalDocuments == null) "无法加载当前隐私政策与用户协议版本，请检查网络后重试" else null
            ) }
            return
        }
        loading {
            val restored = restore(stored)
            val legalRequired = restored.legalAcceptanceRequired || repository.legalAcceptanceRequired(restored.accessToken)
            val profile = if (legalRequired) null else repository.getProfile(restored.accessToken)
            it.copy(
                initialized = true,
                session = restored.copy(legalAcceptanceRequired = legalRequired),
                profile = profile,
                selectedBindingId = profile?.let(::preferredBinding)?.id,
                legalAcceptanceRequired = legalRequired,
                legalDocuments = legalDocuments,
                message = if (legalRequired) "请先确认最新隐私政策与用户协议" else "登录状态已恢复",
                error = if (legalDocuments == null) "当前协议版本加载失败，QQ 首次登录与注册暂不可用" else null
            )
        }
    }

    fun setEntryMode(mode: AccountEntryMode) = update { it.copy(entryMode = mode, error = null, message = null) }
    suspend fun selectBinding(id: String) = mutex.withLock {
        update { it.copy(selectedBindingId = id, busy = true, error = null) }
        val token = requireSession().accessToken
        try {
            val analysis = repository.profileAnalysis(token, id)
            val context = repository.toolContext(token, id)
            update { it.copy(profileAnalysis = analysis, toolContext = context, session = currentSession(it.session), busy = false) }
        } catch (error: Throwable) { if (error is CancellationException) throw error; fail(error); update { it.copy(busy = false) } }
    }
    fun clearNotice() = update { it.copy(message = null, error = null) }

    suspend fun requestRegistrationCode(email: String) = mutex.withLock {
        if (!requireInput(email.isNotBlank(), "请输入邮箱")) return@withLock
        loading {
            val result = repository.requestRegistrationCode(email)
            it.copy(registrationCode = result, message = "验证码已发送，${(result.expiresInSeconds ?: 300) / 60} 分钟内有效")
        }
    }
    suspend fun login(email: String, password: String) = mutex.withLock {
        if (!requireInput(email.isNotBlank() && password.length >= 8, "请输入有效邮箱和至少 8 位密码")) return@withLock
        authenticate { repository.login(email, password) }
    }
    suspend fun register(
        email: String,
        password: String,
        confirmPassword: String,
        code: String,
        privacyAccepted: Boolean,
        termsAccepted: Boolean,
        ageConfirmed: Boolean
    ) = mutex.withLock {
        if (!requireInput(password == confirmPassword, "两次输入的密码不一致")) return@withLock
        if (!requireInput(privacyAccepted && termsAccepted && ageConfirmed, "请阅读并同意隐私政策、用户协议，并确认已满 14 周岁")) return@withLock
        val legalDocuments = state.value.legalDocuments
        if (!requireInput(legalDocuments != null, "当前隐私政策与用户协议版本尚未加载，请检查网络后重试")) return@withLock
        if (!requireInput(email.isNotBlank() && password.length >= 10 && code.matches(Regex("\\d{6}")), "注册需要有效邮箱、符合规则的密码和 6 位验证码")) return@withLock
        authenticate { repository.register(email, password, code, privacyAccepted, termsAccepted, ageConfirmed, legalDocuments!!) }
    }
    suspend fun refreshSession() = mutex.withLock {
        val refresh = state.value.session?.refreshToken ?: repository.sessionStore.load()?.refreshToken
        if (!requireInput(!refresh.isNullOrBlank(), "没有可刷新的登录状态")) return@withLock
        authenticate("登录状态已刷新") { repository.refresh(refresh!!) }
    }
    suspend fun reloadProfile() = mutex.withLock {
        val session = requireSession()
        loading {
            val profile = repository.getProfile(session.accessToken)
            val selected = retainSelection(it.selectedBindingId, profile)
            val analysis = selected?.let { id -> repository.profileAnalysis(session.accessToken, id) }
            val context = selected?.let { id -> repository.toolContext(session.accessToken, id) }
            it.copy(profile = profile, selectedBindingId = selected, profileAnalysis = analysis, toolContext = context,
                session = currentSession(it.session), message = "账号数据已同步")
        }
    }
    suspend fun logout() = mutex.withLock {
        val refresh = state.value.session?.refreshToken ?: repository.sessionStore.load()?.refreshToken
        try { repository.logout(refresh) } finally {
            pendingQqDeletionToken = null
            mutableState.value = AccountUiState(
                initialized = true,
                legalDocuments = state.value.legalDocuments,
                message = "已退出登录"
            )
        }
    }
    suspend fun startQqAuth(redirectTo: String? = null): QqAuthStart = mutex.withLock {
        val start = repository.startQqAuth(redirectTo)
        update { it.copy(qqAuthStart = start, message = "请在 QQ 完成授权") }
        start
    }
    suspend fun startMobileQqLogin(
        privacyAccepted: Boolean,
        termsAccepted: Boolean,
        ageConfirmed: Boolean
    ): QqAuthStart = mutex.withLock {
        check(qqLoginConsentRequired(QqMobileFlow.LOGIN))
        requireQqLoginConsent(privacyAccepted, termsAccepted, ageConfirmed)
        val legalDocuments = state.value.legalDocuments
            ?: throw IllegalStateException("当前隐私政策与用户协议版本尚未加载，请检查网络后重试")
        val start = repository.startMobileQqLogin(legalDocuments, ageConfirmed)
        update { it.copy(qqAuthStart = start, message = "请在 QQ 完成授权") }
        start
    }
    suspend fun startMobileQqLink(): QqAuthStart = mutex.withLock {
        val start = repository.startMobileQqLink(requireSession().accessToken)
        update { it.copy(qqAuthStart = start, message = "请在 QQ 完成授权") }
        start
    }
    suspend fun completeQqLogin(code: String, state: String) = mutex.withLock {
        authenticate("QQ 登录成功") { repository.completeQqLogin(code, state) }
    }
    suspend fun linkQq(code: String, state: String) = accountWrite("QQ 账号已关联") { repository.linkQq(it, code, state) }
    suspend fun unlinkQq() = accountWrite("QQ 账号已解除关联") { repository.unlinkQq(it) }
    suspend fun acceptCurrentLegal(privacyAccepted: Boolean, termsAccepted: Boolean, ageConfirmed: Boolean) = mutex.withLock {
        if (!requireInput(privacyAccepted && termsAccepted && ageConfirmed, "请阅读并同意隐私政策、用户协议，并确认已满 14 周岁")) return@withLock
        val session = requireSession()
        val legalDocuments = state.value.legalDocuments
        if (!requireInput(legalDocuments != null, "当前隐私政策与用户协议版本尚未加载，请检查网络后重试")) return@withLock
        loading {
            repository.acceptCurrentLegal(session.accessToken, privacyAccepted, termsAccepted, ageConfirmed, legalDocuments!!)
            val profile = repository.getProfile(session.accessToken)
            val acceptedSession = currentSession(it.session)?.copy(legalAcceptanceRequired = false)
            it.copy(
                session = acceptedSession,
                profile = profile,
                selectedBindingId = preferredBinding(profile)?.id,
                legalAcceptanceRequired = false,
                message = "隐私政策与用户协议确认已保存"
            )
        }
    }
    suspend fun exportPersonalData(): String = mutex.withLock {
        val result = repository.exportPersonalData(requireSession().accessToken)
        update { it.copy(message = "个人数据导出已生成，请选择保存位置", error = null) }
        result
    }
    suspend fun requestAccountDeletionCode() = mutex.withLock {
        loading {
            val result = repository.requestAccountDeletionCode(requireSession().accessToken)
            it.copy(deletionCode = result, message = "注销验证码已发送，${(result.expiresInSeconds ?: 300) / 60} 分钟内有效")
        }
    }
    suspend fun deleteEmailAccount(code: String, confirmation: String) = mutex.withLock {
        if (!requireInput(confirmation == "DELETE", "请输入 DELETE 以确认注销")) return@withLock
        if (!requireInput(code.matches(Regex("\\d{6}")), "请输入 6 位注销验证码")) return@withLock
        val userId = currentAccountId()
        if (!requireInput(!userId.isNullOrBlank(), "无法确认当前账号，注销未执行；请刷新账号资料后重试")) return@withLock
        loading {
            repository.deleteEmailAccount(requireSession().accessToken, code)
            val cacheError = runCatching { privateCacheCleaner.clearForAccount(userId!!) }.exceptionOrNull()
            AccountUiState(
                initialized = true,
                legalDocuments = state.value.legalDocuments,
                message = deletionCacheMessage(cacheError)
            )
        }
    }
    suspend fun startQqAccountDeletion(): String = mutex.withLock {
        pendingQqDeletionToken = null
        update { it.copy(qqDeletionReady = false) }
        repository.startQqAccountDeletion(requireSession().accessToken).also {
            update { state -> state.copy(message = "请在 QQ 完成注销身份验证", error = null) }
        }
    }
    suspend fun handleQqAccountDeletionCallback(uri: android.net.Uri) = mutex.withLock {
        val validTarget = uri.scheme == "pjsktools" && uri.host == "auth" && uri.path == "/qq-delete" &&
            uri.port == -1 && uri.userInfo == null && uri.fragment == null &&
            (uri.queryParameterNames == setOf("handoff") || uri.queryParameterNames == setOf("error"))
        if (!requireInput(validTarget, "无效的 QQ 注销回调地址")) return@withLock
        val error = uri.getQueryParameter("error")
        if (error != null) {
            pendingQqDeletionToken = null
            val message = when (error) {
                "qq_authorization_cancelled" -> "已取消 QQ 注销身份验证，账号不会被删除"
                "qq_account_mismatch" -> "授权的 QQ 与当前账号不一致，账号不会被删除"
                "qq_service_unavailable" -> "QQ 登录服务暂时不可用，请稍后重试"
                else -> "QQ 注销身份验证未完成，请重新发起"
            }
            update { it.copy(qqDeletionReady = false, message = message, error = null) }
            return@withLock
        }
        val handoff = uri.getQueryParameter("handoff").orEmpty()
        if (!requireInput(handoff.matches(Regex("delete_[0-9a-f]{32}")), "无效或过期的 QQ 注销凭据")) return@withLock
        loading {
            pendingQqDeletionToken = repository.exchangeQqAccountDeletion(requireSession().accessToken, handoff)
            it.copy(qqDeletionReady = true, message = "QQ 身份验证成功，请再次确认永久注销")
        }
    }
    suspend fun confirmQqAccountDeletion(confirmation: String) = mutex.withLock {
        if (!requireInput(confirmation == "DELETE", "请输入 DELETE 以确认注销")) return@withLock
        val deletionToken = pendingQqDeletionToken
        if (!requireInput(!deletionToken.isNullOrBlank(), "请先重新完成 QQ 身份验证")) return@withLock
        val userId = currentAccountId()
        if (!requireInput(!userId.isNullOrBlank(), "无法确认当前账号，注销未执行；请刷新账号资料后重试")) return@withLock
        loading {
            repository.confirmAccountDeletion(requireSession().accessToken, deletionToken!!)
            pendingQqDeletionToken = null
            val cacheError = runCatching { privateCacheCleaner.clearForAccount(userId!!) }.exceptionOrNull()
            AccountUiState(
                initialized = true,
                legalDocuments = state.value.legalDocuments,
                message = deletionCacheMessage(cacheError)
            )
        }
    }
    suspend fun clearPrivateCache() = mutex.withLock {
        val userId = currentAccountId()
        if (!requireInput(!userId.isNullOrBlank(), "无法确认当前账号，未清除任何本机私有数据；请刷新账号资料后重试")) return@withLock
        try {
            privateCacheCleaner.clearForAccount(userId!!)
            update { it.copy(message = "当前账号的本机私有缓存已清除", error = null) }
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            update { it.copy(error = "本机私有缓存仅部分清理或清理失败，请重试；仍失败时请在系统设置中清除应用存储") }
        }
    }

    /** Host Activity may pass its deep-link URI here after registering an intent-filter. */
    suspend fun handleQqCallback(uri: android.net.Uri) {
        val exactTarget = uri.scheme == "pjsktools" && uri.host == "auth" && uri.path == "/qq" &&
            uri.port == -1 && uri.userInfo == null && uri.fragment == null && uri.queryParameterNames == setOf("handoff")
        if (!requireInput(exactTarget, "Invalid QQ callback URL")) return
        val handoff = uri.getQueryParameter("handoff").orEmpty()
        if (!requireInput(handoff.matches(Regex("[0-9a-f]{32}")), "Invalid QQ handoff")) return
        if (!requireInput(handoff.isNotBlank(), "QQ 回调缺少 handoff")) return
        if (state.value.isAuthenticated) {
            accountWrite("QQ account linked") { token -> repository.exchangeMobileQqLink(token, handoff) }
        } else {
            authenticate("QQ 登录成功") { repository.exchangeMobileQqLogin(handoff) }
        }
    }
    suspend fun setDefault(bindingId: String) = bindingOperation(bindingId) { token ->
        repository.setDefaultBinding(token, bindingId)
        replaceProfile(token, bindingId, "已设为默认 UID")
    }
    suspend fun deleteBinding(bindingId: String) = bindingOperation(bindingId) { token ->
        repository.deleteBinding(token, bindingId)
        replaceProfile(token, null, "UID 绑定已删除")
    }
    suspend fun addFavorite(input: FavoriteInput) = accountWrite("收藏已保存") { repository.addFavorite(it, input) }
    suspend fun deleteFavorite(id: String) = accountWrite("收藏已删除") { repository.deleteFavorite(it, id) }
    suspend fun saveScore(input: ScoreInput) = accountWrite("成绩已保存") { repository.saveScore(it, input) }
    suspend fun deleteScore(id: String) = accountWrite("成绩已删除") { repository.deleteScore(it, id) }
    suspend fun saveDeckConfig(input: DeckConfigInput) = accountWrite("卡组配置已保存") { repository.saveDeckConfig(it, input) }
    suspend fun deleteDeckConfig(id: String) = accountWrite("卡组配置已删除") { repository.deleteDeckConfig(it, id) }
    suspend fun recommendDeck(eventId: String?) = mutex.withLock {
        val session = requireSession(); val binding = state.value.selectedBinding ?: return@withLock
        loading { it.copy(deckRecommendation = repository.recommendDeck(session.accessToken, binding, eventId), session = currentSession(it.session), message = "组卡推荐已生成") }
    }
    suspend fun loadCachedHarukiPreview() {
        val userId = state.value.profile?.user?.id ?: return
        val current = state.value.haruki
        if (current.previewUid.isBlank()) return
        update { it.copy(haruki = it.haruki.copy(preview = harukiPreviewCache?.load(userId, current.previewRegion, current.previewUid))) }
    }
    suspend fun loadHarukiConnection() = harukiOperation { token, current ->
        current.copy(connection = harukiGateway.connection(token), pendingReview = null)
    }
    fun editHarukiPreview(region: String? = null, playerUid: String? = null) = update {
        it.copy(haruki = it.haruki.copy(previewRegion = region ?: it.haruki.previewRegion, previewUid = playerUid ?: it.haruki.previewUid))
    }
    suspend fun previewHaruki() = harukiOperation { token, current ->
        val uid = current.previewUid.trim()
        require(uid.isNotBlank()) { "Enter a player UID" }
        try {
            val preview = harukiGateway.preview(token, current.previewRegion, uid)
            state.value.profile?.user?.id?.let { harukiPreviewCache?.save(it, preview) }
            current.copy(preview = preview)
        } catch (error: Throwable) {
            val cached = state.value.profile?.user?.id?.let { harukiPreviewCache?.load(it, current.previewRegion, uid) }
            if (cached == null) throw error
            update { it.copy(message = "刷新失败，正在显示本地缓存：${error.message ?: "未知错误"}") }
            current.copy(preview = cached)
        }
    }
    suspend fun clearHarukiPreviewCache() {
        val userId = state.value.profile?.user?.id ?: return
        val current = state.value.haruki
        if (current.previewUid.isBlank()) return
        harukiPreviewCache?.clear(userId, current.previewRegion, current.previewUid)
        update { it.copy(haruki = it.haruki.copy(preview = null), message = "已清除当前 UID 的本地 Haruki 缓存") }
    }
    suspend fun startHarukiOAuth(): HarukiOAuthStart = mutex.withLock {
        val start = harukiGateway.startOAuth(requireSession().accessToken)
        update { it.copy(message = "Continue in your browser to connect Haruki.") }
        start
    }
    suspend fun handleHarukiCallback(uri: android.net.Uri) {
        if (!BuildConfig.HARUKI_FEATURE_ENABLED) {
            update { it.copy(error = "Haruki 功能尚未开放") }
            return
        }
        val isCustomScheme = uri.scheme == "pjsktools" && uri.host == "auth"
        val isVerifiedAppLink = uri.scheme == "https" && uri.host == "sekai-tools.cn"
        val valid = (isCustomScheme || isVerifiedAppLink) && uri.path == "/haruki" &&
            uri.port == -1 && uri.userInfo == null && uri.fragment == null &&
            (uri.queryParameterNames == setOf("handoff") || uri.queryParameterNames == setOf("error"))
        if (!requireInput(valid, "Invalid Haruki callback URL") || !state.value.isAuthenticated) return
        uri.getQueryParameter("error")?.let { code ->
            update { it.copy(message = "Haruki 连接失败：$code") }
            return
        }
        val handoff = uri.getQueryParameter("handoff").orEmpty()
        if (!requireInput(handoff.matches(Regex("[0-9a-f]{64}")), "Invalid Haruki handoff")) return
        harukiGateway.completeMobileOAuth(requireSession().accessToken, handoff)
        loadHarukiConnection()
    }
    fun toggleHarukiImport(bindingId: String) = update {
        val selected = it.haruki.selectedSourceBindingIds
        it.copy(haruki = it.haruki.copy(selectedSourceBindingIds = if (bindingId in selected) selected - bindingId else selected + bindingId))
    }
    suspend fun importHarukiBindings() = harukiOperation { token, current ->
        val ids = current.selectedSourceBindingIds.toList()
        require(ids.isNotEmpty()) { "Select at least one Haruki binding" }
        harukiGateway.importBindings(token, ids)
        val profile = repository.getProfile(token)
        update { it.copy(profile = profile, selectedBindingId = retainSelection(it.selectedBindingId, profile)) }
        current.copy(selectedSourceBindingIds = emptySet())
    }
    suspend fun reviewHarukiSync(bindingId: String) = harukiOperation { token, current ->
        current.copy(pendingReview = harukiGateway.reviewSync(token, bindingId))
    }
    fun setHarukiReviewCards(action: String) = update { state ->
        val review = state.haruki.pendingReview ?: return@update state
        state.copy(haruki = state.haruki.copy(pendingReview = review.copy(cardAction = action)))
    }
    fun setHarukiReviewGroup(bindingGroup: String, action: String) = update { state ->
        val review = state.haruki.pendingReview ?: return@update state
        state.copy(haruki = state.haruki.copy(pendingReview = review.copy(groups = review.groups.map { if (it.id == bindingGroup) it.copy(action = action) else it })))
    }
    suspend fun confirmHarukiSync() = harukiOperation { token, current ->
        val review = requireNotNull(current.pendingReview) { "Review a sync before confirming it" }
        harukiGateway.confirmSync(token, review.bindingId, review.reviewToken, review.cardAction ?: "update", review.groups.associate { it.id to it.action })
        current.copy(connection = harukiGateway.connection(token), pendingReview = null)
    }
    suspend fun syncHaruki(bindingId: String) = harukiOperation { token, current ->
        harukiGateway.sync(token, bindingId)
        current.copy(connection = harukiGateway.connection(token))
    }
    suspend fun setHarukiDailySync(bindingId: String, enabled: Boolean) = harukiOperation { token, current ->
        harukiGateway.updateBinding(token, bindingId, dailySync = enabled)
        current.copy(connection = harukiGateway.connection(token))
    }
    suspend fun setHarukiDefault(bindingId: String) = harukiOperation { token, current ->
        harukiGateway.updateBinding(token, bindingId, isDefault = true)
        current.copy(connection = harukiGateway.connection(token))
    }
    suspend fun deleteHarukiBinding(bindingId: String) = harukiOperation { token, current ->
        harukiGateway.deleteBinding(token, bindingId)
        current.copy(connection = harukiGateway.connection(token), selectedSourceBindingIds = current.selectedSourceBindingIds - bindingId)
    }
    suspend fun disconnectHaruki() = harukiOperation { token, current ->
        harukiGateway.disconnect(token)
        current.copy(connection = null, pendingReview = null, selectedSourceBindingIds = emptySet())
    }

    private suspend fun restore(stored: StoredAccountSession): AccountSession {
        if (stored.accessToken.isNotBlank()) {
            try {
                val legalRequired = repository.legalAcceptanceRequired(stored.accessToken)
                val current = repository.latestSession
                if (legalRequired) {
                    return current?.copy(legalAcceptanceRequired = true)
                        ?: AccountSession(stored.accessToken, stored.refreshToken, user = AccountUser(""), legalAcceptanceRequired = true)
                }
                val accessToken = current?.accessToken ?: stored.accessToken
                val profile = repository.getProfile(accessToken)
                return AccountSession(
                    accessToken,
                    current?.refreshToken ?: stored.refreshToken,
                    user = profile.user,
                    legalAcceptanceRequired = false
                )
            } catch (error: AccountApiException) { if (error.statusCode != 401) throw error }
        }
        return repository.refresh(stored.refreshToken)
    }
    private suspend fun authenticate(message: String = "登录成功", block: suspend () -> AccountSession) = loading {
        pendingQqDeletionToken = null
        val session = block()
        val profile = if (session.legalAcceptanceRequired) null else repository.getProfile(session.accessToken)
        it.copy(initialized = true, session = session, profile = profile,
            selectedBindingId = profile?.let(::preferredBinding)?.id, registrationCode = null,
            legalAcceptanceRequired = session.legalAcceptanceRequired,
            message = if (session.legalAcceptanceRequired) "请先确认最新隐私政策与用户协议" else message)
    }
    private suspend fun replaceProfile(token: String, selected: String?, message: String) {
        val profile = repository.getProfile(token)
        update { it.copy(profile = profile, selectedBindingId = selected ?: preferredBinding(profile)?.id, session = currentSession(it.session), message = message) }
    }
    private suspend fun accountWrite(message: String, operation: suspend (String) -> Unit) = mutex.withLock {
        val token = requireSession().accessToken
        loading {
            operation(token)
            val profile = repository.getProfile(token)
            it.copy(profile = profile, session = currentSession(it.session), message = message)
        }
    }
    private suspend fun harukiOperation(operation: suspend (String, HarukiUiState) -> HarukiUiState) = mutex.withLock {
        val session = requireSession()
        update { it.copy(busy = true, error = null, message = null) }
        try {
            val next = operation(session.accessToken, state.value.haruki)
            update { it.copy(haruki = next, session = currentSession(it.session)) }
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            fail(error)
        } finally {
            update { it.copy(busy = false) }
        }
    }
    private suspend fun bindingOperation(id: String?, block: suspend (String) -> Unit) = mutex.withLock {
        val token = requireSession().accessToken
        update { it.copy(busy = true, operationBindingId = id, error = null, message = null) }
        try { block(token) } catch (error: Throwable) { if (error is CancellationException) throw error; fail(error) }
        finally { update { it.copy(busy = false, operationBindingId = null) } }
    }
    private suspend fun loading(result: suspend (AccountUiState) -> AccountUiState) {
        update { it.copy(busy = true, error = null, message = null) }
        try { mutableState.value = result(mutableState.value).copy(busy = false) }
        catch (error: Throwable) { if (error is CancellationException) throw error; fail(error); update { it.copy(initialized = true, busy = false) } }
    }
    private fun requireSession() = state.value.session ?: throw IllegalStateException("请先登录")
    private fun requireInput(valid: Boolean, message: String): Boolean {
        if (!valid) update { it.copy(error = message) }
        return valid
    }
    private fun preferredBinding(profile: MeProfile) = profile.bindings.firstOrNull { it.isDefault } ?: profile.bindings.firstOrNull()
    private fun retainSelection(id: String?, profile: MeProfile) = profile.bindings.firstOrNull { it.id == id }?.id ?: preferredBinding(profile)?.id
    private fun currentSession(fallback: AccountSession?) = repository.latestSession ?: fallback
    private fun currentAccountId() = resolvePrivateAccountId(state.value.profile?.user?.id, state.value.session?.user?.id)
    private fun fail(error: Throwable) = update {
        if (error is AccountApiException && error.statusCode == 401) {
            repository.sessionStore.clear()
            it.copy(session = null, profile = null, selectedBindingId = null, profileAnalysis = null, toolContext = null, error = "登录状态已失效，请重新登录")
        } else it.copy(error = error.message ?: "操作失败")
    }
    private inline fun update(transform: (AccountUiState) -> AccountUiState) { mutableState.value = transform(mutableState.value) }
}

internal fun requireQqLoginConsent(privacyAccepted: Boolean, termsAccepted: Boolean, ageConfirmed: Boolean) {
    require(privacyAccepted && termsAccepted && ageConfirmed) {
        "请逐项同意隐私政策、用户协议，并确认已满 14 周岁"
    }
}

internal enum class QqMobileFlow { LOGIN, LINK }

internal fun qqLoginConsentRequired(flow: QqMobileFlow) = flow == QqMobileFlow.LOGIN

internal fun resolvePrivateAccountId(profileUserId: String?, sessionUserId: String?) =
    profileUserId?.takeIf(String::isNotBlank) ?: sessionUserId?.takeIf(String::isNotBlank)

internal fun deletionCacheMessage(cacheError: Throwable?) = if (cacheError == null) {
    "账号已注销，本机登录凭据与当前账号私有缓存已清除"
} else {
    "账号已注销，但当前账号的部分本机私有缓存可能仍留存；请重试清理或在系统设置中清除应用存储"
}
