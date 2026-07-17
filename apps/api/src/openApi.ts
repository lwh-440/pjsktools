import type { FastifyInstance } from "fastify";

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: "null" }] });
const stringArray: Schema = { type: "array", items: { type: "string" } };

const schemas: Record<string, Schema> = {
  RegionId: { type: "string", enum: ["jp", "en", "tw", "kr", "cn"] },
  DataAvailability: { type: "string", enum: ["matched", "not-released", "missing-data", "cache-stale", "source-unavailable"] },
  Region: {
    type: "object",
    required: ["id", "name", "repository"],
    properties: { id: ref("RegionId"), name: { type: "string" }, repository: { type: "string" } }
  },
  SourceHealth: {
    type: "object",
    properties: {
      status: { type: "string" }, syncedAt: nullable({ type: "string", format: "date-time" }), updatedAt: nullable({ type: "string", format: "date-time" }),
      unavailableReason: nullable({ type: "string" }), stale: { type: "boolean" }, warnings: stringArray,
      primarySource: nullable({ type: "string" }), fallbackLine: nullable({ type: "string" }), latestUpdatedAt: nullable({ type: "string" }), cacheUpdatedAt: nullable({ type: "string" }), errors: stringArray
    }
  },
  ApiError: {
    type: "object",
    required: ["statusCode", "code", "message"],
    properties: {
      statusCode: { type: "integer" }, code: { type: "string" }, message: { type: "string" }, retryable: { type: "boolean" }, requestId: nullable({ type: "string" })
    }
  },
  PublicUser: {
    type: "object",
    required: ["id", "createdAt", "updatedAt"],
    properties: {
      id: { type: "string" }, email: nullable({ type: "string", format: "email" }),
      nickname: nullable({ type: "string" }), avatarUrl: nullable({ type: "string" }),
      createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }
    }
  },
  AuthResponse: {
    type: "object", required: ["token", "accessToken", "refreshToken", "expiresIn", "user"],
    properties: {
      token: { type: "string" }, accessToken: { type: "string" }, refreshToken: { type: "string" },
      expiresIn: { type: "integer" }, user: ref("PublicUser")
    }
  },
  LoginRequest: {
    type: "object", required: ["email", "password"],
    properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 } }
  },
  RegisterRequest: {
    type: "object", required: ["email", "password", "code"],
    properties: {
      email: { type: "string", format: "email" }, password: { type: "string", minLength: 10 },
      code: { type: "string", pattern: "^[0-9]{6}$" }
    }
  },
  EmailCodeRequest: {
    type: "object", required: ["email"],
    properties: { email: { type: "string", format: "email" }, purpose: { type: "string", enum: ["register"], default: "register" } }
  },
  EmailCodeResponse: {
    type: "object", required: ["ok", "sent", "expiresIn"],
    properties: {
      ok: { type: "boolean" }, sent: { type: "boolean" }, expiresIn: { type: "integer" },
      devCode: nullable({ type: "string" })
    }
  },
  RefreshTokenRequest: {
    type: "object", required: ["refreshToken"],
    properties: { refreshToken: { type: "string", minLength: 16 } }
  },
  OkResponse: {
    type: "object", required: ["ok"], properties: { ok: { type: "boolean" } }
  },
  RuntimeStatus: {
    type: "object",
    properties: {
      updatedAt: nullable({ type: "string", format: "date-time" }), schemaVersion: { type: "integer" }, cachedPlayers: { type: "integer" },
      cachedRankingTop100: { type: "integer" }, cachedRankingBorders: { type: "integer" }, cachedRankingChurn: { type: "integer" }, rankingSampleSeries: { type: "integer" }
    }
  },
  AssetConfig: {
    type: "object",
    required: ["region"],
    properties: { region: ref("RegionId"), assetDirectory: { type: "string" }, proxyPath: { type: "string" } }
  },
  AssetCandidates: {
    type: "object",
    properties: {
      jacketUrl: nullable({ type: "string" }), bannerUrl: nullable({ type: "string" }), normalUrl: nullable({ type: "string" }),
      afterTrainingUrl: nullable({ type: "string" }), normalThumbnailUrl: nullable({ type: "string" }), afterTrainingThumbnailUrl: nullable({ type: "string" }),
      imageCandidates: stringArray, normalImageCandidates: stringArray, normalThumbnailCandidates: stringArray,
      afterTrainingImageCandidates: stringArray, afterTrainingThumbnailCandidates: stringArray
    }
  },
  DifficultyDetail: {
    type: "object", required: ["difficulty", "playLevel", "totalNoteCount"],
    properties: { id: nullable({ type: "string" }), difficulty: { type: "string" }, playLevel: { type: "integer" }, totalNoteCount: { type: "integer" } }
  },
  SongSummary: {
    type: "object", required: ["id", "title", "unit"],
    properties: {
      id: { type: "string" }, title: { type: "string" }, unit: { type: "string" }, durationSeconds: nullable({ type: "integer" }),
      categories: stringArray, publishedAt: nullable({ type: "string", format: "date-time" }),
      assetbundleName: nullable({ type: "string" }), jacketAssetbundleName: nullable({ type: "string" }), assets: ref("AssetCandidates"),
      facets: { type: "array", items: ref("CatalogItemFacet") }
    }
  },
  Song: {
    allOf: [ref("SongSummary"), { type: "object", properties: {
      difficulties: stringArray, difficultyDetails: { type: "array", items: ref("DifficultyDetail") }, publishedAt: nullable({ type: "string" }),
      lyricist: nullable({ type: "string" }), composer: nullable({ type: "string" }), arranger: nullable({ type: "string" }), bpm: nullable({ type: "number" })
    } }]
  },
  ChartDetail: {
    type: "object", required: ["region", "musicId", "title", "difficulty", "jacketUrl", "chartSvgUrl", "chartPngUrl", "sekaiViewerChartSvgUrl", "susUrl"],
    properties: {
      region: ref("RegionId"), musicId: { type: "string" }, title: { type: "string" }, difficulty: { type: "string" }, difficultyId: nullable({ type: "string" }),
      playLevel: nullable({ type: "integer" }), totalNoteCount: nullable({ type: "integer" }), durationSeconds: nullable({ type: "integer" }), bpm: nullable({ type: "number" }),
      jacketUrl: { type: "string" }, chartSvgUrl: { type: "string" }, chartPngUrl: { type: "string" }, sekaiViewerChartSvgUrl: { type: "string" }, susUrl: { type: "string" }
    }
  },
  SongDetail: {
    type: "object", required: ["region", "music", "assets", "charts"],
    properties: { region: ref("RegionId"), music: ref("Song"), assets: ref("AssetCandidates"), charts: { type: "array", items: ref("ChartDetail") } }
  },
  CardSummary: {
    type: "object", required: ["id", "title", "character", "rarity", "attribute"],
    properties: {
      id: { type: "string" }, title: { type: "string" }, character: { type: "string" }, characterId: nullable({ type: "string" }), rarity: { type: "integer" },
      attribute: { type: "string" }, characterUnit: nullable({ type: "string" }), supportUnit: nullable({ type: "string" }), assetbundleName: nullable({ type: "string" }), assets: ref("AssetCandidates"),
      facets: { type: "array", items: ref("CatalogItemFacet") }
    }
  },
  CardSkill: {
    type: "object", required: ["id"],
    properties: {
      id: { type: "string" }, name: nullable({ type: "string" }), description: nullable({ type: "string" }), skillType: nullable({ type: "string" }), duration: nullable({ type: "integer" }),
      formattedDescriptions: { type: "object", properties: { "1": { type: "string" }, "2": { type: "string" }, "3": { type: "string" }, "4": { type: "string" } } },
      skillFormatTrace: { type: "object", properties: { status: { type: "string" }, missingFields: stringArray, unresolvedPlaceholders: stringArray } }
    }
  },
  Card: {
    allOf: [ref("CardSummary"), { type: "object", properties: { skill: nullable(ref("CardSkill")), specialTrainingSkill: nullable(ref("CardSkill")) } }]
  },
  CardDetail: {
    type: "object", required: ["region", "card", "assets"],
    properties: {
      region: ref("RegionId"), card: ref("Card"), assets: ref("AssetCandidates"),
      relations: { type: "object", properties: {
        relatedEvents: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: nullable({ type: "string" }) } } },
        relatedGachas: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: nullable({ type: "string" }) } } }
      } }
    }
  },
  EventSummary: {
    type: "object", required: ["id", "name", "startAt", "endAt"],
    properties: {
      id: { type: "string" }, name: { type: "string" }, eventType: nullable({ type: "string" }), eventUnit: nullable({ type: "string" }),
      bonusCharacterIds: stringArray, bonusAttributes: stringArray, bannerCharacterId: nullable({ type: "string" }),
      startAt: { type: "string" }, endAt: { type: "string" }, aggregateAt: nullable({ type: "string" }), rankingAnnounceAt: nullable({ type: "string" }),
      storyOutline: nullable({ type: "string" }), assets: ref("AssetCandidates"),
      facets: { type: "array", items: ref("CatalogItemFacet") }
    }
  },
  EventRelations: {
    type: "object", required: ["relatedSongs", "relatedCards", "relatedGachas"],
    properties: {
      relatedSongs: { type: "array", items: ref("SongSummary") },
      relatedCards: { type: "array", items: ref("CardSummary") },
      relatedGachas: { type: "array", items: ref("GachaItem") }
    }
  },
  EventFullDetail: {
    type: "object", required: ["region", "event", "assets", "relations"],
    properties: {
      region: ref("RegionId"), event: ref("EventSummary"), assets: ref("AssetCandidates"),
      relations: ref("EventRelations"), realDataRequired: { type: "boolean" }
    }
  },
  RankingEntry: {
    type: "object", required: ["rank", "score"],
    properties: {
      rank: { type: "integer" }, score: { type: "integer", format: "int64" }, userId: nullable({ type: "string" }), name: nullable({ type: "string" }),
      updatedAt: nullable({ type: "string" }), hourlyGrowth: nullable({ type: "number" }), leaderCardId: nullable({ type: "integer" }),
      leaderCardLevel: nullable({ type: "integer" }), leaderCardMasterRank: nullable({ type: "integer" }), leaderCardImageUrl: nullable({ type: "string" }),
      leaderCardImageCandidates: stringArray, leaderCharacterImageCandidates: stringArray, leaderCharacterId: nullable({ type: "integer" })
    }
  },
  RankingTracePoint: {
    type: "object", required: ["score"],
    properties: { timestamp: nullable({ type: "integer", format: "int64" }), sampledAt: nullable({ type: "string" }), score: { type: "integer", format: "int64" }, rank: nullable({ type: "integer" }) }
  },
  RankingNeighbor: {
    type: "object", required: ["rank", "score"],
    properties: { rank: { type: "integer" }, score: { type: "integer", format: "int64" }, userId: nullable({ type: "string" }), name: nullable({ type: "string" }) }
  },
  RankingProfileHonor: {
    type: "object", additionalProperties: false,
    properties: {
      seq: nullable({ type: "integer" }), profileHonorType: nullable({ type: "string" }), honorId: nullable({ type: "integer" }),
      honorLevel: nullable({ type: "integer" }), bondsHonorViewType: nullable({ type: "string" })
    }
  },
  WorldLinkCharacter: {
    type: "object", required: ["id", "name"], additionalProperties: false,
    properties: { id: { type: "integer" }, name: { type: "string" }, imageCandidates: stringArray }
  },
  RankingPlayerDetail: {
    allOf: [ref("RankingEntry"), { type: "object", properties: {
      profileWord: nullable({ type: "string" }), profileHonors: { type: "array", items: ref("RankingProfileHonor") }, timestamp: nullable({ type: "integer", format: "int64" }), intervalSeconds: nullable({ type: "integer" }),
      growth1h: nullable({ type: "number" }), churn1h: nullable({ type: "integer" }), churn20min: nullable({ type: "integer" }), churn48h: nullable({ type: "integer" }),
      rankHourlyGrowth: nullable({ type: "number" }), observedPtUpdates: nullable({ type: "integer" }), churnStatus: nullable({ type: "string" }), churnUpdatedAt: nullable({ type: "string" }),
      hourlyChurn: { type: "array", items: { type: "object", required: ["hour", "count"], properties: { hour: { type: "string" }, count: { type: "integer" } }, additionalProperties: false } },
      recentScoreChanges: { type: "array", items: { type: "object", required: ["timestamp", "delta"], properties: { timestamp: { type: "integer", format: "int64" }, delta: { type: "number" } }, additionalProperties: false } },
      parkingPeriods: { type: "array", items: { type: "object", properties: { startTime: nullable({ type: "integer", format: "int64" }), sinceMs: nullable({ type: "integer", format: "int64" }), endTime: nullable({ type: "integer", format: "int64" }), durationSeconds: nullable({ type: "integer" }) }, additionalProperties: false } },
      playerTrace: { type: "array", items: ref("RankingTracePoint") }, lineTrace: { type: "array", items: ref("RankingTracePoint") },
      previous: nullable(ref("RankingNeighbor")), next: nullable(ref("RankingNeighbor"))
    } }]
  },
  RankingHistorySample: {
    type: "object", required: ["rank", "score", "sampledAt"],
    properties: { rank: { type: "integer" }, score: { type: "integer", format: "int64" }, sampledAt: { type: "string" }, sampleType: nullable({ type: "string" }), playerName: nullable({ type: "string" }) }
  },
  RankingHistory: {
    type: "object", required: ["region", "eventId", "items", "sampleCount"],
    properties: {
      region: ref("RegionId"), eventId: { type: "string" }, sampleType: nullable({ type: "string" }), items: { type: "array", items: ref("RankingHistorySample") },
      sampleCount: { type: "integer" }, firstSampledAt: nullable({ type: "string" }), lastSampledAt: nullable({ type: "string" }),
      sourceHealth: ref("SourceHealth"), retentionRecommendation: nullable({ type: "string" }), unavailableReason: nullable({ type: "string" }), warnings: stringArray
    }
  },
  RankingHistoryLine: {
    type: "object", required: ["rank", "sampleCount"],
    properties: {
      rank: { type: "integer" }, sampleType: nullable({ type: "string" }), sampleCount: { type: "integer" }, latestScore: nullable({ type: "integer", format: "int64" }),
      latestSampledAt: nullable({ type: "string" }), firstSampledAt: nullable({ type: "string" }), sampleSpanHours: nullable({ type: "number" }),
      speedPerHour: nullable({ type: "number" }), predictability: nullable({ type: "string" }), confidence: nullable({ type: "string" }), confidenceReason: nullable({ type: "string" })
    }
  },
  RankingHistorySummary: {
    type: "object", required: ["region", "eventId", "lines"],
    properties: {
      region: ref("RegionId"), eventId: { type: "string" }, sampleType: nullable({ type: "string" }), lineCount: { type: "integer" },
      lines: { type: "array", items: ref("RankingHistoryLine") }, sourceHealth: ref("SourceHealth"),
      retentionRecommendation: nullable({ type: "string" }), unavailableReason: nullable({ type: "string" }), warnings: stringArray
    }
  },
  ForecastLine: {
    type: "object", required: ["rank"],
    properties: {
      rank: { type: "integer" }, currentScore: nullable({ type: "integer", format: "int64" }), updatedAt: nullable({ type: "string" }),
      sampleCount: { type: "integer" }, sampleSpanHours: nullable({ type: "number" }), hourlyGrowth: nullable({ type: "number" }), speedPerHour: nullable({ type: "number" }),
      forecast1h: nullable({ type: "integer", format: "int64" }), forecast3h: nullable({ type: "integer", format: "int64" }), forecastEnd: nullable({ type: "integer", format: "int64" }),
      confidence: nullable({ type: "string" }), confidenceReason: nullable({ type: "string" }), unavailableReason: nullable({ type: "string" })
    }
  },
  ForecastWindowSummary: {
    type: "object", required: ["lineCount", "maxSampleCount", "maxSampleSpanHours", "confidence"],
    properties: { lineCount: { type: "integer" }, maxSampleCount: { type: "integer" }, maxSampleSpanHours: { type: "number" }, confidence: { type: "string" } }
  },
  ForecastWindows: {
    type: "object", required: ["all", "1h", "3h", "6h"], additionalProperties: false,
    properties: { all: { type: "array", items: ref("ForecastLine") }, "1h": { type: "array", items: ref("ForecastLine") }, "3h": { type: "array", items: ref("ForecastLine") }, "6h": { type: "array", items: ref("ForecastLine") } }
  },
  ForecastWindowSummaries: {
    type: "object", required: ["all", "1h", "3h", "6h"], additionalProperties: false,
    properties: { all: ref("ForecastWindowSummary"), "1h": ref("ForecastWindowSummary"), "3h": ref("ForecastWindowSummary"), "6h": ref("ForecastWindowSummary") }
  },
  Forecast: {
    type: "object", required: ["region", "eventId", "lines"],
    properties: {
      region: ref("RegionId"), eventId: { type: "string" }, generatedAt: nullable({ type: "string" }), experimental: { type: "boolean" },
      source: nullable({ type: "string" }), basis: nullable({ type: "string" }), sampleCount: { type: "integer" }, windowHours: nullable({ type: "string" }),
      lines: { type: "array", items: ref("ForecastLine") }, windows: ref("ForecastWindows"), windowSummaries: ref("ForecastWindowSummaries"),
      sourceHealth: ref("SourceHealth"), retentionRecommendation: nullable({ type: "string" }), unavailableReason: nullable({ type: "string" }), warnings: stringArray
    }
  },
  LiveRanking: {
    type: "object",
    properties: {
      eventId: nullable({ type: "string" }), currentEvent: nullable(ref("EventSummary")), top100: { type: "array", items: ref("RankingEntry") },
      borderLines: { type: "array", items: ref("RankingEntry") }, updatedAt: nullable({ type: "string" }), sourceHealth: ref("SourceHealth"),
      boardType: { type: "string", enum: ["overall", "worldlink"] }, gameCharacterId: nullable({ type: "integer" }), worldLinkCharacters: { type: "array", items: ref("WorldLinkCharacter") }, worldLinkAvailable: { type: "boolean" }, staleRanks: { type: "array", items: { type: "integer" } }, warnings: stringArray
    }
  },
  ScoreControlRequest: {
    type: "object", required: ["currentPt", "targetPt", "remainingMinutes"],
    properties: {
      region: ref("RegionId"), bindingId: nullable({ type: "string" }), eventId: nullable({ type: "string" }), targetRank: nullable({ type: "integer" }),
      currentPt: { type: "number", minimum: 0 }, targetPt: { type: "number", minimum: 0 }, remainingMinutes: { type: "number", minimum: 0 },
      ptPerRun: nullable({ type: "number" }), availableRuns: nullable({ type: "integer" }), musicId: nullable({ type: "string" }), difficulty: nullable({ type: "string" })
    }
  },
  ScoreControlResult: {
    type: "object", required: ["remainingPt", "adjustedPtPerRun", "feasible", "warnings"],
    properties: {
      remainingPt: { type: "number" }, adjustedPtPerRun: { type: "number" }, requiredRuns: nullable({ type: "integer" }),
      requiredPtPerHour: nullable({ type: "integer" }), requiredRunsPerHour: nullable({ type: "number" }), feasible: { type: "boolean" },
      sharedFormulaVersion: nullable({ type: "string" }), warnings: stringArray, targetBorder: nullable(ref("RankingEntry")), realDataRequired: { type: "boolean" }
    }
  },
  EventPointEstimateRequest: {
    type: "object", required: ["region"],
    properties: {
      region: ref("RegionId"), bindingId: nullable({ type: "string" }), eventId: nullable({ type: "string" }), musicId: nullable({ type: "string" }),
      difficulty: nullable({ type: "string" }), currentPt: nullable({ type: "number" }), targetPt: nullable({ type: "number" }),
      eventBonusPercent: nullable({ type: "number" }), baseScore: nullable({ type: "number" }), boost: nullable({ type: "number" })
    }
  },
  EventPointEstimateResult: {
    type: "object", required: ["estimatedPt", "missingFields", "warnings"],
    properties: {
      estimatedPt: { type: "number" }, remainingPt: nullable({ type: "number" }), estimatedRunsToTarget: nullable({ type: "integer" }),
      sharedFormulaVersion: nullable({ type: "string" }), officialFieldsUsed: stringArray, estimatedFieldsUsed: stringArray,
      missingFields: stringArray, warnings: stringArray, calculationTrace: stringArray, realDataRequired: { type: "boolean" }
    }
  },
  PlayerBinding: {
    type: "object", required: ["id", "region", "playerUid", "isDefault", "createdAt", "updatedAt"],
    properties: {
      id: { type: "string" }, region: ref("RegionId"), playerUid: { type: "string" }, displayName: nullable({ type: "string" }),
      isDefault: { type: "boolean" }, note: nullable({ type: "string" }), refreshedAt: nullable({ type: "string" }),
      createdAt: { type: "string" }, updatedAt: { type: "string" }, version: nullable({ type: "string" })
    }
  },
  PlayerBindingPage: {
    type: "object", required: ["items", "page", "pageSize", "total", "totalPages"],
    properties: { items: { type: "array", items: ref("PlayerBinding") }, page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" }, hasNextPage: { type: "boolean" }, hasPreviousPage: { type: "boolean" } }
  },
  PlayerBindingCreateRequest: {
    type: "object", required: ["region", "playerUid"],
    properties: { region: ref("RegionId"), playerUid: { type: "string", minLength: 1, maxLength: 32 }, displayName: nullable({ type: "string" }), isDefault: { type: "boolean" }, note: nullable({ type: "string" }) }
  },
  PlayerBindingPatchRequest: {
    type: "object", minProperties: 1,
    properties: { displayName: nullable({ type: "string" }), isDefault: { type: "boolean" }, note: nullable({ type: "string" }) }
  },
  PlayerProfile: {
    type: "object", required: ["region", "userId", "nickname", "rank", "updatedAt", "source"],
    properties: { region: ref("RegionId"), userId: { type: "string" }, nickname: { type: "string" }, rank: { type: "integer" }, comment: nullable({ type: "string" }), titles: stringArray, updatedAt: { type: "string" }, source: { type: "string" } }
  }
};

