package com.pjsktools.api.generated

import com.pjsktools.api.generated.infrastructure.CollectionFormats.*
import retrofit2.http.*
import retrofit2.Response
import okhttp3.RequestBody
import okhttp3.ResponseBody
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

import com.pjsktools.api.generated.AccountDeletionConfirmRequest
import com.pjsktools.api.generated.AccountDeletionIntentRequest
import com.pjsktools.api.generated.AccountDeletionIntentResponse
import com.pjsktools.api.generated.ApiError
import com.pjsktools.api.generated.AssetConfig
import com.pjsktools.api.generated.AuthResponse
import com.pjsktools.api.generated.CardDetail
import com.pjsktools.api.generated.CardPage
import com.pjsktools.api.generated.ChartDetail
import com.pjsktools.api.generated.ComicDetail
import com.pjsktools.api.generated.ComicPage
import com.pjsktools.api.generated.CostumeDetail
import com.pjsktools.api.generated.CostumePage
import com.pjsktools.api.generated.CreateFavoriteRequest
import com.pjsktools.api.generated.EmailCodeRequest
import com.pjsktools.api.generated.EmailCodeResponse
import com.pjsktools.api.generated.EventFullDetail
import com.pjsktools.api.generated.EventPage
import com.pjsktools.api.generated.EventPointEstimateRequest
import com.pjsktools.api.generated.EventPointEstimateResult
import com.pjsktools.api.generated.EventSummary
import com.pjsktools.api.generated.Favorite
import com.pjsktools.api.generated.FavoriteBulkPatchRequest
import com.pjsktools.api.generated.FavoriteFolder
import com.pjsktools.api.generated.FavoriteFolderCreateRequest
import com.pjsktools.api.generated.FavoriteFolderPatchRequest
import com.pjsktools.api.generated.FavoriteFoldersPatchRequest
import com.pjsktools.api.generated.FavoritePage
import com.pjsktools.api.generated.Forecast
import com.pjsktools.api.generated.GachaDetail
import com.pjsktools.api.generated.GachaPage
import com.pjsktools.api.generated.GetRankingChurn200Response
import com.pjsktools.api.generated.HarukiBindingImportRequest
import com.pjsktools.api.generated.HarukiBindingImportResponse
import com.pjsktools.api.generated.HarukiConnection
import com.pjsktools.api.generated.HarukiDisconnectResponse
import com.pjsktools.api.generated.HarukiMobileCompleteRequest
import com.pjsktools.api.generated.HarukiOAuthStartRequest
import com.pjsktools.api.generated.HarukiOAuthStartResponse
import com.pjsktools.api.generated.HarukiPublicPreviewRequest
import com.pjsktools.api.generated.HarukiPublicPreviewResponse
import com.pjsktools.api.generated.HarukiSyncConfirmRequest
import com.pjsktools.api.generated.HarukiSyncResult
import com.pjsktools.api.generated.HarukiSyncReviewResponse
import com.pjsktools.api.generated.HarukiSyncSettingsRequest
import com.pjsktools.api.generated.HonorDetail
import com.pjsktools.api.generated.HonorPage
import com.pjsktools.api.generated.LegalAcceptanceRequest
import com.pjsktools.api.generated.LiveRanking
import com.pjsktools.api.generated.LoginRequest
import com.pjsktools.api.generated.MaterialDetail
import com.pjsktools.api.generated.MaterialPage
import com.pjsktools.api.generated.OkResponse
import com.pjsktools.api.generated.PlayerBinding
import com.pjsktools.api.generated.PlayerBindingPage
import com.pjsktools.api.generated.PlayerBindingPatchRequest
import com.pjsktools.api.generated.PlayerProfile
import com.pjsktools.api.generated.QqAccountDeletionExchangeRequest
import com.pjsktools.api.generated.QqAccountDeletionStartResponse
import com.pjsktools.api.generated.QqWebHandoffRequest
import com.pjsktools.api.generated.RankingEntryPage
import com.pjsktools.api.generated.RankingHistory
import com.pjsktools.api.generated.RankingHistorySummary
import com.pjsktools.api.generated.RankingPlayerDetail
import com.pjsktools.api.generated.RefreshTokenRequest
import com.pjsktools.api.generated.Region
import com.pjsktools.api.generated.RegionId
import com.pjsktools.api.generated.RegisterRequest
import com.pjsktools.api.generated.RuntimeStatus
import com.pjsktools.api.generated.ScoreControlRequest
import com.pjsktools.api.generated.ScoreControlResult
import com.pjsktools.api.generated.SongDetail
import com.pjsktools.api.generated.SongPage
import com.pjsktools.api.generated.StampDetail
import com.pjsktools.api.generated.StampPage
import com.pjsktools.api.generated.WebAuthResponse

interface AndroidApi {
    /**
     * POST api/me/legal-acceptances
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param legalAcceptanceRequest
     * @return [kotlin.Any]
     */
    @POST("api/me/legal-acceptances")
    suspend fun acceptCurrentLegalDocuments(@Body legalAcceptanceRequest: LegalAcceptanceRequest): Response<kotlin.Any>

    /**
     * PATCH api/me/favorites/bulk
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param favoriteBulkPatchRequest
     * @param idempotencyKey  (optional)
     * @return [kotlin.collections.List<Favorite>]
     */
    @PATCH("api/me/favorites/bulk")
    suspend fun bulkUpdateFavoriteFolders(@Body favoriteBulkPatchRequest: FavoriteBulkPatchRequest, @Header("Idempotency-Key") idempotencyKey: kotlin.String? = null): Response<kotlin.collections.List<Favorite>>

    /**
     * POST api/me/tools/score-control
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param scoreControlRequest
     * @return [ScoreControlResult]
     */
    @POST("api/me/tools/score-control")
    suspend fun calculateBoundScoreControl(@Body scoreControlRequest: ScoreControlRequest): Response<ScoreControlResult>

    /**
     * POST api/tools/score-control
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param scoreControlRequest
     * @return [ScoreControlResult]
     */
    @POST("api/tools/score-control")
    suspend fun calculateScoreControl(@Body scoreControlRequest: ScoreControlRequest): Response<ScoreControlResult>

    /**
     * POST api/me/haruki/oauth/mobile/complete
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param harukiMobileCompleteRequest
     * @return [HarukiConnection]
     */
    @POST("api/me/haruki/oauth/mobile/complete")
    suspend fun completeHarukiMobileOAuth(@Body harukiMobileCompleteRequest: HarukiMobileCompleteRequest): Response<HarukiConnection>

    /**
     * POST api/me/account-deletion/confirm
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param accountDeletionConfirmRequest
     * @return [OkResponse]
     */
    @POST("api/me/account-deletion/confirm")
    suspend fun confirmAccountDeletion(@Body accountDeletionConfirmRequest: AccountDeletionConfirmRequest): Response<OkResponse>

