package com.pjsktools.app.feature.account

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.io.IOException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import com.pjsktools.app.BuildConfig
import com.pjsktools.app.core.ApiOrigin

interface AccountSessionStore {
    fun load(): StoredAccountSession?
    fun save(session: StoredAccountSession)
    fun clear()
}
data class StoredAccountSession(val accessToken: String, val refreshToken: String)

class SharedPreferencesAccountSessionStore(context: Context, baseUrl: String) : AccountSessionStore {
    private val prefs = context.applicationContext.getSharedPreferences("pjsktools-account", Context.MODE_PRIVATE)
    private val origin = ApiOrigin.normalize(baseUrl, BuildConfig.DEBUG, BuildConfig.TEMPORARY_HTTP_HOST)
    private val namespace = ApiOrigin.namespace(origin)
    private val accessKey = "$namespace-access-token"
    private val refreshKey = "$namespace-refresh-token"
    private val alias = "pjsktools-account-session-$namespace"
    init { migrateLegacyDefaultOrigin() }
    override fun load(): StoredAccountSession? {
        return try {
            val access = decrypt(prefs.getString(accessKey, null)).orEmpty()
            val refresh = decrypt(prefs.getString(refreshKey, null)).orEmpty()
            if (access.isBlank() && refresh.isBlank()) null else StoredAccountSession(access, refresh)
        } catch (_: Exception) { clear(); null }
    }
    override fun save(session: StoredAccountSession) { prefs.edit().putString(accessKey, encrypt(session.accessToken)).putString(refreshKey, encrypt(session.refreshToken)).apply() }
    override fun clear() { prefs.edit().remove(accessKey).remove(refreshKey).apply() }

    private fun migrateLegacyDefaultOrigin() {
        if (origin != defaultSessionOrigin || prefs.contains(accessKey) || prefs.contains(refreshKey)) return
        val legacyAccess = prefs.getString("access-token", null)
        val legacyRefresh = prefs.getString("refresh-token", null)
        if (legacyAccess == null && legacyRefresh == null) return
        runCatching {
            val access = decrypt(legacyAccess, legacySessionAlias).orEmpty()
            val refresh = decrypt(legacyRefresh, legacySessionAlias).orEmpty()
            prefs.edit()
                .putString(accessKey, encrypt(access))
                .putString(refreshKey, encrypt(refresh))
                .remove("access-token")
                .remove("refresh-token")
                .apply()
        }.onFailure {
            prefs.edit().remove("access-token").remove("refresh-token").apply()
        }
    }
    private fun key(keyAlias: String = alias): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        return Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray()), Base64.NO_WRAP)
    }
    private fun decrypt(value: String?, keyAlias: String = alias): String? {
        if (value.isNullOrBlank()) return null
        val bytes = Base64.decode(value, Base64.NO_WRAP); require(bytes.size > 12)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(keyAlias), GCMParameterSpec(128, bytes.copyOfRange(0, 12))) }
        return cipher.doFinal(bytes.copyOfRange(12, bytes.size)).toString(Charsets.UTF_8)
    }
}

private val defaultSessionOrigin = ApiOrigin.normalize(ApiOrigin.DEBUG_EMULATOR_DEFAULT, true)
private const val legacySessionAlias = "pjsktools-account-session"

