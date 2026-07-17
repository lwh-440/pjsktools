package com.pjsktools.core.network

import com.pjsktools.api.generated.AndroidApi
import com.pjsktools.api.generated.CreateFavoriteRequest
import com.pjsktools.api.generated.EmailCodeRequest
import com.pjsktools.api.generated.FavoriteBulkPatchRequest
import com.pjsktools.api.generated.FavoriteFolderCreateRequest
import com.pjsktools.api.generated.FavoriteFolderPatchRequest
import com.pjsktools.api.generated.FavoriteFoldersPatchRequest
import com.pjsktools.api.generated.LoginRequest
import com.pjsktools.api.generated.RefreshTokenRequest
import com.pjsktools.api.generated.RegisterRequest
import com.pjsktools.api.generated.RegionId
import com.pjsktools.core.database.FavoriteEntity
import com.pjsktools.core.database.FavoriteFolderEntity
import com.pjsktools.core.database.PublicDataDao
import com.pjsktools.core.model.AccountSession
import com.pjsktools.core.model.AccountUser
import com.pjsktools.core.model.AuthRepository
import com.pjsktools.core.model.AuthState
import com.pjsktools.core.model.Favorite
import com.pjsktools.core.model.FavoriteBulkMode
import com.pjsktools.core.model.FavoriteFolder
import com.pjsktools.core.model.FavoriteRepository
import com.pjsktools.core.model.FavoriteTarget
import com.pjsktools.core.model.FavoriteType
import com.pjsktools.core.model.Region
import com.pjsktools.core.model.SessionStorage
import com.pjsktools.core.model.PlayerBindingRepository
import com.pjsktools.core.model.PlayerBindingSummary
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

internal fun com.pjsktools.api.generated.AuthResponse.domainSession(now: Long = System.currentTimeMillis()) =
    AccountSession(
        accessToken = accessToken,
        refreshToken = refreshToken,
        expiresAtMillis = now + expiresIn * 1_000L,
        user = AccountUser(user.id, user.email, user.nickname, user.avatarUrl)
    )

private fun Region.generated() = RegionId.entries.first { it.value == id }
private fun FavoriteType.generated() = CreateFavoriteRequest.Type.entries.first { it.value == apiName }

private fun com.pjsktools.api.generated.Favorite.domain() = Favorite(
    id = id,
    type = FavoriteType.fromApiName(type.value) ?: FavoriteType.CARD,
    region = Region.fromId(region.value) ?: Region.JP,
    targetId = targetId,
    label = label,
    folderIds = folderIds.toSet(),
    target = target?.let {
        FavoriteTarget(
            id = it.id,
            type = FavoriteType.fromApiName(it.type) ?: FavoriteType.CARD,
            displayName = it.displayName,
            secondaryText = it.secondaryText,
            imageCandidates = it.imageCandidates,
            available = it.available
        )
    },
    createdAt = createdAt,
    updatedAt = updatedAt,
    version = version
)

private fun com.pjsktools.api.generated.FavoriteFolder.domain() =
    FavoriteFolder(id, name, description, itemCount ?: 0, version)

private fun com.pjsktools.api.generated.PlayerBinding.domain() = PlayerBindingSummary(
    id, Region.fromId(region.value) ?: Region.JP, playerUid, displayName, isDefault, note, refreshedAt, version
)

private fun Favorite.toEntity(accountId: String): FavoriteEntity {
    val targetJson = target?.let {
        JSONObject()
            .put("id", it.id)
            .put("type", it.type.apiName)
            .put("displayName", it.displayName)
            .put("secondaryText", it.secondaryText)
            .put("imageCandidates", JSONArray(it.imageCandidates))
            .put("available", it.available)
            .toString()
    }
    return FavoriteEntity(
        accountId, id, type.apiName, region.id, targetId, label,
        JSONArray(folderIds.toList()).toString(), targetJson, createdAt, updatedAt, version
    )
}

private fun FavoriteEntity.domain(): Favorite {
    val target = targetJson?.let { value ->
        runCatching {
            val json = JSONObject(value)
            FavoriteTarget(
                id = json.getString("id"),
                type = FavoriteType.fromApiName(json.getString("type")) ?: FavoriteType.CARD,
                displayName = json.getString("displayName"),
                secondaryText = json.optString("secondaryText").takeIf(String::isNotBlank),
                imageCandidates = json.getJSONArray("imageCandidates").let { array ->
                    (0 until array.length()).map(array::getString)
                },
                available = json.optBoolean("available", true)
            )
        }.getOrNull()
    }
    val folderIds = runCatching {
        JSONArray(folderIdsJson).let { array -> (0 until array.length()).map(array::getString).toSet() }
    }.getOrDefault(emptySet())
    return Favorite(
        id, FavoriteType.fromApiName(type) ?: FavoriteType.CARD, Region.fromId(region) ?: Region.JP,
        targetId, label, folderIds, target, createdAt, updatedAt, version
    )
}

