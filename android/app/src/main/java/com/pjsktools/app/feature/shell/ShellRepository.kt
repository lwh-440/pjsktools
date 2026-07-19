package com.pjsktools.app.feature.shell

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Cache
import okhttp3.CacheControl
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.io.File
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit
import java.util.concurrent.ConcurrentHashMap
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class ShellRepository(
    baseUrl: String,
    private val cachePolicy: ShellCachePolicy = ShellCachePolicy.NETWORK_FIRST,
    cacheDirectory: File? = null,
    client: OkHttpClient? = null
) {
    private val client: OkHttpClient = client ?: OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .apply { cacheDirectory?.let { cache(ShellHttpCacheRegistry.cache(File(it, "shell-http"))) } }
        .build()
    private val base = baseUrl.trimEnd('/').also(::requireHttpUrl)
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    suspend fun loadHome(region: String): HomeDashboard = coroutineScope {
        requireRegion(region)
        val regionsRequest = async { resultOf { getArray("/api/regions").objects(::parseRegion) } }
        val songsRequest = async { resultOf { getArray("/api/master/$region/songs").length() } }
        val cardsRequest = async { resultOf { getArray("/api/master/$region/cards").length() } }
        val eventRequest = async { resultOf { parseEvent(getObject("/api/events/$region/current")) } }
        val liveRequest = async { resultOf { getObject("/api/events/$region/live-ranking") } }
        val warnings = mutableListOf<String>()
        fun <T> Result<T>.value(label: String, fallback: T): T = getOrElse {
            warnings += "$label：${it.userMessage()}"
            fallback
        }
        val regions = regionsRequest.await().value("区服列表加载失败", emptyList())
        val songs = songsRequest.await().value("歌曲数量加载失败", 0)
        val cards = cardsRequest.await().value("卡牌数量加载失败", 0)
        var event = eventRequest.await().value<ShellEvent?>("当前活动加载失败", null)
        val live = liveRequest.await().value<JSONObject?>("实时榜单加载失败", null)
        if (event == null) live?.optJSONObject("currentEvent")?.let { event = parseEvent(it) }
        HomeDashboard(
            regions = regions,
            songCount = songs,
            cardCount = cards,
            currentEvent = event,
            topRanks = live?.optJSONArray("top100").objects(::parseRanking).orEmpty().sortedBy { it.rank }.take(3),
            updatedAt = live.stringOrNull("updatedAt") ?: live?.optJSONObject("sourceHealth").stringOrNull("latestUpdatedAt"),
            warnings = (warnings + live?.optJSONArray("warnings").strings()).distinct()
        )
    }

    suspend fun publicProfile(region: String, userId: String, refresh: Boolean = false): PublicProfile {
        requireRegion(region)
        require(userId.isNotBlank()) { "请输入玩家 UID" }
        val encoded = encode(userId.trim())
        val json = if (refresh) postObject("/api/players/$region/$encoded/refresh", JSONObject())
        else getObject("/api/players/$region/$encoded/profile")
        return PublicProfile(
            region = json.optString("region", region),
            userId = json.optString("userId", userId.trim()),
            nickname = json.optString("nickname").ifBlank { "未命名玩家" },
            rank = json.intOrNull("rank"),
            comment = json.stringOrNull("comment"),
            titles = json.optJSONArray("titles").strings(),
            source = json.stringOrNull("source"),
            rawJson = json.toString(2)
        )
    }

    suspend fun shareCard(region: String, type: String, id: String): ShareCard {
        requireRegion(region)
        require(type in setOf("profile", "score", "event")) { "不支持的分享卡类型" }
        require(id.isNotBlank()) { "请输入分享对象 ID" }
        val url = base.toHttpUrl().newBuilder()
            .addPathSegments("api/share/cards")
            .addPathSegment(type)
            .addPathSegment(id.trim())
            .addQueryParameter("region", region)
            .build()
        val json = JSONObject(request(url.toString()))
        val imageUrl = json.optString("imageUrl").takeIf(String::isNotBlank)
            ?: error("服务端未返回分享卡图片地址")
        return ShareCard(
            type = json.optString("type", type), id = json.optString("id", id.trim()),
            title = json.optString("title", "分享卡"), summary = json.stringOrNull("summary"), imageUrl = imageUrl
        )
    }

    suspend fun compareDecks(
        region: String,
        form: DeckCompareForm,
        candidates: List<DeckCompareCandidateDraft>,
        account: DeckCompareAccountContext?
    ): DeckCompareResult {
        requireRegion(region)
        require(candidates.size in 2..5) { "比较方案必须为 2-5 个" }
        require(form.musicId.isNotBlank()) { "请输入歌曲 ID" }
        val usesSaved = candidates.any { it.mode == DeckCandidateMode.SAVED }
        if (usesSaved) require(account != null) { "保存卡组只能在登录并选择绑定 UID 后使用" }
        if (usesSaved) require(account?.region == region) { "保存卡组绑定区服必须与当前比较区服一致" }
        val body = JSONObject()
            .put("region", region).put("musicId", form.musicId.trim()).put("difficulty", form.difficulty)
            .put("liveType", form.liveType).put("scoreMode", form.scoreMode)
            .put("boost", form.boost.number("火量", 0.0, 10.0))
            .put("eventBonusPercent", form.eventBonusPercent.number("活动加成"))
            .put("skill15Strategy", form.skill15Strategy).put("skill6Mode", form.skill6Mode)
            .put("teammates", JSONArray(List(4) { JSONObject()
                .put("power", form.teammatePower.number("队友综合力", 0.000001))
                .put("effectiveness", form.teammateEffectiveness.number("队友技能值", 0.0)) }))
            .put("candidates", JSONArray(candidates.map(::candidateJson)))
        if (form.scoreMode == "exact") {
            val skills = form.exactSkills.split(Regex("[,\\s]+"))
                .filter(String::isNotBlank).map { it.toDoubleOrNull() ?: error("Exact 技能值包含非数字内容") }
            require(skills.size in 1..6) { "Exact 模式需要 1-6 个技能值" }
            body.put("skills", JSONArray(skills))
        }
        val token = if (usesSaved) account?.accessToken else null
        if (usesSaved) body.put("bindingId", account?.bindingId)
        val path = if (usesSaved) "/api/me/tools/deck-compare" else "/api/tools/deck-compare"
        return parseDeckResult(postObject(path, body, token))
    }

    private fun candidateJson(candidate: DeckCompareCandidateDraft): JSONObject {
        val json = JSONObject().put("id", candidate.id).put("name", candidate.name.ifBlank { candidate.id })
        when (candidate.mode) {
            DeckCandidateMode.MANUAL -> json
                .put("power", candidate.power.number("${candidate.name} 综合力", 0.000001))
                .put("effectiveness", candidate.effectiveness.number("${candidate.name} 技能值", 0.0))
            DeckCandidateMode.CARDS -> {
                val ids = candidate.cardIds.split(Regex("[,\\s]+" )).filter(String::isNotBlank)
                require(ids.size in 1..5) { "${candidate.name} 需要 1-5 个 cardId" }
                json.put("cardIds", JSONArray(ids))
            }
            DeckCandidateMode.SAVED -> {
                require(candidate.deckConfigId.isNotBlank()) { "${candidate.name} 未选择保存卡组" }
                json.put("deckConfigId", candidate.deckConfigId)
            }
        }
        return json
    }

    private fun parseDeckResult(json: JSONObject): DeckCompareResult {
        val comparisons = json.optJSONArray("comparisons").objects { item ->
            DeckComparison(
                id = item.optString("id"), name = item.optString("name", item.optString("id")),
                source = item.stringOrNull("source"), power = item.doubleOrNull("power"),
                effectiveness = item.doubleOrNull("effectiveness"), score = item.doubleOrNull("score"),
                eventPoint = item.doubleOrNull("eventPoint"),
                status = item.optJSONObject("referenceParity").stringOrNull("status") ?: item.stringOrNull("status"),
                missingFields = item.optJSONArray("missingFields").strings()
            )
        }
        val exact = json.optJSONObject("liveExactTrace") ?: comparisons.firstOrNull()?.let {
            json.optJSONArray("comparisons")?.optJSONObject(0)?.optJSONObject("liveExactTrace")
        }
        val musicTrace = json.optJSONObject("musicMetaTrace")
        val trace = listOfNotNull(
            exact?.let { "Exact notes" to (it.optJSONObject("noteScoreSummary")?.opt("noteCount") ?: it.opt("noteCount") ?: "-").toString() },
            exact?.let { "Exact active bonus" to (it.opt("activeBonus") ?: "-").toString() },
            musicTrace?.let { "Music meta" to (it.stringOrNull("status") ?: it.stringOrNull("source") ?: "available") }
        )
        return DeckCompareResult(
            formulaId = json.stringOrNull("referenceFormulaId"), scoreMode = json.stringOrNull("scoreMode"),
            multiLiveVersion = json.stringOrNull("multiLiveVersion"), liveExactVersion = json.stringOrNull("liveExactVersion"),
            winnerByScore = json.optJSONObject("winnerByScore").stringOrNull("id"),
            winnerByEventPoint = json.optJSONObject("winnerByEventPoint").stringOrNull("id"),
            scoreDelta = json.doubleOrNull("scoreDelta"), eventPointDelta = json.doubleOrNull("eventPointDelta"),
            comparisons = comparisons, missingFields = json.optJSONArray("missingFields").strings(),
            estimatedFields = json.optJSONArray("estimatedFieldsUsed").strings(), traceSummary = trace,
            rawJson = json.toString(2)
        )
    }

    private suspend fun getObject(path: String) = JSONObject(request(path))
    private suspend fun getArray(path: String) = JSONArray(request(path))
    private suspend fun postObject(path: String, body: JSONObject, token: String? = null) = JSONObject(request(path, body.toString(), token))

    private suspend fun request(path: String, body: String? = null, token: String? = null): String {
        val url = if (path.startsWith("http://") || path.startsWith("https://")) path else "$base$path"
        val builder = Request.Builder().url(url).header("Accept", "application/json")
        token?.takeIf(String::isNotBlank)?.let { builder.header("Authorization", "Bearer $it") }
        if (body != null) builder.post(body.toRequestBody(jsonType))
        when (cachePolicy) {
            ShellCachePolicy.NETWORK_ONLY -> builder.cacheControl(CacheControl.Builder().noCache().noStore().build())
            ShellCachePolicy.CACHE_THEN_REFRESH -> builder.cacheControl(CacheControl.Builder().maxStale(10, TimeUnit.MINUTES).build())
            ShellCachePolicy.NETWORK_FIRST -> Unit
        }
        val original = builder.build()
        val response = try {
            client.newCall(original).await()
        } catch (error: IOException) {
            if (cachePolicy == ShellCachePolicy.NETWORK_ONLY) throw error
            client.newCall(original.newBuilder().cacheControl(CacheControl.FORCE_CACHE).build()).await()
        }
        if (!response.successful) {
            val detail = runCatching { JSONObject(response.body).optString("message") }.getOrNull()
                ?.takeIf(String::isNotBlank) ?: response.body.take(300)
            throw ShellApiException(response.code, detail)
        }
        return response.body
    }
}