    /**
     * POST api/me/player-bindings/{id}/sync/confirm
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param id
     * @param harukiSyncConfirmRequest
     * @param idempotencyKey  (optional)
     * @return [HarukiSyncResult]
     */
    @POST("api/me/player-bindings/{id}/sync/confirm")
    suspend fun confirmHarukiPlayerSync(@Path("id") id: kotlin.String, @Body harukiSyncConfirmRequest: HarukiSyncConfirmRequest, @Header("Idempotency-Key") idempotencyKey: kotlin.String? = null): Response<HarukiSyncResult>

    /**
     * POST api/me/account-deletion/intent
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param accountDeletionIntentRequest
     * @return [kotlin.Any]
     */
    @POST("api/me/account-deletion/intent")
    suspend fun createAccountDeletionIntent(@Body accountDeletionIntentRequest: AccountDeletionIntentRequest): Response<kotlin.Any>

    /**
     * POST api/me/favorites
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param createFavoriteRequest
     * @param idempotencyKey  (optional)
     * @return [Favorite]
     */
    @POST("api/me/favorites")
    suspend fun createFavorite(@Body createFavoriteRequest: CreateFavoriteRequest, @Header("Idempotency-Key") idempotencyKey: kotlin.String? = null): Response<Favorite>

    /**
     * POST api/me/favorite-folders
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param favoriteFolderCreateRequest
     * @param idempotencyKey  (optional)
     * @return [FavoriteFolder]
     */
    @POST("api/me/favorite-folders")
    suspend fun createFavoriteFolder(@Body favoriteFolderCreateRequest: FavoriteFolderCreateRequest, @Header("Idempotency-Key") idempotencyKey: kotlin.String? = null): Response<FavoriteFolder>

    /**
     * DELETE api/me/favorites/{id}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param id
     * @param idempotencyKey  (optional)
     * @param ifMatch  (optional)
     * @return [OkResponse]
     */
    @DELETE("api/me/favorites/{id}")
    suspend fun deleteFavorite(@Path("id") id: kotlin.String, @Header("Idempotency-Key") idempotencyKey: kotlin.String? = null, @Header("If-Match") ifMatch: kotlin.String? = null): Response<OkResponse>

    /**
     * DELETE api/me/favorite-folders/{id}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param id
     * @param idempotencyKey  (optional)
     * @param ifMatch  (optional)
     * @return [OkResponse]
     */
    @DELETE("api/me/favorite-folders/{id}")
    suspend fun deleteFavoriteFolder(@Path("id") id: kotlin.String, @Header("Idempotency-Key") idempotencyKey: kotlin.String? = null, @Header("If-Match") ifMatch: kotlin.String? = null): Response<OkResponse>

    /**
     * DELETE api/me/haruki/connection
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param idempotencyKey  (optional)
     * @return [HarukiDisconnectResponse]
     */
    @DELETE("api/me/haruki/connection")
    suspend fun deleteHarukiConnection(@Header("Idempotency-Key") idempotencyKey: kotlin.String? = null): Response<HarukiDisconnectResponse>

    /**
     * DELETE api/me/account
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @return [OkResponse]
     */
    @DELETE("api/me/account")
    suspend fun deleteMyAccount(): Response<OkResponse>

    /**
     * DELETE api/me/player-bindings/{id}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param id
     * @param ifMatch  (optional)
     * @return [OkResponse]
     */
    @DELETE("api/me/player-bindings/{id}")
    suspend fun deletePlayerBinding(@Path("id") id: kotlin.String, @Header("If-Match") ifMatch: kotlin.String? = null): Response<OkResponse>

    /**
     * POST api/me/tools/event-point-calc
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param eventPointEstimateRequest
     * @return [EventPointEstimateResult]
     */
    @POST("api/me/tools/event-point-calc")
    suspend fun estimateBoundEventPoint(@Body eventPointEstimateRequest: EventPointEstimateRequest): Response<EventPointEstimateResult>

    /**
     * POST api/tools/event-point-calc
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param eventPointEstimateRequest
     * @return [EventPointEstimateResult]
     */
    @POST("api/tools/event-point-calc")
    suspend fun estimateEventPoint(@Body eventPointEstimateRequest: EventPointEstimateRequest): Response<EventPointEstimateResult>

    /**
     * POST api/me/account-deletion/qq/exchange
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param qqAccountDeletionExchangeRequest
     * @return [AccountDeletionIntentResponse]
     */
    @POST("api/me/account-deletion/qq/exchange")
    suspend fun exchangeQqAccountDeletion(@Body qqAccountDeletionExchangeRequest: QqAccountDeletionExchangeRequest): Response<AccountDeletionIntentResponse>

    /**
     * POST api/auth/qq/web-exchange
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param qqWebHandoffRequest
     * @return [WebAuthResponse]
     */
    @POST("api/auth/qq/web-exchange")
    suspend fun exchangeQqWebHandoff(@Body qqWebHandoffRequest: QqWebHandoffRequest): Response<WebAuthResponse>

    /**
     * GET api/me/export
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @return [kotlin.Any]
     */
    @GET("api/me/export")
    suspend fun exportMyData(): Response<kotlin.Any>

    /**
     * GET api/assets/{region}/config
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @return [AssetConfig]
     */
    @GET("api/assets/{region}/config")
    suspend fun getAssetConfig(@Path("region") region: RegionId): Response<AssetConfig>


    /**
    * enum for parameter sort
    */
    enum class SortGetCardCatalog(val value: kotlin.String) {
        @SerialName(value = "id-asc") ID_MINUS_ASC("id-asc"),
        @SerialName(value = "id-desc") ID_MINUS_DESC("id-desc"),
        @SerialName(value = "name-asc") NAME_MINUS_ASC("name-asc"),
        @SerialName(value = "name-desc") NAME_MINUS_DESC("name-desc"),
        @SerialName(value = "start-asc") START_MINUS_ASC("start-asc"),
        @SerialName(value = "start-desc") START_MINUS_DESC("start-desc")
    }

    /**
     * GET api/master/{region}/catalogs/cards
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param page  (optional, default to 1)
     * @param pageSize  (optional, default to 24)
     * @param q  (optional)
     * @param sort  (optional)
     * @param characterId  (optional)
     * @param attribute  (optional)
     * @param rarity  (optional)
     * @param unit  (optional)
     * @param characterIds  (optional)
     * @param units  (optional)
     * @param supportUnits  (optional)
     * @param attributes  (optional)
     * @param rarities  (optional)
     * @param supplyTypes  (optional)
     * @param skillTypes  (optional)
     * @return [CardPage]
     */
    @GET("api/master/{region}/catalogs/cards")
    suspend fun getCardCatalog(@Path("region") region: RegionId, @Query("page") page: kotlin.Int? = 1, @Query("pageSize") pageSize: kotlin.Int? = 24, @Query("q") q: kotlin.String? = null, @Query("sort") sort: SortGetCardCatalog? = null, @Query("characterId") characterId: kotlin.Int? = null, @Query("attribute") attribute: kotlin.String? = null, @Query("rarity") rarity: kotlin.String? = null, @Query("unit") unit: kotlin.String? = null, @Query("characterIds") characterIds: @JvmSuppressWildcards kotlin.collections.List<kotlin.Int>? = null, @Query("units") units: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("supportUnits") supportUnits: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("attributes") attributes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("rarities") rarities: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("supplyTypes") supplyTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("skillTypes") skillTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null): Response<CardPage>

