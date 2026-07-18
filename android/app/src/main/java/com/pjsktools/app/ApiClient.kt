package com.pjsktools.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class ApiClient(private val baseUrl: String) {
    private val client = OkHttpClient()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun regions(): List<Region> = withContext(Dispatchers.IO) {
        JSONArray(get("/api/regions")).mapObjects {
            Region(it.getString("id"), it.getString("name"))
        }
    }

    suspend fun songs(region: String): List<Song> = withContext(Dispatchers.IO) {
        JSONArray(get("/api/master/$region/songs")).mapObjects { item ->
            val difficulties = item.optJSONArray("difficulties") ?: JSONArray()
            Song(
                id = item.getString("id"),
                title = item.getString("title"),
                unit = item.optString("unit", "Project Sekai"),
                difficulties = List(difficulties.length()) { difficulties.getString(it) }
            )
        }
    }

    suspend fun cards(region: String): List<SekaiCard> = withContext(Dispatchers.IO) {
        JSONArray(get("/api/master/$region/cards")).mapObjects { item ->
            SekaiCard(
                id = item.getString("id"),
                character = item.optString("character", "未知角色"),
                title = item.optString("title", "未命名卡牌"),
                rarity = item.optInt("rarity", 0),
                attribute = item.optString("attribute", "unknown"),
                assetbundleName = item.optString("assetbundleName").ifBlank { null }
            )
        }
    }

    suspend fun currentEvent(region: String): EventInfo = withContext(Dispatchers.IO) {
        JSONObject(get("/api/events/$region/current")).toEventInfo()
    }

    suspend fun profile(region: String, userId: String): PlayerProfile = withContext(Dispatchers.IO) {
        JSONObject(get("/api/players/$region/$userId/profile")).toPlayerProfile()
    }

    suspend fun rankingTop100(region: String, eventId: String): List<RankingEntry> = withContext(Dispatchers.IO) {
        JSONArray(get("/api/events/$region/$eventId/ranking-top100")).mapObjects {
            RankingEntry(
                rank = it.getInt("rank"),
                userId = it.optString("userId"),
                name = it.optString("name", "Player"),
                score = it.getInt("score")
            )
        }
    }

    suspend fun rankingBorder(region: String, eventId: String): List<RankingBorder> = withContext(Dispatchers.IO) {
        JSONArray(get("/api/events/$region/$eventId/ranking-border")).mapObjects {
            RankingBorder(rank = it.getInt("rank"), score = it.getInt("score"))
        }
    }

    suspend fun login(email: String, password: String): Session = withContext(Dispatchers.IO) {
        auth("/api/auth/login", email, password)
    }

    suspend fun register(email: String, password: String): Session = withContext(Dispatchers.IO) {
        auth("/api/auth/register", email, password)
    }

    suspend fun favorites(token: String): List<Favorite> = withContext(Dispatchers.IO) {
        JSONArray(get("/api/me/favorites", token)).mapObjects {
            Favorite(
                id = it.getString("id"),
                type = it.getString("type"),
                region = it.getString("region"),
                targetId = it.getString("targetId"),
                label = it.getString("label")
            )
        }
    }

    suspend fun addFavorite(token: String, region: String, targetId: String, label: String): Favorite =
        withContext(Dispatchers.IO) {
            JSONObject(
                post(
                    path = "/api/me/favorites",
                    body = JSONObject()
                        .put("type", "player")
                        .put("region", region)
                        .put("targetId", targetId)
                        .put("label", label)
                        .toString(),
                    token = token
                )
            ).let {
                Favorite(
                    id = it.getString("id"),
                    type = it.getString("type"),
                    region = it.getString("region"),
                    targetId = it.getString("targetId"),
                    label = it.getString("label")
                )
            }
        }

    suspend fun scores(token: String): List<ScoreRecord> = withContext(Dispatchers.IO) {
        JSONArray(get("/api/me/scores", token)).mapObjects { it.toScoreRecord() }
    }

    suspend fun addScore(token: String, region: String, songId: String, score: Int): ScoreRecord =
        withContext(Dispatchers.IO) {
            JSONObject(
                post(
                    path = "/api/me/scores",
                    body = JSONObject()
                        .put("region", region)
                        .put("songId", songId)
                        .put("difficulty", "expert")
                        .put("clearStatus", "fc")
                        .put("score", score)
                        .put("targetScore", 1000000)
                        .put("note", "Android 端手动记录")
                        .toString(),
                    token = token
                )
            ).toScoreRecord()
        }

    private fun auth(path: String, email: String, password: String): Session {
        val response = JSONObject(
            post(
                path = path,
                body = JSONObject()
                    .put("email", email)
                    .put("password", password)
                    .toString()
            )
        )
        val user = response.getJSONObject("user")
        return Session(token = response.getString("token"), email = user.getString("email"))
    }

    private fun get(path: String, token: String? = null): String {
        val builder = Request.Builder().url("$baseUrl$path")
        if (token != null) builder.header("Authorization", "Bearer $token")
        return execute(builder.build())
    }

    private fun post(path: String, body: String, token: String? = null): String {
        val builder = Request.Builder()
            .url("$baseUrl$path")
            .post(body.toRequestBody(jsonMediaType))
            .header("Content-Type", "application/json")
        if (token != null) builder.header("Authorization", "Bearer $token")
        return execute(builder.build())
    }

    private fun execute(request: Request): String {
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) error("API 请求失败：${response.code} $body")
            return body
        }
    }
}

private fun <T> JSONArray.mapObjects(transform: (JSONObject) -> T): List<T> =
    List(length()) { index -> transform(getJSONObject(index)) }

private fun JSONObject.toEventInfo(): EventInfo =
    EventInfo(
        id = getString("id"),
        name = getString("name"),
        eventType = getString("eventType"),
        startAt = getString("startAt"),
        endAt = getString("endAt"),
        region = getString("region")
    )

private fun JSONObject.toPlayerProfile(): PlayerProfile =
    PlayerProfile(
        region = getString("region"),
        userId = getString("userId"),
        nickname = getString("nickname"),
        rank = getInt("rank"),
        comment = getString("comment")
    )

private fun JSONObject.toScoreRecord(): ScoreRecord =
    ScoreRecord(
        id = getString("id"),
        region = getString("region"),
        songId = getString("songId"),
        difficulty = getString("difficulty"),
        clearStatus = getString("clearStatus"),
        score = getInt("score"),
        targetScore = if (isNull("targetScore")) null else getInt("targetScore"),
        note = if (isNull("note")) null else getString("note")
    )