fun clearShellHttpCaches(cacheDir: File, region: String?): CacheClearResult =
    ShellHttpCacheRegistry.clear(cacheDir, region)

private object ShellHttpCacheRegistry {
    private val caches = ConcurrentHashMap<String, Cache>()

    fun cache(directory: File): Cache {
        val canonical = directory.canonicalFile
        return caches.computeIfAbsent(canonical.path) { Cache(canonical, 20L * 1024L * 1024L) }
    }

    fun clear(cacheDir: File, region: String?): CacheClearResult {
        val shellRoot = cacheDir.resolve("shell").canonicalFile
        val targetRoot = if (region == null) shellRoot else {
            require(region in setOf("jp", "en", "tw", "kr", "cn")) { "不支持的区服：$region" }
            shellRoot.resolve(region).resolve("shell-http").canonicalFile
        }
        require(targetRoot.path == shellRoot.path || targetRoot.path.startsWith(shellRoot.path + File.separator)) {
            "缓存目录超出 Shell 范围"
        }
        val before = targetRoot.directorySize()
        val matching = caches.filterKeys { path ->
            path == targetRoot.path || path.startsWith(targetRoot.path + File.separator)
        }.values
        val evictFailures = matching.count { runCatching { it.evictAll() }.isFailure }
        val activePaths = matching.map { it.directory.canonicalPath }.toSet()
        val inactiveDirectories = if (!targetRoot.exists()) emptyList() else targetRoot.walkTopDown()
            .filter { it.isDirectory && it.name == "shell-http" && it.canonicalPath !in activePaths }
            .toList()
        val deleteFailures = inactiveDirectories.count { !it.deleteRecursively() }
        val remaining = shellRoot.directorySize()
        val targetRemaining = targetRoot.directorySize()
        val scope = region?.uppercase()?.let { "$it 区服" } ?: "全部区服及共享"
        val success = evictFailures == 0 && deleteFailures == 0
        val released = (before - targetRemaining).coerceAtLeast(0)
        val message = if (success) {
            "已清除$scope Shell HTTP 缓存，释放 ${formatCacheBytes(released)}；剩余 ${formatCacheBytes(remaining)}。"
        } else {
            "${scope}缓存仅部分清除，释放 ${formatCacheBytes(released)}；$evictFailures 个活跃缓存清空失败、$deleteFailures 个离线目录删除失败，Shell 总剩余 ${formatCacheBytes(remaining)}。"
        }
        return CacheClearResult(message, formatCacheBytes(remaining))
    }
}

