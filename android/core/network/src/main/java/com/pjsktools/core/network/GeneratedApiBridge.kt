package com.pjsktools.core.network

import com.pjsktools.api.generated.*
import com.pjsktools.core.model.CatalogFilterState
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import retrofit2.Response

interface ApiContractAdapter {
    suspend fun getRuntimeStatus(): RuntimeStatusDto
    suspend fun getCurrentEvent(region: String): EventSummaryDto
    suspend fun getLiveRanking(region: String, boardType: String = "overall", gameCharacterId: Int? = null): LiveRankingDto
    suspend fun getEventCatalog(region: String, page: Int = 1, pageSize: Int = 24, q: String? = null, sort: String? = null, filters: CatalogFilterState = CatalogFilterState()): EventPageDto
    suspend fun getSongCatalog(region: String, page: Int, pageSize: Int, q: String? = null, sort: String? = null, unit: String? = null, category: String? = null, filters: CatalogFilterState = CatalogFilterState()): SongPageDto
    suspend fun getSongDetail(region: String, musicId: String): SongDetailDto
    suspend fun getCardCatalog(region: String, page: Int, pageSize: Int, q: String? = null, sort: String? = null, characterId: Int? = null, attribute: String? = null, rarity: String? = null, unit: String? = null, filters: CatalogFilterState = CatalogFilterState()): CardPageDto
    suspend fun getCardDetail(region: String, cardId: String): CardDetailDto
    suspend fun getRankingTop100(region: String, eventId: String, page: Int = 1, pageSize: Int = 100): RankingEntryPageDto
    suspend fun getRankingBorders(region: String, eventId: String, page: Int = 1, pageSize: Int = 100): RankingEntryPageDto
    suspend fun getRankingHistory(region: String, eventId: String, sampleType: String = "border", windowHours: Int? = null): RankingHistoryDto
    suspend fun getRankingHistorySummary(region: String, eventId: String, sampleType: String = "border", windowHours: Int? = null): RankingHistorySummaryDto
    suspend fun getRankingForecast(region: String, eventId: String, windowHours: Int? = null): ForecastDto
    suspend fun getFullEventDetail(region: String, eventId: String): EventFullDetailDto
    suspend fun getRankingPlayerDetail(region: String, eventId: String, rank: Int, boardType: String = "overall", gameCharacterId: Int? = null): RankingPlayerDetailDto
    suspend fun calculateScoreControl(request: ScoreControlRequest): ScoreControlResultDto
    suspend fun estimateEventPoint(request: EventPointEstimateRequest): EventPointEstimateResultDto
    suspend fun getPlayerBindings(): PlayerBindingPageDto
    suspend fun createPlayerBinding(request: PlayerBindingCreateRequest): PlayerBindingDto
    suspend fun getPlayerProfile(region: String, userId: String): PlayerProfileDto
    suspend fun refreshPlayerProfile(region: String, userId: String): PlayerProfileDto
    suspend fun getGachaCatalog(region: String, page: Int, pageSize: Int, q: String? = null, sort: String? = null, category: String? = null, rarity: String? = null, characterId: Int? = null, partType: String? = null, source: String? = null, gender: String? = null, filters: CatalogFilterState = CatalogFilterState()): GachaPageDto
    suspend fun getGachaCatalogItem(region: String, itemId: String): CatalogDetailDto
    suspend fun getHonorCatalog(region: String, page: Int, pageSize: Int, q: String? = null, sort: String? = null, category: String? = null, rarity: String? = null, characterId: Int? = null, partType: String? = null, source: String? = null, gender: String? = null, filters: CatalogFilterState = CatalogFilterState()): HonorPageDto
    suspend fun getHonorCatalogItem(region: String, itemId: String): CatalogDetailDto
    suspend fun getMaterialCatalog(region: String, page: Int, pageSize: Int, q: String? = null, sort: String? = null, category: String? = null, rarity: String? = null, characterId: Int? = null, partType: String? = null, source: String? = null, gender: String? = null, filters: CatalogFilterState = CatalogFilterState()): MaterialPageDto
    suspend fun getMaterialCatalogItem(region: String, itemId: String): CatalogDetailDto
    suspend fun getCostumeCatalog(region: String, page: Int, pageSize: Int, q: String? = null, sort: String? = null, category: String? = null, rarity: String? = null, characterId: Int? = null, partType: String? = null, source: String? = null, gender: String? = null, filters: CatalogFilterState = CatalogFilterState()): CostumePageDto
    suspend fun getCostumeCatalogItem(region: String, itemId: String): CatalogDetailDto
    suspend fun getStampCatalog(region: String, page: Int, pageSize: Int, q: String? = null, sort: String? = null, category: String? = null, rarity: String? = null, characterId: Int? = null, partType: String? = null, source: String? = null, gender: String? = null, filters: CatalogFilterState = CatalogFilterState()): StampPageDto
    suspend fun getStampCatalogItem(region: String, itemId: String): CatalogDetailDto
    suspend fun getComicCatalog(region: String, page: Int, pageSize: Int, q: String? = null, sort: String? = null, category: String? = null, rarity: String? = null, characterId: Int? = null, partType: String? = null, source: String? = null, gender: String? = null, filters: CatalogFilterState = CatalogFilterState()): ComicPageDto
    suspend fun getComicCatalogItem(region: String, itemId: String): CatalogDetailDto
}

