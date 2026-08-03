package com.pjsktools.app.feature.events

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class EventsToolsRepository(
    baseUrl: String,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .build()
) {
    private val apiBaseUrl = baseUrl.trimEnd('/')
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    init {
        require(apiBaseUrl.startsWith("http://") || apiBaseUrl.startsWith("https://")) {
            "baseUrl 必须是 http(s) 地址"
        }
    }

    suspend fun loadDashboard(region: String, windowHours: Int? = null): EventsDashboard = coroutineScope {
        requireRegion(region)
        val warnings = mutableListOf<String>()
        val eventsRequest = async { catchingSuspend { getArray("/api/events/$region").mapObjects(::parseEvent) } }
        val currentRequest = async { catchingSuspend { parseEvent(getObject("/api/events/$region/current")) } }
        val liveRequest = async { catchingSuspend { getObject("/api/events/$region/live-ranking") } }

        val events = eventsRequest.await().getOrElse {
            warnings += "往期活动加载失败：${it.userMessage()}"
            emptyList()
        }
        var current = currentRequest.await().getOrElse {
            warnings += "当前活动加载失败：${it.userMessage()}"
            null
        }
        val live = liveRequest.await().getOrElse {
            warnings += "实时榜单加载失败：${it.userMessage()}"
            null
        }

        live?.optJSONObject("currentEvent")?.let { current = parseEvent(it) }
        val eventId = current?.id?.takeUnless { it == "none" || it == "unknown" }
        var top100 = live?.optJSONArray("top100")?.mapObjects(::parseRanking).orEmpty()
        var borders = live?.optJSONArray("borderLines")?.mapObjects(::parseBorder).orEmpty()

        if (live == null && eventId != null) {
            val topRequest = async { catchingSuspend { getArray("/api/events/$region/$eventId/ranking-top100").mapObjects(::parseRanking) } }
            val borderRequest = async { catchingSuspend { getArray("/api/events/$region/$eventId/ranking-border").mapObjects(::parseBorder) } }
            top100 = topRequest.await().getOrElse {
                warnings += "Top 100 加载失败：${it.userMessage()}"
                emptyList()
            }
            borders = borderRequest.await().getOrElse {
                warnings += "边线加载失败：${it.userMessage()}"
                emptyList()
            }
        }

        val insights = if (eventId == null) null else loadInsights(region, eventId, windowHours, warnings)
        warnings += live?.optJSONArray("warnings").stringList()
        EventsDashboard(
            currentEvent = current,
            events = events.sortedByDescending { it.startAt },
            top100 = top100.sortedBy { it.rank },
            borders = borders.sortedBy { it.rank },
            updatedAt = live.optStringOrNull("updatedAt")
                ?: live?.optJSONObject("sourceHealth").optStringOrNull("latestUpdatedAt"),
            sourceHealth = live?.optJSONObject("sourceHealth")?.let(::parseSourceHealth),
            insights = insights,
            warnings = warnings.distinct()
        )
    }

    suspend fun scoreControl(region: String, input: ScoreControlInput): ToolResult {
        requireRegion(region)
        val payload = JSONObject()
            .put("region", region)
            .put("currentPt", input.currentPt)
            .put("targetPt", input.targetPt)
            .put("remainingMinutes", input.remainingMinutes)
            .put("ptPerRun", input.ptPerRun)
        input.availableRuns?.let { payload.put("availableRuns", it) }
        input.eventId?.let { payload.put("eventId", it) }
        input.targetRank?.let { payload.put("targetRank", it) }
        val json = postObject("/api/tools/score-control", payload)
        return ToolResult(
            title = "控分计算结果",
            highlights = listOf(
                "剩余 PT" to json.numberText("remainingPt"),
                "每局 PT" to json.numberText("adjustedPtPerRun"),
                "所需局数" to json.numberText("requiredRuns"),
                "每小时 PT" to json.numberText("requiredPtPerHour"),
                "可达成" to if (json.optBoolean("feasible", false)) "是" else "否"
            ),
            warnings = json.optJSONArray("warnings").stringList(),
            missingFields = json.optJSONObject("eventPointEstimate")?.optJSONArray("missingFields").stringList(),
            rawJson = json.toString(2)
        )
    }

    suspend fun recommendDeck(region: String, input: DeckRecommendInput): ToolResult {
        requireRegion(region)
        val payload = JSONObject()
            .put("region", region)
            .put("ownedCardIds", JSONArray(input.ownedCardIds))
            .put("target", input.target)
            .put("limit", input.limit)
        input.eventId?.let { payload.put("eventId", it) }
        val json = postObject("/api/tools/deck-recommend", payload)
        val firstDeck = json.optJSONArray("recommendedDecks")?.optJSONObject(0)
        val firstCards = firstDeck?.optJSONArray("cards") ?: json.optJSONArray("recommendedCards")
        val cardIds = firstCards?.let(::extractCardIds).orEmpty()
        return ToolResult(
            title = "组卡推荐结果",
            highlights = listOf(
                "推荐卡组" to cardIds.ifEmpty { listOf("无可用推荐") }.joinToString(" / "),
                "候选卡数" to json.numberText("candidateCount"),
                "搜索方式" to (json.optStringOrNull("searchMode") ?: "-"),
                "超时" to if (json.optBoolean("timedOut", false)) "是" else "否",
                "公式模式" to (json.optStringOrNull("formulaMode") ?: "-")
            ),
            warnings = listOfNotNull(json.optStringOrNull("note")),
            missingFields = json.optJSONArray("missingFields").stringList(),
            rawJson = json.toString(2)
        )
    }

    suspend fun normalEventPlan(region: String, input: NormalEventPlanInput): ToolResult {
        requireRegion(region)
        val payload = JSONObject()
            .put("region", region)
            .put("difficulty", input.difficulty)
            .put("currentPt", input.currentPt)
            .put("targetPt", input.targetPt)
            .put("remainingMinutes", input.remainingMinutes)
            .put("boost", input.boost)
            .put("ownedCardIds", JSONArray(input.ownedCardIds))
            .put("limit", input.limit)
        input.eventId?.let { payload.put("eventId", it) }
        input.musicId?.takeIf { it.isNotBlank() }?.let { payload.put("musicId", it) }
        val json = postObject("/api/tools/normal-event-plan", payload)
        val control = json.optJSONObject("scoreControl")
        val eventPoint = json.optJSONObject("eventPoint")
        val sections = json.optJSONObject("sections")
        val readyCount = sections?.keys()?.asSequence()?.count {
            sections.optJSONObject(it)?.optBoolean("ready") == true
        } ?: 0
        return ToolResult(
            title = "普通活动规划结果",
            highlights = listOf(
                "目标 PT" to json.numberText("targetPt"),
                "推导活动加成" to json.numberText("derivedEventBonusPercent"),
                "预计每局 PT" to (eventPoint?.numberText("estimatedPt") ?: "-"),
                "所需局数" to (control?.numberText("requiredRuns") ?: "-"),
                "就绪环节" to "$readyCount / ${sections?.length() ?: 0}"
            ),
            warnings = json.optJSONArray("warnings").stringList(),
            missingFields = json.optJSONArray("missingFields").stringList(),
            rawJson = json.toString(2)
        )
    }

    suspend fun rankingPlayer(region: String, eventId: String, rank: Int): RankingPlayerDetail {
        requireRegion(region)
        require(rank > 0) { "排名必须大于 0" }
        val json = getObject("/api/events/$region/$eventId/ranking-player/$rank")
        return RankingPlayerDetail(
            row = parseRanking(json),
            profileWord = json.optStringOrNull("profileWord"),
            profileHonorCount = json.optJSONArray("profileHonors")?.length() ?: 0,
            intervalSeconds = json.optNullableInt("intervalSeconds"),
            inTop100Range = json.optBoolean("inTop100Range", false),
            rankHourlyGrowth = json.optNullableDouble("rankHourlyGrowth"),
            playerTrace = json.optJSONArray("playerTrace")?.mapObjects(::parseTracePoint).orEmpty(),
            rankTrace = json.optJSONArray("rankTrace")?.mapObjects(::parseTracePoint).orEmpty(),
            churnStatus = json.optStringOrNull("churnStatus"),
            churn1h = json.optNullableInt("churn1h"),
            churn20min = json.optNullableInt("churn20min"),
            churn48h = json.optNullableInt("churn48h"),
            observedPtUpdates = json.optNullableInt("observedPtUpdates"),
            churnUpdatedAt = json.optStringOrNull("churnUpdatedAt")
        )
    }

    suspend fun eventFull(region: String, eventId: String): FullEventDetail {
        requireRegion(region)
        val json = getObject("/api/master/$region/events/$eventId/full")
        val event = parseEvent(json.getJSONObject("event"))
        val assets = json.optJSONObject("assets")
        val relations = json.optJSONObject("relations") ?: JSONObject()
        return FullEventDetail(
            event = event,
            bannerCandidates = assets.assetCandidates("bannerUrl", "imageCandidates"),
            relatedSongs = relations.optJSONArray("relatedSongs")?.mapObjects { parseRelated(it, EventRelatedKind.SONG) }.orEmpty(),
            relatedCards = relations.optJSONArray("relatedCards")?.mapObjects { parseRelated(it, EventRelatedKind.CARD) }.orEmpty(),
            relatedGachas = relations.optJSONArray("relatedGachas")?.mapObjects { parseRelated(it, EventRelatedKind.GACHA) }.orEmpty()
        )
    }

    suspend fun refreshRanking(region: String, eventId: String) {
        requireRegion(region)
        postObject("/api/events/$region/$eventId/refresh", JSONObject())
    }

    suspend fun eventPoint(
        region: String,
        eventId: String?,
        musicId: String?,
        difficulty: String,
        currentPt: Long,
        targetPt: Long,
        account: EventsAccountContext? = null
    ): ToolResult {
        val payload = toolPayload(region, eventId, account)
            .put("difficulty", difficulty).put("currentPt", currentPt).put("targetPt", targetPt)
        musicId?.takeIf(String::isNotBlank)?.let { payload.put("musicId", it) }
        val json = postTool("event-point-calc", payload, account)
        return diagnosticToolResult("活动 PT 计算结果", json, listOf(
            "预计每局 PT" to json.numberText("estimatedPt"),
            "当前 PT" to currentPt.toString(), "目标 PT" to targetPt.toString(),
            "公式版本" to (json.optStringOrNull("formulaVersion") ?: json.optStringOrNull("sharedFormulaVersion") ?: "-")
        ))
    }

    suspend fun musicRecommend(
        region: String, eventId: String?, currentPt: Long, targetPt: Long,
        account: EventsAccountContext? = null
    ): ToolResult {
        val payload = toolPayload(region, eventId, account)
            .put("currentPt", currentPt).put("targetPt", targetPt).put("limit", 10)
        val json = postTool("music-recommend", payload, account)
        val recommendations = json.optJSONArray("recommendations")
        val first = recommendations?.optJSONObject(0)
        return diagnosticToolResult("歌曲推荐结果", json, listOf(
            "推荐数量" to (recommendations?.length() ?: 0).toString(),
            "首选歌曲" to (first?.optStringOrNull("title") ?: first?.optStringOrNull("musicId") ?: "-"),
            "预计 PT" to (first?.numberText("estimatedPt") ?: "-")
        ))
    }

    suspend fun areaItemRecommend(
        region: String, cardIds: List<String>, account: EventsAccountContext? = null
    ): ToolResult {
        val payload = toolPayload(region, null, account).put("limit", 20)
        if (account == null) payload.put("cardIds", JSONArray(cardIds))
        val json = postTool("area-item-recommend", payload, account)
        val recommendations = json.optJSONArray("recommendations")
        val first = recommendations?.optJSONObject(0)
        return diagnosticToolResult("区域道具推荐结果", json, listOf(
            "建议数量" to (recommendations?.length() ?: 0).toString(),
            "首选道具" to (first?.optStringOrNull("name") ?: first?.optStringOrNull("areaItemId") ?: "-"),
            "综合力提升" to (first?.numberText("powerGain") ?: "-")
        ))
    }

    suspend fun mysekaiRecommend(region: String, eventId: String?, account: EventsAccountContext): ToolResult {
        val json = postTool("mysekai-calc", toolPayload(region, eventId, account), account)
        val cards = json.optJSONArray("recommendedCards") ?: json.optJSONObject("deck")?.optJSONArray("cards")
        return diagnosticToolResult("MySekai 计算结果", json, listOf(
            "推荐卡数" to (cards?.length() ?: 0).toString(),
            "预计 PT" to json.numberText("estimatedPt"),
            "公式版本" to (json.optStringOrNull("formulaVersion") ?: "-")
        ))
    }

    suspend fun boundNormalEventPlan(account: EventsAccountContext, input: NormalEventPlanInput): ToolResult {
        val payload = toolPayload(account.region, input.eventId, account)
            .put("difficulty", input.difficulty).put("currentPt", input.currentPt).put("targetPt", input.targetPt)
            .put("remainingMinutes", input.remainingMinutes).put("boost", input.boost).put("limit", input.limit)
        input.musicId?.takeIf(String::isNotBlank)?.let { payload.put("musicId", it) }
        val json = postTool("normal-event-plan", payload, account)
        return diagnosticToolResult("绑定数据普通活动规划", json, listOf(
            "目标 PT" to json.numberText("targetPt"),
            "推导活动加成" to json.numberText("derivedEventBonusPercent"),
            "所需局数" to (json.optJSONObject("scoreControl")?.numberText("requiredRuns") ?: "-")
        ))
    }

    private fun toolPayload(region: String, eventId: String?, account: EventsAccountContext?): JSONObject {
        requireRegion(region)
        if (account != null) require(account.region == region) { "绑定区服与当前工具区服不一致" }
        return JSONObject().put("region", region).apply {
            eventId?.takeUnless { it == "none" || it == "unknown" }?.let { put("eventId", it) }
            account?.let { put("bindingId", it.bindingId) }
        }
    }

    private suspend fun postTool(name: String, payload: JSONObject, account: EventsAccountContext?): JSONObject =
        postObject(if (account == null) "/api/tools/$name" else "/api/me/tools/$name", payload, account?.token)

    private fun diagnosticToolResult(title: String, json: JSONObject, highlights: List<Pair<String, String>>) = ToolResult(
        title = title,
        highlights = highlights,
        warnings = json.optJSONArray("warnings").stringList(),
        missingFields = collectDiagnosticStrings(json, "missingFields"),
        estimatedFields = collectDiagnosticStrings(json, "estimatedFieldsUsed"),
        trace = collectDiagnosticStrings(json, "calculationTrace") + listOfNotNull(json.optStringOrNull("formulaVersion")),
        readiness = json.optJSONObject("sections")?.keys()?.asSequence()?.map { key ->
            val section = json.optJSONObject("sections")?.optJSONObject(key)
            "$key: ${if (section?.optBoolean("ready") == true) "ready" else "missing-data"}"
        }?.toList().orEmpty(),
        rawJson = json.toString(2)
    )

    private suspend fun loadInsights(
        region: String,
        eventId: String,
        windowHours: Int?,
        dashboardWarnings: MutableList<String>
    ): RankingInsights = coroutineScope {
        val windowQuery = windowHours?.let { "&windowHours=$it" }.orEmpty()
        val forecastQuery = windowHours?.let { "?windowHours=$it" }.orEmpty()
        val forecastRequest = async { catchingSuspend { getObject("/api/events/$region/$eventId/ranking-forecast$forecastQuery") } }
        val summaryRequest = async { catchingSuspend { getObject("/api/events/$region/$eventId/ranking-history/summary?sampleType=border$windowQuery") } }
        val historyRequest = async { catchingSuspend { getObject("/api/events/$region/$eventId/ranking-history?sampleType=border&limit=5000$windowQuery") } }
        val forecast = forecastRequest.await().getOrElse {
            dashboardWarnings += "预测线加载失败：${it.userMessage()}"
            JSONObject()
        }
        val summary = summaryRequest.await().getOrElse {
            dashboardWarnings += "历史摘要加载失败：${it.userMessage()}"
            JSONObject()
        }
        val history = historyRequest.await().getOrElse {
            dashboardWarnings += "历史样本加载失败：${it.userMessage()}"
            JSONObject()
        }
        RankingInsights(
            experimental = forecast.optBoolean("experimental", true),
            sampleCount = maxOf(forecast.optInt("sampleCount"), history.optInt("sampleCount")),
            lines = forecast.optJSONArray("lines")?.mapObjects(::parseForecastLine).orEmpty(),
            historyLines = summary.optJSONArray("lines")?.mapObjects(::parseHistoryLine).orEmpty(),
            recentSamples = history.optJSONArray("items")?.mapObjects(::parseHistorySample).orEmpty().takeLast(100),
            retentionRecommendation = forecast.optStringOrNull("retentionRecommendation")
                ?: summary.optStringOrNull("retentionRecommendation")
                ?: history.optStringOrNull("retentionRecommendation"),
            unavailableReason = forecast.optStringOrNull("unavailableReason")
                ?: summary.optStringOrNull("unavailableReason")
                ?: history.optStringOrNull("unavailableReason"),
            warnings = (forecast.optJSONArray("warnings").stringList() +
                summary.optJSONArray("warnings").stringList() +
                history.optJSONArray("warnings").stringList()).distinct()
        )
    }

    private suspend fun getObject(path: String): JSONObject = JSONObject(request(path))
    private suspend fun getArray(path: String): JSONArray = JSONArray(request(path))
    private suspend fun postObject(path: String, payload: JSONObject, token: String? = null): JSONObject = JSONObject(request(path, payload.toString(), token))

    private suspend fun request(path: String, body: String? = null, token: String? = null): String {
        val builder = Request.Builder().url("$apiBaseUrl$path").header("Accept", "application/json")
        token?.takeIf(String::isNotBlank)?.let { builder.header("Authorization", "Bearer $it") }
        if (body != null) builder.post(body.toRequestBody(jsonMediaType))
        val response = client.newCall(builder.build()).awaitBody()
        val responseBody = response.body
        if (!response.successful) {
            val apiMessage = runCatching { JSONObject(responseBody).optString("message") }.getOrNull()
            throw EventsApiException(response.code, apiMessage?.takeIf { it.isNotBlank() } ?: responseBody.take(300))
        }
        return responseBody
    }

    private fun requireRegion(region: String) {
        require(region in setOf("jp", "en", "tw", "kr", "cn")) { "不支持的区服：$region" }
    }
}