    /**
     * GET api/master/{region}/cards/{cardId}/full
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param cardId
     * @return [CardDetail]
     */
    @GET("api/master/{region}/cards/{cardId}/full")
    suspend fun getCardDetail(@Path("region") region: RegionId, @Path("cardId") cardId: kotlin.String): Response<CardDetail>


    /**
    * enum for parameter sort
    */
    enum class SortGetComicCatalog(val value: kotlin.String) {
        @SerialName(value = "id-asc") ID_MINUS_ASC("id-asc"),
        @SerialName(value = "id-desc") ID_MINUS_DESC("id-desc"),
        @SerialName(value = "name-asc") NAME_MINUS_ASC("name-asc"),
        @SerialName(value = "name-desc") NAME_MINUS_DESC("name-desc"),
        @SerialName(value = "start-asc") START_MINUS_ASC("start-asc"),
        @SerialName(value = "start-desc") START_MINUS_DESC("start-desc")
    }

    /**
     * GET api/master/{region}/catalogs/comics
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param page  (optional, default to 1)
     * @param pageSize  (optional, default to 24)
     * @param q  (optional)
     * @param sort  (optional)
     * @param category  (optional)
     * @param rarity  (optional)
     * @param characterId  (optional)
     * @param partType  (optional)
     * @param source  (optional)
     * @param gender  (optional)
     * @param gachaTypes  (optional)
     * @param characterIds  (optional)
     * @param units  (optional)
     * @param honorTypes  (optional)
     * @param rarities  (optional)
     * @param materialTypes  (optional)
     * @param partTypes  (optional)
     * @param sources  (optional)
     * @param genders  (optional)
     * @param stampTypes  (optional)
     * @param comicTypes  (optional)
     * @param groupOnce  (optional)
     * @param usableOnly  (optional)
     * @param relatedOnly  (optional)
     * @return [ComicPage]
     */
    @GET("api/master/{region}/catalogs/comics")
    suspend fun getComicCatalog(@Path("region") region: RegionId, @Query("page") page: kotlin.Int? = 1, @Query("pageSize") pageSize: kotlin.Int? = 24, @Query("q") q: kotlin.String? = null, @Query("sort") sort: SortGetComicCatalog? = null, @Query("category") category: kotlin.String? = null, @Query("rarity") rarity: kotlin.String? = null, @Query("characterId") characterId: kotlin.Int? = null, @Query("partType") partType: kotlin.String? = null, @Query("source") source: kotlin.String? = null, @Query("gender") gender: kotlin.String? = null, @Query("gachaTypes") gachaTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("characterIds") characterIds: @JvmSuppressWildcards kotlin.collections.List<kotlin.Int>? = null, @Query("units") units: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("honorTypes") honorTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("rarities") rarities: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("materialTypes") materialTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("partTypes") partTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("sources") sources: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("genders") genders: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("stampTypes") stampTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("comicTypes") comicTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("groupOnce") groupOnce: kotlin.Boolean? = null, @Query("usableOnly") usableOnly: kotlin.Boolean? = null, @Query("relatedOnly") relatedOnly: kotlin.Boolean? = null): Response<ComicPage>

    /**
     * GET api/master/{region}/catalogs/comics/{itemId}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param itemId
     * @return [ComicDetail]
     */
    @GET("api/master/{region}/catalogs/comics/{itemId}")
    suspend fun getComicCatalogItem(@Path("region") region: RegionId, @Path("itemId") itemId: kotlin.String): Response<ComicDetail>


    /**
    * enum for parameter sort
    */
    enum class SortGetCostumeCatalog(val value: kotlin.String) {
        @SerialName(value = "id-asc") ID_MINUS_ASC("id-asc"),
        @SerialName(value = "id-desc") ID_MINUS_DESC("id-desc"),
        @SerialName(value = "name-asc") NAME_MINUS_ASC("name-asc"),
        @SerialName(value = "name-desc") NAME_MINUS_DESC("name-desc"),
        @SerialName(value = "start-asc") START_MINUS_ASC("start-asc"),
        @SerialName(value = "start-desc") START_MINUS_DESC("start-desc")
    }

    /**
     * GET api/master/{region}/catalogs/costumes
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param page  (optional, default to 1)
     * @param pageSize  (optional, default to 24)
     * @param q  (optional)
     * @param sort  (optional)
     * @param category  (optional)
     * @param rarity  (optional)
     * @param characterId  (optional)
     * @param partType  (optional)
     * @param source  (optional)
     * @param gender  (optional)
     * @param gachaTypes  (optional)
     * @param characterIds  (optional)
     * @param units  (optional)
     * @param honorTypes  (optional)
     * @param rarities  (optional)
     * @param materialTypes  (optional)
     * @param partTypes  (optional)
     * @param sources  (optional)
     * @param genders  (optional)
     * @param stampTypes  (optional)
     * @param comicTypes  (optional)
     * @param groupOnce  (optional)
     * @param usableOnly  (optional)
     * @param relatedOnly  (optional)
     * @return [CostumePage]
     */
    @GET("api/master/{region}/catalogs/costumes")
    suspend fun getCostumeCatalog(@Path("region") region: RegionId, @Query("page") page: kotlin.Int? = 1, @Query("pageSize") pageSize: kotlin.Int? = 24, @Query("q") q: kotlin.String? = null, @Query("sort") sort: SortGetCostumeCatalog? = null, @Query("category") category: kotlin.String? = null, @Query("rarity") rarity: kotlin.String? = null, @Query("characterId") characterId: kotlin.Int? = null, @Query("partType") partType: kotlin.String? = null, @Query("source") source: kotlin.String? = null, @Query("gender") gender: kotlin.String? = null, @Query("gachaTypes") gachaTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("characterIds") characterIds: @JvmSuppressWildcards kotlin.collections.List<kotlin.Int>? = null, @Query("units") units: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("honorTypes") honorTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("rarities") rarities: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("materialTypes") materialTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("partTypes") partTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("sources") sources: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("genders") genders: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("stampTypes") stampTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("comicTypes") comicTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("groupOnce") groupOnce: kotlin.Boolean? = null, @Query("usableOnly") usableOnly: kotlin.Boolean? = null, @Query("relatedOnly") relatedOnly: kotlin.Boolean? = null): Response<CostumePage>

    /**
     * GET api/master/{region}/catalogs/costumes/{itemId}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param itemId
     * @return [CostumeDetail]
     */
    @GET("api/master/{region}/catalogs/costumes/{itemId}")
    suspend fun getCostumeCatalogItem(@Path("region") region: RegionId, @Path("itemId") itemId: kotlin.String): Response<CostumeDetail>

    /**
     * GET api/events/{region}/current
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @return [EventSummary]
     */
    @GET("api/events/{region}/current")
    suspend fun getCurrentEvent(@Path("region") region: RegionId): Response<EventSummary>

    /**
     * GET api/legal/current
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @return [kotlin.Any]
     */
    @GET("api/legal/current")
    suspend fun getCurrentLegalDocuments(): Response<kotlin.Any>


