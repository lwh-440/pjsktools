package com.pjsktools.app.feature.content

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class ContentRepository(baseUrl: String, private val client: OkHttpClient = OkHttpClient()) {
    private val root = baseUrl.trimEnd('/').toHttpUrl()

    suspend fun information(region: String): ContentPage<InformationItem> {
        val body = get(path(region, "information"))
        val items = body.array("items").objects().map(::informationItem)
        return ContentPage(items, total = body.int("total") ?: items.size,
            capabilityStatus = body.text("capabilityStatus") ?: body.obj("sourceHealth")?.text("status"),
            warnings = body.strings("warnings"), unavailableReason = body.text("unavailableReason"),
            sourceHealth = diagnostics(body.obj("sourceHealth")), syncedAt = body.text("syncedAt"))
    }

    suspend fun informationDetail(region: String, id: String): InformationDetail {
        val body = get(path(region, "information", id))
        return InformationDetail(
            item = informationItem(body), detailKind = body.text("detailKind"),
            embedStatus = body.text("embedStatus"), embeddedDetailUrl = body.text("embeddedDetailUrl"),
            detailUrl = body.text("detailUrl"), warnings = body.strings("warnings")
        )
    }

    suspend fun exchanges(region: String): ContentPage<ExchangeItem> {
        val body = get(path(region, "exchanges", "context"))
        val items = body.array("items").objects().map(::exchangeItem)
        return ContentPage(items, total = body.int("total") ?: items.size,
            capabilityStatus = body.text("capabilityStatus"), warnings = body.strings("warnings"),
            facets = facets(body.obj("facets")), sourceHealth = diagnostics(body.obj("sourceHealth")),
            syncedAt = body.text("syncedAt"), unavailableCollections = body.strings("unavailableCollections"),
            lookupDiagnostics = diagnostics(body.obj("lookupDiagnostics")))
    }

    suspend fun exchangeDetail(region: String, id: String): ExchangeDetail {
        val body = get(path(region, "exchanges", id))
        return ExchangeDetail(exchangeItem(body.obj("item") ?: JSONObject()),
            body.obj("summary")?.text("name"), body.array("siblings").objects().map(::exchangeItem),
            body.text("capabilityStatus"), diagnostics(body.obj("sourceHealth")), body.text("syncedAt"),
            diagnostics(body.obj("lookupDiagnostics")))
    }

    suspend fun missions(region: String): ContentPage<MissionItem> {
        val body = get(path(region, "missions", "context"))
        val groups = body.obj("groups") ?: JSONObject()
        val items = listOf("normal", "beginner", "character", "honor").flatMap { kind ->
            groups.array(kind).objects().map { missionItem(kind, it) }
        }
        return ContentPage(items, total = items.size, capabilityStatus = body.text("capabilityStatus"),
            warnings = body.strings("warnings"), unavailableReason = body.text("unavailableReason"),
            sourceHealth = diagnostics(body.obj("sourceHealth")), syncedAt = body.text("syncedAt"),
            lookupDiagnostics = diagnostics(body.obj("lookupDiagnostics")))
    }

    suspend fun virtualLives(region: String): ContentPage<VirtualLiveItem> {
        val body = get(path(region, "virtual-lives", "context"))
        val items = body.array("items").objects().map(::virtualLiveItem)
        return ContentPage(items, total = body.int("total") ?: items.size,
            capabilityStatus = body.text("capabilityStatus"), warnings = body.strings("warnings"),
            sourceHealth = diagnostics(body.obj("sourceHealth")), syncedAt = body.text("syncedAt"))
    }

    suspend fun virtualLiveDetail(region: String, id: String): VirtualLiveDetail {
        val body = get(path(region, "virtual-lives", id, "full"))
        val live = virtualLiveItem(body.obj("live") ?: JSONObject().put("id", id))
        return VirtualLiveDetail(
            live = live,
            schedules = body.array("schedules").objects().map { scheduleText(it) },
            characters = body.array("characters").objects().map { it.text("name") ?: "角色 #${it.text("id") ?: "-"}" },
            rewards = body.array("resolvedRewards").objects().map(::resourceItem),
            steps = body.array("setlistSummaries").objects().map { step ->
                val music = step.obj("music")
                VirtualLiveStep(step.int("index") ?: 0, step.int("seq") ?: 0,
                    step.text("type") ?: "unknown", music?.text("title") ?: step.text("assetbundleName") ?: "节目",
                    music?.strings("jacketCandidates").orEmpty())
            },
            readinessStatus = body.obj("detailReadiness")?.text("status"),
            capabilityStatus = body.text("capabilityStatus")
        )
    }

    suspend fun virtualLivePlayback(region: String, id: String): PlaybackState =
        playback(get(path(region, "virtual-lives", id, "playback")))

    suspend fun virtualLiveStep(region: String, id: String, index: Int): VirtualLiveStepDetail {
        val body = get(path(region, "virtual-lives", id, "steps", index.toString()))
        val events = body.array("mcEvents").objects().mapIndexed { eventIndex, event ->
            VirtualLiveEvent(
                id = event.text("id") ?: eventIndex.toString(),
                type = event.text("type") ?: "event",
                time = event.double("time"),
                text = event.text("serif") ?: event.text("text") ?: event.text("motionKey"),
                characterId = event.text("character3dId") ?: event.text("characterId"),
                voiceUrl = event.obj("voice")?.text("proxiedUrl") ?: event.obj("voice")?.text("url"),
                motionKey = event.text("motionKey"), facialKey = event.text("facialKey"),
                bodyCostume3dId = event.text("bodyCostume3dId")
            )
        }
        return VirtualLiveStepDetail(
            index = body.int("stepIndex") ?: index,
            type = body.obj("step")?.text("type") ?: body.text("type") ?: "unknown",
            playbackStatus = body.text("playbackStatus"),
            unavailableReason = body.text("unavailableReason"),
            warnings = body.strings("warnings"),
            events = events,
            queue = playbackEntries(body.array("playbackQueue"))
        )
    }

    suspend fun live2d(
        region: String, query: String, characterId: String, costumeType: String,
        availability: String, page: Int, pageSize: Int
    ): ContentPage<Live2dItem> {
        val url = path(region, "live2d", "models").newBuilder()
            .addQueryParameter("page", page.toString()).addQueryParameter("pageSize", pageSize.toString())
            .addQueryParameter("availability", availability)
            .apply {
                if (query.isNotBlank()) addQueryParameter("q", query.trim())
                if (characterId.isNotBlank()) addQueryParameter("characterId", characterId)
                if (costumeType.isNotBlank()) addQueryParameter("costumeType", costumeType.trim())
            }.build()
        val body = get(url)
        val array = if (body.has("items")) body.array("items") else body.array("models")
        val items = array.objects().map(::live2dItem)
        return ContentPage(items, body.int("page") ?: page, body.int("pageSize") ?: pageSize,
            body.int("total") ?: items.size, body.int("totalPages") ?: 1,
            body.text("capabilityStatus"), body.strings("warnings"), body.text("unavailableReason"),
            sourceHealth = diagnostics(body.obj("sourceHealth")), syncedAt = body.text("syncedAt"))
    }

    suspend fun live2dDetail(region: String, id: String): Live2dDetail {
        val body = get(path(region, "live2d", "models", id, "full"))
        val assets = body.obj("assets") ?: JSONObject()
        return Live2dDetail(
            model = live2dItem(body.obj("model") ?: JSONObject().put("id", id)),
            playbackStatus = body.text("playbackStatus"), unavailableReason = body.text("unavailableReason"),
            model3Url = assets.text("rewrittenModel3JsonUrl") ?: assets.text("proxiedModel3JsonUrl"),
            textureUrls = assets.strings("proxiedTextureFiles"),
            motionUrls = assets.strings("proxiedMotionFiles"),
            expressionUrls = assets.strings("proxiedExpressionFiles"),
            runtimeRequirements = body.strings("runtimeRequired")
        )
    }

    suspend fun mysekai(
        region: String, kind: MysekaiKind, query: String, category: String,
        page: Int, pageSize: Int
    ): ContentPage<MysekaiItem> {
        val url = path(region, "mysekai", "catalog", kind.apiName).newBuilder()
            .addQueryParameter("page", page.toString()).addQueryParameter("pageSize", pageSize.toString())
            .addQueryParameter("sort", "id-desc").apply {
                if (query.isNotBlank()) addQueryParameter("q", query.trim())
                if (category.isNotBlank()) addQueryParameter("category", category)
            }.build()
        val body = get(url)
        val items = body.array("items").objects().map { mysekaiItem(kind, it) }
        return ContentPage(items, body.int("page") ?: page, body.int("pageSize") ?: pageSize,
            body.int("total") ?: items.size, body.int("totalPages") ?: 1,
            body.text("capabilityStatus"), body.strings("warnings"),
            facets = facets(body.obj("facets")), sourceHealth = diagnostics(body.obj("sourceHealth")),
            syncedAt = body.text("syncedAt"), lookupDiagnostics = diagnostics(body.obj("lookupDiagnostics")))
    }

    suspend fun mysekaiDetail(region: String, item: MysekaiItem): MysekaiDetail {
        val body = get(path(region, "mysekai", "catalog", item.kind.apiName, item.id))
        val parsed = mysekaiItem(item.kind, body.obj("item") ?: JSONObject()).takeIf { it.id.isNotBlank() } ?: item
        return MysekaiDetail(parsed, body.array("blueprints").length(),
            body.array("materialCosts").objects().map { cost ->
                MysekaiCost(cost.int("quantity"), cost.obj("material")?.let { mysekaiItem(MysekaiKind.MATERIALS, it) })
            }, body.array("relatedFixtures").length())
    }

    suspend fun stories(
        region: String, storyType: String, query: String, unit: String, relatedId: String,
        sort: String, page: Int, pageSize: Int
    ): ContentPage<StoryItem> {
        val url = path(region, "stories", "catalog").newBuilder()
            .addQueryParameter("page", page.toString()).addQueryParameter("pageSize", pageSize.toString())
            .addQueryParameter("sort", sort).apply {
                if (storyType != "all") addQueryParameter("storyType", storyType)
                if (query.isNotBlank()) addQueryParameter("q", query.trim())
                if (unit.isNotBlank()) addQueryParameter("unit", unit.trim())
                if (relatedId.isNotBlank()) addQueryParameter("relatedId", relatedId.trim())
            }.build()
        val body = get(url)
        val items = body.array("items").objects().map(::storyItem)
        return ContentPage(items, body.int("page") ?: page, body.int("pageSize") ?: pageSize,
            body.int("total") ?: items.size, body.int("totalPages") ?: 1,
            body.text("capabilityStatus"), body.strings("warnings"), body.text("unavailableReason"),
            sourceHealth = diagnostics(body.obj("sourceHealth")), syncedAt = body.text("syncedAt"))
    }

    suspend fun storyDetail(region: String, storyType: String, id: String): StoryDetail {
        val body = get(path(region, "stories", storyType, id, "full"))
        val raw = body.array("matches").objects().firstOrNull()?.obj("raw") ?: JSONObject()
        return StoryDetail(id, storyType, body.text("displayTitle") ?: raw.text("title") ?: raw.text("name") ?: id,
            raw.text("outline") ?: raw.text("description"), body.strings("imageCandidates"),
            body.array("chapters").objects().mapIndexed { index, chapter ->
                StoryChapter(chapter.text("id") ?: index.toString(), chapter.text("name") ?: chapter.text("title") ?: "章节 ${index + 1}",
                    chapter.text("chapterTitle"), chapter.text("scenarioStatus"))
            }, body.obj("playbackReadiness")?.bool("hasScenario") == true, body.text("unavailableReason"))
    }

    suspend fun storyPlayback(region: String, storyType: String, id: String, episodeId: String): PlaybackState =
        playback(get(path(region, "stories", storyType, id, "episodes", episodeId, "playback")))

    private fun path(region: String, vararg segments: String): HttpUrl = root.newBuilder()
        .addPathSegments("api/master").addPathSegment(region).apply { segments.forEach(::addPathSegment) }.build()

    private suspend fun get(url: HttpUrl): JSONObject {
        val text = execute(Request.Builder().url(url).get().build())
        return try { JSONObject(text) } catch (failure: Throwable) {
            if (failure is CancellationException) throw failure
            throw IOException("服务返回了无效 JSON", failure)
        }
    }

    private suspend fun execute(request: Request): String = suspendCancellableCoroutine { continuation ->
        val call = client.newCall(request)
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (continuation.isActive) continuation.resumeWithException(e)
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val body = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        val message = runCatching { JSONObject(body).text("message") }.getOrNull()
                        if (continuation.isActive) continuation.resumeWithException(IOException(message ?: "请求失败：HTTP ${response.code}"))
                    } else if (continuation.isActive) continuation.resume(body)
                }
            }
        })
    }
}

