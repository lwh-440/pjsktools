package com.pjsktools.app.feature.account

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.modules.SerializersModule
import kotlinx.serialization.modules.contextual
import com.pjsktools.api.generated.AndroidApi
import com.pjsktools.api.generated.HarukiBindingImportRequest
import com.pjsktools.api.generated.HarukiMobileCompleteRequest
import com.pjsktools.api.generated.HarukiOAuthStartRequest
import com.pjsktools.api.generated.HarukiPublicPreviewRequest
import com.pjsktools.api.generated.HarukiSyncConfirmRequest
import com.pjsktools.api.generated.HarukiSyncSettingsRequest
import com.pjsktools.api.generated.PlayerBindingPatchRequest
import com.pjsktools.api.generated.RegionId
import okhttp3.OkHttpClient
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import okhttp3.MediaType.Companion.toMediaType
import java.math.BigDecimal
import java.net.URI
import java.util.UUID

/**
 * Account-scoped boundary for the Haruki backend contract.  The concrete implementation is
 * intentionally supplied by the generated OpenAPI layer; this UI/domain module never talks to
 * Haruki directly and never receives an OAuth token.
 */
interface HarukiConnectionGateway {
    suspend fun preview(accessToken: String, region: String, playerUid: String): HarukiPublicPreview
    suspend fun startOAuth(accessToken: String): HarukiOAuthStart
    suspend fun connection(accessToken: String): HarukiConnection?
    suspend fun importBindings(accessToken: String, bindingIds: List<String>): List<String>
    suspend fun reviewSync(accessToken: String, bindingId: String): HarukiSyncReview
    suspend fun confirmSync(accessToken: String, bindingId: String, reviewToken: String?, cards: String, groups: Map<String, String>): HarukiSyncResult
    suspend fun sync(accessToken: String, bindingId: String): HarukiSyncResult
    suspend fun updateBinding(accessToken: String, bindingId: String, isDefault: Boolean? = null, dailySync: Boolean? = null)
    suspend fun deleteBinding(accessToken: String, bindingId: String)
    suspend fun disconnect(accessToken: String)
    suspend fun completeMobileOAuth(accessToken: String, handoff: String)
}