    /**
    * enum for parameter sort
    */
    enum class SortGetEventCatalog(val value: kotlin.String) {
        @SerialName(value = "id-asc") ID_MINUS_ASC("id-asc"),
        @SerialName(value = "id-desc") ID_MINUS_DESC("id-desc"),
        @SerialName(value = "name-asc") NAME_MINUS_ASC("name-asc"),
        @SerialName(value = "name-desc") NAME_MINUS_DESC("name-desc"),
        @SerialName(value = "start-asc") START_MINUS_ASC("start-asc"),
        @SerialName(value = "start-desc") START_MINUS_DESC("start-desc")
    }

    /**
     * GET api/master/{region}/catalogs/events
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param page  (optional, default to 1)
     * @param pageSize  (optional, default to 24)
     * @param q  (optional)
     * @param sort  (optional)
     * @param eventTypes  (optional)
     * @param eventUnits  (optional)
     * @param bonusCharacterIds  (optional)
     * @param bannerCharacterIds  (optional)
     * @param bonusAttributes  (optional)
     * @return [EventPage]
     */
    @GET("api/master/{region}/catalogs/events")
    suspend fun getEventCatalog(@Path("region") region: RegionId, @Query("page") page: kotlin.Int? = 1, @Query("pageSize") pageSize: kotlin.Int? = 24, @Query("q") q: kotlin.String? = null, @Query("sort") sort: SortGetEventCatalog? = null, @Query("eventTypes") eventTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("eventUnits") eventUnits: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("bonusCharacterIds") bonusCharacterIds: @JvmSuppressWildcards kotlin.collections.List<kotlin.Int>? = null, @Query("bannerCharacterIds") bannerCharacterIds: @JvmSuppressWildcards kotlin.collections.List<kotlin.Int>? = null, @Query("bonusAttributes") bonusAttributes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null): Response<EventPage>

    /**
     * GET api/events/{region}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @return [kotlin.collections.List<EventSummary>]
     */
    @GET("api/events/{region}")
    suspend fun getEvents(@Path("region") region: RegionId): Response<kotlin.collections.List<EventSummary>>

    /**
     * GET api/me/favorite-folders
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @return [kotlin.collections.List<FavoriteFolder>]
     */
    @GET("api/me/favorite-folders")
    suspend fun getFavoriteFolders(): Response<kotlin.collections.List<FavoriteFolder>>

    /**
     * GET api/me/favorites
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param folderId  (optional)
     * @param unfiled  (optional)
     * @param type  (optional)
     * @param region  (optional)
     * @param q  (optional)
     * @param page  (optional)
     * @param pageSize  (optional)
     * @return [FavoritePage]
     */
    @GET("api/me/favorites")
    suspend fun getFavorites(@Query("folderId") folderId: kotlin.String? = null, @Query("unfiled") unfiled: kotlin.Boolean? = null, @Query("type") type: kotlin.String? = null, @Query("region") region: RegionId? = null, @Query("q") q: kotlin.String? = null, @Query("page") page: kotlin.Int? = null, @Query("pageSize") pageSize: kotlin.Int? = null): Response<FavoritePage>

    /**
     * GET api/master/{region}/events/{eventId}/full
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param eventId
     * @return [EventFullDetail]
     */
    @GET("api/master/{region}/events/{eventId}/full")
    suspend fun getFullEventDetail(@Path("region") region: RegionId, @Path("eventId") eventId: kotlin.String): Response<EventFullDetail>


    /**
    * enum for parameter sort
    */
    enum class SortGetGachaCatalog(val value: kotlin.String) {
        @SerialName(value = "id-asc") ID_MINUS_ASC("id-asc"),
        @SerialName(value = "id-desc") ID_MINUS_DESC("id-desc"),
        @SerialName(value = "name-asc") NAME_MINUS_ASC("name-asc"),
        @SerialName(value = "name-desc") NAME_MINUS_DESC("name-desc"),
        @SerialName(value = "start-asc") START_MINUS_ASC("start-asc"),
        @SerialName(value = "start-desc") START_MINUS_DESC("start-desc")
    }

    /**
     * GET api/master/{region}/catalogs/gachas
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param page  (optional, default to 1)
     * @param pageSize  (optional, default to 24)
     * @param q  (optional)
     * @param sort  (optional)
     * @param category  (optional)
     * @param rarity  (optional)
     * @param characterId  (optional)
     * @param partType  (optional)
     * @param source  (optional)
     * @param gender  (optional)
     * @param gachaTypes  (optional)
     * @param characterIds  (optional)
     * @param units  (optional)
     * @param honorTypes  (optional)
     * @param rarities  (optional)
     * @param materialTypes  (optional)
     * @param partTypes  (optional)
     * @param sources  (optional)
     * @param genders  (optional)
     * @param stampTypes  (optional)
     * @param comicTypes  (optional)
     * @param groupOnce  (optional)
     * @param usableOnly  (optional)
     * @param relatedOnly  (optional)
     * @return [GachaPage]
     */
    @GET("api/master/{region}/catalogs/gachas")
    suspend fun getGachaCatalog(@Path("region") region: RegionId, @Query("page") page: kotlin.Int? = 1, @Query("pageSize") pageSize: kotlin.Int? = 24, @Query("q") q: kotlin.String? = null, @Query("sort") sort: SortGetGachaCatalog? = null, @Query("category") category: kotlin.String? = null, @Query("rarity") rarity: kotlin.String? = null, @Query("characterId") characterId: kotlin.Int? = null, @Query("partType") partType: kotlin.String? = null, @Query("source") source: kotlin.String? = null, @Query("gender") gender: kotlin.String? = null, @Query("gachaTypes") gachaTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("characterIds") characterIds: @JvmSuppressWildcards kotlin.collections.List<kotlin.Int>? = null, @Query("units") units: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("honorTypes") honorTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("rarities") rarities: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("materialTypes") materialTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("partTypes") partTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("sources") sources: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("genders") genders: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("stampTypes") stampTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("comicTypes") comicTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("groupOnce") groupOnce: kotlin.Boolean? = null, @Query("usableOnly") usableOnly: kotlin.Boolean? = null, @Query("relatedOnly") relatedOnly: kotlin.Boolean? = null): Response<GachaPage>

    /**
     * GET api/master/{region}/catalogs/gachas/{itemId}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param itemId
     * @return [GachaDetail]
     */
    @GET("api/master/{region}/catalogs/gachas/{itemId}")
    suspend fun getGachaCatalogItem(@Path("region") region: RegionId, @Path("itemId") itemId: kotlin.String): Response<GachaDetail>

    /**
     * GET api/me/haruki/connection
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @return [HarukiConnection]
     */
    @GET("api/me/haruki/connection")
    suspend fun getHarukiConnection(): Response<HarukiConnection>


    /**
    * enum for parameter sort
    */
    enum class SortGetHonorCatalog(val value: kotlin.String) {
        @SerialName(value = "id-asc") ID_MINUS_ASC("id-asc"),
        @SerialName(value = "id-desc") ID_MINUS_DESC("id-desc"),
        @SerialName(value = "name-asc") NAME_MINUS_ASC("name-asc"),
        @SerialName(value = "name-desc") NAME_MINUS_DESC("name-desc"),
        @SerialName(value = "start-asc") START_MINUS_ASC("start-asc"),
        @SerialName(value = "start-desc") START_MINUS_DESC("start-desc")
    }