private fun informationItem(json: JSONObject): InformationItem {
    val raw = json.obj("raw") ?: json
    return InformationItem(raw.text("id") ?: json.text("id") ?: "", raw.text("title") ?: raw.text("name") ?: "未命名公告",
        raw.text("informationType"), raw.text("informationTag"), raw.long("startAt"), raw.long("endAt"),
        (json.strings("bannerImageCandidates") + raw.strings("bannerImageCandidates") + listOfNotNull(raw.text("bannerUrl"))).distinct())
}

private fun exchangeItem(json: JSONObject) = ExchangeItem(
    json.text("id") ?: "", json.text("name") ?: "兑换项 #${json.text("id") ?: "-"}", json.text("summaryId"),
    json.text("summaryName"), json.text("category"), json.text("status"), json.text("refreshCycle"),
    json.int("exchangeLimit"), json.long("startAt"), json.long("endAt"),
    json.array("rewards").objects().map(::resourceItem), json.array("costs").objects().map(::resourceItem),
    json.strings("imageCandidates")
)

private fun resourceItem(json: JSONObject): ResourceItem {
    val item = json.obj("item") ?: json
    return ResourceItem(json.text("resourceType") ?: item.text("resourceType") ?: "unknown",
        json.text("resourceId") ?: item.text("id"), json.text("name") ?: item.text("name") ?: item.text("title") ?: "未解析资源",
        json.int("quantity") ?: item.int("quantity"),
        (json.strings("imageCandidates") + item.strings("imageCandidates") + listOfNotNull(json.text("imageUrl"), item.text("imageUrl"))).distinct(),
        json.text("lookupStatus"))
}