/** Generated OpenAPI client adapter; every Haruki operation is sent to the pjsktools backend. */
class GeneratedHarukiGateway(
    baseUrl: String,
    private val client: OkHttpClient
) : HarukiConnectionGateway {
    private val baseUrl = baseUrl.trimEnd('/') + "/"
    private val json = harukiJson

    override suspend fun preview(accessToken: String, region: String, playerUid: String): HarukiPublicPreview =
        guarded("公开资料") {
        val snapshot = requireBody(api(accessToken).previewHarukiPublicSuite(HarukiPublicPreviewRequest(regionId(region), playerUid)), "公开资料").snapshot
        HarukiPublicPreview(
            region = snapshot.region.value,
            playerUid = snapshot.playerUid,
            nickname = snapshot.profile?.name,
            rank = snapshot.profile?.rank?.toInt(),
            updatedAt = snapshot.fetchedAt,
            snapshotJson = json.encodeToString(snapshot)
        )
    }

    override suspend fun startOAuth(accessToken: String): HarukiOAuthStart =
        guarded("OAuth") {
            HarukiOAuthStart(requireBody(
                api(accessToken).startHarukiOAuth(
                    HarukiOAuthStartRequest(
                        HarukiOAuthStartRequest.Client.ANDROID,
                        "https://sekai-tools.cn/auth/haruki"
                    )
                ),
                "OAuth"
            ).authorizationUrl.toString())
        }

    override suspend fun connection(accessToken: String): HarukiConnection? = guarded("OAuth") {
        val generated = api(accessToken)
        val remote = requireBody(generated.getHarukiConnection(), "OAuth")
        if (!remote.connected) return@guarded null
        val playerBindings = requireBody(generated.getPlayerBindings(1, 100), "玩家绑定").items
            .filter { it.verified == true && it.source?.value == "haruki-oauth" }
            .map {
                HarukiSourceBinding(
                    id = it.id,
                    region = it.region.value,
                    playerUid = it.playerUid,
                    displayName = it.displayName,
                    snapshotAt = it.upstreamUploadedAt,
                    lastSyncedAt = it.lastSyncSucceededAt,
                    dailySync = it.autoSyncDaily ?: false,
                    isDefault = it.isDefault,
                    status = it.lastSyncStatus?.value,
                    version = it.version
                )
            }
        connection(remote, playerBindings)
    }

    override suspend fun importBindings(accessToken: String, bindingIds: List<String>): List<String> =
        requireBody(api(accessToken).importHarukiBindings(HarukiBindingImportRequest(bindingIds), idempotencyKey())).bindings.map { it.id }

    override suspend fun reviewSync(accessToken: String, bindingId: String): HarukiSyncReview {
        val response = requireBody(api(accessToken).reviewHarukiPlayerSync(bindingId))
        if (response.noChange == true || response.review == null) return HarukiSyncReview(bindingId = bindingId, summary = "Haruki 数据没有变化")
        val groups = response.review.groups.orEmpty().map { (id, value) ->
            HarukiSyncGroup(id, "$id：传入 ${value.incomingCount} / 当前 ${value.currentCount}", if (value.emptyRequiresConfirmation) "keep" else "update")
        }
        return HarukiSyncReview(
            bindingId = bindingId,
            reviewToken = response.reviewToken,
            summary = "同步复核将在 ${response.expiresIn} 秒后过期",
            groups = groups,
            cardAction = "update"
        )
    }

    override suspend fun confirmSync(accessToken: String, bindingId: String, reviewToken: String?, cards: String, groups: Map<String, String>): HarukiSyncResult {
        val token = requireNotNull(reviewToken) { "同步复核令牌缺失" }
        val cardsMode = if (cards == "keep") HarukiSyncConfirmRequest.Cards.KEEP else HarukiSyncConfirmRequest.Cards.UPDATE
        return syncResult(bindingId, requireBody(api(accessToken).confirmHarukiPlayerSync(bindingId, HarukiSyncConfirmRequest(token, cardsMode, groups), idempotencyKey())))
    }

    override suspend fun sync(accessToken: String, bindingId: String): HarukiSyncResult =
        syncResult(bindingId, requireBody(api(accessToken).syncHarukiPlayerData(bindingId, idempotencyKey())))

    override suspend fun updateBinding(accessToken: String, bindingId: String, isDefault: Boolean?, dailySync: Boolean?) {
        val generated = api(accessToken)
        var version = currentBinding(generated, bindingId).version
        if (dailySync != null) version = requireBody(
            generated.updateHarukiSyncSettings(bindingId, HarukiSyncSettingsRequest(dailySync), idempotencyKey(), version)
        ).version
        if (isDefault != null) requireBody(generated.updatePlayerBinding(bindingId, PlayerBindingPatchRequest(isDefault = isDefault), version))
    }

    override suspend fun deleteBinding(accessToken: String, bindingId: String) {
        val generated = api(accessToken)
        requireBody(generated.deletePlayerBinding(bindingId, currentBinding(generated, bindingId).version))
    }

    override suspend fun disconnect(accessToken: String) {
        requireBody(api(accessToken).deleteHarukiConnection(idempotencyKey()))
    }

    override suspend fun completeMobileOAuth(accessToken: String, handoff: String) = guarded("OAuth") {
        requireBody(api(accessToken).completeHarukiMobileOAuth(HarukiMobileCompleteRequest(handoff)), "OAuth")
        Unit
    }

    private fun api(accessToken: String): AndroidApi = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client.newBuilder().addInterceptor { chain ->
            val request = chain.request()
            val builder = request.newBuilder().header("Authorization", "Bearer $accessToken")
            if (request.method !in setOf("GET", "HEAD") && request.header("Idempotency-Key") == null) {
                builder.header("Idempotency-Key", idempotencyKey())
            }
            chain.proceed(builder.build())
        }.build())
        .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
        .build()
        .create(AndroidApi::class.java)

    private fun regionId(value: String) = requireNotNull(RegionId.decode(value)) { "Unsupported region: $value" }

    private fun connection(value: com.pjsktools.api.generated.HarukiConnection, playerBindings: List<HarukiSourceBinding>): HarukiConnection {
        return HarukiConnection(
            status = value.status?.value ?: "active",
            connectedAt = value.createdAt,
            lastSyncedAt = value.updatedAt,
            availableBindings = value.availableBindings.map { HarukiAvailableSourceBinding(it.id, it.region.value, it.playerUid, it.displayName) },
            bindings = playerBindings
        )
    }

    private fun syncResult(bindingId: String, value: com.pjsktools.api.generated.HarukiSyncResult) =
        HarukiSyncResult(bindingId, if (value.ok) "success" else "failed", value.upstreamVersion)

    private suspend fun currentBinding(api: AndroidApi, bindingId: String) =
        requireBody(api.getPlayerBindings(1, 100), "玩家绑定").items.firstOrNull { it.id == bindingId }
            ?: throw HarukiApiException("未找到对应的 Haruki 玩家绑定，请刷新后重试。")

    private fun idempotencyKey() = UUID.randomUUID().toString()

    private suspend fun <T> guarded(kind: String, block: suspend () -> T): T = try {
        block()
    } catch (error: HarukiApiException) {
        throw error
    } catch (error: SerializationException) {
        throw HarukiApiException("Haruki $kind 数据解析失败，请稍后重试。", error)
    } catch (error: HttpException) {
        throw categorized(error.code(), kind, error)
    }

    private fun <T> requireBody(response: retrofit2.Response<T>, kind: String = "数据"): T {
        if (!response.isSuccessful) throw categorized(response.code(), kind, HttpException(response))
        return response.body() ?: throw HarukiApiException("Haruki $kind 数据解析失败：响应为空。")
    }

    private fun categorized(code: Int, kind: String, cause: Throwable) = HarukiApiException(
        when {
            code == 403 -> "Haruki 授权已失效或权限不足，请重新连接。"
            code == 404 && kind == "公开资料" -> "未找到该区服/UID 的 Haruki 公开资料。"
            code == 404 -> "未找到 Haruki 连接或玩家绑定，请刷新后重试。"
            code == 429 -> "Haruki 请求过于频繁，请稍后再试。"
            code in 500..599 -> "pjsktools 暂时无法访问 Haruki，请稍后再试。"
            else -> "Haruki $kind 请求失败（HTTP $code）。"
        },
        cause
    )
}