    /**
     * GET api/master/{region}/catalogs/honors
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param page  (optional, default to 1)
     * @param pageSize  (optional, default to 24)
     * @param q  (optional)
     * @param sort  (optional)
     * @param category  (optional)
     * @param rarity  (optional)
     * @param characterId  (optional)
     * @param partType  (optional)
     * @param source  (optional)
     * @param gender  (optional)
     * @param gachaTypes  (optional)
     * @param characterIds  (optional)
     * @param units  (optional)
     * @param honorTypes  (optional)
     * @param rarities  (optional)
     * @param materialTypes  (optional)
     * @param partTypes  (optional)
     * @param sources  (optional)
     * @param genders  (optional)
     * @param stampTypes  (optional)
     * @param comicTypes  (optional)
     * @param groupOnce  (optional)
     * @param usableOnly  (optional)
     * @param relatedOnly  (optional)
     * @return [HonorPage]
     */
    @GET("api/master/{region}/catalogs/honors")
    suspend fun getHonorCatalog(@Path("region") region: RegionId, @Query("page") page: kotlin.Int? = 1, @Query("pageSize") pageSize: kotlin.Int? = 24, @Query("q") q: kotlin.String? = null, @Query("sort") sort: SortGetHonorCatalog? = null, @Query("category") category: kotlin.String? = null, @Query("rarity") rarity: kotlin.String? = null, @Query("characterId") characterId: kotlin.Int? = null, @Query("partType") partType: kotlin.String? = null, @Query("source") source: kotlin.String? = null, @Query("gender") gender: kotlin.String? = null, @Query("gachaTypes") gachaTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("characterIds") characterIds: @JvmSuppressWildcards kotlin.collections.List<kotlin.Int>? = null, @Query("units") units: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("honorTypes") honorTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("rarities") rarities: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("materialTypes") materialTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("partTypes") partTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("sources") sources: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("genders") genders: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("stampTypes") stampTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("comicTypes") comicTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("groupOnce") groupOnce: kotlin.Boolean? = null, @Query("usableOnly") usableOnly: kotlin.Boolean? = null, @Query("relatedOnly") relatedOnly: kotlin.Boolean? = null): Response<HonorPage>

    /**
     * GET api/master/{region}/catalogs/honors/{itemId}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param itemId
     * @return [HonorDetail]
     */
    @GET("api/master/{region}/catalogs/honors/{itemId}")
    suspend fun getHonorCatalogItem(@Path("region") region: RegionId, @Path("itemId") itemId: kotlin.String): Response<HonorDetail>


    /**
    * enum for parameter boardType
    */
    enum class BoardTypeGetLiveRanking(val value: kotlin.String) {
        @SerialName(value = "overall") OVERALL("overall"),
        @SerialName(value = "worldlink") WORLDLINK("worldlink")
    }

    /**
     * GET api/events/{region}/live-ranking
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param boardType  (optional, default to overall)
     * @param gameCharacterId  (optional)
     * @return [LiveRanking]
     */
    @GET("api/events/{region}/live-ranking")
    suspend fun getLiveRanking(@Path("region") region: RegionId, @Query("boardType") boardType: BoardTypeGetLiveRanking? = BoardTypeGetLiveRanking.OVERALL, @Query("gameCharacterId") gameCharacterId: kotlin.Int? = null): Response<LiveRanking>


    /**
    * enum for parameter sort
    */
    enum class SortGetMaterialCatalog(val value: kotlin.String) {
        @SerialName(value = "id-asc") ID_MINUS_ASC("id-asc"),
        @SerialName(value = "id-desc") ID_MINUS_DESC("id-desc"),
        @SerialName(value = "name-asc") NAME_MINUS_ASC("name-asc"),
        @SerialName(value = "name-desc") NAME_MINUS_DESC("name-desc"),
        @SerialName(value = "start-asc") START_MINUS_ASC("start-asc"),
        @SerialName(value = "start-desc") START_MINUS_DESC("start-desc")
    }

    /**
     * GET api/master/{region}/catalogs/materials
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param page  (optional, default to 1)
     * @param pageSize  (optional, default to 24)
     * @param q  (optional)
     * @param sort  (optional)
     * @param category  (optional)
     * @param rarity  (optional)
     * @param characterId  (optional)
     * @param partType  (optional)
     * @param source  (optional)
     * @param gender  (optional)
     * @param gachaTypes  (optional)
     * @param characterIds  (optional)
     * @param units  (optional)
     * @param honorTypes  (optional)
     * @param rarities  (optional)
     * @param materialTypes  (optional)
     * @param partTypes  (optional)
     * @param sources  (optional)
     * @param genders  (optional)
     * @param stampTypes  (optional)
     * @param comicTypes  (optional)
     * @param groupOnce  (optional)
     * @param usableOnly  (optional)
     * @param relatedOnly  (optional)
     * @return [MaterialPage]
     */
    @GET("api/master/{region}/catalogs/materials")
    suspend fun getMaterialCatalog(@Path("region") region: RegionId, @Query("page") page: kotlin.Int? = 1, @Query("pageSize") pageSize: kotlin.Int? = 24, @Query("q") q: kotlin.String? = null, @Query("sort") sort: SortGetMaterialCatalog? = null, @Query("category") category: kotlin.String? = null, @Query("rarity") rarity: kotlin.String? = null, @Query("characterId") characterId: kotlin.Int? = null, @Query("partType") partType: kotlin.String? = null, @Query("source") source: kotlin.String? = null, @Query("gender") gender: kotlin.String? = null, @Query("gachaTypes") gachaTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("characterIds") characterIds: @JvmSuppressWildcards kotlin.collections.List<kotlin.Int>? = null, @Query("units") units: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("honorTypes") honorTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("rarities") rarities: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("materialTypes") materialTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("partTypes") partTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("sources") sources: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("genders") genders: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("stampTypes") stampTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("comicTypes") comicTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("groupOnce") groupOnce: kotlin.Boolean? = null, @Query("usableOnly") usableOnly: kotlin.Boolean? = null, @Query("relatedOnly") relatedOnly: kotlin.Boolean? = null): Response<MaterialPage>

    /**
     * GET api/master/{region}/catalogs/materials/{itemId}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param itemId
     * @return [MaterialDetail]
     */
    @GET("api/master/{region}/catalogs/materials/{itemId}")
    suspend fun getMaterialCatalogItem(@Path("region") region: RegionId, @Path("itemId") itemId: kotlin.String): Response<MaterialDetail>

    /**
     * GET api/me/legal-acceptances
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @return [kotlin.Any]
     */
    @GET("api/me/legal-acceptances")
    suspend fun getMyLegalAcceptances(): Response<kotlin.Any>

    /**
     * GET api/me/player-bindings
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param page  (optional)
     * @param pageSize  (optional)
     * @return [PlayerBindingPage]
     */
    @GET("api/me/player-bindings")
    suspend fun getPlayerBindings(@Query("page") page: kotlin.Int? = null, @Query("pageSize") pageSize: kotlin.Int? = null): Response<PlayerBindingPage>