private fun missionItem(kind: String, json: JSONObject) = MissionItem(
    json.text("id") ?: "", kind, json.text("missionType") ?: "unknown", json.text("sentence") ?: "任务说明不可用",
    json.int("seq"), json.text("category"), json.obj("character")?.text("id"),
    json.int("requirement"), json.int("maxRequirement"), json.obj("character")?.text("name"),
    json.array("stages").objects().map { MissionStage(it.int("seq") ?: 0, it.int("requirement"), it.int("exp"), it.int("quantity")) },
    json.array("rewards").objects().map(::resourceItem), json.text("lookupStatus"), json.strings("missingFields")
)

private fun virtualLiveItem(json: JSONObject) = VirtualLiveItem(
    json.text("id") ?: json.text("virtualLiveId") ?: "", json.text("name") ?: json.text("title") ?: "Virtual Live",
    json.text("virtualLiveType"), json.long("startAt"), json.long("endAt"),
    (json.strings("imageCandidates") + listOfNotNull(json.text("imageUrl"))).distinct(),
    json.int("scheduleCount") ?: json.array("virtualLiveSchedules").length(),
    json.int("setlistCount") ?: json.array("virtualLiveSetlists").length(),
    json.int("rewardCount") ?: json.array("virtualLiveRewards").length()
)