class EventsApiException(val statusCode: Int, detail: String) :
    IllegalStateException("API $statusCode${detail.takeIf { it.isNotBlank() }?.let { "：$it" }.orEmpty()}")

private fun parseEvent(json: JSONObject) = EventSummary(
    id = json.optString("id", "none"),
    name = json.optString("name", "未命名活动"),
    eventType = json.optStringOrNull("eventType"),
    startAt = json.optString("startAt"),
    endAt = json.optString("endAt"),
    storyOutline = json.optStringOrNull("storyOutline")
)

private fun parseRanking(json: JSONObject) = RankingRow(
    rank = json.optInt("rank"),
    userId = json.optStringOrNull("userId"),
    playerName = json.optStringOrNull("playerName") ?: json.optStringOrNull("name") ?: "Player",
    score = json.optLong("score"),
    growth = json.optNullableLong("hourlyGrowth") ?: json.optNullableLong("growth") ?: json.optNullableLong("scoreDifference") ?: json.optNullableLong("delta"),
    updatedAt = json.optStringOrNull("updatedAt"),
    leaderCardId = json.optStringOrNull("leaderCardId") ?: json.optStringOrNull("cardId"),
    leaderCardLevel = json.optNullableInt("leaderCardLevel") ?: json.optNullableInt("cardLevel"),
    leaderCardMasterRank = json.optNullableInt("leaderCardMasterRank") ?: json.optNullableInt("cardMasterRank"),
    leaderImageCandidates = listOfNotNull(json.optStringOrNull("leaderCardImageUrl")) +
        json.optJSONArray("leaderCardImageCandidates").stringList() +
        json.optJSONArray("leaderCharacterImageCandidates").stringList(),
    leaderAssetStatus = json.optStringOrNull("leaderAssetStatus")
)

