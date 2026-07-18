package com.pjsktools.app.feature.account

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** State owner that can be observed by Compose or called directly by a host screen. */
class AccountFeatureController(private val repository: AccountRepository) {
    private val mutex = Mutex()
    private val mutableState = MutableStateFlow(AccountUiState())
    val state: StateFlow<AccountUiState> = mutableState.asStateFlow()

    suspend fun initialize() = mutex.withLock {
        if (state.value.initialized) return
        val stored = repository.sessionStore.load()
        if (stored == null) { update { it.copy(initialized = true) }; return }
        loading {
            val restored = restore(stored)
            val profile = repository.getProfile(restored.accessToken)
            it.copy(initialized = true, session = restored, profile = profile,
                selectedBindingId = preferredBinding(profile)?.id, message = "登录状态已恢复")
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
        loading { it.copy(registrationCode = repository.requestRegistrationCode(email), message = "验证码已请求") }
    }
    suspend fun login(email: String, password: String) = mutex.withLock {
        if (!requireInput(email.isNotBlank() && password.length >= 8, "请输入有效邮箱和至少 8 位密码")) return@withLock
        authenticate { repository.login(email, password) }
    }
    suspend fun register(email: String, password: String, code: String) = mutex.withLock {
        if (!requireInput(email.isNotBlank() && password.length >= 10 && code.matches(Regex("\\d{6}")), "注册需要有效邮箱、至少 10 位密码和 6 位验证码")) return@withLock
        authenticate { repository.register(email, password, code) }
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
            mutableState.value = AccountUiState(initialized = true, message = "已退出登录")
        }
    }
    suspend fun startQqAuth(redirectTo: String? = null): QqAuthStart = mutex.withLock {
        val start = repository.startQqAuth(redirectTo)
        update { it.copy(qqAuthStart = start, message = "请在 QQ 完成授权") }
        start
    }
    suspend fun startMobileQq(): QqAuthStart = mutex.withLock {
        val start = if (state.value.isAuthenticated) repository.startMobileQqLink(requireSession().accessToken) else repository.startMobileQqLogin()
        update { it.copy(qqAuthStart = start, message = "请在 QQ 完成授权") }
        start
    }
    suspend fun completeQqLogin(code: String, state: String) = mutex.withLock {
        authenticate("QQ 登录成功") { repository.completeQqLogin(code, state) }
    }
    suspend fun linkQq(code: String, state: String) = accountWrite("QQ 账号已关联") { repository.linkQq(it, code, state) }
    suspend fun unlinkQq() = accountWrite("QQ 账号已解除关联") { repository.unlinkQq(it) }

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
    suspend fun addBinding(input: NewPlayerBinding) = bindingOperation(null) { token ->
        if (!requireInput(input.playerUid.isNotBlank(), "请输入玩家 UID")) return@bindingOperation
        val created = repository.addBinding(token, input)
        val profile = repository.getProfile(token)
        update { it.copy(profile = profile, selectedBindingId = created.id, message = "玩家 UID 已绑定") }
    }
    suspend fun setDefault(bindingId: String) = bindingOperation(bindingId) { token ->
        repository.setDefaultBinding(token, bindingId)
        replaceProfile(token, bindingId, "已设为默认 UID")
    }
    suspend fun refreshPublicProfile(bindingId: String) = bindingOperation(bindingId) { token ->
        repository.refreshPublicProfile(token, bindingId)
        replaceProfile(token, bindingId, "公开资料已刷新")
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
    suspend fun loadCards() = assetOperation { token, binding -> update { it.copy(assets = it.assets.copy(cardsJson = repository.loadCards(token, binding.id))) } }
    suspend fun saveCards(json: String) = assetOperation { token, binding -> repository.saveCards(token, binding, json); update { it.copy(assets = it.assets.copy(cardsJson = json), message = "持有卡已保存") } }
    suspend fun deleteCard(cardId: String) = assetOperation { token, binding -> repository.deleteCard(token, binding.id, cardId); update { it.copy(assets = it.assets.copy(cardsJson = repository.loadCards(token, binding.id)), message = "持有卡已删除") } }
    suspend fun loadPlayerData(kind: String) = assetOperation { token, binding ->
        val record = repository.loadPlayerData(token, binding.id, kind)
        val data = runCatching { org.json.JSONObject(record).opt("data")?.toString() }.getOrNull() ?: "[]"
        update { it.copy(assets = it.assets.copy(kind = kind, editorJson = data, validationJson = null)) }
    }
    suspend fun validatePlayerData(json: String) = assetOperation { token, binding ->
        val kind = state.value.assets.kind
        val result = repository.validatePlayerData(token, binding, kind, json)
        update { it.copy(assets = it.assets.copy(editorJson = json, validationJson = result)) }
    }
    suspend fun savePlayerData(json: String) = assetOperation { token, binding -> repository.savePlayerData(token, binding, state.value.assets.kind, json); update { it.copy(assets = it.assets.copy(editorJson = json), message = "玩家资产已保存") } }
    suspend fun exportPlayerData() = assetOperation { token, binding ->
        val exported = repository.exportPlayerData(token, binding.id)
        val completeness = repository.fullCompleteness(token, binding.id)
        update { it.copy(assets = it.assets.copy(exportJson = exported, completenessJson = completeness)) }
    }
    suspend fun reviewImport(payload: String) = assetOperation { token, binding -> update { it.copy(assets = it.assets.copy(importPayload = payload, importReviewJson = repository.reviewImport(token, binding.id, payload))) } }
    suspend fun confirmImport() = assetOperation { token, binding -> repository.confirmImport(token, binding.id, state.value.assets.importPayload); update { it.copy(message = "玩家资产导入完成", assets = it.assets.copy(importReviewJson = null)) } }

    private suspend fun restore(stored: StoredAccountSession): AccountSession {
        if (stored.accessToken.isNotBlank()) {
            try {
                val profile = repository.getProfile(stored.accessToken)
                return AccountSession(stored.accessToken, stored.refreshToken, user = profile.user)
            } catch (error: AccountApiException) { if (error.statusCode != 401) throw error }
        }
        return repository.refresh(stored.refreshToken)
    }
    private suspend fun authenticate(message: String = "登录成功", block: suspend () -> AccountSession) = loading {
        val session = block()
        val profile = repository.getProfile(session.accessToken)
        it.copy(initialized = true, session = session, profile = profile,
            selectedBindingId = preferredBinding(profile)?.id, registrationCode = null, message = message)
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
    private suspend fun assetOperation(operation: suspend (String, PlayerBinding) -> Unit) = mutex.withLock {
        val session = requireSession(); val binding = state.value.selectedBinding ?: return@withLock
        update { it.copy(busy = true, error = null, message = null) }
        try { operation(session.accessToken, binding); update { it.copy(session = currentSession(it.session)) } }
        catch (error: Throwable) { if (error is CancellationException) throw error; fail(error) }
        finally { update { it.copy(busy = false) } }
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
    private fun fail(error: Throwable) = update {
        if (error is AccountApiException && error.statusCode == 401) {
            repository.sessionStore.clear()
            it.copy(session = null, profile = null, selectedBindingId = null, profileAnalysis = null, toolContext = null, error = "登录状态已失效，请重新登录")
        } else it.copy(error = error.message ?: "操作失败")
    }
    private inline fun update(transform: (AccountUiState) -> AccountUiState) { mutableState.value = transform(mutableState.value) }
}