class GeneratedApiBridge(
    private val generated: AndroidApi,
    private val json: Json
) : ApiContractAdapter {
    private fun region(value: String) = requireNotNull(RegionId.decode(value)) { "Unsupported region: $value" }

    private suspend inline fun <reified Source, reified Target> call(
        noinline request: suspend () -> Response<Source>
    ): Target {
        val response = request()
        if (!response.isSuccessful) throw HttpException(response)
        val body = requireNotNull(response.body()) { "Backend returned an empty response body" }
        return json.decodeFromString(json.encodeToString(body))
    }

    private fun cardSort(value: String?) = AndroidApi.SortGetCardCatalog.entries.firstOrNull { it.value == value }
    private fun eventSort(value: String?) = AndroidApi.SortGetEventCatalog.entries.firstOrNull { it.value == value }
    private fun songSort(value: String?) = AndroidApi.SortGetSongCatalog.entries.firstOrNull { it.value == value }
    private fun gachaSort(value: String?) = AndroidApi.SortGetGachaCatalog.entries.firstOrNull { it.value == value }
    private fun honorSort(value: String?) = AndroidApi.SortGetHonorCatalog.entries.firstOrNull { it.value == value }
    private fun materialSort(value: String?) = AndroidApi.SortGetMaterialCatalog.entries.firstOrNull { it.value == value }
    private fun costumeSort(value: String?) = AndroidApi.SortGetCostumeCatalog.entries.firstOrNull { it.value == value }
    private fun stampSort(value: String?) = AndroidApi.SortGetStampCatalog.entries.firstOrNull { it.value == value }
    private fun comicSort(value: String?) = AndroidApi.SortGetComicCatalog.entries.firstOrNull { it.value == value }

    override suspend fun getRuntimeStatus() = call<RuntimeStatus, RuntimeStatusDto> { generated.getRuntimeStatus() }
    override suspend fun getCurrentEvent(region: String) = call<EventSummary, EventSummaryDto> { generated.getCurrentEvent(region(region)) }
    override suspend fun getLiveRanking(region: String, boardType: String, gameCharacterId: Int?) = call<LiveRanking, LiveRankingDto> {
        generated.getLiveRanking(region(region), AndroidApi.BoardTypeGetLiveRanking.entries.firstOrNull { it.value == boardType }, gameCharacterId)
    }
    override suspend fun getEventCatalog(region: String, page: Int, pageSize: Int, q: String?, sort: String?, filters: CatalogFilterState) =
        call<EventPage, EventPageDto> {
            generated.getEventCatalog(
                region(region), page, pageSize, q, eventSort(sort),
                filters.values("eventTypes"), filters.values("eventUnits"),
                filters.intValues("bonusCharacterIds"), filters.intValues("bannerCharacterIds"),
                filters.values("bonusAttributes")
            )
        }
    override suspend fun getSongCatalog(region: String, page: Int, pageSize: Int, q: String?, sort: String?, unit: String?, category: String?, filters: CatalogFilterState) =
        call<SongPage, SongPageDto> {
            generated.getSongCatalog(
                region(region), page, pageSize, q, songSort(sort), unit, category,
                filters.values("musicTags"), filters.values("categories")
            )
        }
    override suspend fun getSongDetail(region: String, musicId: String) = call<SongDetail, SongDetailDto> { generated.getSongDetail(region(region), musicId) }
    override suspend fun getCardCatalog(region: String, page: Int, pageSize: Int, q: String?, sort: String?, characterId: Int?, attribute: String?, rarity: String?, unit: String?, filters: CatalogFilterState) =
        call<CardPage, CardPageDto> {
            generated.getCardCatalog(
                region(region), page, pageSize, q, cardSort(sort), characterId, attribute, rarity, unit,
                filters.intValues("characterIds"), filters.values("units"), filters.values("supportUnits"),
                filters.values("attributes"), filters.values("rarities"), filters.values("supplyTypes"),
                filters.values("skillTypes")
            )
        }
    override suspend fun getCardDetail(region: String, cardId: String) = call<CardDetail, CardDetailDto> { generated.getCardDetail(region(region), cardId) }
    override suspend fun getRankingTop100(region: String, eventId: String, page: Int, pageSize: Int) = call<RankingEntryPage, RankingEntryPageDto> { generated.getRankingTop100(region(region), eventId, page, pageSize) }
    override suspend fun getRankingBorders(region: String, eventId: String, page: Int, pageSize: Int) = call<RankingEntryPage, RankingEntryPageDto> { generated.getRankingBorders(region(region), eventId, page, pageSize) }
    override suspend fun getRankingHistory(region: String, eventId: String, sampleType: String, windowHours: Int?) = call<RankingHistory, RankingHistoryDto> {
        generated.getRankingHistory(region(region), eventId, AndroidApi.SampleTypeGetRankingHistory.entries.firstOrNull { it.value == sampleType }, null, null, null, 5000, AndroidApi.WindowHoursGetRankingHistory.entries.firstOrNull { it.value == windowHours })
    }
    override suspend fun getRankingHistorySummary(region: String, eventId: String, sampleType: String, windowHours: Int?) = call<RankingHistorySummary, RankingHistorySummaryDto> {
        generated.getRankingHistorySummary(region(region), eventId, AndroidApi.SampleTypeGetRankingHistorySummary.entries.firstOrNull { it.value == sampleType }, null, null, AndroidApi.WindowHoursGetRankingHistorySummary.entries.firstOrNull { it.value == windowHours })
    }
    override suspend fun getRankingForecast(region: String, eventId: String, windowHours: Int?) = call<Forecast, ForecastDto> { generated.getRankingForecast(region(region), eventId, AndroidApi.WindowHoursGetRankingForecast.entries.firstOrNull { it.value == windowHours }) }
    override suspend fun getFullEventDetail(region: String, eventId: String) = call<EventFullDetail, EventFullDetailDto> { generated.getFullEventDetail(region(region), eventId) }
    override suspend fun getRankingPlayerDetail(region: String, eventId: String, rank: Int, boardType: String, gameCharacterId: Int?) = call<RankingPlayerDetail, RankingPlayerDetailDto> {
        generated.getRankingPlayerDetail(region(region), eventId, rank.toString(), AndroidApi.BoardTypeGetRankingPlayerDetail.entries.firstOrNull { it.value == boardType }, gameCharacterId)
    }
    override suspend fun calculateScoreControl(request: ScoreControlRequest) = call<com.pjsktools.api.generated.ScoreControlResult, ScoreControlResultDto> { generated.calculateScoreControl(request) }
    override suspend fun estimateEventPoint(request: EventPointEstimateRequest) = call<com.pjsktools.api.generated.EventPointEstimateResult, EventPointEstimateResultDto> { generated.estimateEventPoint(request) }
    override suspend fun getPlayerBindings() = call<PlayerBindingPage, PlayerBindingPageDto> { generated.getPlayerBindings(1, 100) }
    override suspend fun createPlayerBinding(request: PlayerBindingCreateRequest) = call<PlayerBinding, PlayerBindingDto> { generated.createPlayerBinding(request) }
    override suspend fun getPlayerProfile(region: String, userId: String) = call<PlayerProfile, PlayerProfileDto> { generated.getPlayerProfile(region(region), userId) }
    override suspend fun refreshPlayerProfile(region: String, userId: String) = call<PlayerProfile, PlayerProfileDto> { generated.refreshPlayerProfile(region(region), userId) }
    override suspend fun getGachaCatalog(region: String, page: Int, pageSize: Int, q: String?, sort: String?, category: String?, rarity: String?, characterId: Int?, partType: String?, source: String?, gender: String?, filters: CatalogFilterState) = call<GachaPage, GachaPageDto> {
        generated.getGachaCatalog(region(region), page, pageSize, q, gachaSort(sort), category, rarity, characterId, partType, source, gender, filters.values("gachaTypes"), filters.intValues("characterIds"), filters.values("units"), filters.values("honorTypes"), filters.values("rarities"), filters.values("materialTypes"), filters.values("partTypes"), filters.values("sources"), filters.values("genders"), filters.values("stampTypes"), filters.values("comicTypes"), filters.toggles["groupOnce"], filters.toggles["usableOnly"], filters.toggles["relatedOnly"])
    }
    override suspend fun getGachaCatalogItem(region: String, itemId: String) = call<GachaDetail, CatalogDetailDto> { generated.getGachaCatalogItem(region(region), itemId) }
    override suspend fun getHonorCatalog(region: String, page: Int, pageSize: Int, q: String?, sort: String?, category: String?, rarity: String?, characterId: Int?, partType: String?, source: String?, gender: String?, filters: CatalogFilterState) = call<HonorPage, HonorPageDto> {
        generated.getHonorCatalog(region(region), page, pageSize, q, honorSort(sort), category, rarity, characterId, partType, source, gender, filters.values("gachaTypes"), filters.intValues("characterIds"), filters.values("units"), filters.values("honorTypes"), filters.values("rarities"), filters.values("materialTypes"), filters.values("partTypes"), filters.values("sources"), filters.values("genders"), filters.values("stampTypes"), filters.values("comicTypes"), filters.toggles["groupOnce"], filters.toggles["usableOnly"], filters.toggles["relatedOnly"])
    }
    override suspend fun getHonorCatalogItem(region: String, itemId: String) = call<HonorDetail, CatalogDetailDto> { generated.getHonorCatalogItem(region(region), itemId) }
    override suspend fun getMaterialCatalog(region: String, page: Int, pageSize: Int, q: String?, sort: String?, category: String?, rarity: String?, characterId: Int?, partType: String?, source: String?, gender: String?, filters: CatalogFilterState) = call<MaterialPage, MaterialPageDto> {
        generated.getMaterialCatalog(region(region), page, pageSize, q, materialSort(sort), category, rarity, characterId, partType, source, gender, filters.values("gachaTypes"), filters.intValues("characterIds"), filters.values("units"), filters.values("honorTypes"), filters.values("rarities"), filters.values("materialTypes"), filters.values("partTypes"), filters.values("sources"), filters.values("genders"), filters.values("stampTypes"), filters.values("comicTypes"), filters.toggles["groupOnce"], filters.toggles["usableOnly"], filters.toggles["relatedOnly"])
    }
    override suspend fun getMaterialCatalogItem(region: String, itemId: String) = call<MaterialDetail, CatalogDetailDto> { generated.getMaterialCatalogItem(region(region), itemId) }
    override suspend fun getCostumeCatalog(region: String, page: Int, pageSize: Int, q: String?, sort: String?, category: String?, rarity: String?, characterId: Int?, partType: String?, source: String?, gender: String?, filters: CatalogFilterState) = call<CostumePage, CostumePageDto> {
        generated.getCostumeCatalog(region(region), page, pageSize, q, costumeSort(sort), category, rarity, characterId, partType, source, gender, filters.values("gachaTypes"), filters.intValues("characterIds"), filters.values("units"), filters.values("honorTypes"), filters.values("rarities"), filters.values("materialTypes"), filters.values("partTypes"), filters.values("sources"), filters.values("genders"), filters.values("stampTypes"), filters.values("comicTypes"), filters.toggles["groupOnce"], filters.toggles["usableOnly"], filters.toggles["relatedOnly"])
    }
    override suspend fun getCostumeCatalogItem(region: String, itemId: String) = call<CostumeDetail, CatalogDetailDto> { generated.getCostumeCatalogItem(region(region), itemId) }
    override suspend fun getStampCatalog(region: String, page: Int, pageSize: Int, q: String?, sort: String?, category: String?, rarity: String?, characterId: Int?, partType: String?, source: String?, gender: String?, filters: CatalogFilterState) = call<StampPage, StampPageDto> {
        generated.getStampCatalog(region(region), page, pageSize, q, stampSort(sort), category, rarity, characterId, partType, source, gender, filters.values("gachaTypes"), filters.intValues("characterIds"), filters.values("units"), filters.values("honorTypes"), filters.values("rarities"), filters.values("materialTypes"), filters.values("partTypes"), filters.values("sources"), filters.values("genders"), filters.values("stampTypes"), filters.values("comicTypes"), filters.toggles["groupOnce"], filters.toggles["usableOnly"], filters.toggles["relatedOnly"])
    }
    override suspend fun getStampCatalogItem(region: String, itemId: String) = call<StampDetail, CatalogDetailDto> { generated.getStampCatalogItem(region(region), itemId) }
    override suspend fun getComicCatalog(region: String, page: Int, pageSize: Int, q: String?, sort: String?, category: String?, rarity: String?, characterId: Int?, partType: String?, source: String?, gender: String?, filters: CatalogFilterState) = call<ComicPage, ComicPageDto> {
        generated.getComicCatalog(region(region), page, pageSize, q, comicSort(sort), category, rarity, characterId, partType, source, gender, filters.values("gachaTypes"), filters.intValues("characterIds"), filters.values("units"), filters.values("honorTypes"), filters.values("rarities"), filters.values("materialTypes"), filters.values("partTypes"), filters.values("sources"), filters.values("genders"), filters.values("stampTypes"), filters.values("comicTypes"), filters.toggles["groupOnce"], filters.toggles["usableOnly"], filters.toggles["relatedOnly"])
    }
    override suspend fun getComicCatalogItem(region: String, itemId: String) = call<ComicDetail, CatalogDetailDto> { generated.getComicCatalogItem(region(region), itemId) }
}

private fun CatalogFilterState.values(key: String) = selected[key]?.toList()?.takeIf { it.isNotEmpty() }
private fun CatalogFilterState.intValues(key: String) = values(key)?.mapNotNull(String::toIntOrNull)?.takeIf { it.isNotEmpty() }