private fun parseBorder(json: JSONObject) = BorderRow(
    rank = json.optInt("rank"), score = json.optLong("score"), updatedAt = json.optStringOrNull("updatedAt")
)

private fun parseSourceHealth(json: JSONObject) = RankingSourceHealth(
    status = json.optStringOrNull("status"),
    primarySource = json.optStringOrNull("primarySource"),
    fallbackLine = json.optStringOrNull("fallbackLine"),
    latestUpdatedAt = json.optStringOrNull("latestUpdatedAt"),
    stale = json.optBoolean("stale", false),
    errors = json.optJSONArray("errors").stringList()
)

private fun parseForecastLine(json: JSONObject) = ForecastLine(
    rank = json.optInt("rank"),
    currentScore = json.optLong("currentScore"),
    speedPerHour = json.optNullableDouble("speedPerHour") ?: json.optNullableDouble("hourlyGrowth"),
    forecast1h = json.optNullableLong("forecast1h"),
    forecast3h = json.optNullableLong("forecast3h"),
    forecastEnd = json.optNullableLong("forecastEnd"),
    sampleCount = json.optInt("sampleCount"),
    sampleSpanHours = json.optNullableDouble("sampleSpanHours") ?: json.optNullableDouble("sampleHours"),
    confidence = json.optStringOrNull("confidence"),
    reason = json.optStringOrNull("unavailableReason") ?: json.optStringOrNull("confidenceReason")
)