const catalogAssetSchema: Schema = {
  type: "object", required: ["imageCandidates"],
  properties: {
    imageUrl: nullable({ type: "string" }), thumbnailUrl: nullable({ type: "string" }), imageCandidates: stringArray,
    logoUrl: nullable({ type: "string" }), bannerUrl: nullable({ type: "string" }), screenUrl: nullable({ type: "string" }),
    degreeMainUrl: nullable({ type: "string" }), degreeSubUrl: nullable({ type: "string" }), rankMainUrl: nullable({ type: "string" }),
    scrollUrl: nullable({ type: "string" }), frameUrl: nullable({ type: "string" }), source: nullable({ type: "string" })
  }
};
schemas.CatalogAssets = catalogAssetSchema;
schemas.CatalogItemFacet = {
  type: "object", required: ["key", "values"],
  properties: { key: { type: "string" }, values: stringArray }
};
schemas.CatalogFilterOption = {
  type: "object", required: ["value", "label", "count", "iconCandidates"],
  properties: {
    value: { type: "string" }, label: { type: "string" }, count: { type: "integer" },
    iconKey: nullable({ type: "string" }), color: nullable({ type: "string" }), iconCandidates: stringArray
  }
};
schemas.CatalogFilterGroup = {
  type: "object", required: ["key", "label", "selection", "match", "options"],
  properties: {
    key: { type: "string" }, label: { type: "string" }, selection: { type: "string", enum: ["multi"] },
    match: { type: "string", enum: ["any", "all"] }, options: { type: "array", items: ref("CatalogFilterOption") }
  }
};
schemas.CatalogFilterMeta = {
  type: "object", required: ["groups"],
  properties: {
    groups: { type: "array", items: ref("CatalogFilterGroup") },
    toggles: { type: "array", items: { type: "object", required: ["key", "label", "value"], properties: { key: { type: "string" }, label: { type: "string" }, value: { type: "boolean" } } } }
  }
};
schemas.AppliedCatalogFilters = {
  type: "object",
  additionalProperties: false,
  properties: Object.fromEntries([
    "eventTypes", "eventUnits", "bonusCharacterIds", "bannerCharacterIds", "bonusAttributes",
    "musicTags", "categories", "characterIds", "units", "supportUnits", "attributes", "rarities",
    "supplyTypes", "skillTypes", "gachaTypes", "honorTypes", "materialTypes", "partTypes",
    "sources", "genders", "stampTypes", "comicTypes"
  ].map((key) => [key, stringArray]).concat([
    ["groupOnce", { type: "boolean" }], ["usableOnly", { type: "boolean" }], ["relatedOnly", { type: "boolean" }]
  ]))
};
schemas.CostumeColorVariant = { type: "object", properties: { colorId: nullable({ type: "integer" }), colorName: nullable({ type: "string" }), assetbundleName: nullable({ type: "string" }) } };
schemas.CostumePart = { type: "object", required: ["partType", "variants"], properties: { partType: { type: "string" }, variants: { type: "array", items: ref("CostumeColorVariant") } } };