    /**
     * GET api/players/{region}/{userId}/profile
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param userId
     * @return [PlayerProfile]
     */
    @GET("api/players/{region}/{userId}/profile")
    suspend fun getPlayerProfile(@Path("region") region: RegionId, @Path("userId") userId: kotlin.String): Response<PlayerProfile>

    /**
     * GET api/events/{region}/{eventId}/ranking-border
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param eventId
     * @param page  (optional, default to 1)
     * @param pageSize  (optional, default to 24)
     * @return [RankingEntryPage]
     */
    @GET("api/events/{region}/{eventId}/ranking-border")
    suspend fun getRankingBorders(@Path("region") region: RegionId, @Path("eventId") eventId: kotlin.String, @Query("page") page: kotlin.Int? = 1, @Query("pageSize") pageSize: kotlin.Int? = 24): Response<RankingEntryPage>


    /**
    * enum for parameter boardType
    */
    enum class BoardTypeGetRankingChurn(val value: kotlin.String) {
        @SerialName(value = "overall") OVERALL("overall"),
        @SerialName(value = "worldlink") WORLDLINK("worldlink")
    }

    /**
     * GET api/events/{region}/{eventId}/ranking-churn
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param eventId
     * @param boardType  (optional)
     * @param gameCharacterId  (optional)
     * @param top  (optional)
     * @return [GetRankingChurn200Response]
     */
    @GET("api/events/{region}/{eventId}/ranking-churn")
    suspend fun getRankingChurn(@Path("region") region: RegionId, @Path("eventId") eventId: kotlin.String, @Query("boardType") boardType: BoardTypeGetRankingChurn? = null, @Query("gameCharacterId") gameCharacterId: kotlin.Int? = null, @Query("top") top: kotlin.Int? = null): Response<GetRankingChurn200Response>


    /**
    * enum for parameter windowHours
    */
    enum class WindowHoursGetRankingForecast(val value: kotlin.Int) {
        @SerialName(value = "1") _1(1),
        @SerialName(value = "3") _3(3),
        @SerialName(value = "6") _6(6)
    }

    /**
     * GET api/events/{region}/{eventId}/ranking-forecast
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param eventId
     * @param windowHours  (optional)
     * @return [Forecast]
     */
    @GET("api/events/{region}/{eventId}/ranking-forecast")
    suspend fun getRankingForecast(@Path("region") region: RegionId, @Path("eventId") eventId: kotlin.String, @Query("windowHours") windowHours: WindowHoursGetRankingForecast? = null): Response<Forecast>


    /**
    * enum for parameter sampleType
    */
    enum class SampleTypeGetRankingHistory(val value: kotlin.String) {
        @SerialName(value = "top100") TOP100("top100"),
        @SerialName(value = "border") BORDER("border")
    }


    /**
    * enum for parameter windowHours
    */
    enum class WindowHoursGetRankingHistory(val value: kotlin.Int) {
        @SerialName(value = "1") _1(1),
        @SerialName(value = "3") _3(3),
        @SerialName(value = "6") _6(6)
    }

    /**
     * GET api/events/{region}/{eventId}/ranking-history
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param eventId
     * @param sampleType  (optional)
     * @param rank  (optional)
     * @param from  (optional)
     * @param to  (optional)
     * @param limit  (optional)
     * @param windowHours  (optional)
     * @return [RankingHistory]
     */
    @GET("api/events/{region}/{eventId}/ranking-history")
    suspend fun getRankingHistory(@Path("region") region: RegionId, @Path("eventId") eventId: kotlin.String, @Query("sampleType") sampleType: SampleTypeGetRankingHistory? = null, @Query("rank") rank: kotlin.Int? = null, @Query("from") from: kotlin.String? = null, @Query("to") to: kotlin.String? = null, @Query("limit") limit: kotlin.Int? = null, @Query("windowHours") windowHours: WindowHoursGetRankingHistory? = null): Response<RankingHistory>


    /**
    * enum for parameter sampleType
    */
    enum class SampleTypeGetRankingHistorySummary(val value: kotlin.String) {
        @SerialName(value = "top100") TOP100("top100"),
        @SerialName(value = "border") BORDER("border")
    }


    /**
    * enum for parameter windowHours
    */
    enum class WindowHoursGetRankingHistorySummary(val value: kotlin.Int) {
        @SerialName(value = "1") _1(1),
        @SerialName(value = "3") _3(3),
        @SerialName(value = "6") _6(6)
    }

    /**
     * GET api/events/{region}/{eventId}/ranking-history/summary
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param eventId
     * @param sampleType  (optional)
     * @param rank  (optional)
     * @param limit  (optional)
     * @param windowHours  (optional)
     * @return [RankingHistorySummary]
     */
    @GET("api/events/{region}/{eventId}/ranking-history/summary")
    suspend fun getRankingHistorySummary(@Path("region") region: RegionId, @Path("eventId") eventId: kotlin.String, @Query("sampleType") sampleType: SampleTypeGetRankingHistorySummary? = null, @Query("rank") rank: kotlin.Int? = null, @Query("limit") limit: kotlin.Int? = null, @Query("windowHours") windowHours: WindowHoursGetRankingHistorySummary? = null): Response<RankingHistorySummary>


    /**
    * enum for parameter boardType
    */
    enum class BoardTypeGetRankingPlayerDetail(val value: kotlin.String) {
        @SerialName(value = "overall") OVERALL("overall"),
        @SerialName(value = "worldlink") WORLDLINK("worldlink")
    }

    /**
     * GET api/events/{region}/{eventId}/ranking-player/{rank}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param eventId
     * @param rank
     * @param boardType  (optional)
     * @param gameCharacterId  (optional)
     * @return [RankingPlayerDetail]
     */
    @GET("api/events/{region}/{eventId}/ranking-player/{rank}")
    suspend fun getRankingPlayerDetail(@Path("region") region: RegionId, @Path("eventId") eventId: kotlin.String, @Path("rank") rank: kotlin.String, @Query("boardType") boardType: BoardTypeGetRankingPlayerDetail? = null, @Query("gameCharacterId") gameCharacterId: kotlin.Int? = null): Response<RankingPlayerDetail>

    /**
     * GET api/events/{region}/{eventId}/ranking-top100
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param eventId
     * @param page  (optional, default to 1)
     * @param pageSize  (optional, default to 24)
     * @return [RankingEntryPage]
     */
    @GET("api/events/{region}/{eventId}/ranking-top100")
    suspend fun getRankingTop100(@Path("region") region: RegionId, @Path("eventId") eventId: kotlin.String, @Query("page") page: kotlin.Int? = 1, @Query("pageSize") pageSize: kotlin.Int? = 24): Response<RankingEntryPage>

    /**
     * GET api/regions
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @return [kotlin.collections.List<Region>]
     */
    @GET("api/regions")
    suspend fun getRegions(): Response<kotlin.collections.List<Region>>