private fun parseHistoryLine(json: JSONObject) = HistorySummaryLine(
    rank = json.optInt("rank"),
    sampleType = json.optStringOrNull("sampleType"),
    sampleCount = json.optInt("sampleCount"),
    latestScore = json.optNullableLong("latestScore"),
    latestSampledAt = json.optStringOrNull("latestSampledAt"),
    sampleSpanHours = json.optNullableDouble("sampleSpanHours"),
    speedPerHour = json.optNullableDouble("speedPerHour"),
    confidence = json.optStringOrNull("confidence") ?: json.optStringOrNull("predictability"),
    confidenceReason = json.optStringOrNull("confidenceReason")
)

private fun parseHistorySample(json: JSONObject) = RankingHistorySample(
    rank = json.optInt("rank"), score = json.optLong("score"), sampledAt = json.optString("sampledAt"), sampleType = json.optStringOrNull("sampleType")
)

private fun parseTracePoint(json: JSONObject) = RankingTracePoint(
    timestamp = json.optLong("timestamp"), rank = json.optInt("rank"), score = json.optLong("score")
)

private fun parseRelated(json: JSONObject, kind: EventRelatedKind): EventRelatedItem {
    val title = json.optStringOrNull("title") ?: json.optStringOrNull("name") ?: "ID ${json.optString("id")}"
    val assets = json.optJSONObject("assets")
    return EventRelatedItem(
        id = json.optString("id"),
        title = title,
        subtitle = when (kind) {
            EventRelatedKind.SONG -> json.optStringOrNull("unit")
            EventRelatedKind.CARD -> json.optStringOrNull("character")
            EventRelatedKind.GACHA -> json.optStringOrNull("category")
        },
        kind = kind,
        imageCandidates = assets.assetCandidates("normalThumbnailUrl", "normalThumbnailCandidates", "normalUrl", "imageCandidates", "bannerUrl")
    )
}

