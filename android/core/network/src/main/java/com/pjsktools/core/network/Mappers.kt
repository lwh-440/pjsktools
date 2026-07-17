package com.pjsktools.core.network

import com.pjsktools.api.generated.CardDetailDto
import com.pjsktools.api.generated.CardSummaryDto
import com.pjsktools.api.generated.CatalogAssetDto
import com.pjsktools.api.generated.CatalogDetailDto
import com.pjsktools.api.generated.CatalogItemDto
import com.pjsktools.api.generated.EventSummaryDto
import com.pjsktools.api.generated.EventFullDetailDto
import com.pjsktools.api.generated.EventPointEstimateResultDto
import com.pjsktools.api.generated.ForecastDto
import com.pjsktools.api.generated.ForecastLineDto
import com.pjsktools.api.generated.LiveRankingDto
import com.pjsktools.api.generated.PlayerProfileDto
import com.pjsktools.api.generated.RankingEntryDto
import com.pjsktools.api.generated.RankingHistorySampleDto
import com.pjsktools.api.generated.RankingHistoryDto
import com.pjsktools.api.generated.RankingHistorySummaryDto
import com.pjsktools.api.generated.RankingPlayerDetailDto
import com.pjsktools.api.generated.ScoreControlResultDto
import com.pjsktools.api.generated.SourceHealthDto
import com.pjsktools.api.generated.SongDetailDto
import com.pjsktools.api.generated.SongSummaryDto
import com.pjsktools.core.database.*
import com.pjsktools.core.model.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

internal fun proxyUrl(baseUrl: String, value: String?): String? {
    if (value.isNullOrBlank()) return null
    if (value.startsWith(baseUrl) || value.startsWith("/api/")) return if (value.startsWith("/")) baseUrl.trimEnd('/') + value else value
    return baseUrl.trimEnd('/') + "/api/assets/proxy?url=" + URLEncoder.encode(value, StandardCharsets.UTF_8.toString())
}
private fun proxyUrls(baseUrl: String, values: List<String?>): List<String> = values.mapNotNull { proxyUrl(baseUrl, it) }.distinct()

internal fun resolveAssetUrl(baseUrl: String, values: List<String?>): String? {
    val backend = baseUrl.toHttpUrlOrNull() ?: return null
    val upstream = values.mapNotNull { value ->
        val normalized = value?.trim()?.takeIf(String::isNotEmpty) ?: return@mapNotNull null
        val absolute = when {
            normalized.startsWith("/api/") -> baseUrl.trimEnd('/') + normalized
            else -> normalized
        }
        val parsed = absolute.toHttpUrlOrNull()
        when {
            parsed != null && parsed.host == backend.host && parsed.port == backend.port && parsed.encodedPath == "/api/assets/proxy" ->
                parsed.queryParameter("url")
            parsed != null && parsed.host != backend.host -> absolute
            else -> null
        }
    }.distinct().take(3)
    if (upstream.isEmpty()) return values.firstNotNullOfOrNull { proxyUrl(baseUrl, it) }
    return backend.newBuilder().encodedPath("/api/assets/resolve").query(null).apply {
        upstream.forEach { addQueryParameter("url", it) }
    }.build().toString()
}

private fun List<com.pjsktools.api.generated.CatalogItemFacetDto>.domainFacets() =
    map { CatalogItemFacet(it.key, it.values.toSet()) }

internal fun com.pjsktools.api.generated.CatalogFilterMetaDto.domain(baseUrl: String) = CatalogFilterMeta(
    groups = groups.map { group ->
        CatalogFilterGroup(
            key = group.key,
            label = group.label,
            matchAll = group.match.equals("all", true),
            options = group.options.map { option ->
                CatalogFilterOption(
                    value = option.value,
                    label = option.label,
                    count = option.count,
                    iconKey = option.iconKey,
                    iconCandidates = listOfNotNull(resolveAssetUrl(baseUrl, option.iconCandidates)),
                    color = option.color
                )
            }
        )
    },
    toggles = toggles.map { CatalogFilterToggle(it.key, it.label, it.value) }
)