    /**
     * GET api/runtime/status
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @return [RuntimeStatus]
     */
    @GET("api/runtime/status")
    suspend fun getRuntimeStatus(): Response<RuntimeStatus>


    /**
    * enum for parameter sort
    */
    enum class SortGetSongCatalog(val value: kotlin.String) {
        @SerialName(value = "id-asc") ID_MINUS_ASC("id-asc"),
        @SerialName(value = "id-desc") ID_MINUS_DESC("id-desc"),
        @SerialName(value = "name-asc") NAME_MINUS_ASC("name-asc"),
        @SerialName(value = "name-desc") NAME_MINUS_DESC("name-desc"),
        @SerialName(value = "start-asc") START_MINUS_ASC("start-asc"),
        @SerialName(value = "start-desc") START_MINUS_DESC("start-desc")
    }

    /**
     * GET api/master/{region}/catalogs/songs
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param page  (optional, default to 1)
     * @param pageSize  (optional, default to 24)
     * @param q  (optional)
     * @param sort  (optional)
     * @param unit  (optional)
     * @param category  (optional)
     * @param musicTags  (optional)
     * @param categories  (optional)
     * @return [SongPage]
     */
    @GET("api/master/{region}/catalogs/songs")
    suspend fun getSongCatalog(@Path("region") region: RegionId, @Query("page") page: kotlin.Int? = 1, @Query("pageSize") pageSize: kotlin.Int? = 24, @Query("q") q: kotlin.String? = null, @Query("sort") sort: SortGetSongCatalog? = null, @Query("unit") unit: kotlin.String? = null, @Query("category") category: kotlin.String? = null, @Query("musicTags") musicTags: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("categories") categories: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null): Response<SongPage>

    /**
     * GET api/master/{region}/music/{musicId}/charts/{difficulty}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param musicId
     * @param difficulty
     * @return [ChartDetail]
     */
    @GET("api/master/{region}/music/{musicId}/charts/{difficulty}")
    suspend fun getSongChart(@Path("region") region: RegionId, @Path("musicId") musicId: kotlin.String, @Path("difficulty") difficulty: kotlin.String): Response<ChartDetail>

    /**
     * GET api/master/{region}/music/{musicId}/full
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param musicId
     * @return [SongDetail]
     */
    @GET("api/master/{region}/music/{musicId}/full")
    suspend fun getSongDetail(@Path("region") region: RegionId, @Path("musicId") musicId: kotlin.String): Response<SongDetail>


    /**
    * enum for parameter sort
    */
    enum class SortGetStampCatalog(val value: kotlin.String) {
        @SerialName(value = "id-asc") ID_MINUS_ASC("id-asc"),
        @SerialName(value = "id-desc") ID_MINUS_DESC("id-desc"),
        @SerialName(value = "name-asc") NAME_MINUS_ASC("name-asc"),
        @SerialName(value = "name-desc") NAME_MINUS_DESC("name-desc"),
        @SerialName(value = "start-asc") START_MINUS_ASC("start-asc"),
        @SerialName(value = "start-desc") START_MINUS_DESC("start-desc")
    }

    /**
     * GET api/master/{region}/catalogs/stamps
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param page  (optional, default to 1)
     * @param pageSize  (optional, default to 24)
     * @param q  (optional)
     * @param sort  (optional)
     * @param category  (optional)
     * @param rarity  (optional)
     * @param characterId  (optional)
     * @param partType  (optional)
     * @param source  (optional)
     * @param gender  (optional)
     * @param gachaTypes  (optional)
     * @param characterIds  (optional)
     * @param units  (optional)
     * @param honorTypes  (optional)
     * @param rarities  (optional)
     * @param materialTypes  (optional)
     * @param partTypes  (optional)
     * @param sources  (optional)
     * @param genders  (optional)
     * @param stampTypes  (optional)
     * @param comicTypes  (optional)
     * @param groupOnce  (optional)
     * @param usableOnly  (optional)
     * @param relatedOnly  (optional)
     * @return [StampPage]
     */
    @GET("api/master/{region}/catalogs/stamps")
    suspend fun getStampCatalog(@Path("region") region: RegionId, @Query("page") page: kotlin.Int? = 1, @Query("pageSize") pageSize: kotlin.Int? = 24, @Query("q") q: kotlin.String? = null, @Query("sort") sort: SortGetStampCatalog? = null, @Query("category") category: kotlin.String? = null, @Query("rarity") rarity: kotlin.String? = null, @Query("characterId") characterId: kotlin.Int? = null, @Query("partType") partType: kotlin.String? = null, @Query("source") source: kotlin.String? = null, @Query("gender") gender: kotlin.String? = null, @Query("gachaTypes") gachaTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("characterIds") characterIds: @JvmSuppressWildcards kotlin.collections.List<kotlin.Int>? = null, @Query("units") units: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("honorTypes") honorTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("rarities") rarities: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("materialTypes") materialTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("partTypes") partTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("sources") sources: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("genders") genders: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("stampTypes") stampTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("comicTypes") comicTypes: @JvmSuppressWildcards kotlin.collections.List<kotlin.String>? = null, @Query("groupOnce") groupOnce: kotlin.Boolean? = null, @Query("usableOnly") usableOnly: kotlin.Boolean? = null, @Query("relatedOnly") relatedOnly: kotlin.Boolean? = null): Response<StampPage>

    /**
     * GET api/master/{region}/catalogs/stamps/{itemId}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param itemId
     * @return [StampDetail]
     */
    @GET("api/master/{region}/catalogs/stamps/{itemId}")
    suspend fun getStampCatalogItem(@Path("region") region: RegionId, @Path("itemId") itemId: kotlin.String): Response<StampDetail>

    /**
     * POST api/me/haruki/bindings/import
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param harukiBindingImportRequest
     * @param idempotencyKey  (optional)
     * @return [HarukiBindingImportResponse]
     */
    @POST("api/me/haruki/bindings/import")
    suspend fun importHarukiBindings(@Body harukiBindingImportRequest: HarukiBindingImportRequest, @Header("Idempotency-Key") idempotencyKey: kotlin.String? = null): Response<HarukiBindingImportResponse>

    /**
     * POST api/auth/login
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param loginRequest
     * @return [AuthResponse]
     */
    @POST("api/auth/login")
    suspend fun login(@Body loginRequest: LoginRequest): Response<AuthResponse>

    /**
     * POST api/auth/web/login
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param loginRequest
     * @return [WebAuthResponse]
     */
    @POST("api/auth/web/login")
    suspend fun loginWeb(@Body loginRequest: LoginRequest): Response<WebAuthResponse>

    /**
     * POST api/auth/logout
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param refreshTokenRequest
     * @return [OkResponse]
     */
    @POST("api/auth/logout")
    suspend fun logout(@Body refreshTokenRequest: RefreshTokenRequest): Response<OkResponse>

    /**
     * POST api/auth/web/logout
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @return [OkResponse]
     */
    @POST("api/auth/web/logout")
    suspend fun logoutWeb(): Response<OkResponse>