class HarukiApiException(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

@Serializable data class HarukiPublicPreview(
    val region: String,
    val playerUid: String,
    val nickname: String? = null,
    val rank: Int? = null,
    val updatedAt: String? = null,
    val snapshotJson: String
)
data class HarukiOAuthStart(val authorizationUrl: String)
data class HarukiConnection(
    val status: String,
    val connectedAt: String? = null,
    val lastSyncedAt: String? = null,
    val availableBindings: List<HarukiAvailableSourceBinding> = emptyList(),
    val bindings: List<HarukiSourceBinding> = emptyList()
)
data class HarukiAvailableSourceBinding(val id: String, val region: String, val playerUid: String, val displayName: String? = null)
data class HarukiSourceBinding(
    val id: String,
    val region: String,
    val playerUid: String,
    val displayName: String? = null,
    val snapshotAt: String? = null,
    val lastSyncedAt: String? = null,
    val dailySync: Boolean = false,
    val isDefault: Boolean = false,
    val status: String? = null,
    val version: String? = null
)
data class HarukiSyncGroup(val id: String, val label: String, val action: String)
data class HarukiSyncReview(
    val bindingId: String,
    val reviewToken: String? = null,
    val summary: String,
    val groups: List<HarukiSyncGroup> = emptyList(),
    val cardAction: String? = null
)
data class HarukiSyncResult(val bindingId: String, val status: String, val syncedAt: String? = null)

data class HarukiUiState(
    val preview: HarukiPublicPreview? = null,
    val previewRegion: String = "jp",
    val previewUid: String = "",
    val connection: HarukiConnection? = null,
    val selectedSourceBindingIds: Set<String> = emptySet(),
    val pendingReview: HarukiSyncReview? = null
)

@Entity(tableName = "haruki_public_previews", primaryKeys = ["userId", "region", "playerUid"])
data class HarukiPreviewEntity(val userId: String, val region: String, val playerUid: String, val payload: String)

@Dao
interface HarukiPreviewDao {
    @Query("SELECT payload FROM haruki_public_previews WHERE userId = :userId AND region = :region AND playerUid = :playerUid")
    suspend fun payloadFor(userId: String, region: String, playerUid: String): String?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: HarukiPreviewEntity)

    @Query("DELETE FROM haruki_public_previews WHERE userId = :userId AND region = :region AND playerUid = :playerUid")
    suspend fun delete(userId: String, region: String, playerUid: String)

    @Query("DELETE FROM haruki_public_previews WHERE userId = :userId")
    suspend fun deleteAllForUser(userId: String)
}