const catalogItemProperties: Record<string, Schema> = {
  id: { type: "string" }, type: { type: "string" }, name: { type: "string" }, title: nullable({ type: "string" }),
  description: nullable({ type: "string" }), category: nullable({ type: "string" }), rarity: nullable({ type: "string" }),
  characterId: nullable({ type: "integer" }), startAt: nullable({ type: "string" }), endAt: nullable({ type: "string" }),
  relatedCardIds: stringArray, assets: ref("CatalogAssets"), facets: { type: "array", items: ref("CatalogItemFacet") }
};
const catalogItemExtras: Record<string, Record<string, Schema>> = {
  Gacha: { gachaType: nullable({ type: "string" }) },
  Honor: { honorRarity: nullable({ type: "string" }), groupId: nullable({ type: "integer" }) },
  Material: { materialType: nullable({ type: "string" }) },
  Costume: {
    costumeNumber: nullable({ type: "integer" }), designer: nullable({ type: "string" }), gender: nullable({ type: "string" }), source: nullable({ type: "string" }),
    partTypes: stringArray, characterIds: { type: "array", items: { type: "integer" } }, parts: { type: "array", items: ref("CostumePart") }, assetStatus: nullable({ type: "string" })
  },
  Stamp: { stampType: nullable({ type: "string" }) },
  Comic: { comicType: nullable({ type: "string" }) }
};
for (const [name, extra] of Object.entries(catalogItemExtras)) {
  schemas[`${name}Item`] = { type: "object", required: ["id", "type", "name", "relatedCardIds", "assets"], properties: { ...catalogItemProperties, ...extra } };
  schemas[`${name}Detail`] = {
    type: "object", required: ["region", "type", "item", "assets", "relatedCards"],
    properties: {
      region: ref("RegionId"), type: { type: "string" }, item: ref(`${name}Item`), assets: ref("CatalogAssets"),
      relatedCards: { type: "array", items: ref("CardSummary") }
    }
  };
}