class AccountRepository(
    baseUrl: String,
    val sessionStore: AccountSessionStore,
    private val client: OkHttpClient = OkHttpClient()
) {
    private val base = baseUrl.trimEnd('/')
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val refreshMutex = Mutex()
    @Volatile var latestSession: AccountSession? = null
        private set

    suspend fun requestRegistrationCode(email: String) = io {
        post("/api/auth/email-code/start", JSONObject().put("email", email.trim()).put("purpose", "register")).let {
            RegistrationCodeResult(it.optBoolean("sent"), it.longOrNull("expiresIn"), it.longOrNull("resendAfter"), it.stringOrNull("devCode"))
        }
    }
    suspend fun login(email: String, password: String) = io {
        auth(post("/api/auth/login", JSONObject().put("email", email.trim()).put("password", password)))
    }
    suspend fun register(email: String, password: String, code: String) = io {
        auth(post("/api/auth/register", JSONObject().put("email", email.trim()).put("password", password).put("code", code.trim())))
    }
    suspend fun refresh(refreshToken: String) = io {
        try { auth(post("/api/auth/refresh", JSONObject().put("refreshToken", refreshToken))) }
        catch (error: Throwable) { if (error is CancellationException) throw error; sessionStore.clear(); latestSession = null; throw error }
    }
    suspend fun logout(refreshToken: String?) = io {
        try { if (!refreshToken.isNullOrBlank()) post("/api/auth/logout", JSONObject().put("refreshToken", refreshToken)) }
        finally { sessionStore.clear() }
    }
    suspend fun getProfile(accessToken: String) = io { parseProfile(get("/api/me/profile", accessToken)) }
    suspend fun setDefaultBinding(accessToken: String, id: String) = io {
        binding(patch("/api/me/player-bindings/${encode(id)}", JSONObject().put("isDefault", true), accessToken))
    }
    suspend fun deleteBinding(accessToken: String, id: String) = io { delete("/api/me/player-bindings/${encode(id)}", accessToken); Unit }
    suspend fun startQqAuth(redirectTo: String? = null) = io {
        val suffix = redirectTo?.takeIf(String::isNotBlank)?.let { "?redirectTo=${encode(it)}" }.orEmpty()
        val j = get("/api/auth/qq/start$suffix")
        QqAuthStart(j.optString("state"), j.optString("authorizeUrl"), j.longOrNull("expiresIn"))
    }
    suspend fun startMobileQqLogin() = startQqAuth("pjsktools://auth/qq")
    suspend fun startMobileQqLink(token: String) = io {
        val j = get("/api/auth/qq/mobile-link/start", token)
        QqAuthStart(j.optString("state"), j.optString("authorizeUrl"), j.longOrNull("expiresIn"))
    }
    suspend fun exchangeMobileQqLogin(handoff: String) = io {
        auth(post("/api/auth/qq/mobile-exchange", JSONObject().put("handoff", handoff)))
    }
    suspend fun exchangeMobileQqLink(token: String, handoff: String) = io {
        post("/api/auth/qq/mobile-link/exchange", JSONObject().put("handoff", handoff), token)
    }
    suspend fun completeQqLogin(code: String, state: String) = io {
        auth(get("/api/auth/qq/callback?code=${encode(code)}&state=${encode(state)}"))
    }
    suspend fun linkQq(token: String, code: String, state: String) = io {
        post("/api/auth/qq/link", JSONObject().put("code", code).put("state", state), token).toString()
    }
    suspend fun unlinkQq(token: String) = io { delete("/api/auth/qq/link", token); Unit }
    suspend fun profileAnalysis(token: String, id: String) = io {
        val j = get("/api/me/player-bindings/${encode(id)}/profile-analysis", token)
        val p = j.optJSONObject("profileSummary") ?: JSONObject()
        ProfileAnalysis(p.stringOrNull("nickname"), p.intOrNull("rank"), p.stringOrNull("comment"), j.toString())
    }
    suspend fun toolContext(token: String, id: String) = io {
        val j = get("/api/me/player-bindings/${encode(id)}/tool-context", token)
        ToolContext(j.optInt("inventoryCount"), j.optJSONArray("playerDataKinds").strings(),
            j.optJSONArray("toolContextWarnings").strings(), j.optJSONObject("completeness")?.toString() ?: "{}", j.toString())
    }
    suspend fun addFavorite(token: String, input: FavoriteInput) = io { favorite(post("/api/me/favorites", JSONObject()
        .put("type", input.type).put("region", input.region).put("targetId", input.targetId).put("label", input.label), token)) }
    suspend fun deleteFavorite(token: String, id: String) = io { delete("/api/me/favorites/${encode(id)}", token); Unit }
    suspend fun saveScore(token: String, input: ScoreInput) = io {
        val body = JSONObject().put("region", input.region).put("songId", input.songId).put("difficulty", input.difficulty)
            .put("clearStatus", input.clearStatus).put("score", input.score).put("note", input.note)
        input.targetScore?.let { body.put("targetScore", it) }
        score(if (input.id == null) post("/api/me/scores", body, token) else patch("/api/me/scores/${encode(input.id)}", body, token))
    }
    suspend fun deleteScore(token: String, id: String) = io { delete("/api/me/scores/${encode(id)}", token); Unit }
    suspend fun saveDeckConfig(token: String, input: DeckConfigInput) = io {
        val body = JSONObject().put("bindingId", input.bindingId).put("region", input.region).put("name", input.name)
            .put("eventId", input.eventId).put("leaderCardId", input.leaderCardId).put("cardIds", JSONArray(input.cardIds)).put("note", input.note)
        deck(if (input.id == null) post("/api/me/deck-configs", body, token) else patch("/api/me/deck-configs/${encode(input.id)}", body, token))
    }
    suspend fun deleteDeckConfig(token: String, id: String) = io { delete("/api/me/deck-configs/${encode(id)}", token); Unit }
    suspend fun recommendDeck(token: String, binding: PlayerBinding, eventId: String?) = io {
        val body = JSONObject().put("region", binding.region).put("bindingId", binding.id).put("eventId", eventId?.takeIf(String::isNotBlank))
        DeckRecommendation(post("/api/me/tools/deck-recommend", body, token).toString())
    }
    private fun auth(json: JSONObject): AccountSession {
        val access = json.stringOrNull("accessToken") ?: json.stringOrNull("token")
            ?: throw AccountApiException(200, "认证响应缺少 access token")
        val refresh = json.stringOrNull("refreshToken") ?: sessionStore.load()?.refreshToken
            ?: throw AccountApiException(200, "认证响应缺少 refresh token")
        val result = AccountSession(access, refresh, json.longOrNull("expiresIn"), user(json.optJSONObject("user") ?: JSONObject()))
        sessionStore.save(StoredAccountSession(access, refresh))
        latestSession = result
        return result
    }
    private fun parseProfile(json: JSONObject) = MeProfile(
        user = user(json.optJSONObject("user") ?: JSONObject()),
        oauthAccounts = json.optJSONArray("oauthAccounts").objects { OAuthAccount(it.optString("id"), it.optString("provider"), it.stringOrNull("nickname"), it.stringOrNull("avatarUrl"), it.stringOrNull("createdAt")) },
        bindings = json.optJSONArray("bindings").objects(::binding),
        bindingSummaries = json.optJSONArray("bindingSummaries").objects(::summary),
        favorites = json.optJSONArray("favorites").objects(::favorite),
        scores = json.optJSONArray("scores").objects(::score),
        deckConfigs = json.optJSONArray("deckConfigs").objects(::deck)
    )
    private fun user(j: JSONObject) = AccountUser(j.optString("id"), j.stringOrNull("email"), j.stringOrNull("nickname"), j.stringOrNull("avatarUrl"), j.stringOrNull("createdAt"))
    private fun binding(j: JSONObject): PlayerBinding {
        val p = j.optJSONObject("publicProfileSnapshot")
        return PlayerBinding(j.optString("id"), j.optString("region"), j.optString("playerUid"), j.stringOrNull("displayName"),
            j.optBoolean("isDefault"), j.stringOrNull("note"), p?.let { PublicPlayerProfile(it.stringOrNull("nickname") ?: it.stringOrNull("name"), it.intOrNull("rank"), it.stringOrNull("comment") ?: it.stringOrNull("profileWord"), it.stringOrNull("source"), it.toString()) },
            j.stringOrNull("refreshedAt"), j.stringOrNull("createdAt"), j.stringOrNull("updatedAt"))
    }
    private fun summary(j: JSONObject): BindingSummary {
        val id = j.optJSONObject("binding")?.optString("id").orEmpty()
        val completeness = j.optJSONObject("completeness")
        val kinds = completeness?.optJSONArray("uploadedPlayerDataKinds").strings()
        val dataKinds = j.optJSONArray("playerData").objects { it.optString("kind") }
        return BindingSummary(id, j.optInt("inventoryCount"), kinds, dataKinds, completeness?.toString())
    }
    private fun favorite(j: JSONObject) = FavoriteRecord(j.optString("id"), j.optString("type"), j.optString("region"), j.optString("targetId"), j.optString("label"))
    private fun score(j: JSONObject) = ScoreRecord(j.optString("id"), j.optString("region"), j.optString("songId"), j.optString("difficulty"), j.optString("clearStatus"), j.optInt("score"), j.intOrNull("targetScore"), j.stringOrNull("note"))
    private fun deck(j: JSONObject) = DeckConfig(j.optString("id"), j.stringOrNull("bindingId"), j.optString("region"), j.optString("name"), j.stringOrNull("eventId"), j.stringOrNull("leaderCardId"), j.optJSONArray("cardIds").strings(), j.stringOrNull("note"))

    private suspend fun get(path: String, token: String? = null) = execute(builder(path, token).get().build())
    private suspend fun post(path: String, body: JSONObject, token: String? = null) = execute(builder(path, token).post(body.toString().toRequestBody(jsonType)).build())
    private suspend fun patch(path: String, body: JSONObject, token: String) = execute(builder(path, token).patch(body.toString().toRequestBody(jsonType)).build())
    private suspend fun delete(path: String, token: String) = execute(builder(path, token).delete().build())
    private fun builder(path: String, token: String?): Request.Builder = Request.Builder().url("$base$path").header("Accept", "application/json")
        .also { if (!token.isNullOrBlank()) it.header("Authorization", "Bearer $token") }
    private suspend fun execute(request: Request, allowRefresh: Boolean = request.header("Authorization") != null): JSONObject =
        executeRaw(request, allowRefresh).takeIf(String::isNotBlank)?.let(::JSONObject) ?: JSONObject()
    private suspend fun executeRaw(request: Request, allowRefresh: Boolean = request.header("Authorization") != null): String {
        val (code, body) = awaitResponse(request)
        if (code in 200..299) return body
        if (code == 401 && allowRefresh) return refreshAndRetryRaw(request)
        val message = runCatching { JSONObject(body).optString("message") }.getOrNull().orEmpty()
        throw AccountApiException(code, message.ifBlank { body.ifBlank { "API 请求失败（HTTP $code）" } })
    }
    private suspend fun refreshAndRetryRaw(original: Request): String = refreshMutex.withLock {
        val stored = sessionStore.load() ?: throw AccountApiException(401, "登录状态已失效")
        val sent = original.header("Authorization")?.removePrefix("Bearer ")
        if (stored.accessToken.isNotBlank() && stored.accessToken != sent)
            return executeRaw(original.newBuilder().header("Authorization", "Bearer ${stored.accessToken}").build(), false)
        try {
            val request = builder("/api/auth/refresh", null).post(JSONObject().put("refreshToken", stored.refreshToken).toString().toRequestBody(jsonType)).build()
            val refreshed = auth(execute(request, false))
            return executeRaw(original.newBuilder().header("Authorization", "Bearer ${refreshed.accessToken}").build(), false)
        } catch (error: Throwable) { if (error is CancellationException) throw error; sessionStore.clear(); latestSession = null; throw error }
    }
    private suspend fun awaitResponse(request: Request): Pair<Int, String> = suspendCancellableCoroutine { continuation ->
        val call = client.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, error: IOException) {
                if (continuation.isActive) continuation.resumeWithException(error)
            }
            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val result = it.code to it.body?.string().orEmpty()
                    if (continuation.isActive) continuation.resume(result)
                }
            }
        })
    }
    private fun encode(value: String) = java.net.URLEncoder.encode(value, "UTF-8")
    private suspend fun <T> io(block: suspend () -> T): T = withContext(Dispatchers.IO) { block() }
}

private fun JSONObject.stringOrNull(key: String) = if (!has(key) || isNull(key)) null else optString(key).takeIf { it.isNotBlank() && it != "null" }
private fun JSONObject.longOrNull(key: String) = if (!has(key) || isNull(key)) null else optLong(key)
private fun JSONObject.intOrNull(key: String) = if (!has(key) || isNull(key)) null else optInt(key)
private fun <T> JSONArray?.objects(transform: (JSONObject) -> T) = if (this == null) emptyList() else List(length()) { transform(getJSONObject(it)) }
private fun JSONArray?.strings() = if (this == null) emptyList() else List(length()) { optString(it) }.filter(String::isNotBlank)