internal fun EventSummaryDto.domain(baseUrl: String) = EventSummary(
    id, name, eventType, startAt, endAt, storyOutline,
    proxyUrl(baseUrl, assets?.bannerUrl ?: assets?.imageCandidates?.firstOrNull()),
    facets.domainFacets(), eventUnit, aggregateAt, rankingAnnounceAt, bonusCharacterIds, bonusAttributes
)
internal fun SourceHealthDto.domain() = SourceHealth(status ?: "unknown", updatedAt ?: syncedAt, unavailableReason, warnings, primarySource, fallbackLine, latestUpdatedAt, cacheUpdatedAt, errors)
internal fun LiveRankingDto.domain(baseUrl: String) = LiveRankingSnapshot(
    event = currentEvent?.domain(baseUrl),
    top100 = top100.map { it.domain(baseUrl) },
    borders = borderLines.map { it.domain(baseUrl) },
    updatedAt = updatedAt,
    sourceHealth = sourceHealth?.domain() ?: SourceHealth(),
    boardType = boardType ?: "overall",
    gameCharacterId = gameCharacterId,
    worldLinkCharacters = worldLinkCharacters.map { WorldLinkCharacter(it.id, it.name, it.imageCandidates.mapNotNull { value -> proxyUrl(baseUrl, value) }) },
    worldLinkAvailable = worldLinkAvailable,
    warnings = warnings
)
private fun List<CatalogItemFacet>.encodeFacets(json: Json) =
    json.encodeToString(associate { it.key to it.values })
private fun String.decodeFacets(json: Json) =
    runCatching { json.decodeFromString<Map<String, Set<String>>>(this) }
        .getOrDefault(emptyMap())
        .map { CatalogItemFacet(it.key, it.value) }

internal fun EventSummary.entity(region: Region, json: Json) = EventEntity(region.id, id, name, eventType, startAt, endAt, storyOutline, bannerUrl, facets.encodeFacets(json))
internal fun EventEntity.domain(json: Json) = EventSummary(id, name, eventType, startAt, endAt, storyOutline, bannerUrl, facetsJson.decodeFacets(json))
internal fun RankingEntryDto.domain(baseUrl: String) = RankingEntry(rank, score, userId, name, updatedAt, proxyUrl(baseUrl, leaderCardImageUrl), hourlyGrowth, leaderCardId, leaderCardLevel, leaderCardMasterRank, (leaderCardImageCandidates.orEmpty()).mapNotNull { proxyUrl(baseUrl, it) }, (leaderCharacterImageCandidates.orEmpty()).mapNotNull { proxyUrl(baseUrl, it) }, leaderCharacterId)
internal fun RankingEntry.entity(region: Region, eventId: String, board: String, json: Json) = RankingEntity(region.id, eventId, board, rank, score, userId, name, updatedAt, leaderImageUrl, hourlyGrowth, leaderCardId, leaderCardLevel, leaderCardMasterRank, json.encodeToString(leaderImageCandidates), json.encodeToString(leaderCharacterImageCandidates), leaderCharacterId)
internal fun RankingEntity.domain(json: Json) = RankingEntry(
    rank, score, userId, name, updatedAt, leaderImageUrl, hourlyGrowth, leaderCardId, leaderCardLevel, leaderCardMasterRank,
    runCatching { json.decodeFromString<List<String>>(leaderImageCandidatesJson) }.getOrDefault(emptyList()),
    runCatching { json.decodeFromString<List<String>>(leaderCharacterImageCandidatesJson) }.getOrDefault(emptyList()),
    leaderCharacterId
)
internal fun RankingHistorySampleDto.entity(region: Region, eventId: String) = RankingHistoryEntity(region.id, eventId, sampleType ?: "border", rank, score, sampledAt)
internal fun RankingHistoryEntity.domain() = RankingHistoryPoint(rank, score, sampledAt, sampleType)
internal fun ForecastLineDto.domain() = ForecastLine(rank, currentScore, hourlyGrowth, forecast1h, forecast3h, forecastEnd, confidence, updatedAt, sampleCount, sampleSpanHours, confidenceReason, unavailableReason)
internal fun ForecastLineDto.entity(region: Region, eventId: String) = ForecastEntity(region.id, eventId, rank, currentScore, hourlyGrowth, forecast1h, forecast3h, forecastEnd, confidence)
internal fun ForecastEntity.domain() = ForecastLine(rank, currentScore, hourlyGrowth, forecast1h, forecast3h, forecastEnd, confidence)