for (const [name, item] of [
  ["SongPage", "SongSummary"], ["CardPage", "CardSummary"], ["EventPage", "EventSummary"], ["RankingEntryPage", "RankingEntry"],
  ["GachaPage", "GachaItem"], ["HonorPage", "HonorItem"], ["MaterialPage", "MaterialItem"], ["CostumePage", "CostumeItem"], ["StampPage", "StampItem"], ["ComicPage", "ComicItem"]
] as const) {
  schemas[name] = {
    type: "object", required: ["items", "page", "pageSize", "total", "totalPages", "hasNextPage", "hasPreviousPage"],
    properties: {
      items: { type: "array", items: ref(item) }, page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" },
      hasNextPage: { type: "boolean" }, hasPreviousPage: { type: "boolean" }, region: ref("RegionId"), type: nullable({ type: "string" }), masterVersion: nullable({ type: "string" }),
      sourceHealth: ref("SourceHealth"), source: nullable({ type: "string" }), unavailableReason: nullable({ type: "string" }),
      filterMeta: ref("CatalogFilterMeta"), appliedFilters: ref("AppliedCatalogFilters")
    }
  };
}

schemas.FavoriteTarget = {
  type: "object", required: ["id", "type", "displayName", "available", "imageCandidates"],
  properties: {
    id: { type: "string" }, type: { type: "string" }, displayName: { type: "string" },
    secondaryText: nullable({ type: "string" }), imageUrl: nullable({ type: "string" }),
    imageCandidates: stringArray, available: { type: "boolean" }
  }
};
schemas.Favorite = {
  type: "object", required: ["id", "type", "region", "targetId", "folderIds", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string" }, type: { type: "string", enum: ["player", "event", "song", "card", "gacha", "honor", "material", "costume", "stamp", "comic"] },
    region: ref("RegionId"), targetId: { type: "string" }, label: nullable({ type: "string" }),
    folderIds: stringArray, target: ref("FavoriteTarget"), createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" }, version: nullable({ type: "string" })
  }
};
schemas.FavoriteFolder = {
  type: "object", required: ["id", "name", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string" }, name: { type: "string" }, description: nullable({ type: "string" }),
    itemCount: { type: "integer" }, createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" }, version: nullable({ type: "string" })
  }
};
schemas.FavoritePage = {
  type: "object", required: ["items", "page", "pageSize", "total", "totalPages"],
  properties: {
    items: { type: "array", items: ref("Favorite") }, page: { type: "integer" }, pageSize: { type: "integer" },
    total: { type: "integer" }, totalPages: { type: "integer" }, hasNextPage: { type: "boolean" }, hasPreviousPage: { type: "boolean" }
  }
};
schemas.FavoriteFolderCreateRequest = {
  type: "object", required: ["name"],
  properties: { name: { type: "string", minLength: 1, maxLength: 60 }, description: { type: "string", maxLength: 200 } }
};
schemas.FavoriteFolderPatchRequest = {
  type: "object", minProperties: 1,
  properties: { name: { type: "string", minLength: 1, maxLength: 60 }, description: { type: "string", maxLength: 200 } }
};
schemas.CreateFavoriteRequest = {
  type: "object", required: ["type", "region", "targetId"],
  properties: {
    type: { type: "string", enum: ["player", "event", "song", "card", "gacha", "honor", "material", "costume", "stamp", "comic"] },
    region: ref("RegionId"), targetId: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1, maxLength: 200 },
    folderIds: stringArray
  }
};
schemas.FavoriteFoldersPatchRequest = {
  type: "object", required: ["folderIds"], properties: { folderIds: stringArray }
};
schemas.FavoriteBulkPatchRequest = {
  type: "object", required: ["favoriteIds", "folderIds", "mode"],
  properties: {
    favoriteIds: { type: "array", minItems: 1, maxItems: 200, items: { type: "string" } },
    folderIds: stringArray, mode: { type: "string", enum: ["add", "remove", "replace"] }
  }
};