    /**
     * POST api/me/haruki/public/preview
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param harukiPublicPreviewRequest
     * @return [HarukiPublicPreviewResponse]
     */
    @POST("api/me/haruki/public/preview")
    suspend fun previewHarukiPublicSuite(@Body harukiPublicPreviewRequest: HarukiPublicPreviewRequest): Response<HarukiPublicPreviewResponse>

    /**
     * POST api/integrations/haruki/webhook/{region}/{dataType}/{playerUid}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param dataType
     * @param playerUid
     * @return [OkResponse]
     */
    @POST("api/integrations/haruki/webhook/{region}/{dataType}/{playerUid}")
    suspend fun receiveHarukiWebhook(@Path("region") region: RegionId, @Path("dataType") dataType: kotlin.String, @Path("playerUid") playerUid: kotlin.String): Response<OkResponse>

    /**
     * POST api/players/{region}/{userId}/refresh
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param region
     * @param userId
     * @return [PlayerProfile]
     */
    @POST("api/players/{region}/{userId}/refresh")
    suspend fun refreshPlayerProfile(@Path("region") region: RegionId, @Path("userId") userId: kotlin.String): Response<PlayerProfile>

    /**
     * POST api/auth/refresh
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param refreshTokenRequest
     * @return [AuthResponse]
     */
    @POST("api/auth/refresh")
    suspend fun refreshSession(@Body refreshTokenRequest: RefreshTokenRequest): Response<AuthResponse>

    /**
     * POST api/auth/web/refresh
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @return [WebAuthResponse]
     */
    @POST("api/auth/web/refresh")
    suspend fun refreshWebSession(): Response<WebAuthResponse>

    /**
     * POST api/auth/register
     *
     *
     * Responses:
     *  - 201: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param registerRequest
     * @return [AuthResponse]
     */
    @POST("api/auth/register")
    suspend fun register(@Body registerRequest: RegisterRequest): Response<AuthResponse>

    /**
     * POST api/auth/web/register
     *
     *
     * Responses:
     *  - 201: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param registerRequest
     * @return [WebAuthResponse]
     */
    @POST("api/auth/web/register")
    suspend fun registerWeb(@Body registerRequest: RegisterRequest): Response<WebAuthResponse>

    /**
     * GET api/assets/resolve
     *
     *
     * Responses:
     *  - 200: Resolved image asset
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param url  (optional)
     * @return [ResponseBody]
     */
    @GET("api/assets/resolve")
    suspend fun resolveAsset(@Query("url") url: @JvmSuppressWildcards kotlin.collections.List<java.net.URI>? = null): Response<ResponseBody>

    /**
     * POST api/me/player-bindings/{id}/sync/review
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param id
     * @return [HarukiSyncReviewResponse]
     */
    @POST("api/me/player-bindings/{id}/sync/review")
    suspend fun reviewHarukiPlayerSync(@Path("id") id: kotlin.String): Response<HarukiSyncReviewResponse>

    /**
     * POST api/me/account-deletion/email-code
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @return [EmailCodeResponse]
     */
    @POST("api/me/account-deletion/email-code")
    suspend fun startAccountDeletionEmailVerification(): Response<EmailCodeResponse>

    /**
     * POST api/auth/email-code/start
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param emailCodeRequest
     * @return [EmailCodeResponse]
     */
    @POST("api/auth/email-code/start")
    suspend fun startEmailVerification(@Body emailCodeRequest: EmailCodeRequest): Response<EmailCodeResponse>

    /**
     * POST api/me/haruki/oauth/start
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param harukiOAuthStartRequest
     * @return [HarukiOAuthStartResponse]
     */
    @POST("api/me/haruki/oauth/start")
    suspend fun startHarukiOAuth(@Body harukiOAuthStartRequest: HarukiOAuthStartRequest): Response<HarukiOAuthStartResponse>

    /**
     * GET api/me/account-deletion/qq/start
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param client  (optional, default to "web")
     * @return [QqAccountDeletionStartResponse]
     */
    @GET("api/me/account-deletion/qq/start")
    suspend fun startQqAccountDeletion(@Query("client") client: kotlin.String? = "web"): Response<QqAccountDeletionStartResponse>

    /**
     * POST api/me/player-bindings/{id}/sync
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param id
     * @param idempotencyKey  (optional)
     * @return [HarukiSyncResult]
     */
    @POST("api/me/player-bindings/{id}/sync")
    suspend fun syncHarukiPlayerData(@Path("id") id: kotlin.String, @Header("Idempotency-Key") idempotencyKey: kotlin.String? = null): Response<HarukiSyncResult>

    /**
     * PATCH api/me/favorite-folders/{id}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param id
     * @param favoriteFolderPatchRequest
     * @param idempotencyKey  (optional)
     * @param ifMatch  (optional)
     * @return [FavoriteFolder]
     */
    @PATCH("api/me/favorite-folders/{id}")
    suspend fun updateFavoriteFolder(@Path("id") id: kotlin.String, @Body favoriteFolderPatchRequest: FavoriteFolderPatchRequest, @Header("Idempotency-Key") idempotencyKey: kotlin.String? = null, @Header("If-Match") ifMatch: kotlin.String? = null): Response<FavoriteFolder>

    /**
     * PATCH api/me/favorites/{id}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param id
     * @param favoriteFoldersPatchRequest
     * @param idempotencyKey  (optional)
     * @param ifMatch  (optional)
     * @return [Favorite]
     */
    @PATCH("api/me/favorites/{id}")
    suspend fun updateFavoriteFolders(@Path("id") id: kotlin.String, @Body favoriteFoldersPatchRequest: FavoriteFoldersPatchRequest, @Header("Idempotency-Key") idempotencyKey: kotlin.String? = null, @Header("If-Match") ifMatch: kotlin.String? = null): Response<Favorite>

    /**
     * PATCH api/me/player-bindings/{id}/sync-settings
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param id
     * @param harukiSyncSettingsRequest
     * @param idempotencyKey  (optional)
     * @param ifMatch  (optional)
     * @return [PlayerBinding]
     */
    @PATCH("api/me/player-bindings/{id}/sync-settings")
    suspend fun updateHarukiSyncSettings(@Path("id") id: kotlin.String, @Body harukiSyncSettingsRequest: HarukiSyncSettingsRequest, @Header("Idempotency-Key") idempotencyKey: kotlin.String? = null, @Header("If-Match") ifMatch: kotlin.String? = null): Response<PlayerBinding>

    /**
     * PATCH api/me/player-bindings/{id}
     *
     *
     * Responses:
     *  - 200: Successful response
     *  - 400: Invalid input
     *  - 401: Authentication required
     *  - 404: Resource not found
     *  - 409: Resource conflict
     *  - 412: Optimistic concurrency check failed
     *  - 429: Rate limit exceeded
     *  - 503: Source unavailable
     *
     * @param id
     * @param playerBindingPatchRequest
     * @param ifMatch  (optional)
     * @return [PlayerBinding]
     */
    @PATCH("api/me/player-bindings/{id}")
    suspend fun updatePlayerBinding(@Path("id") id: kotlin.String, @Body playerBindingPatchRequest: PlayerBindingPatchRequest, @Header("If-Match") ifMatch: kotlin.String? = null): Response<PlayerBinding>

}