private fun FavoriteFolder.toEntity(accountId: String) =
    FavoriteFolderEntity(accountId, id, name, description, itemCount, version)

private fun FavoriteFolderEntity.domain() = FavoriteFolder(id, name, description, itemCount, version)

@Singleton
class AccountRepositoryImpl @Inject constructor(
    @RawAndroidApi private val api: AndroidApi,
    private val sessions: SessionStorage,
    private val dao: PublicDataDao
) : AuthRepository {
    override val state: Flow<AuthState> = sessions.session.map {
        if (it == null) AuthState.SignedOut else AuthState.SignedIn(it)
    }

    override suspend fun login(email: String, password: String) = runCatching {
        val response = api.login(LoginRequest(email, password))
        sessions.save(requireNotNull(response.body()) { "登录失败 (${response.code()})" }.domainSession())
    }

    override suspend fun sendRegistrationCode(email: String) = runCatching {
        val response = api.startEmailVerification(EmailCodeRequest(email))
        requireNotNull(response.body()) { "验证码发送失败 (${response.code()})" }.devCode
    }

    override suspend fun register(email: String, password: String, code: String) = runCatching {
        val response = api.register(RegisterRequest(email, password, code))
        sessions.save(requireNotNull(response.body()) { "注册失败 (${response.code()})" }.domainSession())
    }

    override suspend fun refresh() = runCatching {
        val current = requireNotNull(sessions.current()) { "尚未登录" }
        val response = api.refreshSession(RefreshTokenRequest(current.refreshToken))
        sessions.save(requireNotNull(response.body()) { "会话刷新失败 (${response.code()})" }.domainSession())
    }

    override suspend fun logout() {
        val current = sessions.current()
        if (current != null) {
            runCatching { api.logout(RefreshTokenRequest(current.refreshToken)) }
            dao.clearPrivateAccount(current.user.id)
        }
        sessions.clear()
    }
}