@Database(entities = [HarukiPreviewEntity::class], version = 2, exportSchema = false)
abstract class HarukiPreviewDatabase : RoomDatabase() { abstract fun previews(): HarukiPreviewDao }

/** An app-private Room cache scoped to one signed-in pjsktools user. */
class HarukiPreviewCache(context: Context) {
    private val dao = Room.databaseBuilder(context.applicationContext, HarukiPreviewDatabase::class.java, "haruki-preview.db")
        .fallbackToDestructiveMigration()
        .build()
        .previews()
    private val json = harukiJson

    suspend fun load(userId: String, region: String, playerUid: String): HarukiPublicPreview? = withContext(Dispatchers.IO) { dao.payloadFor(userId, region, playerUid) }?.let {
        runCatching { json.decodeFromString<HarukiPublicPreview>(it) }.getOrNull()
    }

    suspend fun save(userId: String, preview: HarukiPublicPreview) = withContext(Dispatchers.IO) {
        dao.upsert(HarukiPreviewEntity(userId, preview.region, preview.playerUid, json.encodeToString(preview)))
    }

    suspend fun clear(userId: String, region: String, playerUid: String) = withContext(Dispatchers.IO) { dao.delete(userId, region, playerUid) }
    suspend fun clearAllForUser(userId: String) = withContext(Dispatchers.IO) { dao.deleteAllForUser(userId) }
}

private val harukiJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    serializersModule = SerializersModule {
        contextual(Any::class, JsonElementAsAnySerializer)
        contextual(BigDecimal::class, BigDecimalJsonSerializer)
        contextual(URI::class, UriJsonSerializer)
    }
}

private object JsonElementAsAnySerializer : KSerializer<Any> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("HarukiJsonElement", PrimitiveKind.STRING)
    override fun deserialize(decoder: Decoder): Any = (decoder as JsonDecoder).decodeJsonElement()
    override fun serialize(encoder: Encoder, value: Any) {
        (encoder as JsonEncoder).encodeJsonElement(value as? JsonElement ?: JsonPrimitive(value.toString()))
    }
}

private object BigDecimalJsonSerializer : KSerializer<BigDecimal> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("HarukiBigDecimal", PrimitiveKind.STRING)
    override fun deserialize(decoder: Decoder): BigDecimal = BigDecimal(decoder.decodeString())
    override fun serialize(encoder: Encoder, value: BigDecimal) = encoder.encodeString(value.toPlainString())
}

private object UriJsonSerializer : KSerializer<URI> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("HarukiUri", PrimitiveKind.STRING)
    override fun deserialize(decoder: Decoder): URI = URI(decoder.decodeString())
    override fun serialize(encoder: Encoder, value: URI) = encoder.encodeString(value.toString())
}