private fun extractCardIds(cards: JSONArray): List<String> = List(cards.length()) { index ->
    val item = cards.optJSONObject(index) ?: return@List null
    item.optStringOrNull("cardId") ?: item.optJSONObject("card")?.optStringOrNull("id")
}.filterNotNull()

private fun JSONArray?.stringList(): List<String> = if (this == null) emptyList() else
    List(length()) { index -> optString(index) }.filter { it.isNotBlank() }

private fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T): List<T> =
    List(length()) { index -> transform(getJSONObject(index)) }

private fun JSONObject?.optStringOrNull(key: String): String? {
    if (this == null || !has(key) || isNull(key)) return null
    return optString(key).takeIf { it.isNotBlank() }
}

private fun JSONObject.optNullableLong(key: String): Long? = if (!has(key) || isNull(key)) null else optLong(key)
private fun JSONObject.optNullableInt(key: String): Int? = if (!has(key) || isNull(key)) null else optInt(key)
private fun JSONObject.optNullableDouble(key: String): Double? = if (!has(key) || isNull(key)) null else optDouble(key).takeIf { it.isFinite() }
private fun JSONObject.numberText(key: String): String = if (!has(key) || isNull(key)) "-" else opt(key).toString()
private fun Throwable.userMessage(): String = message ?: this::class.java.simpleName