internal fun EventFullDetailDto.domain(baseUrl: String) = EventDetail(
    event.domain(baseUrl), relations.relatedSongs.map { it.domain(baseUrl) }, relations.relatedCards.map { it.domain(baseUrl) },
    relations.relatedGachas.map { it.domain(baseUrl) }
)
internal fun RankingPlayerDetailDto.domain(baseUrl: String) = RankingPlayerDetail(
    entry = RankingEntry(rank, score, userId, name, updatedAt, proxyUrl(baseUrl, leaderCardImageUrl), hourlyGrowth, leaderCardId, leaderCardLevel, leaderCardMasterRank, leaderCardImageCandidates.orEmpty().mapNotNull { proxyUrl(baseUrl, it) }, leaderCharacterImageCandidates.orEmpty().mapNotNull { proxyUrl(baseUrl, it) }, leaderCharacterId),
    profileWord = profileWord, intervalSeconds = intervalSeconds, growth1h = growth1h, churn1h = churn1h, churn20min = churn20min,
    churn48h = churn48h, rankHourlyGrowth = rankHourlyGrowth, observedPtUpdates = observedPtUpdates, churnStatus = churnStatus, churnUpdatedAt = churnUpdatedAt,
    hourlyChurn = hourlyChurn.orEmpty().map { ChurnHour(it.hour, it.count) },
    recentScoreChanges = recentScoreChanges.orEmpty().map { ScoreChange(it.timestamp, it.delta.toDouble()) },
    parkingPeriods = parkingPeriods.orEmpty().map { ParkingPeriod(it.startTime, it.sinceMs, it.endTime, it.durationSeconds) },
    profileHonors = profileHonors.orEmpty().map { RankingProfileHonor(it.seq, it.profileHonorType, it.honorId, it.honorLevel, it.bondsHonorViewType) },
    playerTrace = playerTrace.map { RankingTracePoint(it.score, it.timestamp, it.sampledAt, it.rank) },
    lineTrace = lineTrace.map { RankingTracePoint(it.score, it.timestamp, it.sampledAt, it.rank) },
    previous = previous?.let { RankingNeighbor(it.rank, it.score, it.userId, it.name) },
    next = next?.let { RankingNeighbor(it.rank, it.score, it.userId, it.name) }
)

internal fun ScoreControlResultDto.domain(baseUrl: String) = ScoreControlResult(
    remainingPt.toLong(), adjustedPtPerRun.toLong(), requiredRuns, requiredPtPerHour?.toLong(),
    requiredRunsPerHour, feasible, targetBorder?.domain(baseUrl), sharedFormulaVersion, warnings
)

internal fun EventPointEstimateResultDto.domain() = EventPointEstimate(
    estimatedPt.toLong(), remainingPt?.toLong(), estimatedRunsToTarget, sharedFormulaVersion,
    officialFieldsUsed, estimatedFieldsUsed, missingFields, warnings, calculationTrace
)

internal fun ForecastDto.domain(window: ForecastWindow, history: RankingHistoryDto, summary: RankingHistorySummaryDto): ForecastDashboard {
    fun List<ForecastLineDto>.lines() = map { it.domain() }
    val allWindows = windows?.let {
        mapOf(ForecastWindow.ALL to it.all.lines(), ForecastWindow.ONE_HOUR to it.oneHour.lines(), ForecastWindow.THREE_HOURS to it.threeHours.lines(), ForecastWindow.SIX_HOURS to it.sixHours.lines())
    } ?: mapOf(window to lines.lines())
    val allSummaries = windowSummaries?.let {
        mapOf(
            ForecastWindow.ALL to ForecastWindowSummary(it.all.lineCount, it.all.maxSampleCount, it.all.maxSampleSpanHours, it.all.confidence),
            ForecastWindow.ONE_HOUR to ForecastWindowSummary(it.oneHour.lineCount, it.oneHour.maxSampleCount, it.oneHour.maxSampleSpanHours, it.oneHour.confidence),
            ForecastWindow.THREE_HOURS to ForecastWindowSummary(it.threeHours.lineCount, it.threeHours.maxSampleCount, it.threeHours.maxSampleSpanHours, it.threeHours.confidence),
            ForecastWindow.SIX_HOURS to ForecastWindowSummary(it.sixHours.lineCount, it.sixHours.maxSampleCount, it.sixHours.maxSampleSpanHours, it.sixHours.confidence)
        )
    } ?: emptyMap()
    return ForecastDashboard(
        eventId, window, allWindows[window] ?: lines.lines(), allWindows, allSummaries,
        history.items.map { RankingHistoryPoint(it.rank, it.score, it.sampledAt, it.sampleType) },
        summary.lines.map { HistorySummaryLine(it.rank, it.sampleType, it.sampleCount, it.latestScore, it.latestSampledAt, it.firstSampledAt, it.sampleSpanHours, it.speedPerHour, it.confidence, it.confidenceReason) },
        sampleCount, generatedAt, source, (warnings + summary.warnings).distinct(), unavailableReason ?: summary.unavailableReason,
        retentionRecommendation ?: summary.retentionRecommendation, sourceHealth?.domain() ?: SourceHealth()
    )
}

