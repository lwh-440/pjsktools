package com.pjsktools.core.model

import kotlinx.coroutines.flow.Flow

data class AccountUser(
    val id: String,
    val email: String?,
    val nickname: String? = null,
    val avatarUrl: String? = null
)

data class AccountSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtMillis: Long,
    val user: AccountUser
)

sealed interface AuthState {
    data object Loading : AuthState
    data object SignedOut : AuthState
    data class SignedIn(val session: AccountSession) : AuthState
}

interface SessionStorage {
    val session: Flow<AccountSession?>
    suspend fun current(): AccountSession?
    suspend fun save(session: AccountSession)
    suspend fun clear()
}

interface AuthRepository {
    val state: Flow<AuthState>
    suspend fun login(email: String, password: String): Result<Unit>
    suspend fun sendRegistrationCode(email: String): Result<VerificationCodeDelivery>
    suspend fun register(email: String, password: String, code: String): Result<Unit>
    suspend fun refresh(): Result<Unit>
    suspend fun logout()
}

data class VerificationCodeDelivery(
    val sent: Boolean,
    val expiresInSeconds: Int,
    val resendAfterSeconds: Int,
    val developmentCode: String? = null
)

data class PlayerBindingSummary(
    val id: String, val region: Region, val playerUid: String, val displayName: String? = null,
    val isDefault: Boolean = false, val note: String? = null, val refreshedAt: String? = null, val version: String? = null
)

interface PlayerBindingRepository {
    val bindings: Flow<List<PlayerBindingSummary>>
    suspend fun refresh(): Result<Unit>
}

enum class FavoriteType(val apiName: String) {
    PLAYER("player"), EVENT("event"), SONG("song"), CARD("card"), GACHA("gacha"),
    HONOR("honor"), MATERIAL("material"), COSTUME("costume"), STAMP("stamp"), COMIC("comic");

    companion object {
        fun fromApiName(value: String) = entries.firstOrNull { it.apiName == value }
    }
}

data class FavoriteTarget(
    val id: String,
    val type: FavoriteType,
    val displayName: String,
    val secondaryText: String? = null,
    val imageCandidates: List<String> = emptyList(),
    val available: Boolean = true
)

data class Favorite(
    val id: String,
    val type: FavoriteType,
    val region: Region,
    val targetId: String,
    val label: String?,
    val folderIds: Set<String>,
    val target: FavoriteTarget?,
    val createdAt: String,
    val updatedAt: String,
    val version: String?
)

data class FavoriteFolder(
    val id: String,
    val name: String,
    val description: String? = null,
    val itemCount: Int = 0,
    val version: String? = null
)

data class FavoriteQuery(
    val folderId: String? = null,
    val unfiled: Boolean = false,
    val type: FavoriteType? = null,
    val region: Region? = null,
    val text: String = ""
)

enum class FavoriteBulkMode { ADD, REMOVE, REPLACE }

interface FavoriteRepository {
    val favorites: Flow<List<Favorite>>
    val folders: Flow<List<FavoriteFolder>>
    suspend fun refresh(): Result<Unit>
    suspend fun add(type: FavoriteType, region: Region, targetId: String, label: String? = null): Result<Favorite>
    suspend fun remove(favorite: Favorite): Result<Unit>
    suspend fun setFolders(favorite: Favorite, folderIds: Set<String>): Result<Favorite>
    suspend fun createFolder(name: String, description: String? = null): Result<FavoriteFolder>
    suspend fun updateFolder(folder: FavoriteFolder, name: String, description: String?): Result<FavoriteFolder>
    suspend fun deleteFolder(folder: FavoriteFolder): Result<Unit>
    suspend fun bulk(favoriteIds: Set<String>, folderIds: Set<String>, mode: FavoriteBulkMode): Result<Unit>
}

data class CatalogItemFacet(val key: String, val values: Set<String>)
data class CatalogFilterOption(
    val value: String,
    val label: String,
    val count: Int,
    val iconKey: String? = null,
    val iconCandidates: List<String> = emptyList(),
    val color: String? = null
)
data class CatalogFilterGroup(
    val key: String,
    val label: String,
    val matchAll: Boolean,
    val options: List<CatalogFilterOption>
)
data class CatalogFilterToggle(val key: String, val label: String, val value: Boolean)
data class CatalogFilterMeta(
    val groups: List<CatalogFilterGroup> = emptyList(),
    val toggles: List<CatalogFilterToggle> = emptyList()
)
data class CatalogFilterState(
    val selected: Map<String, Set<String>> = emptyMap(),
    val toggles: Map<String, Boolean> = emptyMap()
) {
    val activeCount: Int get() = selected.values.sumOf { it.size } + toggles.values.count { it }
}
