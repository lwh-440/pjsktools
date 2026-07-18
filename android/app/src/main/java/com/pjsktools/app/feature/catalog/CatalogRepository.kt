package com.pjsktools.app.feature.catalog

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class CatalogRepository(baseUrl: String, private val client: OkHttpClient = OkHttpClient()) {
    private val rootUrl = baseUrl.trimEnd('/').toHttpUrl()

    suspend fun catalog(
        region: String,
        type: CatalogType,
        query: String,
        page: Int,
        pageSize: Int,
        costumeFilters: CostumeFilters = CostumeFilters()
    ): CatalogPage = withContext(Dispatchers.IO) {
        val url = rootUrl.newBuilder()
            .addPathSegments("api/master")
            .addPathSegment(region)
            .addPathSegment("catalog")
            .addPathSegment(type.apiName)
            .addQueryParameter("page", page.coerceAtLeast(1).toString())
            .addQueryParameter("pageSize", pageSize.coerceIn(1, 100).toString())
            .addQueryParameter("sort", "id-desc")
            .apply {
                if (query.isNotBlank()) addQueryParameter("q", query.trim())
                if (type == CatalogType.COSTUMES) {
                    if (costumeFilters.partType.isNotBlank()) addQueryParameter("partType", costumeFilters.partType)
                    if (costumeFilters.source.isNotBlank()) addQueryParameter("source", costumeFilters.source)
                    if (costumeFilters.rarity.isNotBlank()) addQueryParameter("rarity", costumeFilters.rarity)
                    if (costumeFilters.gender.isNotBlank()) addQueryParameter("gender", costumeFilters.gender)
                    if (costumeFilters.characterId.isNotBlank()) addQueryParameter("characterId", costumeFilters.characterId)
                }
            }
            .build()
        val body = JSONObject(execute(Request.Builder().url(url).get().build()))
        val items = body.optJSONArray("items").objects().map { parseCatalogItem(type, it) }
        val health = body.optJSONObject("sourceHealth")
        CatalogPage(
            items = items,
            page = body.optInt("page", page).coerceAtLeast(1),
            pageSize = body.optInt("pageSize", pageSize).coerceAtLeast(1),
            total = body.optInt("total", items.size).coerceAtLeast(0),
            totalPages = body.optInt("totalPages", 1).coerceAtLeast(1),
            source = body.text("source"),
            sourceStatus = health?.text("status"),
            unavailableReason = health?.text("unavailableReason") ?: body.text("unavailableReason"),
            syncedAt = health?.text("syncedAt"),
            masterVersion = body.text("masterVersion")
        )
    }

    suspend fun detail(region: String, item: CatalogItem): CatalogDetail = withContext(Dispatchers.IO) {
        val url = rootUrl.newBuilder()
            .addPathSegments("api/master")
            .addPathSegment(region)
            .addPathSegment(if (item.type == CatalogType.SONGS) "music" else item.type.apiName)
            .addPathSegment(item.id)
            .addPathSegment("full")
            .build()
        val body = JSONObject(execute(Request.Builder().url(url).get().build()))
        when (item.type) {
            CatalogType.SONGS -> parseSongDetail(item, body)
            CatalogType.CARDS -> parseCardDetail(item, body)
            else -> parseCollectionDetail(item, body)
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
                        if (continuation.isActive) continuation.resumeWithException(
                            IOException(message ?: "API 请求失败：HTTP ${response.code}")
                        )
                    } else if (continuation.isActive) {
                        continuation.resume(body)
                    }
                }
            }
        })
    }

    private fun parseCatalogItem(type: CatalogType, json: JSONObject): CatalogItem {
        val title = json.text("title") ?: json.text("name") ?: "未命名条目"
        val subtitle = (when (type) {
            CatalogType.SONGS -> listOfNotNull(json.text("unit"), json.text("durationSeconds")?.let { "${it}s" }).joinToString(" · ")
            CatalogType.CARDS -> listOfNotNull(json.text("character"), json.text("attribute"), json.text("rarity")?.let { "星级 $it" }).joinToString(" · ")
            CatalogType.COSTUMES -> listOfNotNull(json.stringList("partTypes").takeIf { it.isNotEmpty() }?.joinToString(" / "), json.text("source")).joinToString(" · ")
            else -> json.text("category") ?: json.text("rarity")
        }).takeUnless { it.isNullOrBlank() }
        return CatalogItem(
            id = json.text("id") ?: "unknown",
            type = type,
            title = title,
            subtitle = subtitle,
            description = json.text("description"),
            category = json.text("category"),
            rarity = json.text("rarity"),
            startAt = json.text("startAt"),
            endAt = json.text("endAt"),
            assetUrls = assetUrls(json.optJSONObject("assets"))
        )
    }

    private fun parseSongDetail(fallback: CatalogItem, body: JSONObject): SongCatalogDetail {
        val music = body.optJSONObject("music") ?: JSONObject()
        val item = parseCatalogItem(CatalogType.SONGS, music).withFallback(fallback)
        val relations = body.optJSONObject("relations") ?: JSONObject()
        return SongCatalogDetail(
            item = item,
            assetUrls = (assetUrls(body.optJSONObject("assets")) + item.assetUrls).distinct(),
            unit = music.text("unit"),
            durationSeconds = music.intValue("durationSeconds"),
            bpm = music.doubleValue("bpm"),
            categories = music.stringList("categories"),
            difficulties = music.optJSONArray("difficultyDetails").objects().map {
                SongDifficulty(it.text("difficulty") ?: "unknown", it.intValue("playLevel"), it.intValue("totalNoteCount"))
            },
            charts = body.optJSONArray("charts").objects().map { chart ->
                ChartAsset(
                    difficulty = chart.text("difficulty") ?: "unknown",
                    imageCandidates = listOfNotNull(
                        chart.text("chartPngUrl"), chart.text("chartSvgUrl"), chart.text("sekaiViewerChartSvgUrl")
                    ),
                    susUrl = chart.text("susUrl"),
                    unavailableReason = chart.text("unavailableReason")
                )
            },
            relatedEvents = relatedItems(relations.optJSONArray("relatedEvents"), RelatedKind.EVENT),
            vocals = relatedItems(relations.optJSONArray("vocals") ?: relations.optJSONArray("musicVocals"), RelatedKind.DISPLAY_ONLY)
        )
    }

    private fun parseCardDetail(fallback: CatalogItem, body: JSONObject): CardCatalogDetail {
        val card = body.optJSONObject("card") ?: JSONObject()
        val item = parseCatalogItem(CatalogType.CARDS, card).withFallback(fallback)
        val relations = body.optJSONObject("relations") ?: JSONObject()
        val assets = body.optJSONObject("assets")
        return CardCatalogDetail(
            item = item,
            assetUrls = (assetUrls(assets) + item.assetUrls).distinct(),
            character = card.text("character"),
            rarity = card.intValue("rarity"),
            attribute = card.text("attribute"),
            normalImageCandidates = assetValues(assets, "normalUrl", "normalThumbnailUrl", "normalThumbnailCandidates", "imageCandidates"),
            afterTrainingImageCandidates = assetValues(assets, "afterTrainingUrl", "afterTrainingThumbnailUrl", "afterTrainingThumbnailCandidates"),
            skill = parseSkill(card.optJSONObject("skill")),
            specialTrainingSkill = parseSkill(card.optJSONObject("specialTrainingSkill")),
            relatedEvents = relatedItems(relations.optJSONArray("relatedEvents"), RelatedKind.EVENT),
            relatedGachas = relatedItems(relations.optJSONArray("relatedGachas"), RelatedKind.GACHA)
        )
    }

    private fun parseCollectionDetail(fallback: CatalogItem, body: JSONObject): CollectionCatalogDetail {
        val json = body.optJSONObject("item") ?: JSONObject()
        val item = parseCatalogItem(fallback.type, json).withFallback(fallback)
        return CollectionCatalogDetail(
            item = item,
            assetUrls = (assetUrls(body.optJSONObject("assets")) + item.assetUrls).distinct(),
            costume = if (fallback.type == CatalogType.COSTUMES) parseCostume(json) else null,
            relatedCards = relatedItems(body.optJSONObject("relations")?.optJSONArray("relatedCards"), RelatedKind.CARD)
        )
    }

    private fun parseSkill(json: JSONObject?): SkillDetail? {
        json ?: return null
        val descriptions = json.optJSONObject("formattedDescriptions")
        val levels = buildMap {
            if (descriptions != null) for (level in 1..4) {
                descriptions.text(level.toString())?.let { put(level, it) }
            }
        }
        return SkillDetail(
            id = json.text("id") ?: "unknown",
            name = json.text("name"),
            descriptionsByLevel = levels,
            missingFields = json.optJSONObject("skillFormatTrace")?.stringList("missingFields").orEmpty()
        )
    }

    private fun parseCostume(json: JSONObject): CostumeDetail {
        val variants = linkedMapOf<String, List<String>>()
        json.optJSONObject("parts")?.let { parts ->
            for (key in parts.keys()) variants[key] = parts.optJSONArray(key).objects().mapNotNull {
                it.text("colorName") ?: it.text("colorId")?.let { id -> "Color $id" }
            }
        }
        return CostumeDetail(
            partTypes = json.stringList("partTypes"), source = json.text("source"), rarity = json.text("rarity"),
            gender = json.text("gender"), designer = json.text("designer"),
            characterIds = json.stringList("characterIds"),
            partVariants = variants,
            extraParts = json.optJSONArray("extraParts").objects().map { extra ->
                CostumeExtraPart(
                    characterId = extra.text("characterId"),
                    partType = extra.text("partType"),
                    variants = extra.optJSONArray("variants").objects().mapNotNull {
                        it.text("colorName") ?: it.text("colorId")?.let { id -> "Color $id" }
                    }
                )
            }
        )
    }

    private fun relatedItems(array: JSONArray?, kind: RelatedKind): List<RelatedItem> = array.objects().map { json ->
        RelatedItem(
            id = json.text("id") ?: "unknown",
            title = json.text("title") ?: json.text("name") ?: "未命名条目",
            subtitle = json.text("character") ?: json.text("category"),
            kind = kind
        )
    }

    private fun assetUrls(json: JSONObject?): List<String> {
        json ?: return emptyList()
        val result = mutableListOf<String>()
        for (key in json.keys()) when (val value = json.opt(key)) {
            is String -> if (value.isAssetUrl()) result += value
            is JSONArray -> for (index in 0 until value.length()) value.optString(index).takeIf { it.isAssetUrl() }?.let(result::add)
        }
        return result.distinct()
    }

    private fun assetValues(json: JSONObject?, vararg keys: String): List<String> {
        json ?: return emptyList()
        return keys.flatMap { key ->
            when (val value = json.opt(key)) {
                is String -> listOf(value)
                is JSONArray -> List(value.length()) { value.optString(it) }
                else -> emptyList()
            }
        }.filter { it.isAssetUrl() }.distinct()
    }
}