internal fun SongSummaryDto.domain(baseUrl: String): SongSummary {
    val candidates = listOfNotNull(resolveAssetUrl(baseUrl, listOf(assets?.jacketUrl) + assets?.imageCandidates.orEmpty()))
    return SongSummary(id, title, unit, durationSeconds, categories, publishedAt, candidates.firstOrNull(), candidates, facets.domainFacets())
}
internal fun SongSummary.entity(region: Region, json: Json) = SongEntity(region.id, id, title, unit, durationSeconds, json.encodeToString(categories), jacketUrl, publishedAt = publishedAt, jacketCandidatesJson = json.encodeToString(jacketCandidates), facetsJson = facets.encodeFacets(json))
internal fun SongEntity.domain(json: Json) = SongSummary(id, title, unit, durationSeconds, runCatching { json.decodeFromString<List<String>>(categoriesJson) }.getOrDefault(emptyList()), publishedAt, jacketUrl, runCatching { json.decodeFromString<List<String>>(jacketCandidatesJson) }.getOrDefault(listOfNotNull(jacketUrl)), facetsJson.decodeFacets(json))
internal fun SongDetailDto.domain(baseUrl: String) = SongDetail(
    song = SongSummary(music.id, music.title, music.unit, music.durationSeconds, music.categories, music.publishedAt,
        resolveAssetUrl(baseUrl, listOf(assets.jacketUrl, music.assets?.jacketUrl) + assets.imageCandidates),
        listOfNotNull(resolveAssetUrl(baseUrl, listOf(assets.jacketUrl, music.assets?.jacketUrl) + assets.imageCandidates))),
    lyricist = music.lyricist, composer = music.composer, arranger = music.arranger, bpm = music.bpm,
    difficulties = music.difficultyDetails.map { Difficulty(it.id, it.difficulty, it.playLevel, it.totalNoteCount) },
    charts = charts.map { chart ->
        val resolved = resolveAssetUrl(baseUrl, listOf(chart.chartSvgUrl, chart.sekaiViewerChartSvgUrl, chart.chartPngUrl))
        ChartPreview(chart.difficulty, chart.playLevel, chart.totalNoteCount, resolved, null, null)
    }
)
internal fun SongDetail.entities(region: Region, json: Json) = song.entity(region, json).copy(lyricist = lyricist, composer = composer, arranger = arranger, bpm = bpm) to charts.map { SongDifficultyEntity(region.id, song.id, it.difficulty, null, it.level, it.notes, it.svgUrl, it.pngUrl, it.viewerSvgUrl) }
internal fun SongEntity.detail(difficulties: List<SongDifficultyEntity>, json: Json) = SongDetail(domain(json), lyricist, composer, arranger, bpm, difficulties.map { Difficulty(it.difficultyId, it.difficulty, it.level, it.notes) }, difficulties.map { ChartPreview(it.difficulty, it.level, it.notes, it.svgUrl, it.viewerSvgUrl, it.pngUrl) })