private fun live2dItem(json: JSONObject): Live2dItem {
    val counts = json.obj("assetCounts") ?: JSONObject()
    return Live2dItem(json.text("id") ?: "", json.text("name") ?: json.text("costumeType") ?: json.text("modelPath") ?: "Live2D",
        json.text("modelPath"), json.int("characterId"), json.text("costumeType"), json.text("regionReferenceStatus"),
        json.text("playbackStatus"), counts.int("motions") ?: 0, counts.int("expressions") ?: 0, counts.int("textures") ?: 0)
}

private fun mysekaiItem(kind: MysekaiKind, json: JSONObject) = MysekaiItem(
    json.text("id") ?: "", kind, json.text("name") ?: "${kind.label} #${json.text("id") ?: "-"}", json.text("description"),
    json.text("category"), json.text("rarity"), (json.strings("imageCandidates") + listOfNotNull(json.text("imageUrl"))).distinct()
)

private fun storyItem(json: JSONObject) = StoryItem(
    json.text("id") ?: "", json.text("storyType") ?: "unknown", json.text("name") ?: "未命名故事", json.text("description"),
    json.text("unit"), json.text("relatedId"), json.long("startAt"), json.int("chapterCount") ?: 0, json.int("episodeCount") ?: 0,
    (json.strings("imageCandidates") + listOfNotNull(json.text("bannerUrl"))).distinct(), json.text("imageStatus")
)