@Singleton
class FavoriteRepositoryImpl @Inject constructor(
    private val api: AndroidApi,
    private val sessions: SessionStorage,
    private val dao: PublicDataDao
) : FavoriteRepository {
    override val favorites: Flow<List<Favorite>> = sessions.session.flatMapLatest { session ->
        session?.let { dao.observeFavorites(it.user.id).map { rows -> rows.map(FavoriteEntity::domain) } }
            ?: flowOf(emptyList())
    }
    override val folders: Flow<List<FavoriteFolder>> = sessions.session.flatMapLatest { session ->
        session?.let { dao.observeFavoriteFolders(it.user.id).map { rows -> rows.map(FavoriteFolderEntity::domain) } }
            ?: flowOf(emptyList())
    }

    override suspend fun refresh() = runCatching {
        val account = requireNotNull(sessions.current()) { "请先登录" }.user.id
        val folders = requireNotNull(api.getFavoriteFolders().body()) { "收藏夹加载失败" }.map { it.domain() }
        val favorites = requireNotNull(api.getFavorites(pageSize = 100).body()) { "收藏加载失败" }.items.map { it.domain() }
        dao.replaceFavorites(account, favorites.map { it.toEntity(account) }, folders.map { it.toEntity(account) })
    }

    override suspend fun add(type: FavoriteType, region: Region, targetId: String, label: String?) = runCatching {
        val account = requireNotNull(sessions.current()) { "请先登录" }.user.id
        val pendingId = "pending-${type.apiName}-${region.id}-$targetId"
        val now = Instant.now().toString()
        val pending = Favorite(
            pendingId, type, region, targetId, label, emptySet(),
            FavoriteTarget(targetId, type, label ?: targetId), now, now, null
        )
        dao.upsertFavorites(listOf(pending.toEntity(account)))
        val response = api.createFavorite(
            CreateFavoriteRequest(type.generated(), region.generated(), targetId, label, emptyList()),
            "android-favorite-${UUID.randomUUID()}"
        )
        val favorite = requireNotNull(response.body()) { "收藏失败 (${response.code()})" }.domain()
        dao.deleteFavorite(account, pendingId)
        dao.upsertFavorites(listOf(favorite.toEntity(account)))
        favorite
    }.onFailure {
        sessions.current()?.user?.id?.let { account ->
            dao.deleteFavorite(account, "pending-${type.apiName}-${region.id}-$targetId")
            runCatching { refresh() }
        }
    }

    override suspend fun remove(favorite: Favorite) = runCatching {
        val account = requireNotNull(sessions.current()) { "请先登录" }.user.id
        dao.deleteFavorite(account, favorite.id)
        val response = api.deleteFavorite(favorite.id, "android-favorite-${UUID.randomUUID()}", favorite.version)
        check(response.isSuccessful) { "取消收藏失败 (${response.code()})" }
    }.onFailure {
        sessions.current()?.user?.id?.let { account ->
            dao.upsertFavorites(listOf(favorite.toEntity(account)))
        }
    }

    override suspend fun setFolders(favorite: Favorite, folderIds: Set<String>) = runCatching {
        val account = requireNotNull(sessions.current()) { "请先登录" }.user.id
        dao.upsertFavorites(listOf(favorite.copy(folderIds = folderIds).toEntity(account)))
        val response = api.updateFavoriteFolders(
            favorite.id,
            FavoriteFoldersPatchRequest(folderIds.toList()),
            "android-favorite-${UUID.randomUUID()}",
            favorite.version
        )
        val updated = requireNotNull(response.body()) { "收藏夹更新失败 (${response.code()})" }.domain()
        dao.upsertFavorites(listOf(updated.toEntity(account)))
        updated
    }.onFailure {
        sessions.current()?.user?.id?.let { account ->
            dao.upsertFavorites(listOf(favorite.toEntity(account)))
        }
    }

    override suspend fun createFolder(name: String, description: String?) = runCatching {
        val account = requireNotNull(sessions.current()) { "请先登录" }.user.id
        val response = api.createFavoriteFolder(
            FavoriteFolderCreateRequest(name, description),
            "android-folder-${UUID.randomUUID()}"
        )
        val folder = requireNotNull(response.body()) { "创建收藏夹失败 (${response.code()})" }.domain()
        dao.upsertFavoriteFolders(listOf(folder.toEntity(account)))
        folder
    }

    override suspend fun updateFolder(folder: FavoriteFolder, name: String, description: String?) = runCatching {
        val account = requireNotNull(sessions.current()) { "请先登录" }.user.id
        val response = api.updateFavoriteFolder(
            folder.id,
            FavoriteFolderPatchRequest(name, description),
            "android-folder-${UUID.randomUUID()}",
            folder.version
        )
        val updated = requireNotNull(response.body()) { "更新收藏夹失败 (${response.code()})" }.domain()
        dao.upsertFavoriteFolders(listOf(updated.toEntity(account)))
        updated
    }

    override suspend fun deleteFolder(folder: FavoriteFolder) = runCatching {
        val account = requireNotNull(sessions.current()) { "请先登录" }.user.id
        val response = api.deleteFavoriteFolder(
            folder.id,
            "android-folder-${UUID.randomUUID()}",
            folder.version
        )
        check(response.isSuccessful) { "删除收藏夹失败 (${response.code()})" }
        dao.deleteFavoriteFolder(account, folder.id)
        refresh().getOrThrow()
    }

    override suspend fun bulk(favoriteIds: Set<String>, folderIds: Set<String>, mode: FavoriteBulkMode) = runCatching {
        val generatedMode = FavoriteBulkPatchRequest.Mode.entries.first { it.value == mode.name.lowercase() }
        val response = api.bulkUpdateFavoriteFolders(
            FavoriteBulkPatchRequest(favoriteIds.toList(), folderIds.toList(), generatedMode),
            "android-favorite-${UUID.randomUUID()}"
        )
        check(response.isSuccessful) { "批量整理失败 (${response.code()})" }
        refresh().getOrThrow()
    }
}

@Singleton
class PlayerBindingRepositoryImpl @Inject constructor(
    private val api: AndroidApi,
    private val sessions: SessionStorage
) : PlayerBindingRepository {
    private val state = kotlinx.coroutines.flow.MutableStateFlow<List<PlayerBindingSummary>>(emptyList())
    override val bindings: Flow<List<PlayerBindingSummary>> = state

    override suspend fun refresh() = runCatching {
        requireNotNull(sessions.current()) { "请先登录" }
        val response = api.getPlayerBindings(1, 100)
        state.value = requireNotNull(response.body()) { "绑定 UID 加载失败 (${response.code()})" }.items.map { it.domain() }
    }

    override suspend fun create(region: Region, playerUid: String, displayName: String?, isDefault: Boolean) = runCatching {
        requireNotNull(sessions.current()) { "请先登录" }
        val response = api.createPlayerBinding(
            com.pjsktools.api.generated.PlayerBindingCreateRequest(region.generated(), playerUid, displayName, isDefault)
        )
        val binding = requireNotNull(response.body()) { "绑定 UID 失败 (${response.code()})" }.domain()
        state.value = (state.value.filterNot { it.id == binding.id } + binding).sortedByDescending { it.isDefault }
        binding
    }
}