internal fun CardSummaryDto.domain(baseUrl: String): CardSummary {
    val candidates = listOfNotNull(resolveAssetUrl(baseUrl, listOf(assets?.normalThumbnailUrl) + assets?.normalThumbnailCandidates.orEmpty()))
    return CardSummary(id, title, character, characterId, rarity, attribute, characterUnit ?: supportUnit, candidates.firstOrNull(), candidates, facets.domainFacets())
}
internal fun CardSummary.entity(region: Region, json: Json) = CardEntity(region.id, id, title, character, characterId, rarity, attribute, unit, normalThumbnailUrl, null, null, null, null, json.encodeToString(normalThumbnailCandidates), facets.encodeFacets(json))
internal fun CardEntity.summary(json: Json) = CardSummary(id, title, character, characterId, rarity, attribute, unit, normalThumbnailUrl, runCatching { json.decodeFromString<List<String>>(normalThumbnailCandidatesJson) }.getOrDefault(listOfNotNull(normalThumbnailUrl)), facetsJson.decodeFacets(json))
private fun com.pjsktools.api.generated.CardSkillDto.domain() = CardSkill(id, name, description, formattedDescriptions.mapNotNull { (key, value) -> key.toIntOrNull()?.let { it to value } }.toMap(), skillFormatTrace?.status, skillFormatTrace?.missingFields.orEmpty())
internal fun CardDetailDto.domain(baseUrl: String): CardDetail {
    val thumbnails = listOfNotNull(resolveAssetUrl(baseUrl, listOf(assets.normalThumbnailUrl) + assets.normalThumbnailCandidates))
    val normal = listOfNotNull(resolveAssetUrl(baseUrl, listOf(assets.normalUrl) + assets.normalImageCandidates))
    val trained = listOfNotNull(resolveAssetUrl(baseUrl, listOf(assets.afterTrainingUrl) + assets.afterTrainingImageCandidates))
    return CardDetail(
        CardSummary(card.id, card.title, card.character, card.characterId, card.rarity, card.attribute, card.characterUnit ?: card.supportUnit, thumbnails.firstOrNull(), thumbnails),
        normal.firstOrNull(), normal, trained.firstOrNull(), trained, card.skill?.domain(), card.specialTrainingSkill?.domain(),
        relations?.relatedEvents.orEmpty().map { RelatedCatalogItem(it.id, it.name) }, relations?.relatedGachas.orEmpty().map { RelatedCatalogItem(it.id, it.name) }
    )
}

internal fun PlayerProfileDto.entity() = PlayerProfileEntity(region, userId, nickname, rank, comment, Json.encodeToString(titles), updatedAt, source)
internal fun PlayerProfileEntity.domain() = PlayerProfile(requireNotNull(Region.fromId(region)), userId, nickname, rank, comment, runCatching { Json.decodeFromString<List<String>>(titlesJson) }.getOrDefault(emptyList()), updatedAt, source)

internal fun CatalogAssetDto.domain(baseUrl: String): CatalogAsset {
    val common = imageCandidates
    val image = resolveAssetUrl(baseUrl, listOf(imageUrl) + common)
    val thumbnail = resolveAssetUrl(baseUrl, listOf(thumbnailUrl, imageUrl) + common)
    val banner = resolveAssetUrl(baseUrl, listOf(bannerUrl, screenUrl, imageUrl) + common)
    return CatalogAsset(
        image, thumbnail, listOfNotNull(image),
        resolveAssetUrl(baseUrl, listOf(logoUrl) + common), banner, resolveAssetUrl(baseUrl, listOf(screenUrl, bannerUrl) + common),
        resolveAssetUrl(baseUrl, listOf(degreeMainUrl) + common), resolveAssetUrl(baseUrl, listOf(degreeSubUrl) + common), resolveAssetUrl(baseUrl, listOf(rankMainUrl) + common),
        resolveAssetUrl(baseUrl, listOf(scrollUrl) + common), resolveAssetUrl(baseUrl, listOf(frameUrl) + common)
    )
}
internal fun CatalogItemDto.domain(baseUrl: String): CatalogEntry {
    val kind = requireNotNull(CatalogKind.fromApiName(type)) { "Unsupported catalog type: $type" }
    val data = CatalogEntryData(
        id, kind, name, title, description, category, rarity, characterId, startAt, endAt, relatedCardIds,
        assets.domain(baseUrl), source, gender, designer, partTypes, characterIds,
        parts.map { CostumePart(it.partType, it.variants.map { variant -> CostumeColorVariant(variant.colorId, variant.colorName, variant.assetbundleName) }) }, assetStatus,
        facets.domainFacets()
    )
    return when (kind) {
        CatalogKind.GACHA -> GachaEntry(data, gachaType)
        CatalogKind.HONOR -> HonorEntry(data, honorRarity, groupId)
        CatalogKind.MATERIAL -> MaterialEntry(data, materialType)
        CatalogKind.COSTUME -> CostumeEntry(data, costumeNumber)
        CatalogKind.STAMP -> StampEntry(data, stampType)
        CatalogKind.COMIC -> ComicEntry(data, comicType)
    }
}
internal fun CatalogDetailDto.domain(baseUrl: String) = CatalogDetail(item.domain(baseUrl), relatedCards.map { it.domain(baseUrl) })