private fun JSONObject?.assetCandidates(vararg keys: String): List<String> {
    if (this == null) return emptyList()
    return keys.flatMap { key ->
        when (val value = opt(key)) {
            is JSONArray -> value.stringList()
            is String -> listOf(value)
            else -> emptyList()
        }
    }.filter(String::isNotBlank).distinct()
}

private fun collectDiagnosticStrings(root: JSONObject, key: String): List<String> {
    val values = mutableListOf<String>()
    fun visit(value: Any?, depth: Int) {
        if (depth > 4) return
        when (value) {
            is JSONObject -> {
                value.optJSONArray(key)?.stringList()?.let(values::addAll)
                value.keys().forEach { childKey -> visit(value.opt(childKey), depth + 1) }
            }
            is JSONArray -> repeat(value.length()) { visit(value.opt(it), depth + 1) }
        }
    }
    visit(root, 0)
    return values.filter(String::isNotBlank).distinct()
}

private suspend inline fun <T> catchingSuspend(crossinline block: suspend () -> T): Result<T> = try {
    Result.success(block())
} catch (error: CancellationException) {
    throw error
} catch (error: Throwable) {
    Result.failure(error)
}

private data class HttpBodyResponse(val code: Int, val successful: Boolean, val body: String)

private suspend fun Call.awaitBody(): HttpBodyResponse = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onFailure(call: Call, error: IOException) {
            if (continuation.isActive) continuation.resumeWithException(error)
        }

        override fun onResponse(call: Call, response: okhttp3.Response) {
            response.use {
                if (continuation.isActive) continuation.resume(HttpBodyResponse(response.code, response.isSuccessful, response.body?.string().orEmpty()))
            }
        }
    })
}