private fun CatalogItem.withFallback(fallback: CatalogItem): CatalogItem = copy(
    id = id.takeUnless { it == "unknown" } ?: fallback.id,
    title = title.takeUnless { it == "未命名条目" } ?: fallback.title,
    subtitle = subtitle ?: fallback.subtitle, description = description ?: fallback.description,
    category = category ?: fallback.category, rarity = rarity ?: fallback.rarity,
    startAt = startAt ?: fallback.startAt, endAt = endAt ?: fallback.endAt,
    assetUrls = (assetUrls + fallback.assetUrls).distinct()
)

private fun JSONArray?.objects(): List<JSONObject> =
    if (this == null) emptyList() else List(length()) { optJSONObject(it) ?: JSONObject() }

private fun JSONObject.text(key: String): String? =
    if (!has(key) || isNull(key)) null else opt(key)?.toString()?.takeIf { it.isNotBlank() && it != "null" }

private fun JSONObject.intValue(key: String): Int? =
    if (!has(key) || isNull(key)) null else runCatching { getInt(key) }.getOrNull()

private fun JSONObject.doubleValue(key: String): Double? =
    if (!has(key) || isNull(key)) null else runCatching { getDouble(key) }.getOrNull()

private fun JSONObject.stringList(key: String): List<String> {
    val array = optJSONArray(key) ?: return emptyList()
    return List(array.length()) { array.opt(it)?.toString().orEmpty() }.filter { it.isNotBlank() && it != "null" }
}

private fun String.isAssetUrl() = startsWith("http://") || startsWith("https://") || startsWith("/api/")