private fun playback(body: JSONObject): PlaybackState {
    val mediaAssets = body.array("mediaAssets").objects()
    val queue = (playbackEntries(body.array("playbackQueue")) + mediaAssets.mapNotNull { asset ->
        if (asset.text("kind") !in setOf("voice", "bgm", "se", "audio")) return@mapNotNull null
        val url = asset.text("proxiedUrl") ?: asset.text("url") ?: return@mapNotNull null
        PlaybackEntry(asset.text("kind") ?: "audio", asset.text("identifier") ?: asset.text("kind") ?: "音频", url)
    }).distinctBy { it.url }
    val snippets = body.array("snippets").objects().mapNotNull { it.text("text") ?: it.text("serif") ?: it.text("message") }
    val images = mediaAssets.filter { it.text("kind") in setOf("background", "card-still", "image", "scenario-effect") }
        .flatMap { listOfNotNull(it.text("proxiedUrl"), it.text("url")) }
    val actions = body.array("actions").objects().mapIndexed { index, action ->
        ScenarioAction(action.int("index") ?: index, action.text("type") ?: "unknown",
            action.text("windowDisplayName") ?: action.text("speaker"), action.text("body") ?: action.text("text"),
            action.text("effectName"))
    }.sortedBy(ScenarioAction::index)
    val readiness = body.obj("playbackReadiness")
    val diagnostics = buildList {
        readiness?.int("setlistCount")?.let { add("节目 $it") }
        readiness?.int("mcEventCount")?.let { add("MC 事件 $it") }
        readiness?.int("musicCount")?.let { add("歌曲 $it") }
        readiness?.int("playableAudioCount")?.let { add("可播放音频 $it") }
    }
    return PlaybackState(body.text("playbackStatus"), body.text("episodeId"), body.text("unavailableReason"),
        (body.strings("warnings") + body.strings("missingResources")).distinct(), queue, snippets, images.distinct(), diagnostics, actions)
}

private fun playbackEntries(array: JSONArray): List<PlaybackEntry> = array.objects().mapNotNull { entry ->
    entry.text("url")?.let { PlaybackEntry(entry.text("type") ?: "media", entry.text("label") ?: "媒体", it, entry.double("time")) }
}

private fun scheduleText(json: JSONObject): String {
    val start = json.long("startAt") ?: json.long("startTime")
    val end = json.long("endAt") ?: json.long("endTime")
    return listOfNotNull(start?.let(::formatEpoch), end?.let(::formatEpoch)).joinToString(" ～ ").ifBlank { "场次时间未公开" }
}

private fun formatEpoch(value: Long): String = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.getDefault()).format(java.util.Date(value))

private fun facets(json: JSONObject?): Map<String, List<String>> {
    json ?: return emptyMap()
    return json.keys().asSequence().associateWith { json.strings(it) }
}

private fun diagnostics(json: JSONObject?): Map<String, String> {
    json ?: return emptyMap()
    return json.keys().asSequence().associateWith { key ->
        when (val value = json.opt(key)) {
            is JSONObject -> diagnostics(value).entries.joinToString { "${it.key}=${it.value}" }
            is JSONArray -> List(value.length()) { value.opt(it)?.toString().orEmpty() }.joinToString()
            else -> value?.toString().orEmpty()
        }
    }
}

private fun JSONObject.obj(key: String): JSONObject? = optJSONObject(key)
private fun JSONObject.array(key: String): JSONArray = optJSONArray(key) ?: JSONArray()
private fun JSONObject.text(key: String): String? = if (!has(key) || isNull(key)) null else opt(key)?.toString()?.takeIf { it.isNotBlank() && it != "null" }
private fun JSONObject.int(key: String): Int? = if (!has(key) || isNull(key)) null else runCatching { getInt(key) }.getOrNull()
private fun JSONObject.long(key: String): Long? = if (!has(key) || isNull(key)) null else runCatching { getLong(key) }.getOrNull()
private fun JSONObject.double(key: String): Double? = if (!has(key) || isNull(key)) null else runCatching { getDouble(key) }.getOrNull()
private fun JSONObject.bool(key: String): Boolean? = if (!has(key) || isNull(key)) null else runCatching { getBoolean(key) }.getOrNull()
private fun JSONObject.strings(key: String): List<String> = array(key).let { array -> List(array.length()) { array.opt(it)?.toString().orEmpty() }.filter { it.isNotBlank() && it != "null" } }
private fun JSONArray.objects(): List<JSONObject> = List(length()) { optJSONObject(it) ?: JSONObject() }