function openApiPath(url: string) {
  return url.replace(/:([A-Za-z0-9_]+)/g, "{$1}").replace(/\*$/, "{resourcePath}");
}

function pathParameters(url: string) {
  const parameters = [...url.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
    name: match[1], in: "path", required: true, schema: match[1] === "region" ? ref("RegionId") : { type: "string" }
  }));
  if (url.endsWith("/*")) {
    parameters.push({ name: "resourcePath", in: "path", required: true, schema: { type: "string" } });
  }
  return parameters;
}

const jsonResponse = (schema: Schema, description = "Successful response") => ({ description, content: { "application/json": { schema } } });
const query = (name: string, schema: Schema) => ({ name, in: "query", required: false, schema });
const queryMulti = (name: string, itemSchema: Schema = { type: "string" }) => ({ name, in: "query", required: false, style: "form", explode: true, schema: { type: "array", items: itemSchema } });
const requestBody = (schema: Schema) => ({ required: true, content: { "application/json": { schema } } });
const headerRef = (name: string) => ({ $ref: `#/components/parameters/${name}` });

type OperationOverride = {
  operationId: string;
  response: Schema;
  parameters?: Schema[];
  request?: Schema;
  security?: boolean;
  successStatus?: number;
};

const overrides: Record<string, OperationOverride> = {
  "GET /api/regions": { operationId: "getRegions", response: { type: "array", items: ref("Region") } },
  "GET /api/runtime/status": { operationId: "getRuntimeStatus", response: ref("RuntimeStatus") },
  "GET /api/assets/:region/config": { operationId: "getAssetConfig", response: ref("AssetConfig") },
  "GET /api/assets/resolve": { operationId: "resolveAsset", response: { type: "string", format: "binary" }, parameters: [query("url", { type: "array", maxItems: 3, items: { type: "string", format: "uri" } })] },
  "GET /api/events/:region": { operationId: "getEvents", response: { type: "array", items: ref("EventSummary") } },
  "GET /api/events/:region/current": { operationId: "getCurrentEvent", response: ref("EventSummary") },
  "GET /api/events/:region/live-ranking": { operationId: "getLiveRanking", response: ref("LiveRanking"), parameters: [query("boardType", { type: "string", enum: ["overall", "worldlink"], default: "overall" }), query("gameCharacterId", { type: "integer", minimum: 1 })] },
  "GET /api/events/:region/:eventId/ranking-top100": { operationId: "getRankingTop100", response: ref("RankingEntryPage"), parameters: [query("page", { type: "integer", minimum: 1, default: 1 }), query("pageSize", { type: "integer", minimum: 1, maximum: 100, default: 24 })] },
  "GET /api/events/:region/:eventId/ranking-border": { operationId: "getRankingBorders", response: ref("RankingEntryPage"), parameters: [query("page", { type: "integer", minimum: 1, default: 1 }), query("pageSize", { type: "integer", minimum: 1, maximum: 100, default: 24 })] },
  "GET /api/events/:region/:eventId/ranking-history": { operationId: "getRankingHistory", response: ref("RankingHistory"), parameters: [query("sampleType", { type: "string", enum: ["top100", "border"] }), query("rank", { type: "integer" }), query("from", { type: "string" }), query("to", { type: "string" }), query("limit", { type: "integer", maximum: 5000 }), query("windowHours", { type: "integer", enum: [1, 3, 6] })] },
  "GET /api/events/:region/:eventId/ranking-history/summary": { operationId: "getRankingHistorySummary", response: ref("RankingHistorySummary"), parameters: [query("sampleType", { type: "string", enum: ["top100", "border"] }), query("rank", { type: "integer" }), query("limit", { type: "integer", maximum: 5000 }), query("windowHours", { type: "integer", enum: [1, 3, 6] })] },
  "GET /api/events/:region/:eventId/ranking-forecast": { operationId: "getRankingForecast", response: ref("Forecast"), parameters: [query("windowHours", { type: "integer", enum: [1, 3, 6] })] },
  "GET /api/events/:region/:eventId/ranking-player/:rank": { operationId: "getRankingPlayerDetail", response: ref("RankingPlayerDetail"), parameters: [query("boardType", { type: "string", enum: ["overall", "worldlink"] }), query("gameCharacterId", { type: "integer" })] },
  "GET /api/events/:region/:eventId/ranking-churn": { operationId: "getRankingChurn", response: { type: "object", properties: { status: { type: "string" }, updatedAt: nullable({ type: "string" }), errors: stringArray } }, parameters: [query("boardType", { type: "string", enum: ["overall", "worldlink"] }), query("gameCharacterId", { type: "integer" }), query("top", { type: "integer" })] },
  "GET /api/master/:region/events/:eventId/full": { operationId: "getFullEventDetail", response: ref("EventFullDetail") },
  "GET /api/master/:region/music/:musicId/full": { operationId: "getSongDetail", response: ref("SongDetail") },
  "GET /api/master/:region/music/:musicId/charts/:difficulty": { operationId: "getSongChart", response: ref("ChartDetail") },
  "GET /api/master/:region/cards/:cardId/full": { operationId: "getCardDetail", response: ref("CardDetail") },
  "GET /api/players/:region/:userId/profile": { operationId: "getPlayerProfile", response: ref("PlayerProfile") },
  "POST /api/players/:region/:userId/refresh": { operationId: "refreshPlayerProfile", response: ref("PlayerProfile") },
  "POST /api/auth/email-code/start": { operationId: "startEmailVerification", response: ref("EmailCodeResponse"), request: ref("EmailCodeRequest") },
  "POST /api/auth/register": { operationId: "register", response: ref("AuthResponse"), request: ref("RegisterRequest"), successStatus: 201 },
  "POST /api/auth/login": { operationId: "login", response: ref("AuthResponse"), request: ref("LoginRequest") },
  "POST /api/auth/refresh": { operationId: "refreshSession", response: ref("AuthResponse"), request: ref("RefreshTokenRequest") },
  "POST /api/auth/logout": { operationId: "logout", response: ref("OkResponse"), request: ref("RefreshTokenRequest") },
  "POST /api/tools/score-control": { operationId: "calculateScoreControl", response: ref("ScoreControlResult"), request: ref("ScoreControlRequest") },
  "POST /api/tools/event-point-calc": { operationId: "estimateEventPoint", response: ref("EventPointEstimateResult"), request: ref("EventPointEstimateRequest") },
  "POST /api/me/tools/score-control": { operationId: "calculateBoundScoreControl", response: ref("ScoreControlResult"), request: ref("ScoreControlRequest"), security: true },
  "POST /api/me/tools/event-point-calc": { operationId: "estimateBoundEventPoint", response: ref("EventPointEstimateResult"), request: ref("EventPointEstimateRequest"), security: true },
  "GET /api/me/player-bindings": { operationId: "getPlayerBindings", response: ref("PlayerBindingPage"), security: true, parameters: [query("page", { type: "integer" }), query("pageSize", { type: "integer" })] },
  "POST /api/me/player-bindings": { operationId: "createPlayerBinding", response: ref("PlayerBinding"), request: ref("PlayerBindingCreateRequest"), security: true },
  "PATCH /api/me/player-bindings/:id": { operationId: "updatePlayerBinding", response: ref("PlayerBinding"), request: ref("PlayerBindingPatchRequest"), security: true, parameters: [headerRef("IfMatch")] },
  "DELETE /api/me/player-bindings/:id": { operationId: "deletePlayerBinding", response: ref("OkResponse"), security: true, parameters: [headerRef("IfMatch")] },
  "GET /api/me/favorite-folders": { operationId: "getFavoriteFolders", response: { type: "array", items: ref("FavoriteFolder") }, security: true },
  "POST /api/me/favorite-folders": { operationId: "createFavoriteFolder", response: ref("FavoriteFolder"), request: ref("FavoriteFolderCreateRequest"), security: true, parameters: [headerRef("IdempotencyKey")] },
  "PATCH /api/me/favorite-folders/:id": { operationId: "updateFavoriteFolder", response: ref("FavoriteFolder"), request: ref("FavoriteFolderPatchRequest"), security: true, parameters: [headerRef("IdempotencyKey"), headerRef("IfMatch")] },
  "DELETE /api/me/favorite-folders/:id": { operationId: "deleteFavoriteFolder", response: ref("OkResponse"), security: true, parameters: [headerRef("IdempotencyKey"), headerRef("IfMatch")] },
  "GET /api/me/favorites": { operationId: "getFavorites", response: ref("FavoritePage"), security: true, parameters: [
    query("folderId", { type: "string" }), query("unfiled", { type: "boolean" }), query("type", { type: "string" }),
    query("region", ref("RegionId")), query("q", { type: "string" }), query("page", { type: "integer" }), query("pageSize", { type: "integer" })
  ] },
  "POST /api/me/favorites": { operationId: "createFavorite", response: ref("Favorite"), request: ref("CreateFavoriteRequest"), security: true, parameters: [headerRef("IdempotencyKey")] },
  "PATCH /api/me/favorites/bulk": { operationId: "bulkUpdateFavoriteFolders", response: { type: "array", items: ref("Favorite") }, request: ref("FavoriteBulkPatchRequest"), security: true, parameters: [headerRef("IdempotencyKey")] },
  "PATCH /api/me/favorites/:id": { operationId: "updateFavoriteFolders", response: ref("Favorite"), request: ref("FavoriteFoldersPatchRequest"), security: true, parameters: [headerRef("IdempotencyKey"), headerRef("IfMatch")] },
  "DELETE /api/me/favorites/:id": { operationId: "deleteFavorite", response: ref("OkResponse"), security: true, parameters: [headerRef("IdempotencyKey"), headerRef("IfMatch")] }
};