private fun File.directorySize(): Long = if (!exists()) 0L else walkTopDown().filter { it.isFile }.sumOf { it.length() }
private fun formatCacheBytes(value: Long): String = when {
    value >= 1024L * 1024L -> "%.1f MB".format(value / 1024.0 / 1024.0)
    value >= 1024L -> "%.1f KB".format(value / 1024.0)
    else -> "$value B"
}

class ShellApiException(val statusCode: Int, detail: String) :
    IllegalStateException("API $statusCode${detail.takeIf(String::isNotBlank)?.let { "：$it" }.orEmpty()}")

private data class HttpResponse(val code: Int, val successful: Boolean, val body: String)
private suspend fun Call.await(): HttpResponse = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (continuation.isActive) continuation.resumeWithException(e)
        }
        override fun onResponse(call: Call, response: okhttp3.Response) {
            response.use {
                if (continuation.isActive) continuation.resume(HttpResponse(response.code, response.isSuccessful, response.body?.string().orEmpty()))
            }
        }
    })
}

private fun requireHttpUrl(value: String) = require(value.startsWith("http://") || value.startsWith("https://")) { "API Base URL 必须为 http(s) 地址" }
private fun requireRegion(region: String) = require(region in setOf("jp", "en", "tw", "kr", "cn")) { "不支持的区服：$region" }
private fun parseRegion(json: JSONObject) = ShellRegion(json.optString("id"), json.optString("name", json.optString("id").uppercase()))
private fun parseEvent(json: JSONObject) = ShellEvent(json.optString("id"), json.optString("name", "未命名活动"), json.stringOrNull("startAt"), json.stringOrNull("endAt"))
private fun parseRanking(json: JSONObject) = ShellRanking(json.optInt("rank"), json.stringOrNull("userId"), json.stringOrNull("playerName") ?: json.stringOrNull("name") ?: "Player", json.optLong("score"))
private fun encode(value: String) = URLEncoder.encode(value, StandardCharsets.UTF_8.toString())
private fun String.number(label: String, min: Double? = null, max: Double? = null): Double {
    val value = trim().toDoubleOrNull() ?: error("$label 不是有效数字")
    if (min != null) require(value >= min) { "$label 不能小于 $min" }
    if (max != null) require(value <= max) { "$label 不能大于 $max" }
    return value
}
private fun JSONObject?.stringOrNull(key: String): String? = this?.takeIf { it.has(key) && !it.isNull(key) }?.optString(key)?.takeIf(String::isNotBlank)
private fun JSONObject.intOrNull(key: String): Int? = if (has(key) && !isNull(key)) optInt(key) else null
private fun JSONObject.doubleOrNull(key: String): Double? = if (has(key) && !isNull(key)) optDouble(key).takeIf(Double::isFinite) else null
private fun JSONArray?.strings(): List<String> = if (this == null) emptyList() else List(length()) { optString(it) }.filter(String::isNotBlank)
private fun <T> JSONArray?.objects(transform: (JSONObject) -> T): List<T> = if (this == null) emptyList() else List(length()) { transform(getJSONObject(it)) }
private suspend inline fun <T> resultOf(crossinline block: suspend () -> T): Result<T> = try { Result.success(block()) } catch (e: CancellationException) { throw e } catch (e: Throwable) { Result.failure(e) }
private fun Throwable.userMessage() = message ?: this::class.java.simpleName