const catalogParameters = [
  query("page", { type: "integer", minimum: 1, default: 1 }), query("pageSize", { type: "integer", minimum: 1, maximum: 100, default: 24 }),
  query("q", { type: "string", maxLength: 100 }), query("sort", { type: "string", enum: ["id-asc", "id-desc", "name-asc", "name-desc", "start-asc", "start-desc"] })
];

overrides["GET /api/master/:region/catalogs/events"] = { operationId: "getEventCatalog", response: ref("EventPage"), parameters: [...catalogParameters, queryMulti("eventTypes"), queryMulti("eventUnits"), queryMulti("bonusCharacterIds", { type: "integer" }), queryMulti("bannerCharacterIds", { type: "integer" }), queryMulti("bonusAttributes")] };
overrides["GET /api/master/:region/catalogs/songs"] = { operationId: "getSongCatalog", response: ref("SongPage"), parameters: [...catalogParameters, query("unit", { type: "string" }), query("category", { type: "string" }), queryMulti("musicTags"), queryMulti("categories")] };
overrides["GET /api/master/:region/catalogs/cards"] = { operationId: "getCardCatalog", response: ref("CardPage"), parameters: [...catalogParameters, query("characterId", { type: "integer" }), query("attribute", { type: "string" }), query("rarity", { type: "string" }), query("unit", { type: "string" }), queryMulti("characterIds", { type: "integer" }), queryMulti("units"), queryMulti("supportUnits"), queryMulti("attributes"), queryMulti("rarities"), queryMulti("supplyTypes"), queryMulti("skillTypes")] };
const collectionCatalogParameters = [
  ...catalogParameters,
  query("category", { type: "string" }), query("rarity", { type: "string" }), query("characterId", { type: "integer" }),
  query("partType", { type: "string" }), query("source", { type: "string" }), query("gender", { type: "string" }),
  queryMulti("gachaTypes"), queryMulti("characterIds", { type: "integer" }), queryMulti("units"), queryMulti("honorTypes"),
  queryMulti("rarities"), queryMulti("materialTypes"), queryMulti("partTypes"), queryMulti("sources"), queryMulti("genders"),
  queryMulti("stampTypes"), queryMulti("comicTypes"), query("groupOnce", { type: "boolean" }), query("usableOnly", { type: "boolean" }), query("relatedOnly", { type: "boolean" })
];
const androidCatalogOverrides = [
  ["gachas", "Gacha", "Gacha"], ["honors", "Honor", "Honor"], ["materials", "Material", "Material"],
  ["costumes", "Costume", "Costume"], ["stamps", "Stamp", "Stamp"], ["comics", "Comic", "Comic"]
] as const;
for (const [pathName, schemaName, operationName] of androidCatalogOverrides) {
  overrides[`GET /api/master/:region/catalogs/${pathName}`] = {
    operationId: `get${operationName}Catalog`, response: ref(`${schemaName}Page`), parameters: collectionCatalogParameters
  };
  overrides[`GET /api/master/:region/catalogs/${pathName}/:itemId`] = {
    operationId: `get${operationName}CatalogItem`, response: ref(`${schemaName}Detail`)
  };
}


export function installOpenApi(app: FastifyInstance) {
  const paths: Record<string, Record<string, unknown>> = {};
  app.addHook("onRoute", (route: any) => {
    if (!route.url.startsWith("/")) return;
    const methods = (Array.isArray(route.method) ? route.method : [route.method]).map((item: string) => item.toLowerCase());
    const path = openApiPath(route.url);
    paths[path] ??= {};
    for (const method of methods) {
      if (method === "head") continue;
      const key = `${method.toUpperCase()} ${route.url}`;
      const override = overrides[key];
      const parameters: Schema[] = [...pathParameters(route.url), ...(override?.parameters ?? [])];
      const isPng = method === "get" && route.url.endsWith(".png");
      const isImage = isPng || (method === "get" && route.url === "/api/assets/resolve");
      const operationId = override?.operationId ?? `${method}_${route.url.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
      paths[path][method] = {
        operationId,
        tags: [override ? "Android" : route.url.startsWith("/api/master") ? "MasterData" : route.url.startsWith("/api/events") ? "Events" : route.url.startsWith("/api/players") ? "Players" : "System"],
        parameters,
        ...(override?.request ? { requestBody: requestBody(override.request) } : {}),
        ...(override?.security ? { security: [{ BearerAuth: [] }] } : {}),
        responses: {
          [String(override?.successStatus ?? 200)]: isImage ? { description: "Resolved image asset", content: { "image/*": { schema: { type: "string", format: "binary" } } } } : jsonResponse(override?.response ?? { type: "object" }),
          "400": { $ref: "#/components/responses/BadRequest" }, "401": { $ref: "#/components/responses/Unauthorized" }, "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" }, "412": { $ref: "#/components/responses/PreconditionFailed" }, "429": { $ref: "#/components/responses/RateLimited" }, "503": { $ref: "#/components/responses/Unavailable" }
        }
      };
    }
  });

  return () => ({
    openapi: "3.1.0",
    info: { title: "pjsktools API", version: "0.3.0", description: "Public API contract used by the pjsktools Android client." },
    servers: [{ url: "/", description: "Current server" }],
    paths,
    components: {
      schemas,
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }
      },
      parameters: {
        IdempotencyKey: { name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 8, maxLength: 128 } },
        IfMatch: { name: "If-Match", in: "header", required: false, schema: { type: "string" } }
      },
      responses: Object.fromEntries([
        ["BadRequest", "Invalid input"], ["Unauthorized", "Authentication required"], ["NotFound", "Resource not found"], ["Conflict", "Resource conflict"],
        ["PreconditionFailed", "Optimistic concurrency check failed"], ["RateLimited", "Rate limit exceeded"], ["Unavailable", "Source unavailable"]
      ].map(([name, description]) => [name, jsonResponse(ref("ApiError"), description)]))
    }
  });
}
