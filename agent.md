# Agent Context

## Project Positioning

This project is a Project Sekai / PJSK player toolbox. Target architecture:

- One backend: centralizes real data access, caching, account/auth, player data, favorites, score records, calculation tools, ranking data, and share-card data.
- Two frontends: web and native Android use the same backend APIs.
- Real data first: music, charts, card skills, events, gachas, honors, ranking borders, player profiles, music meta, vocals, images, and relations must come from real sources. If unavailable, return an explicit unavailable/missing reason instead of fabricated data.

Android now has a buildable multi-module implementation under `android/`, including the first read-only milestone and the second-round complete catalog integration. Continue from this implementation and its current API contracts instead of restoring the obsolete prototype.

## Android App Implementation Plan

### Baseline and non-negotiable decisions

- `android/` is a clean, buildable Kotlin and Jetpack Compose scaffold. `assembleDebug` and `testDebugUnitTest` have passed with the Android Studio JDK 21. Continue from this scaffold; do not restore the removed single-Activity prototype, handwritten `JSONObject` parsing, global cleartext traffic, or direct UI-to-network calls.
- Keep `minSdk 26`, `compileSdk 35`, `targetSdk 35`, Java/Kotlin target 17, and the currently pinned dependency versions until a dedicated upgrade task reviews compatibility.
- The Android app is a native client for this project's backend. It must never call Team-Haruki, Sekai Viewer, Moesekai, game endpoints, asset mirrors, or other upstream sources directly. The backend owns source selection, region isolation, formulas, validation, recommendation logic, diagnostics, and share-card rendering.
- Use Kotlin, Jetpack Compose, Material 3, Hilt, Retrofit/OkHttp, kotlinx.serialization, Room, DataStore, Coil, WorkManager, and Media3. Release builds use HTTPS only; emulator cleartext access to `10.0.2.2` remains debug-only.
- Adopt real Gradle multi-module architecture before feature implementation. Do not use a long-lived single-module package-only transition.
- The first usable milestone is read-only: explicit region onboarding, current event and rankings, songs, cards, public player lookup, settings, and offline cache. Account, favorites, player assets, tools, notifications, and media playback are later phases.
- Supported regions are exactly `jp`, `en`, `tw`, `kr`, and `cn`. First launch must require an explicit region choice. Never infer a region from locale and never fall back to another region's data or assets.

### Module architecture

Create these Gradle modules before implementing milestone features:

- `:app`: `Application`, `Activity`, root navigation, build environment wiring, Hilt composition, and deep-link entry points. It contains no repositories or business logic.
- `:core:common`: result/state primitives, coroutine dispatchers, clock, logging, connectivity abstraction, and shared utilities.
- `:core:model`: Android domain models and repository interfaces used by ViewModels and UI. It has no Retrofit, generated-client, or Room dependency.
- `:core:api`: committed OpenAPI-generated Retrofit services and DTOs under a stable generated package such as `com.pjsktools.api.generated`. Generated files are never edited manually.
- `:core:network`: OkHttp configuration, generated-client construction, request headers, timeouts, retry/error mapping, and API DTO-to-domain mapping.
- `:core:database`: Room database, entities, DAOs, migrations, cache metadata, transactions, and entity-to-domain mapping.
- `:core:datastore`: selected region, onboarding completion, theme, cache preferences, and later lightweight session metadata.
- `:core:designsystem`: Material theme, typography, icons, reusable controls, and standard loading/empty/stale/offline/partial/unavailable/error components.
- `:core:testing`: JSON fixtures, fake repositories, coroutine rules, test dispatchers, clocks, and shared Compose/test helpers.
- `:feature:onboarding`: mandatory first-run region selection.
- `:feature:home`: runtime/source status and current-event summary.
- `:feature:events`: event detail, ranking borders/lists/history, churn, and forecast.
- `:feature:songs`: paginated/searchable song list, detail, assets, difficulty data, and real chart preview.
- `:feature:cards`: paginated/searchable/filterable card list, detail, normal/trained images, and relations.
- `:feature:player`: public UID profile lookup and explicit refresh.
- `:feature:settings`: region, theme, cache diagnostics/cleanup, app version, and API environment information.

Add later feature modules only in their delivery phase: `:feature:account`, `:feature:assets`, `:feature:tools`, `:feature:sharing`, `:feature:content`, `:feature:stories`, `:feature:virtual-live`, `:feature:live2d`, and `:feature:mysekai`.

Module dependency rules are strict:

- Feature modules may depend on core modules but never directly on another feature module.
- `:app` assembles features and navigation but contains no repository, persistence, network, or calculation logic.
- UI and ViewModels consume only domain models and repository interfaces from `:core:model`.
- Generated API DTOs remain inside `:core:api` and `:core:network`; Room entities remain inside `:core:database`.
- DTO-to-domain mapping belongs to `:core:network`; entity-to-domain mapping belongs to `:core:database`.
- Hilt binds repository implementations at data boundaries. Test and preview code replace them through `:core:testing` fakes.

### UI, navigation, and state model

- Top-level destinations are fixed as Home, Events, Catalog, Player, and Settings. Catalog contains Songs and Cards for the first milestone and can add other catalogs without changing the top-level navigation.
- Use Navigation Compose with typed destinations. Each top-level destination preserves its own back stack, selected filters, query, page, and scroll position.
- Phone details open as full destinations. Expanded widths use list-detail panes when useful; do not create a separate tablet product flow.
- Region is required global application state, not an implicit route default. Switching region clears region-specific detail destinations, cancels obsolete requests, and reloads repositories for the new region.
- Use immutable `UiState`, screen-level ViewModels, `StateFlow`, `SavedStateHandle`, and unidirectional events/effects. Compose functions never call Retrofit, DAOs, or generated services directly.
- Every data screen explicitly supports Loading, Content, Empty, Refreshing, Stale, Offline, Partial, Unavailable, and Error. Preserve distinct backend meanings for `missing-data`, `not-released`, `cache-stale`, and `source-unavailable`; never collapse them into a generic failure.
- Respect process death, predictive back, edge-to-edge insets, font scaling, TalkBack order, 48dp touch targets, dark theme, reduced motion, and Chinese/Japanese/Korean/long-English text fitting.

### OpenAPI-first generated client

`apps/api/src/app.ts` remains the route source of truth, but the current route-inventory OpenAPI is not sufficient for Android generation because many successful responses are still generic objects. Phase 0 must complete the contract before Android feature work.

For the first milestone, add concrete OpenAPI request/response schemas for:

- regions, runtime status, source/cache metadata, and asset configuration;
- current event, event detail, ranking borders, ranking lists, ranking history/summary, churn, and forecast;
- song page, song summary, full song detail, song assets/relations, difficulties, and chart response;
- card page, card summary, full card detail, card assets, and relations;
- public player profile and refresh response;
- share-card metadata and PNG response;
- common API error, region enum, source health, unavailable reason, missing fields, asset candidates, and cache timestamps.

Contract rules:

- Milestone endpoints must not expose `object + additionalProperties` or untyped pagination items.
- Paginated endpoints use concrete schemas such as `SongPage`, `CardPage`, and `RankingEntryPage`, while preserving `{ items, page, pageSize, total, totalPages, hasNextPage, hasPreviousPage }` and the maximum page size of 100.
- Every milestone operation has a stable, readable `operationId`, complete path/query/header definitions, documented success and error responses, and deterministic examples.
- Add five-region fixtures and examples for `matched`, `not-released`, `missing-data`, `cache-stale`, and `source-unavailable` where applicable.
- Generate and commit a canonical OpenAPI artifact from the Fastify app. Backend tests validate runtime responses against the schema and CI fails if the checked-in artifact drifts.

Generated client rules:

- Pin the OpenAPI Generator version and configuration.
- Generate Kotlin `jvm-retrofit2` code with coroutines and kotlinx.serialization into `:core:api`.
- Commit generated sources so Android Studio and offline builds do not require code generation.
- Mark generated files as non-editable and keep all custom behavior outside the generated directory.
- CI regenerates the client and runs `git diff --exit-code`; generation must be deterministic across supported development environments.
- Feature modules never import generated DTOs. `:core:network` converts them into stable domain models so generator or schema changes do not leak into UI code.

### Repository, cache, and region isolation

Use a network-bound repository flow for public read-only data:

1. A ViewModel requests a domain repository for the currently selected region.
2. The repository observes Room and emits cached domain data immediately.
3. Missing or stale data triggers a generated-client request unless an equivalent refresh is already active.
4. A successful response replaces the related rows and cache metadata in one Room transaction.
5. Network failure preserves cached content and exposes Offline or Stale with the last successful refresh time.
6. Explicit backend unavailability preserves source diagnostics and exposes Partial or Unavailable; it never substitutes another region.

Cache keys include at least `region`, stable business ID, and dataset/source version when supplied. Region must be present in every region-dependent entity, DAO query, image cache key, repository key, WorkManager unique name, and saved navigation argument.

- Define separate freshness policies for runtime/event data, rankings, song catalog/detail, card catalog/detail, and public player profiles. User refresh bypasses normal freshness checks but still respects backend throttling and in-flight deduplication.
- Coil uses bounded memory/disk cache with region-aware keys and only backend-returned URLs.
- Settings reports public cache size, cache timestamps, and clear-cache actions. Clearing public cache must not clear region/theme/onboarding preferences.
- Low-storage errors degrade to online-only behavior without deleting valid user settings or corrupting Room.
- Later authenticated writes may use an outbox only when the original `Idempotency-Key` and `If-Match` are preserved. This is not part of the read-only milestone.

### Delivery phases and exit gates

#### Phase 0 - Typed API contract and generated client

- Complete milestone OpenAPI schemas, stable operation IDs, deterministic five-region fixtures, and runtime response validation.
- Add the canonical checked-in OpenAPI artifact, pinned generator configuration, generated `:core:api`, and generation-diff CI.
- Exit gate: generated milestone services and DTOs compile independently; milestone responses contain no `Map<String, Any>` or untyped pagination items; backend contract tests pass.

#### Phase 1 - Multi-module foundation

- Split the current scaffold into all listed core and initial feature modules.
- Establish Hilt bindings, root navigation, mandatory region onboarding, Room, DataStore, generated networking, connectivity/error mapping, and the design-system state components.
- Preserve debug/staging/release build types and debug-only `10.0.2.2` cleartext configuration. Staging and release hosts remain placeholders until real HTTPS origins exist.
- Exit gate: all empty feature modules assemble, the app launches offline, selected region survives process death, switching region clears stale navigation state, Room migrations are tested, and `assembleDebug`, unit tests, and lint pass.

#### Phase 2 - Read-only core milestone

- Home: runtime/source status, cache diagnostics, and current-event summary.
- Events: current event, detail, ranking border/list/history/summary, churn, forecast, explicit refresh, and stale/offline states.
- Songs: paginated/searchable list, detail, assets, difficulties, and real chart preview.
- Cards: paginated/searchable/filterable list, detail, normal/trained assets, and relations.
- Player: public UID profile lookup and explicit refresh only; authenticated analysis is later.
- Settings: region, theme, cache size/timestamps/cleanup, app version, build type, and API environment.
- Exit gate: Android matches fixed backend/web fixture values for all five regions, offline restart displays cached content, no cross-region cache leakage occurs, and every explicit unavailable state remains distinguishable.

#### Phase 3 - Account and synchronized personal data

- Add email/QQ session flows, token refresh single-flight, player bindings, favorites, scores, and deck configurations.
- Use Keystore-backed secret storage, idempotency keys, ETags/`If-Match`, conflict UI, logout cleanup, and authenticated pagination.

#### Phase 4 - Player assets and protected offline writes

- Add inventory and other player-data kinds, import/export/review, completeness and validation, local drafts, and device-local screenshot recognition.
- Raw screenshots never leave the device; only user-confirmed structured rows are uploaded.

#### Phase 5 - Calculation tools

- Add event point, score control, deck recommend, deck compare, music recommend, normal event plan, area item recommend, and MySekai tools.
- Android renders backend formula/reference IDs, traces, missing fields, estimated fields, and unavailable reasons; it never ports formulas into Kotlin.

#### Phase 6 - Remaining content and sharing

- Add information, exchanges, missions, remaining catalogs, MySekai catalogs, text/deep-link sharing, and backend-rendered PNG share cards.

#### Phase 7 - Story and Virtual Live media

- Add story catalog/text/voice and Virtual Live schedule/setlist/MC/audio using Media3 with audio focus, lifecycle, headset, and cache handling.

#### Phase 8 - Native chart and Live2D spikes

- Prototype native chart playback and Live2D separately. Promote either only after representative five-region assets, frame time, memory, cancellation, synchronization, and fallback acceptance pass.

#### Phase 9 - Release hardening

- Add baseline profiles, startup/macrobenchmarks, ANR/memory/network profiling, R8/resource shrinking, dependency/secret scanning, accessibility audit, signing backup, privacy/data-safety material, staged rollout, monitoring, and rollback procedures.

### Test and CI requirements

- Backend contract tests validate all milestone responses against OpenAPI, operation ID stability, concrete pagination types, five-region fixtures, and checked-in artifact freshness.
- Generated-client tests verify kotlinx.serialization behavior and deterministic regeneration.
- Android unit tests cover API/domain and entity/domain mapping, repository freshness, in-flight deduplication, region isolation, ViewModel state, error/source-state mapping, and DataStore onboarding restoration.
- Room tests cover migrations, transactional replacement, cache cleanup, region-keyed primary keys, and coexistence of the same stable ID in multiple regions.
- Compose tests cover mandatory region selection, independent top-level back stacks, search/filter/pagination, all standard screen states, dark theme, large fonts, TalkBack labels, phone layouts, and expanded list-detail layouts.
- Integration tests use deterministic JSON fixtures or MockWebServer. Ordinary tests never depend on live upstream providers.
- Build verification includes OpenAPI drift, generated-client diff, `assembleDebug`, `testDebugUnitTest`, Android lint, Room schema verification, API 26, one intermediate API, target API, small phone, expanded width, and at least one low-memory physical device before milestone release.

### Definition of done

An Android feature is complete only when it:

- uses the generated API client through a domain repository boundary;
- keeps generated DTOs, Room entities, Retrofit, and DAOs out of UI code;
- handles all five regions with strict cache and navigation isolation;
- defines loading, refresh, offline, stale, partial, missing, not-released, unavailable, and error behavior where applicable;
- survives rotation and process recreation and restores meaningful query/filter/page/detail state;
- includes risk-appropriate unit, database, integration, and Compose tests;
- supports dark theme, font scaling, TalkBack, small screens, and expanded layouts;
- logs no tokens, verification codes, private player payloads, or imported screenshots; and
- updates affected OpenAPI schemas, fixtures, generated client, Room migrations, feature documentation, and release impact in the same change.

## Android Round 2: Complete Catalog Integration

This section extends the first-milestone architecture above. It does not relax the module, region, generated-client, cache, security, accessibility, or state-model rules already defined.

### Scope and compatibility

- Catalog covers songs, cards, gachas, honors, materials, costumes, stamps, and comics.
- Songs remain owned by `:feature:songs`, cards remain owned by `:feature:cards`, and the six added collections are owned by `:feature:collections`.
- `:app` only composes the seven Catalog tabs; stamps and comics share a nested segmented selector.
- Existing dynamic web routes and their response shapes remain unchanged. Android uses additive typed routes under `/api/master/{region}/catalogs/{type}` and `/api/master/{region}/catalogs/{type}/{id}`.
- Web production components, DOM structure, styling, filters, and detail entry behavior must not be changed for Android integration.

### Contract and generated client

- Every Android catalog list and detail operation has a stable operation ID and a concrete schema. Catalog models expose no `raw`, `additionalProperties`, `Map<String, Any>`, or untyped response body.
- Typed list responses include region, items, pagination flags, master version, source health, source, and an unavailable reason.
- Asset fields contain explicit candidates and availability diagnostics. Preferred URLs are backend-relative `/api/assets/proxy` URLs.
- OpenAPI operations intended for Android carry the `Android` tag. OpenAPI Generator 7.12.0 generates only that tag into `:core:api/generated`.
- Generated models, `AndroidApi`, and required support sources are committed and compiled as part of `:core:api`. Generated code is never edited manually.
- `:core:network` creates the Retrofit service and delegates runtime calls through the generated `AndroidApi`. Compatibility DTO conversion is isolated in `GeneratedApiBridge`; repositories and features do not create Retrofit services.
- The canonical specification remains `apps/api/openapi/openapi.json`. Export and regeneration must be deterministic on Windows and Linux, and CI must fail on specification or generated-source drift.

### Domain and storage

- `:core:model` owns `CatalogKind`, `CatalogQuery`, sealed catalog entries, typed detail data, assets, facets, and `CollectionsRepository`.
- UI code receives domain models only. Generated models, compatibility DTOs, Room entities, internal JSON storage models, and DAOs remain outside feature modules.
- Room schema version 2 adds `catalog_items`, `catalog_facets`, and `catalog_details`, with region/type/id keys and searchable facet indexes.
- Internal detail JSON serializes dedicated storage models, never generated DTOs.
- Songs and cards use full-catalog synchronization rather than caching only pages the user visited.

### Synchronization and isolation

- A catalog sync requests at most 100 records per page and continues until every page is received.
- All pages in one sync must have the same `masterVersion`. A failure or version change retries the complete sync once.
- A successful sync replaces one region/type directory and its facets in a single Room transaction. A failed sync preserves the previous directory.
- One unavailable catalog never clears another catalog. The same stable ID may coexist in all five regions.
- Directory TTL is 24 hours and opened-detail TTL is 7 days. Manual refresh bypasses local freshness checks but still respects backend limits and request coalescing.
- WorkManager refreshes current-region directories daily only with network, battery, and storage constraints satisfied. It does not background-poll rankings.
- Every Room key, metadata key, navigation argument, request, and Coil cache key remains region-scoped. Switching region closes details and prevents old-region content from flashing.

### UI and assets

- Catalog tabs preserve independent search text, filters, page, scroll position, and selected detail.
- Filters are derived from locally cached facets; region-specific values are never hard-coded.
- Phones use full-screen details. Expanded layouts use list-detail presentation without feature-to-feature dependencies.
- Each catalog independently renders loading, refreshing, empty, stale, offline, partial, unavailable, and error states. Missing assets, not-released data, and unavailable sources remain distinguishable.
- Gachas use banner proportions, honors and comics use wide assets, and other collections use square or source-appropriate proportions.
- Android and Coil may contact only the configured backend host. `:core:network` rewrites external candidates through `/api/assets/proxy` and rejects candidates that cannot be safely proxied.
- New Simplified Chinese UI text belongs in Android string resources and must support dark theme, font scaling, TalkBack, narrow screens, and expanded layouts.

### Round 2 acceptance

- Backend tests cover five regions, eight typed lists and details, pagination, filters, empty data, 404, and source-unavailable responses while preserving legacy route behavior.
- Android tests cover generated-model conversion, typed dispatch, facets, full-pagination synchronization, version drift, interrupted replacement, duplicate refreshes, Room migration, region isolation, and detail cleanup.
- Required gates are API build and contract tests, web build, encoding check, deterministic OpenAPI generation, generated-source compilation, `assembleDebug`, root `testDebugUnitTest`, and `lintDebug`.
- The debug APK remains `android/app/build/outputs/apk/debug/app-debug.apk`. Final device acceptance uses the Android Studio emulator against the local backend and demonstrates all catalogs, detail views, region switching, and cached restart behavior.

## Reference Projects

- Team-Haruki
  - Haruki-Sekai-API: player profiles, event rankings, ranking borders, multi-region API behavior.
  - haruki-sekai-*-master: primary master data source.
- Sekai-World/sekai-viewer
  - Reference for music detail, resource URL layering, card/event images, catalog pages, multi-region asset differences, eventCardBonus, EventPointCalc, and user card list UX.
- moe-sekai/Moesekai
  - Reference for real SUS charts, music_meta, chart previews, request/cache design, deck recommend, score-control, prediction, sekai-calculator data model, DFS/GA deck search, MySekai, and future chart player direction.

When data fields, asset paths, chart rendering, calculations, or cross-region differences are unclear, check sekai-viewer and Moesekai first. This project follows the AGPL compliance route for any copied, modified, or derived GPL/AGPL code: preserve upstream notices, record the source revision/path in `THIRD_PARTY_NOTICES.md`, and make corresponding source public before a public deployment. This project is a player assistant, not an entertainment site; ignore Moesekai entertainment pages such as guess-jacket, guess-who, and sticker-maker when planning future features.

Local audit note, 2026-07-10:

- This note is based on directly reading local project files, especially `apps/api/src/normalEventFormula.ts`, `tools.ts`, `mysekaiCalc.ts`, `externalData.ts`, `playerSummary.ts`, `apps/web/src/App.tsx`, `apps/web/src/pages/account.tsx`, `apps/web/src/components/StoryPlaybackPlayer.tsx`, `scripts/check-encoding.mjs`, and `scripts/smoke-api.mjs`.
- Reference projects were successfully cloned on 2026-07-10: `refer/sekai-viewer` from Sekai Viewer `dev` and `refer/Moesekai` from Moesekai `main`. Future parity work should read these local checkouts first before using web/GitHub API.
- PowerShell `Get-Content` can display Chinese source as mojibake in this Windows environment even when the file is valid UTF-8. Use `node` UTF-8 reads and `npm run check:encoding` for source-file encoding judgments, not raw console rendering alone.
Reference-source audit update, 2026-07-10:

- Reference projects were cloned locally and should be used directly for future work:
  - Sekai Viewer: `refer/sekai-viewer`.
  - Moesekai: `refer/Moesekai`.

Five-region implementation constraint, 2026-07-11:

- Every future master-data, formula, player-asset, content API, cache-schema, and source-diagnostic change must be evaluated for all supported regions: `jp`, `en`, `tw`, `kr`, and `cn`.
- JP or CN success is not evidence of five-region completion. Parity and acceptance notes must include a five-region capability matrix or an explicit per-region state such as `matched`, `not-released`, `missing-data`, `cache-stale`, or `source-unavailable`.
- Region master data must never fall back to another region. The only cross-region data allowed is a reference-project-confirmed global constant, currently the Moesekai WL1/WL2/WL3 support bonus tables, and its source metadata must use `scope: "global-reference-constant"`.
- Adding a master field or collection requires updating the cache schema, five-region sync path, source-health classification, offline `verify:regions` checks, and tool `missingFields`/parity semantics in the same change.
- Formula master uses Moesekai `metadata.exmeaning.com/{region}/master` as the authoritative source and Team-Haruki as the same-region fallback. Team-Haruki remains the primary source for base catalogs, songs, events, and assets.
- Large formula reference files are generated at runtime under ignored `apps/api/data/reference-cache/{region}` directories. Do not add five-region bulk JSON files to version control.
- Current rollout state: JP/CN retain legacy exact reference caches for compatibility; EN/TW/KR require their first runtime sync. EN currently returns upstream 404 for some Finale-only collections, which means `not-released`, not a connectivity failure and not `matched`.
- Confirmed Sekai Viewer reference files:
  - Event point UI/reference flow: `refer/sekai-viewer/src/pages/EventPointCalc.tsx`.
  - User card list/import UX: `refer/sekai-viewer/src/pages/user/sekai_profile/SekaiUserCardList.tsx`, `SekaiUserImportMember.tsx`, `refer/sekai-viewer/src/components/widgets/CardThumb.tsx`, `CardImage.tsx`.
  - Virtual Live workflow: `refer/sekai-viewer/src/pages/virtual_live/VirtualLiveDetail.tsx`, `VirtualLiveStep.tsx`, `VirtualLiveStepMC.tsx`, `VirtualLiveStepMCTimeline.tsx`, `VirtualLiveStepMusic.tsx`, `VirtualLiveMCCommon.tsx`.
  - Story/Live2D runtime: `refer/sekai-viewer/src/pages/storyreader-live2d/*`, `refer/sekai-viewer/src/pages/storyreader/*`, `refer/sekai-viewer/src/utils/Live2DPlayer/Live2DPlayer.ts`, `Live2DController.ts`, `PreloadQueue.ts`, `action/*`, `action/special_effect/*`, `layer/*`, and `animation/*`.
- Confirmed Moesekai reference files:
  - Event point and bonus: `refer/Moesekai/refer/re_sekai-calculator/src/event-point/event-calculator.ts`, `card-event-calculator.ts`, `card-bloom-event-calculator.ts`, `event-service.ts`.
  - Deck detail and recommend: `refer/Moesekai/refer/re_sekai-calculator/src/deck-information/deck-calculator.ts`, `refer/Moesekai/refer/re_sekai-calculator/src/deck-recommend/base-deck-recommend.ts`, `find-best-cards-ga.ts`, `event-deck-recommend.ts`, `challenge-live-deck-recommend.ts`, `bloom-support-deck-recommend.ts`, `event-bonus-deck-recommend.ts`, `world-bloom-filter.ts`.
  - Card power/skill: `refer/Moesekai/refer/re_sekai-calculator/src/card-information/card-calculator.ts`, `card-power-calculator.ts`, `card-skill-calculator.ts`, `card-detail-map*.ts`.
  - Area item recommend: `refer/Moesekai/refer/re_sekai-calculator/src/area-item-information/area-item-service.ts`, `refer/Moesekai/refer/re_sekai-calculator/src/area-item-recommend/area-item-recommend.ts`, `refer/Moesekai/refer/re_sekai-calculator/src/deck-information/deck-calculator.ts`.
  - MySekai: `refer/Moesekai/refer/re_sekai-calculator/src/mysekai-information/mysekai-service.ts`, `mysekai-event-calculator.ts`, `refer/Moesekai/refer/re_sekai-calculator/src/deck-recommend/mysekai-deck-recommend.ts`.
  - User data: `refer/Moesekai/refer/re_sekai-calculator/src/user-data/user-card.ts`, `user-area.ts`, `user-character.ts`, `user-honor.ts`, `user-profile-honor.ts`, `user-challenge-live-solo-deck.ts`, `user-world-bloom-support-deck.ts`, `user-mysekai-canvas.ts`, `user-mysekai-gate.ts`, `user-mysekai-fixture-game-character-performance-bonus.ts`.
  - Account/profile UX: `refer/Moesekai/web/src/components/QuickBindForm.tsx`, `AccountSelector.tsx`, `AccountSelectorBar.tsx`, `refer/Moesekai/web/src/app/profile/*`, `refer/Moesekai/web/src/components/profile/*`.

Reference gap index for future implementation:

- Formula status: World Bloom/WL support recommendation and summation behavior is parity-locked; real-fixture validation remains incomplete.
  - Reference files: `event-point/event-calculator.ts` (`getSupportDeckBonus`, `getWorldBloomSupportDeckCount`), `event-point/card-bloom-event-calculator.ts` (`getCardSupportDeckBonus`), `deck-recommend/bloom-support-deck-recommend.ts`, `deck-information/deck-calculator.ts`.
  - Local files to change: `apps/api/src/normalEventFormula.ts`, `apps/api/src/calcData.ts`, `apps/api/src/tools.ts`, `apps/api/src/playerSummary.ts` for validation/tool-context.
  - Current local status: `apps/api/src/calcData.ts` now builds `supportDeckBreakdown` with `referenceFormulaId: Moesekai.EventCalculator.getSupportDeckBonus` and `referencePreprocessId: Moesekai.CardBloomEventCalculator.getCardSupportDeckBonus`; it excludes current main-deck card IDs, applies support count 12/20/25 from turn, reads `worldBloomSupportDeckBonuses` / `worldBloomSupportDeckBonusesWL1/2/3`, and traces character type, Master Rank, skill level, unit-event-limited bonus, officialFieldsUsed, estimatedFieldsUsed, and missingFields. Uploaded `world-bloom-support` is still preferred, but missing uploaded support decks now fall back to a Moesekai `BloomSupportDeckRecommend` style inventory recommendation when eventId and gameCharacterId/specialCharacterId are supplied. `supportDeckBreakdown.supportDeckSource` distinguishes `uploaded`, `recommended-from-inventory`, and `unavailable`.
  - Moesekai data fallback now matches `refer/Moesekai/web/src/lib/deck-recommend/data-provider.ts`: if Team-Haruki/local cache has empty `worldBloomSupportDeckBonusesWL1/2/3`, `apps/api/src/masterData.ts` reads `refer/Moesekai/web/public/data/worldBloomSupportDeckBonusesWL1/2/3.json` and marks the collection source as `reference-local` / `moesekai-local-reference`. This is a real reference-data fallback, not synthetic bonus data.
  - Current unit resolution: newly synced cards preserve raw `characterId` and `gameCharacters.unit`; `CardService.getCardUnits` adds non-`none` supportUnit plus the raw character unit. Character-name mapping remains only as a legacy-cache fallback. The uploaded support-deck path still needs a real non-empty `userWorldBloomSupportDecks` UID sample.
- Formula status: event deck bonus / WL Finale / leader honor algorithm behavior is implemented and parity-locked, but real master/UID fixtures can still produce `missing-data`.
  - Reference files: `event-point/event-calculator.ts` (`getDeckBonus`), `event-point/card-event-calculator.ts`, `deck-information/deck-calculator.ts`, master files `event-card-bonus-limit.ts`, `event-honor-bonus.ts`, `world-bloom-different-attribute-bonus.ts`.
  - Local files to change: `apps/api/src/normalEventFormula.ts`, `apps/api/src/calcData.ts`.
  - Current local behavior: EventConfig reads `worldBlooms`, `eventCardBonusLimits`, raw `gameCharacters`, `eventHonorBonuses`, and `worldBloomDifferentAttributeBonuses`; card bonus limits are dynamic, Leader bonus applies only to the first DeckCalculator card, owned honor matching uses uploaded `honors`, different-attribute bonus matches unique attr count, and WL3 applies the 336000 power cap. `profile-honors` does not replace the full owned honor list.
  - Remaining validation: offline-normalized caches currently contain empty `worldBlooms`, `eventCardBonusLimits`, and raw `gameCharacters` collections. A successful master refresh plus real active-event UID comparison is required before those cases can report `matched`.
- Formula status: Challenge Live aggregate high-score recommend is implemented at the Moesekai path level.
  - Reference files: `deck-recommend/challenge-live-deck-recommend.ts`, `deck-recommend/base-deck-recommend.ts`, `deck-recommend/find-best-cards-ga.ts`, `deck-information/deck-calculator.ts`, `live-score/live-calculator.ts`.
  - Local files to change: `apps/api/src/tools.ts`, `apps/api/src/calcData.ts`, `apps/api/src/normalEventFormula.ts`.
  - Current behavior: character filter, `member = min(5, candidateCount)`, same-character cards, GA-first search with DFS fallback, DeckCalculator leader/skill ordering, and aggregate `LiveCalculator.getLiveScoreByDeck(..., CHALLENGE)` fitness. Real UID same-input comparison remains required; per-note `LiveExactCalculator` is outside this round.
- Formula status: event-point score input now uses Moesekai music meta and DeckCalculator/LiveCalculator when inventory is supplied.
  - Reference files: `event-point/event-calculator.ts` (`getEventPoint`, `getDeckEventPoint`), `music-recommend/music-recommend.ts`, `common/music-meta.ts`, `live-score/live-calculator.ts`.
  - Local files to change: `apps/api/src/normalEventFormula.ts`, `apps/api/src/tools.ts`, `apps/api/src/masterData.ts` or a music-meta provider if added.
  - Current behavior: per-difficulty rows come from `https://moe.exmeaning.com/data/music_meta/music_metas.json`, cached under `apps/api/data/music-meta`; missing rows return `missing-data`. Full player-sample proof remains pending.
- Formula status: multiplayer Live and Deck Comparator backend match the Moesekai reference workflow when all inputs are complete.
  - Reference files: `refer/Moesekai/web/src/lib/deck-comparator/calculator.ts`, `refer/Moesekai/refer/re_sekai-calculator/src/live-score/live-calculator.ts`, `refer/Moesekai/refer/re_sekai-calculator/src/live-score/live-exact-calculator.ts`, and `event-point/event-calculator.ts`.
  - `multi-live-v1-reference` supports five independent player power/effectiveness rows, Skill 1-5 expected/best/worst strategies, Skill 6 team-average/highest-power modes, Fever, active bonus, per-player scores, actual otherScore, and event PT.
  - `live-exact-v1-reference` supports explicit exact mode for score-control and Deck Comparator. It reads same-region `music_score` SUS charts, parses notes/skill markers/fever markers, consumes same-region `ingameNotes` and `ingameCombos`, and returns per-note score details, effect windows, fever window, active bonus, `musicScoreTrace`, and `referenceParity.liveExactCalculator`.
  - Public/authenticated `POST /api/tools/deck-compare` and `POST /api/me/tools/deck-compare` compare 2-5 manual, inventory-backed, or saved deck-config candidates. Saved decks resolve through the selected binding and shared CardCalculator/DeckCalculator.
  - Event point, score control, music recommend, and normal event plan accept teammate settings. Music recommend evaluates every eligible song through the shared multiplayer/event-point core before sorting. Missing teammates use an explicit 200000/200 assumption and remain estimated. Exact mode is opt-in for specified songs/decks and does not replace aggregate full-list recommendation sorting.
- Formula status: exact reference CardPower/CardSkill data is consumed when complete player/master rows exist.
  - Reference files: `card-information/card-calculator.ts`, `card-power-calculator.ts`, `card-skill-calculator.ts`, `card-detail-map-power.ts`, `card-detail-map-skill.ts`, `deck-information/deck-calculator.ts`.
  - Local files to change: `apps/api/src/normalEventFormula.ts`, `apps/api/src/mysekaiCalc.ts`, `apps/api/src/calcData.ts`.
  - Current behavior: independent reference cache uses Moesekai's `metadata.exmeaning.com/{region}/master`; card level parameters, special-training vector, read episodes, cumulative Master Lessons, canvas, area-item `Math.fround`, character Rank, fixture, gate, pre/post skill rows, reference/limit traces, and aggregate LiveCalculator are wired. Incomplete data stays `missing-data`.
- Formula status: area-item recommendation is reference-aligned for exact power gain and authoritative upgrade costs available in each region.
  - Reference files: `area-item-information/area-item-service.ts`, `area-item-recommend/area-item-recommend.ts`, and `deck-information/deck-calculator.ts`.
  - Current behavior: `area-item-v1-reference` builds current area-item levels from player assets, upgrades one candidate by one level, and rebuilds the same target deck through the shared CardCalculator/DeckCalculator. It returns exact power before/after/gain, affected cards, three-dimensional area bonus traces, authoritative shop costs, player shortages, affordability, and power-per-coin sorting. JSON text matching and `priorityScore` final ranking are removed.
  - Five-region data: `areas`, `areaItems`, `areaItemLevels`, and `shopItems` are synchronized and diagnosed independently for `jp/en/tw/kr/cn`. Explicit shop relations are preferred; the Moesekai ShopItem ID rule is limited to its covered levels. Missing level 16-20 cost relations remain `missing-data` while exact power gain may still be reported. Current offline capability is matched in all five regions; TW is using a valid but stale cache and remains visibly `cache-stale`.
- MySekai status: exact CardCalculator-backed recommendation is implemented and parity-locked for the available reference fixtures.
  - Reference files: `mysekai-information/mysekai-event-calculator.ts`, `deck-recommend/mysekai-deck-recommend.ts`, `deck-recommend/base-deck-recommend.ts`, `deck-recommend/find-best-cards-ga.ts`, `deck-information/deck-calculator.ts`, `mysekai-information/mysekai-service.ts`.
  - Local files to change: `apps/api/src/mysekaiCalc.ts`, shared deck/card detail modules if introduced, `apps/web/src/App.tsx` MySekai UI.
  - Current local behavior: `mysekai-v5-reference` uses the shared exact CardCalculator and DeckCalculator path for GA/beam fitness, preserves the uploaded training state, resolves canvas by `cardId`, gates by `mysekaiGateId + mysekaiGateLevel`, fixtures by `gameCharacterId + totalBonusRate`, and applies WL Finale fixture and skill limits from event master. Replacement and asset-gap recommendations recompute deck power and MySekai PT instead of using fixed priority scores. Incomplete cards are excluded as `missing-data` rather than scored by rarity/level approximations.
  - Remaining validation: the local Moesekai clone does not publish `mock-user-data.json`; same-input adapter comparison therefore still depends on real UID exports. Both current CN UID acceptance samples pass the local v5 path without missing or estimated fields.
- Player asset UX status: visual inventory and screenshot import now follow the reference workflows.
  - Reference files: Sekai Viewer `SekaiUserImportMember.tsx` for screenshot crop/hash/OCR/card-selection review, `SekaiUserCardList.tsx` for thumbnail list/filter/sort/event bonus popover, `CardThumb.tsx`, `CardImage.tsx`; Moesekai `QuickBindForm.tsx`, `AccountSelector.tsx`, `AccountSelectorBar.tsx`, `components/profile/*`.
  - Implemented: five-region card thumbnail catalog, owned/unowned filters, fuzzy ID/name/character search, character/attribute/rarity/unit filters, level/power/MR/event/id sorting, card edit modal, batch edits, explicit delete confirmation, local screenshot grid segmentation, DCT perceptual hash matching, optional local Tesseract OCR, manual ambiguity review, and added/updated/unchanged/overwrite/unresolved import diff.
  - Screenshot privacy: screenshots, crops, hashes, and OCR text stay in the browser. Only user-confirmed structured card rows enter import review. The old Sekai Viewer `chara_hash.json` URL currently returns 404, so the browser builds and caches fingerprints from the selected region's own card thumbnails through the read-only asset proxy; no JP card asset fallback is used for other regions.
  - Remaining UX gap: Moesekai-style profile charts and power-bonus detail panels are not part of this round. Final browser screenshot acceptance now passes: desktop at 1265px and mobile at 375px have no page-level horizontal overflow; mobile inventory renders two columns, screenshot controls stack to one column, and the 359px edit dialog fits inside the viewport. Acceptance captures are stored in `artifacts/assets-desktop-acceptance.png`, `artifacts/assets-mobile-acceptance.png`, and `artifacts/assets-mobile-edit-modal-acceptance.png`.
- Story/Live2D status: the local runtime now follows the Sekai Viewer Player/Controller/Action/Layer/Preload structure.
  - Reference files: `refer/sekai-viewer/src/utils/Live2DPlayer/Live2DController.ts`, `Live2DPlayer.ts`, `PreloadQueue.ts`, `action/index.ts`, `action/character_layout.ts`, `action/character_motion.ts`, `action/action_layout_mode.ts`, `action/sound.ts`, `action/talk.ts`, `action/special_effect/*`, `layer/*`, `animation/*`, `pages/storyreader-live2d/*`.
  - Local files to change: `apps/api/src/externalData.ts`, `apps/web/src/components/StoryPlaybackPlayer.tsx`, `apps/web/src/components/Live2dPlayer.tsx`, `apps/web/src/App.tsx`.
  - Implemented: real Pixi 7/mulmotion model stage, shared model preview runtime, six-model queue reuse, motion/expression concurrency, voice mouth movement, preload phases, ActionLayoutMode, layered effects, Howler audio, cancellation, playback controls, and explicit resource diagnostics. No stand-in model is rendered.
  - Cubism Core is loaded from Sekai Viewer's public deployed runtime at `https://sekai.best/live2ddependencies/live2dcubismcore@20250717.min.js`; it is not copied into this repository. Network/runtime failure degrades explicitly. Remaining proof is broader five-region real-scenario coverage for rare movie/shader/scenario-effect resources.
- Virtual Live gap: reference-scope workflow is close, but diagnostics and mapping can deepen.
  - Reference files: `refer/sekai-viewer/src/pages/virtual_live/VirtualLiveDetail.tsx`, `VirtualLiveStep.tsx`, `VirtualLiveStepMC.tsx`, `VirtualLiveStepMCTimeline.tsx`, `VirtualLiveStepMusic.tsx`, `VirtualLiveMCCommon.tsx`.
  - Local files to change: `apps/api/src/externalData.ts`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`.
  - Specific missing pieces: richer character/costume name mapping, MC event filters, setlist search, audio preload status, source outage diagnostics, and verified sample IDs across live types.
## Current Structure

- apps/api: Fastify + TypeScript backend.
- apps/web: React + Vite + TypeScript web frontend.
- android: clean Kotlin + Jetpack Compose production scaffold; feature implementation has not started.
- apps/api/data/master-cache: region master cache.
- apps/api/src/db/migrations: PostgreSQL manual migrations.
- agent.md: authoritative Android implementation plan and API mapping.

## Backend Capabilities

Base/runtime APIs:

- GET /health
- GET /api/regions
- GET /api/runtime/status
- GET /api/assets/:region/config

Master/detail APIs:

- GET /api/master/:region/songs
- GET /api/master/:region/music/:musicId
- GET /api/master/:region/music/:musicId/full
- GET /api/master/:region/music/:musicId/charts/:difficulty
- GET /api/master/:region/cards
- GET /api/master/:region/cards/:cardId
- GET /api/master/:region/cards/:cardId/full
- GET /api/master/:region/events/:eventId/full
- GET /api/master/:region/events/:eventId/bonus-config
- GET /api/master/:region/:collection
- GET /api/master/:region/:collection/:id/full
- GET /api/master/:region/information
- GET /api/master/:region/live2d/models
- GET /api/master/:region/mysekai/context
- GET /api/master/:region/exchanges/context
- GET /api/master/:region/missions/context
- GET /api/master/:region/virtual-lives/context
- GET /api/master/:region/virtual-lives/:virtualLiveId/steps/:stepIndex
- GET /api/master/:region/stories/context
- GET /api/master/:region/stories/:storyType/:storyId/full

Master collections currently exposed or planned for calculations:

- gachas, honors, honorGroups, materials, costumes, stamps, comics
- eventMusics, musicVocals
- eventDeckBonuses, eventRarityBonusRates, gameCharacterUnits
- cardRarities, cardEpisodes, masterLessons, areaItemLevels
- External/stable-source collections: announcements, exchanges, shopItems, missions, virtualLives, live2d, mysekai

Content UX status:

- Web content pages now present stable-source data as player-assistant workflows instead of generic JSON cards.
- Announcements use a timeline with category, availability time, banner, source, and detail links when the upstream provides them.
- Exchanges flatten `materialExchangeSummaries[].materialExchanges`, resolve rewards through material-exchange resource boxes, and resolve costs through the current region's material masters. JP/EN embed resource-box details; TW/KR/CN use the same-region `resourceBoxDetails` collection.
- Missions use region-isolated `normalMissions`, `beginnerMissions`, `characterMissionV2s` + `characterMissionV2ParameterGroups`, and `honorMissions`. Character V2 stages are resolved by `parameterGroupId`; fixed mission rewards reuse the exchange resource lookup and icon rules.
- Virtual Live uses separate groups for live records, schedules, setlists, and rewards.
- Stories now load `/stories/context` automatically, show story groups/lists, and open `/stories/:storyType/:storyId/full` from list selections. Story full responses expose chapters, relation hints, resourceCandidates, sourceHealth, warnings, and unavailableReason. This is still a resource workflow, not a full story or live演出播放器.
- Backend content-context endpoints add compatible displayGroups, previewItems, sourceHealth, warnings, unavailableGroups, relationHints, and resourceCandidates fields while preserving old groups/files/summary/sourceMetadata fields.
- No Supabase migration was needed for this Content UX round.

## Data Source Layers

- Team-Haruki master remains the core source for music, cards, skills, events, event cards, gachas, honors, materials, vocals, event music, and calculation master tables.
- Metadata mirrors are used for reference-project-style collections that are not reliably present in Team-Haruki master: metadata.exmeaning.com is primary and metadata.pjsk.moe is fallback.
- Information API is used for announcements: baijing.exmeaning.com/{jp|cn}/information. Other regions return an explicit unavailable reason until a real source is confirmed.
- Sekai Viewer asset domains are used for comics and Live2D: sekai-comics and sekai-live2d-assets/live2d/model_list.json.
- MySekai master/context uses metadata mirrors; MySekai asset candidates use mysekai/... paths under the region asset directory.
- raw.githubusercontent.com can be unstable in this environment. Prefer metadata mirrors, GitHub API, or Git Bash for verification.
- Real UID validation source, 2026-07-10:
  - CN UID `7485929717040896807` is a working public Suite sample. Moesekai-style Suite Public API `https://suite-api.haruki.seiunx.com/public/cn/suite/{uid}` returns player `秋风凉叶`, rank 522, upload_time 1783652105, and real user-data groups.
  - Team-Haruki toolbox profile route `https://toolbox-api-direct.haruki.seiunx.com/event-tracker/api/v2/web/players/cn/{uid}/profile` currently returns 404 for this UID/region and is diagnostic only, not a blocker for Suite-based asset validation.
  - The local real-UID smoke command is `npm run verify:real-uid`. It forces MemoryStore, uses fast master refresh, creates a temporary account/binding, imports normalized Suite assets, runs authenticated deck/event-point/normal-plan/music/area/MySekai tools, prints a JSON summary, and deletes the temporary account. It must not write Supabase rows.
  - Suite import references Moesekai `refer/Moesekai/web/src/lib/deck-recommend/data-provider.ts` `USER_DATA_KEYS`: userCards, userBonds, userDecks, userGamedata, userMusics, userMusicResults, userMysekaiMaterials, userAreas, userChallengeLiveSoloDecks, userCharacters, userCharacterMissionV2Statuses, userMysekaiCanvases, userCharacterMissionV2s, userMysekaiFixtureGameCharacterPerformanceBonuses, userMysekaiGates, userWorldBloomSupportDecks, userHonors, userMysekaiCharacterTalks, userChallengeLiveSoloResults, userChallengeLiveSoloStages, userChallengeLiveSoloHighScoreRewards, userEvents, userWorldBlooms, userMusicAchievements, userPlayerFrames, userMaterials, upload_time.
  - Local Suite normalization maps userCards to inventory cards; userAreas to area-items; userCharacters to character-ranks; music result/achievement/music rows to music-results; userMaterials and userMysekaiMaterials to materials; userDecks to decks; challenge-live solo deck/result/stage/reward rows to challenge-live; userWorldBloomSupportDecks to world-bloom-support; userHonors/userBonds to honors/profile-honors; userMysekaiCanvases/gates/fixture performance bonuses to MySekai assets. Unmapped Suite groups are preserved in normalizedPreview.unmapped instead of being discarded.
  - Current real sample counts for UID `7485929717040896807` include userCards 692, userDecks 5, userCharacters 26, userAreas 26, userMusicResults 2918, userMusicAchievements 10747, userChallengeLiveSoloDecks 26, userChallengeLiveSoloResults 26, userChallengeLiveSoloStages 238, userChallengeLiveSoloHighScoreRewards 940, userHonors 510, userBonds 187, userMysekaiCanvases 98, userMysekaiGates 5, userMysekaiFixtureGameCharacterPerformanceBonuses 8, userWorldBloomSupportDecks 0, and userMaterials 121. UID `7485933994513767206` is a second CN Suite sample with userCards 667, userDecks 6, userWorldBloomSupportDecks 0, Challenge ready, and MySekai ready.
  - Remaining real-UID gaps to track: compare normalized assets against Moesekai SnowyDataProvider output for the same UID; find an additional UID or event sample with non-empty userWorldBloomSupportDecks to validate uploaded support decks; verify honor/profile-honor ownership in World Bloom/WL against a real active event; and keep Team-Haruki CN toolbox 404 as sourceDiagnostics rather than a failing condition.

Ranking/player APIs:

- GET /api/events/:region
- GET /api/events/:region/current
- GET /api/events/:region/:eventId/ranking-top100
- GET /api/events/:region/:eventId/ranking-border
- GET /api/events/:region/:eventId/ranking-history
- GET /api/events/:region/:eventId/ranking-history/summary
- GET /api/events/:region/:eventId/ranking-player/:rank
- GET /api/events/:region/:eventId/ranking-forecast
- GET /api/players/:region/:userId/profile

Tool APIs:

- GET /api/tools/deck-recommend/schema
- GET /api/tools/calculation-schema
- GET /api/master/:region/events/:eventId/calculation-context
- POST /api/tools/score-control
- POST /api/tools/event-point-calc
- POST /api/me/tools/event-point-calc
- POST /api/tools/deck-recommend
- POST /api/me/tools/deck-recommend
- POST /api/tools/music-recommend
- POST /api/me/tools/music-recommend
- POST /api/tools/area-item-recommend
- POST /api/me/tools/area-item-recommend
- POST /api/tools/normal-event-plan
- POST /api/me/tools/normal-event-plan
- POST /api/tools/mysekai-calc
- POST /api/me/tools/mysekai-calc

Calculation status:

- calcData provider normalizes real master data into deck/score-control models.
- event-point-calc is the shared event point estimate core used by score-control and music recommend. It returns multipliers, run estimates, field sources, formulaSources, estimatedFieldsUsed, missingFields, warnings, and realDataRequired.
- Normal-event tools now share `normal-event-v4.1-reference` formula context. Deck recommend, event-point-calc, score-control, music-recommend, area-item-recommend, and normal-event-plan expose sharedFormulaVersion, formulaContext, assetReadiness, referenceParity, and formula field status where relevant.
- Reference-level formula update: normal-event tools now use a CardDetailMap-backed deck detail layer. The v4 reference layer records concrete reference paths, referenceParity.status, modeSpecificBreakdown, calculationTrace, cardContributionBreakdown, cardParameterTrace, skillEffectTrace, skillFormulaTrace, limitTrace, eventPointBreakdown.referenceFormulaId, eventPointBreakdown.exactness, cardDetailTrace, cardDetailMapTrace, deckDetailTrace, deckCalculatorTrace, wl3PowerCapTrace, and formulaVersion. Tool internals consume DeckCalculator-style deck detail instead of only reporting trace fields.
- Formula v4 reference now loads card/deck/event master collections including eventHonorBonuses, eventCardBonusLimits, worldBlooms, raw gameCharacters, and worldBloomDifferentAttributeBonuses. The CardDetailMap/DeckCalculator layer applies owned-honor Leader bonus, unique-attribute bonus, dynamic card bonus limits, support bonus, and the WL3 336000 power cap. Missing collections or uploaded honors remain `missing-data`.
- Moesekai parity harness exists as `npm run parity:moesekai`. It builds the API, then runs `scripts/parity-moesekai.mjs` against local Moesekai reference paths. Implementation mismatches fail the command; missing public fixture/user data is reported as `master-missing` or `user-data-missing` rather than counted as matched.
- The parity harness locks Moesekai event-point cases, DeckCalculator invariants, aggregate LiveCalculator solo/challenge/multi/auto cases, raw CardService unit resolution, owned `eventHonorBonuses` matching, Leader-only application, dynamic card bonus count limits, and different-attribute bonus. Current result is 36 matched and one `user-data-missing` fixture case.
- Formula reference paths reviewed this round:
  - Moesekai `refer/re_sekai-calculator/src/card-information/card-power-calculator.ts`: card power is built from power1/power2/power3, then special training, card episodes, master lessons, MySekai canvas, area item rates, character Rank rates, fixture bonus, and gate bonus.
  - Moesekai `refer/re_sekai-calculator/src/card-information/card-skill-calculator.ts`: skill score separates score_up, life_recovery, judge support, character-rank score-up, same-unit, different-unit, and reference/limit behaviors.
  - Moesekai `refer/re_sekai-calculator/src/event-point/card-event-calculator.ts`: event bonus separates fixed deck bonus, specific card bonus, leader bonus, event rarity/Master Rank bonus, and WL Finale leader/honor concerns.
  - Moesekai `refer/re_sekai-calculator/src/event-point/event-calculator.ts`: event point has live-type branches for solo, multi, cheerful, and challenge; World Bloom support deck and WL card-bonus limits are separate concerns.
  - Moesekai `refer/re_sekai-calculator/src/deck-recommend/event-deck-recommend.ts`, `challenge-live-deck-recommend.ts`, `bloom-support-deck-recommend.ts`, `music-recommend/music-recommend.ts`, and `area-item-recommend/area-item-recommend.ts`: recommendation is organized around shared deck/detail calculators, not separate ad hoc formulas.
- Authenticated event-point-calc can derive eventBonusPercent from the selected binding inventory and uploaded player assets when eventId is provided.
- deck recommend supports uploaded inventory, fixed cards, fixed characters, fixed leader, target modes, live type, formula modes, DFS search, candidate pruning, event bonus config, per-card contribution, total bonus, estimated power, official fields used, estimated fields used, missing fields, and formula sources.
- deck recommend now exposes per-card powerBreakdown for level, special training, Master Rank, skill level, episode-read, area item, and character Rank contribution.
- deck recommend also exposes cardContributionBreakdown for base power, event bonus layers, skill score, contribution score, and field sources.
- Supported formula modes are normal, challenge, world_bloom, wl, and wl3. Challenge/World Bloom/WL modes must report missing uploaded assets or unverifiable formula pieces instead of claiming exact output.
- score-control supports user input and shared event-point estimates by music/difficulty/live type/event bonus. It consumes normal-event-v4.1-reference eventPointBreakdown and must surface exactness/missing fields instead of maintaining a separate hidden estimate.
- ranking top100 and border refreshes persist real samples into ranking_history_samples when PostgreSQL is configured. MemoryStore keeps the same API as a development fallback only.
- ranking history APIs expose persisted samples and per-rank summaries for border and Top100 lines, with sample count, latest score, sample span, speed, and predictability.
- ranking history APIs now also expose sourceHealth, sampleSource, confidenceReason, warnings, and retentionRecommendation. Raw ranking_history_samples are preserved; no automatic deletion or synthetic samples are introduced.
- ranking forecast prefers persisted PostgreSQL/Supabase history and falls back to runtime-cache only when no persisted samples exist. It supports an optional windowHours query and remains experimental.
- ranking forecast returns all/1h/3h/6h windows, windowSummaries, sample source, sample counts, sample span, hourly speed, confidence, confidenceReason, sourceHealth, warnings, and unavailable reasons.
- The web forecast page is a separate planning workspace with window switching, persistent-sample summary cards, real-sample SVG trend lines, forecast cards, and a score-control target planner. Logged-in users can estimate pt/run from authenticated event-point-calc; manual pt/run remains available without login.
- music recommend ranks real music/difficulty candidates by estimated event points per minute and reports the event point formula as estimated.
- music recommend calls the shared event-point estimate for candidates instead of maintaining a separate formula.
- Authenticated music recommend uses uploaded music-results for preferred difficulty defaults and can reuse derived binding event bonus when eventId is provided.
- area item recommend uses `area-item-v1-reference`: every next-level candidate rebuilds the selected deck through the shared exact CardCalculator/DeckCalculator and is ranked by exact power gain, coin efficiency, or current affordability.
- Upgrade costs resolve from same-region `shopItems` relations or the reference-covered ShopItem ID rule. Responses include resource costs, owned amounts, shortages, affordability, affected cards, area-level/shop traces, and explicit missing-cost diagnostics; player material ownership is never assumed.
- Authenticated area item recommend uses uploaded area-items, materials, inventory, and the selected/saved target deck. Public requests can provide `cardIds`, current items, materials, sorting mode, and unaffordable-item inclusion explicitly. Normal-event-plan and profile analysis consume this same service.
- normal-event-plan is a workflow aggregator for normal-event-v4.1-reference. It orchestrates deck-recommend, event-point-calc, score-control, music-recommend, and area-item-recommend into one response with deck, eventPoint, scoreControl, music, area, sections, derivedEventBonusPercent, assetReadiness, missingFields, warnings, formulaSources, and sharedFormulaVersion.
- Authenticated normal-event-plan reads the selected binding inventory and uploaded area-items, character-ranks, music-results, materials, and related player assets. It does not replace the underlying formulas; unconfirmed pieces remain estimated or missing.
- MySekai calc v5-reference uses the shared exact CardCalculator for cardParameters, training, individual episodes, cumulative Master Lessons, canvas, area items with `Math.fround`, character Rank, fixtures, gates, and pre/post skill maps. DeckCalculator-backed power drives seeded GA fitness and MysekaiEventCalculator PT; Beam remains a compatibility fallback. Event context resolves WL Finale fixture/skill limits, and all replacement/asset-gap gains are recalculated through the same card/deck/event chain. Responses include `cardCalculatorTrace`, `mysekaiServiceTrace`, `eventConfigTrace`, `fixtureLimitTrace`, `skillLimitTrace`, `deckCalculatorTrace`, `marginalGainTrace`, and the existing search/recommendation fields.
- MySekai reference paths reviewed this round:
  - Moesekai `refer/re_sekai-calculator/src/mysekai-information/mysekai-service.ts`: user canvas is treated as a card-id set; gates resolve user gate level through mysekaiGates/mysekaiGateLevels to unit powerBonusRate; fixture bonuses are user-data driven.
  - Moesekai `refer/re_sekai-calculator/src/mysekai-information/mysekai-event-calculator.ts`: MySekai event point derives from deck power and event/support bonus with a power/450000 step.
  - Moesekai `refer/re_sekai-calculator/src/deck-recommend/mysekai-deck-recommend.ts`, `deck-recommend/base-deck-recommend.ts`, `deck-recommend/find-best-cards-ga.ts`, and `user-data/user-mysekai-*`: MySekai assistant is driven by uploaded canvas/gates/fixture assets and defaults to seeded GA. The local v5 path now uses exact shared CardDetail/DeckDetail fitness and keeps incomplete inputs as `missing-data`.
- v4.1-reference/v5-reference reference paths reviewed this round:
  - Moesekai `refer/re_sekai-calculator/src/card-information/card-skill-calculator.ts`: fillSkill combines fixed score, same-unit, reference-rate/max, different-unit, life recovery, and scoreUpLimit.
  - Moesekai `refer/re_sekai-calculator/src/deck-recommend/challenge-live-deck-recommend.ts`: challenge recommendation filters user cards by characterId, then runs high-score deck search using Challenge live type.
  - Moesekai `refer/re_sekai-calculator/src/deck-recommend/bloom-support-deck-recommend.ts` and `event-point/event-calculator.ts`: Bloom support recommendation uses main deck plus all card details through support deck bonus logic.
  - Moesekai `refer/re_sekai-calculator/src/mysekai-information/mysekai-event-calculator.ts`: MySekai event point uses deck power, event bonus plus support bonus, a power/450000 step, and internal point for optimization.
  - Moesekai `refer/re_sekai-calculator/src/deck-recommend/find-best-cards-ga.ts`: default GA config is seed -1, maxIter 1000, maxIterNoImprove 10, popSize 8000, parentSize 800, eliteSize 10, crossoverRate 1.0, baseMutationRate 0.1, noImproveIterToMutationRate 0.02, timeoutMs 15000, target score.
- Local v4 reference formula audit, 2026-07-10:
  - Event point has shared solo/multi/cheerful/challenge branches in `normalEventFormula.ts`. Challenge ignores normal multipliers and reports diagnostics. Cheerful life-rate follows Moesekai `1.15 + clamp(life / 5000, 0.1, 0.2)`. Non-challenge exactness still depends on whether real music/event-rate and score inputs are available.
  - World Bloom/WL support-deck summation now follows the Moesekai `EventCalculator.getSupportDeckBonus` shape: prepared support bonus per card, current main deck exclusion, descending support bonus order, and first 12/20/25 cards by turn. Missing uploaded support decks are now handled by the Moesekai `BloomSupportDeckRecommend` path: derive `worldBloomSupportUnit` from the target character, prepare each inventory card's support bonus, exclude the main deck, and return `supportDeckSource: "recommended-from-inventory"`. The unresolved part is full raw `CardBloomEventCalculator.getCardSupportDeckBonus` / `CardCalculator.batchGetCardDetail` fixture parity beyond the normalized character-to-unit map.
  - `eventHonorBonuses` and `worldBloomDifferentAttributeBonuses` are loaded into the formula master context, but ownership matching, different attribute exact calculation, and leader honor exact calculation are still gap areas.
  - WL3 power cap is actually applied by DeckCalculator-style deck detail and reports `wl3PowerCapTrace.applied`.
  - Challenge deck recommend filters candidates by uploaded target character, allows same-character cards, and scores search results through DeckCalculator-style deck detail.
  - Current Challenge implementation additionally uses `member = min(5, candidateCount)`, music-meta-backed aggregate LiveCalculator fitness, GA-first search, and DFS fallback. Real UID same-input comparison is still required before marking sample parity complete.
  - Inventory preserves complete episode rows (`cardEpisodeId`, `scenarioStatus`, `scenarioStatusReasons`, `isNotSkipped`). Legacy `episodesRead=true` is only an explicit estimated all-episodes-read compatibility path.
  - The Moesekai reference repo intentionally ignores `mock-user-data.json`, `sekai-master-db-diff/`, and `music_metas.json`; local clone does not include those fixtures. The harness can probe Moesekai's remote master/music URLs, but full deck/live/recommend fixture parity needs a supplied user fixture or a real player UID export.
  - Real player UID validation has been run for CN UIDs `7485929717040896807` and `7485933994513767206`. Both validate MySekai v5 import, canvas/gates/fixtures, exact recommendation, and tool-context reuse without missing or estimated fields. A non-empty saved World Bloom support deck and active Finale ownership sample are still needed for those separate paths.
  - Do not describe missing raw data as matched. Current status is reference-level implementation for supported local master/user-data shapes; unresolved fields must remain in `missingFields` or `referenceParity.status = "missing-data"`.
- Calculation responses should separate officialFieldsUsed, estimatedFieldsUsed, missingFields, warnings, formulaSources, and realDataRequired.

Content aggregation APIs:

- GET /api/master/:region/mysekai/context/full
- GET /api/master/:region/live2d/models/:modelId/full
- GET /api/master/:region/live2d/models/:modelId/model3-proxy
- GET /api/master/:region/stories/:storyType/:storyId/full
- GET /api/master/:region/stories/:storyType/:storyId/playback
- GET /api/master/:region/stories/context
- GET /api/master/:region/virtual-lives/:virtualLiveId/playback

Content aggregation status:

- MySekai full context exposes metadata mirror groups, summary counts, grouped previews, resource base candidates, and calculator field status for canvas, gate, fixture, and fixture limit data.
- Live2D full detail parses model3.json when available and exposes model, texture, motion group, expression, physics, pose, displayInfo, proxied resource URLs, and a rewritten model3 endpoint. The web page provides a Live2D player with drag, zoom, grouped motions, expression switching, runtime diagnostics, and resource-index fallback when runtime or model loading fails.
- Story context and story full detail search confirmed metadata story files and return grouped counts, source metadata, scenario asset candidates, scenarioInfo, playbackUrl, playbackReadiness, and unavailable reasons when not found.
- Story playback context follows Sekai Viewer reference paths from `storyLoader.ts` and `storyreader-live2d`: it resolves scenario `.asset` URLs, fetches real scenario JSON, keeps raw scenarioData, normalizes AppearCharacters/Snippets into executable actions, extracts media assets, links Live2D model readiness, and reports unsupportedActions/warnings.
- Story playback v1 supports Talk, Sound, CharacterLayout, CharacterMotion, SpecialEffect.ChangeBackground, first background/BGM/layout bootstrap, and basic screen-effect signaling. Unsupported special effects such as movie, telop, place info, complex scenario effects, and full lipsync/mulmotion must remain explicit unsupportedActions rather than being faked.
- Virtual Live playback context follows Sekai Viewer `virtual_live/*` reference paths: it splits setlist steps into music/mc/mc_timeline, parses MC scenario assets from `virtual_live/mc/scenario/{assetbundleName}/{assetbundleName}.asset`, parses timeline playables from `virtual_live/mc/timeline/{assetbundleName}/{assetbundleName}.playable` when `__timelineParse.events` exists, enriches talk events with `virtual_live/mc/voice/{mcId}/{VoiceKey}.mp3`, links music steps through musicVocals/musics, and exposes `music/long/{assetbundleName}/{assetbundleName}.mp3` candidates.
- Virtual Live playback returns live, schedules, rewards, assets, normalized steps, mcEvents, musicSteps, playbackReadiness, warnings, sourceHealth, and unavailableReason. Parse failures stay localized to the affected step instead of blocking the whole live.
- `/api/assets/proxy` is an allowlisted asset proxy only. It now forwards Range requests and Accept-Ranges/content-range/content-type headers for audio/video-friendly playback while continuing to reject unsupported hosts.

## Web Current State

Web is a React/Vite toolbox dashboard with real URL routes, grouped navigation, and a workbench-style layout. The main implementation is split across apps/web/src/App.tsx, apps/web/src/pages/account.tsx, and apps/web/src/styles.css.

Navigation groups:

- Core tools: dashboard, current ranking borders, ranking forecast, calculation tools, share card.
- Catalog data: music, cards, gachas, honors, materials, costumes, stamps/comics.
- Player data: public player profile, historical events.
- Content data: information, exchanges, missions, virtual live, Live2D model index, MySekai context, story reader.
- Account: login/register and personal information management.

Dashboard/workbench behavior:

- The home page surfaces current region, current event/ranking status, account state, common tools, catalog shortcuts, and data-source status.
- Sidebar navigation is grouped for long-term tool use instead of a single mixed list.
- Mobile layout uses compact navigation behavior and responsive cards/tables to avoid overlap.
- Web copy has been normalized to UTF-8 Chinese and remaining mojibake should be treated as a bug.

Account routes:

- /login: email/password login plus QQ login entry; QQ unavailable state is non-blocking.
- /register: email verification-code registration.
- /me: personal information management dashboard.
- /me/bindings: multi-region UID binding, refresh public profile, set default, delete.
- /me/assets: structured player asset workbench for uploaded inventory, area items, character ranks, music results, materials, honors, profile honors, Challenge Live, World Bloom support, and MySekai canvas/gates/fixtures. It keeps table editing, bulk paste, and advanced JSON modes, calls backend validate before saving non-inventory player-data kinds, shows field help/master lookup chips/tool impact, and uses a two-step JSON import review before writing data.
- /me/deck: authenticated deck recommend using selected/default binding data.
- /me/scores: favorites and score records.

Tool pages:

- Public score-control and deck-recommend remain available without login.
- music-recommend and area-item-recommend are exposed in the web tools page.
- Logged-in users can run authenticated normal-event-plan, event-point-calc, music recommend, area item recommend, and MySekai calc from the tools/MySekai pages using their default binding.
- The tools page has a structured normal-event planning workspace. Public mode accepts manual owned card IDs; authenticated mode uses the default binding. Results are split into deck, event point, score-control, music, and area-item sections with missing fields/warnings plus a full JSON inspector.
- Authenticated deck recommend is exposed in /me/deck.
- MySekai calc is exposed on the MySekai page with grouped master previews, formula field status, per-card contribution display, advanced JSON input, and authenticated binding-data calculation.

Encoding and copy safety:

- The account pages previously regressed into mojibake because Chinese UI strings were saved after an incorrect text decoding/encoding pass, leaving UTF-8-valid but semantically corrupted text such as garbled CJK fragments and even broken JSX string literals. This is not a data-source problem; it is a source-file text encoding/copy issue.
- Any future change touching Chinese copy in apps/web/src, especially apps/web/src/pages/account.tsx and apps/web/src/AuthContext.tsx, must run both `npx tsc -b apps/web/tsconfig.json` and `npm run check:encoding` before reporting completion. TypeScript catches broken JSX/string literals; check:encoding catches common mojibake/replacement text.
- Do not paste Chinese text through tools that reinterpret UTF-8 as a legacy code page. Prefer direct UTF-8 edits via apply_patch or an editor configured for UTF-8.

Stable-source content pages:

- Information page consumes /api/master/:region/information.
- Exchanges page consumes `/api/master/:region/exchanges/context`, with search, status/shop filters, pagination, reward/cost thumbnails, and `/api/master/:region/exchanges/:exchangeId` details. Removed legacy requests for nonexistent `materialExchanges`, `exchangeItems`, and `exchanges` files.
- Exchange rewards follow Moesekai resource rules: currencies use `thumbnail/common_material`, practice tickets use their dedicated PNG directories, and optional name masters are loaded only for reward types present in the current region. Types for which Moesekai defines no image use a semantic UI icon and `assetStatus: reference-no-image`; guessed asset paths and cross-region fallback are forbidden.
- Missions page consumes /api/master/:region/missions/context.
- Virtual Live page consumes /api/master/:region/virtual-lives/context.
- Virtual Live uses an independent catalog route and shareable detail route. The detail response contains schedules, resolved rewards, characters, and lightweight setlist summaries; music and MC assets load through the per-step endpoint only when a step is opened or played. The legacy full playback endpoint remains for compatibility and diagnostics.
- Virtual Live playback now returns referenceSources, referenceParity, preloadStatus, playbackDiagnostics, and playbackQueue. Reference paths reviewed: Sekai Viewer `src/pages/virtual_live/VirtualLiveDetail.tsx`, `VirtualLiveStep.tsx`, `VirtualLiveStepMC.tsx`, `VirtualLiveStepMCTimeline.tsx`, and `VirtualLiveStepMusic.tsx`.
- Virtual Live target is Sekai Viewer `virtual_live/*` parity: details, schedules, rewards, setlist dispatch, MC `.asset`, MC `.playable`, voice, music audio, preload/playback diagnostics, and source health. Future virtual-live work should deepen these reference-project capabilities only.
- Story playback now returns actionSupport, preloadStatus, and playbackDiagnostics, with a Sekai Viewer style support matrix. Reference paths reviewed: `src/utils/Live2DPlayer/action/index.ts`, `action/special_effect/index.ts`, `src/pages/storyreader-live2d/StoryReaderLive2DStage.tsx`, and the related special_effect files for camera, black/white in/out, wipe, shake, telop, place info, full screen text, and scenario effects. The frontend executes additional fallback stage effects for camera, black/white overlay, shake, telop, place info, and full-screen text while keeping text/audio diagnostics available when full Live2D runtime behavior is unavailable.
- Live2D uses an independent paginated catalog at `/section/live2d` and a shareable model preview at `/section/live2d/:modelId`. The catalog does not load Cubism or model assets; the detail route lazy-loads the runtime and consumes `/api/master/:region/live2d/models/:modelId/full` plus its rewritten model3 proxy.
- The Live2D index is a global shared asset list. `global-only` means the asset exists, not that it is released or referenced in the selected region. Only real scenarios parsed for that region may add `region-referenced`; no cross-region reference inference is allowed.
- Live2D detail status distinguishes `region-referenced`, `global-only`, `partial`, `missing-resource`, and browser `render-failed`. A model3 without motion or expression definitions remains `partial`; the UI must not invent controls or guessed motion paths.
- Standalone Live2D preview keeps one stable Pixi canvas across parent rerenders, supports abort/retry/resize/drag/zoom, and performs browser render acceptance. Story keeps its multi-layer controller and must use the same model loading and cleanup semantics when its runtime is next consolidated.
- MySekai assistant page consumes /api/master/:region/mysekai/context/full and POST /api/tools/mysekai-calc.
- Story uses independent catalog, work detail, and episode player routes. `/section/stories` consumes the paginated `/api/master/:region/stories/catalog`; work details list real nested episodes; `/section/stories/:storyType/:storyId/:episodeId/play` consumes the episode-specific playback endpoint and must never silently play the first episode instead.
- Story catalog includes only event, unit, card, and special stories. Area items and other metadata groups must not leak into the story UI. Catalog requests never load scenario, Cubism, models, or audio.
- Story playback is staged: scenario text and the first readable line become available first, then the initial background and at most the current/next model queue are loaded. Voice, BGM, SE, movie, and later models remain deferred until their actions execute. A media or Cubism failure enters `partial-ready` text mode rather than blanking the stage.
- Story player routes are lazy-loaded behind a visible error boundary. Parent timers and ranking refreshes must not recreate its canvas, controller, audio, or progress. Chapter changes abort requests and destroy the prior Pixi/Howler/video state.
- These pages display unavailableReason from the backend when a real source is unavailable and must not invent replacement data.

Catalog/detail behavior:

- Music, cards, events, gachas, honors, materials, costumes, stamps, and comics use shared catalog/detail patterns where practical.
- Detail drawers prioritize a main image, key metadata, relation links, resource links, and source/unavailable state.
- Image components key loading state by item identity and candidate URL to prevent previous catalog images from visually leaking into the next catalog.

Implemented display rules:

- T1-T100 ranking rows open real-time detail dialogs.
- Detail dialog supports player trace and border trace. X axis is collection time, Y axis is total pt.
- Rounds per hour means score-change count within one hour.
- Top100/detail display player name, leader card image, leader level, and Master Rank when upstream data provides it.
- Current ranking borders refresh every 10 seconds; forecast remains a separate page and is marked experimental.
- Music/card/event/gacha/honor/material/costume/stamp/comic lists use backend-generated real asset candidates.
- ArtImage supports srcCandidates, resets by item/candidate identity to avoid cross-catalog image residue, and shows a real-unavailable state when all candidates fail.
- Stable-source pages show unavailableReason instead of fake content when upstream data is missing.
- Card detail image layout rule: Project Sekai member card art is 2338x1440. Use `object-fit: contain` and an aspect ratio of `2338 / 1440` for card art. In detail drawers, render normal and after-training art inside the same `card-art-grid`; do not render after-training art as a separate full-width image. Only show after-training art for rarity 3+ cards. This avoids the recurring bug where 3-star/4-star after-training art appears visually enlarged.

## Account, Auth, and User Data

Auth APIs:

- POST /api/auth/email-code/start
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/me
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/auth/qq/start
- GET /api/auth/qq/callback
- POST /api/auth/qq/link
- DELETE /api/auth/qq/link

Email verification:

- SMTP is configured only through environment variables: SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM.
- Real QQ mail authorization codes must never be committed, logged, or written into docs.
- Verification codes are 6 digits, hashed in storage, valid for 5 minutes, single-use, and limited to 5 attempts.
- Registration requires email + password + code.

QQ OAuth:

- Waiting for QQ Connect site application approval.
- After approval, set PUBLIC_WEB_BASE_URL, QQ_CONNECT_APP_ID, QQ_CONNECT_APP_KEY, QQ_CONNECT_REDIRECT_URI, QQ_CONNECT_SCOPE.
- Production callback must exactly match QQ Connect backend configuration and should use HTTPS.

User data APIs:

- GET /api/me/profile
- GET/POST/PATCH/DELETE /api/me/player-bindings
- GET /api/me/player-bindings/:bindingId/summary
- POST /api/me/player-bindings/:id/refresh-public-profile
- GET /api/me/player-bindings/:bindingId/tool-context
- GET/PUT /api/me/player-data/:bindingId/cards
- GET/PUT /api/me/player-data/:bindingId/area-items
- GET/PUT /api/me/player-data/:bindingId/character-ranks
- GET/PUT /api/me/player-data/:bindingId/music-results
- GET/PUT /api/me/player-data/:bindingId/materials
- GET/PUT /api/me/player-data/:bindingId/challenge-live
- GET/PUT /api/me/player-data/:bindingId/world-bloom-support
- GET/PUT /api/me/player-data/:bindingId/honors
- GET/PUT /api/me/player-data/:bindingId/profile-honors
- GET/PUT /api/me/player-data/:bindingId/decks
- GET/PUT /api/me/player-data/:bindingId/mysekai-canvas
- GET/PUT /api/me/player-data/:bindingId/mysekai-gates
- GET/PUT /api/me/player-data/:bindingId/mysekai-fixtures
- GET /api/me/player-data/:bindingId/export
- POST /api/me/player-data/:bindingId/import
- POST /api/me/player-data/:bindingId/import/review
- POST /api/me/player-data/import
- GET /api/me/player-data/:bindingId/completeness
- GET /api/me/player-data/:bindingId/completeness/full
- POST /api/me/player-data/:bindingId/validate
- GET/POST/PATCH/DELETE /api/me/deck-configs

Rules:

- One account can bind multiple region UIDs.
- UID binding v1 is user-declared and does not prove ownership.
- Public profile refresh may use public APIs only.
- Public profile refresh stores source metadata and keeps UID binding user-declared; it is not ownership proof.
- Tool context aggregates binding, public profile snapshot, inventory count, player asset kinds, completeness, formula readiness, structured per-tool availability, missing fields, warnings, and summary data for selected UID workflows.
- Tool context includes sharedFormulaVersion, assetReadiness, and formulaImpact so the frontend can explain which uploaded assets drive normal-event tools.
- Tool context includes normalEventPlan availability so /me and /me/assets can surface whether uploaded assets are sufficient for the ordinary-event planning workflow.
- Uploaded inventory includes cardId, level, Master Rank, skill level, special training state, default image, and episode-read state.
- Uploaded player assets include area items, character ranks, music results, materials, honors, profile honors, decks, Challenge Live config, World Bloom support config, MySekai canvas, MySekai gates, and MySekai fixtures. These records are user-declared and only used for helper calculations.
- Player asset validation returns structured lookupResults, fieldHelp, toolImpact, and normalizedPreview. Lookup is assistive only: unknown IDs warn but are not auto-rewritten.
- Player data import review is non-mutating. POST /api/me/player-data/:bindingId/import/review parses cards/playerData, reports counts, unsupported kinds, unknown IDs, overwrite risk, normalized preview, field help, and tool impact; only the existing import endpoint writes records after user confirmation.
- Asset editor UX references reviewed this round: Moesekai `refer/re_sekai-calculator/src/user-data/*`, `web/src/components/QuickBindForm.tsx`, `AccountSelector.tsx`, `AccountSelectorBar.tsx`, `web/src/app/profile/*`, `web/src/components/profile/*`; Sekai Viewer `src/pages/user/sekai_profile/SekaiUserCardList.tsx`, `SekaiUserImportMember.tsx`, `src/components/widgets/CardThumb.tsx`, and `CardImage.tsx`.
- Player data export schemaVersion is currently 2 and includes exportSource, binding, publicProfileSnapshot, cards, playerData, deckConfigs, scores, formulaReadiness, toolContextWarnings, and realDataRequired.

## Database and Storage

- PostgreSQL is the production persistence path.
- MemoryStore remains the development fallback when DATABASE_URL is empty.
- Manual migration command: npm run db:migrate -w apps/api.
- Current migrations:
  - 001_auth_and_user_data.sql: users, oauth_accounts, auth_sessions, auth_states, favorites, scores.
  - 002_email_player_deck_data.sql: email_verification_codes, user_player_bindings, user_card_inventory, user_deck_configs.
  - 003_player_data_records.sql: generic user_player_data records for area items, character ranks, music results, materials, Challenge Live, and World Bloom support.
  - 004_supabase_security_constraints.sql: RLS, core check constraints, and cleanup/performance indexes.
  - 005_binding_foreign_key_indexes.sql: binding_id foreign key indexes.
  - 006_expand_player_data_kinds.sql: expands user_player_data kind values for honors, profile honors, decks, and MySekai assets.
  - 007_ranking_history.sql: ranking_history_samples for persisted border/Top100 time series, minute-bucket dedupe, lookup indexes, check constraints, and RLS.
- Supabase is used as hosted PostgreSQL, not Supabase Auth. Business tables have RLS enabled and no public policies; the backend connects with DATABASE_URL.
- Supabase migrations are part of delivery when a plan explicitly requires production schema changes. Do not mark such a round complete with MemoryStore-only verification.
- 007_ranking_history has been applied to the configured Supabase project and verified through MCP list_migrations/list_tables. ranking_history_samples exists in public schema with RLS enabled.
- Migration `008_user_card_inventory_episodes.sql` was applied remotely on 2026-07-10 as `20260710151937 / 008_user_card_inventory_episodes`. Verified through `pjsktools_supabase`: `episodes jsonb NOT NULL DEFAULT '[]'::jsonb`, `chk_user_card_inventory_episodes_array`, RLS still enabled, no policies added, zero incompatible legacy rows, and a transaction-scoped insert/read/rollback left no test data.
- Supabase advisors were checked after 007_ranking_history. Current security INFO notices are RLS-enabled-no-policy for backend-only business tables, including ranking_history_samples, which matches the no-public-policy strategy. Current performance INFO notices include newly created unused ranking_history_samples indexes; this is expected until real production queries accumulate usage stats.
- PgStore must JSON.stringify JSONB values before passing them to pg, especially arrays, to avoid PostgreSQL array coercion.

## spawn EPERM Handling

Known issue:

- Current Windows environment can block Node child_process spawn cmd.exe.
- Vite/Vitest may fail in realpath or worker phases with spawn EPERM.
- This is environment policy, not business logic.

Use this fallback path:

- npm run build -w apps/api
- npx tsc -b apps/web/tsconfig.json
- npm run check:encoding
- npm run verify:local

Do not modify node_modules to work around Vite/Vitest internals. For full Vite/Vitest runs, use Git Bash or an environment that allows Node spawn, preferably Node 22/24 LTS.

## Verification

Recent reliable verification path:

- npm run build -w apps/api
- npx tsc -b apps/web/tsconfig.json
- npm run check:encoding
- npm run verify:local

Recent web toolbox refactor verification:

- npx tsc -b apps/web/tsconfig.json passed.
- npm run build -w apps/api passed.
- npm run check:encoding passed.
- npm run verify:local passed.
- npm run build -w apps/web still fails with known Windows spawn EPERM during Vite realpath; treat this as environment policy and use the documented Git Bash/allowed-spawn path for full Vite builds.

Fastify inject smoke covers email-code dev registration, UID binding, inventory upload, player profile summary, player asset validation with lookup/help/impact/preview fields, non-mutating player-data import review including unsupported kind detection, authenticated deck recommend, authenticated normal-event-plan, authenticated event-point-calc with eventId, bonus config, score-control, music recommend, area item recommend, MySekai calc, structured tool-context, export/import readiness fields, and formula field reporting.
Smoke also covers stable external sources: information, exchanges context, missions context, virtual live context, Live2D models, Live2D full detail, Live2D model3 path rewriting when a model is available, MySekai context/full context, story context/full context, and comic fallback assets.
Smoke covers ranking history writes and reads by refreshing current-event Top100/border data, then checking ranking-history and ranking-history/summary response shapes.
Smoke also verifies lightweight catalog pagination/ETag/304 behavior, the five-region asset directory policy, and ranking leader-card image candidates. `cardDefaultImage` is a training-state enum and must never be exposed as an image URL.
Smoke covers shared normal-event formula fields on public and authenticated deck/event-point/music/area tools, including `normal-event-v4.1-reference` referenceParity/referenceSources fields, CardDetailMap/DeckCalculator/LiveCalculator traces, WL3 power cap trace, and MySekai v5-reference exact CardCalculator/GA search, event point, deck-search trace, replacement recommendations, and beam compatibility fallback.
Smoke creates smoke-* accounts and deletes them at the end through the store layer so Supabase does not accumulate test users.
`npm run parity:moesekai` covers formula reference parity beyond smoke. Current hard cases include Moesekai event point static outputs and DeckCalculator-style synthetic invariants; missing Moesekai ignored fixtures are reported as missing data, not success.

## Persistent Target

### Content System Milestones

- Content capability is tracked independently for `jp/en/tw/kr/cn` through `GET /api/master/:region/content-status`. Valid states are `ready`, `partial`, `not-released`, `missing-resource`, and `source-unavailable`; one missing collection must not blank an otherwise usable page.
- MySekai catalogs use `mysekaiFixtures`, main/sub genres, tags, blueprints, blueprint material costs, materials, and character-talk masters. The visual fixture/material/blueprint catalog is the primary content workflow; the calculator is a separate secondary workflow.
- Virtual Live list and detail consume schedules, setlists, and rewards nested in `virtualLives.json`. Standalone schedule/setlist/reward requests return 404 and must not be restored. MC and music playback resources load only after the user opens playback.
- Information details use a restricted in-app iframe when the same-region record exposes an HTTP(S) path. Custom app schemes remain external-only. EN/TW/KR stay `not-released` until a verified same-region source exists.
- The Live2D model index is a `global-shared-model-asset`; it does not prove regional story availability. A scenario is playable only when its same-region scenario and referenced model resources load.
- Story server parsing is not browser parity. Playback responses remain `pending-browser-validation` until canvas pixels, model rendering, action changes, media playback, and cleanup are checked in a real browser. Missing regional assets remain `missing-resource`.
- `npm run verify:content` dynamically validates five-region information, Virtual Live, MySekai catalogs, four story groups, asset isolation, Live2D scope, and model-preload limits. Synthetic fixtures cannot establish real playback parity.
- Long-term order: content data reliability and catalogs; Story/Live2D real-browser sample coverage; Virtual Live reward/MC enrichment; then optional MySekai OBJ/room preview. Virtual Live remains a data/audio workflow and does not promise Unity 3D stage reproduction.

Long-term target: align this project with the actual player-assistant capabilities implemented by Sekai Viewer and Moesekai. The key standard is not just "an endpoint exists"; the implementation should match reference-project depth for formulas, data flow, UI workflows, source diagnostics, and player-asset reuse wherever those projects provide working functionality.

Public data and asset policy:

- Team-Haruki master repositories provide same-region base catalogs; Moesekai metadata provides formula reference master and music metadata; Haruki Suite provides public player assets; rks-n provides the fast public ranking board; Haruki toolbox remains a detail/fallback source.
- Current event identity and event catalog freshness use same-region Moesekai metadata (`metadata.exmeaning.com/{region}/master/events.json`, with the configured same-region metadata mirror/fallback policy) before Team-Haruki. When rks-n reports an event missing from the local cache, the API returns `活动 #ID` immediately and requests one deduplicated background master refresh; it must not remain at `正在加载活动`.
- Stable images use same-region CDN candidates in this order: `storage.exmeaning.com`, `storage.pjsk.moe`, `storage.sekai.best`, then the same URL through the local streaming proxy. Cross-region asset fallback is forbidden.
- Asset directories are fixed as `sekai-jp-assets`, `sekai-en-assets`, `sekai-tw-assets`, `sekai-kr-assets`, and `sekai-cn-assets`. The Team-Haruki TW repository remains `haruki-sekai-tc-master`, but the asset directory is never `sekai-tc-assets`.
- Catalog pages use lightweight paginated APIs and a version-aware browser IndexedDB cache. Cached data renders first and refreshes in the background; switching region invalidates only that region/query key.
- Ranking leader images are derived from `leaderCardId` plus the same-region card master. `original` and `special_training` select the card image state; they are not URLs. Missing cards fall back to the same-region character icon and then a neutral placeholder.

Current parity snapshot from local-code audit, 2026-07-10:

- Completed or close to reference workflow depth:
  - Account/player-data shell: login/register, UID bindings, `/me`, `/me/bindings`, `/me/assets`, `/me/deck`, `/me/scores`, structured user data records, tool-context, export/import, validate, and non-mutating import review are implemented locally.
  - Player asset UX foundation: `/me/assets` has table/bulk/JSON modes, field help, lookup results, tool impact, normalized preview, and post-save context refresh. This is a functional user-data workbench, although not yet as polished as reference card-list/import UIs.
  - Virtual Live reference-scope workflow: backend and frontend implement live detail, schedule, reward, setlist, MC scenario, MC timeline, voice, music audio, queue, source health, and diagnostics. This is aligned to the reference-project data/audio workflow scope.
  - Ranking/history: persisted ranking history, summary, forecast windows, source health, and experimental forecast UI exist.
  - MySekai search structure: default MySekai recommendation is GA-based with seeded RNG, weighted selection, crossover, mutation, elite retention, no-improvement stop, DeckCalculator-backed fitness trace, replacement candidates, and asset gap ranking.

- Partially complete:
  - Normal-event formula core: shared v4 reference architecture is used by deck/event-point/score-control/music/area/normal-plan, with CardDetailMap and DeckCalculator-style traces. Supported local master/user-data shapes now consume the reference-style data flow; missing raw fields are explicit `missing-data`.
  - Event point static formula parity: `npm run parity:moesekai` verifies Moesekai `EventCalculator.getEventPoint` challenge/multi/cheerful static cases, including cheerful life-rate.
  - Challenge Live: candidate filtering, same-character allowance, `challengeDecks`, and high-score deck scoring now use DeckCalculator-style detail. Further validation still needs real sample comparison against Moesekai fixtures.
  - World Bloom/WL/WL3: support recommendation/summation, owned-honor Leader bonus, Leader-only application, unique-attribute bonus, dynamic card bonus limit, and WL3 power cap are implemented and covered by synthetic parity cases. Real active-event master and non-empty uploaded support-deck fixtures still need validation.
  - MySekai calculation: v5 uses exact shared CardCalculator/DeckCalculator fitness, exact canvas/gate/fixture player mappings, WL Finale limits, seeded GA, and recomputed marginal gains. Available local parity cases and both real CN UID acceptance runs pass.
  - Story/Live2D playback: `story-live2d-v2-reference` uses Pixi 7, Sekai Viewer-compatible mulmotion, Howler, real Live2D models, model queue reuse, motion/expression concurrency, voice mouth movement, layered camera/effects, staged preload, cancellation, independent audio volumes, autoplay/step/fast-forward controls, and explicit resource degradation. The old stand-in character renderer has been removed.
  - Browser acceptance: JP model `v1/main/21_miku/21miku_april001` renders a non-empty 539x518 Cubism 4 canvas through the rewritten model3/API asset proxy path. The Web runtime loads Sekai Viewer's public Cubism Core and uses the mulmotion `cubism4` entry. A 375px mobile viewport has no page-level horizontal overflow; the model list and player stack vertically. Missing story context and unavailable assets remain explicit degraded states.
  - Player card inventory/import: `/me/assets` has a visual card grid and a local-only screenshot recognition/review flow. Import review compares against the selected binding and returns `cardDiff` plus `postSaveImpact`; individual and batch deletion require explicit confirmation. `npm run verify:card-import` verifies five-region catalogs and asset isolation. Browser acceptance covers desktop and 375px mobile layouts, the two-column mobile card grid, stacked screenshot controls, and a viewport-contained edit dialog.
  - Player profile analysis: authenticated `GET /api/me/player-bindings/:bindingId/profile-analysis` and `/me/profile` aggregate the selected binding's public snapshot, inventory, Suite assets, and same-region master into Character Rank radar, Challenge stage/high-score analysis, Bonds lookup, shared-CardCalculator power contribution detail, and the shared reference-level area-item upgrade service. Every module reports readiness, missing fields, source health, and update time independently; public UID-only data remains visibly distinct from imported user assets.
  - Player profile browser acceptance: the desktop and 375px mobile views render a non-empty Character Rank radar, character/Challenge linkage, power diagnostics, and the area-item list with zero page-level horizontal overflow. Screenshots are stored at `artifacts/profile-analysis-desktop.png` and `artifacts/profile-analysis-mobile.png`.
  - Deck Comparator frontend: `/section/deckCompare` consumes the completed public/authenticated `deck-compare` backend, supports 2-5 manual/cardId/saved-deck candidates, unified or per-player teammate settings, Skill 1-5 strategy, Skill 6 mode, aggregate/exact score modes, score/PT winner summaries, trace diagnostics, JSON inspection, and local browser-only comparison history.
  - Content pages: information/exchanges/missions/stories/virtual-live pages are structured workflows, but relation jumps, sample coverage, and source diagnostics can still be deepened.

- Not complete and must not be represented as complete:
  - Sample-proven official event point for all modes.
  - Real-fixture proof for World Bloom/WL leader/honor ownership on an active Finale event.
  - Challenge Live parity harness against Moesekai sample fixtures.
  - Same-input execution through a runnable Moesekai user-data adapter remains blocked by its ignored `mock-user-data.json`; current real UID runs validate the local path but do not replace that unavailable upstream fixture.
  - Existing CN UIDs validate import, honors, Challenge, MySekai, and inventory-recommended World Bloom support; a UID with non-empty saved support deck and an active Finale event is still required.
  - Story/Live2D still needs broader real-scenario sample coverage for rare shader/scenario-effect assets and browser-specific Cubism Core compatibility; missing resources remain `missing-resource` instead of being simulated as matched.
  - Area-item upgrade costs remain `missing-data` only where the current region master exposes no authoritative shop relation and the level is outside the Moesekai ID-rule coverage, notably possible level 16-20 rows. Exact power gain remains available, but efficiency and affordability are never invented.
  - Per-note `LiveExactCalculator` is implemented for explicit exact score-control and Deck Comparator requests. Remaining proof is broader real chart fixture coverage and handling rare SUS variants as `unsupported-chart-format` rather than approximating.

Priority gap areas:

- Formula parity: extend fixture-backed comparisons for event point, Challenge Live, World Bloom/WL/WL3, and real-chart LiveExact cases; MySekai v5 exact card/deck/service behavior is now parity-locked for available fixtures.
- Player asset UX: make UID binding, inventory upload, area items, character ranks, materials, music results, honors, Challenge Live, World Bloom, and MySekai assets easy to import, edit, validate, export, and reuse across tools; next UI depth should focus on MySekai asset editing and review workflows.
- Player profile analysis: Character Rank, Challenge, Bonds, exact power contribution, and the shared exact area-item upgrade service are implemented; remaining work is broader five-region real-player fixture coverage.
- Tool loop integration: keep normal-event-plan, deck recommend, event-point-calc, score-control, music recommend, area item recommend, MySekai calc, and ranking forecast connected through shared formula/context providers and uploaded assets.
- Reference-style content workflows: Story/Live2D now has a reference-structured runtime; continue improving catalog relations, validated rare-effect samples, Virtual Live mapping, and clear missing-data states.
- Data reliability: strengthen cache, timeout, background refresh, historical ranking persistence, resource candidate validation, and source-status reporting while preserving existing data source rules.
- Project boundary: remain a Project Sekai player assistant aligned with reference-project functionality. Do not plan or implement unrelated entertainment tools.

## Real UID Sample Requirements

Future validation should collect read-only public Suite UIDs by sample purpose. Use them only for acceptance testing, MemoryStore/temp-account imports, and gap classification; do not treat a UID as ownership proof, do not retain private claims beyond the test artifact, and do not mark five-region completion from a single-region success.

- `world-bloom-support-uploaded`: a UID with non-empty `userWorldBloomSupportDecks`, to validate uploaded support-deck priority over inventory-generated fallback.
- `wl-finale-active`: an active or reproducible WL Finale sample with relevant honors/profile honors, WL3 power cap behavior, and MySekai fixture limit data.
- `challenge-complete`: a UID with complete Challenge solo deck/result/stage/high-score data for character-filtered high-score deck validation.
- `mysekai-complete`: a UID with canvas, gate, fixture, materials, and enough inventory to validate MySekai v5 marginal gains.
- `multi-region`: at least one public Suite UID for each of `jp/en/tw/kr/cn`, to verify import mapping, source health, and capability matrices without cross-region fallback.
- `rare-story-live2d`: stories containing movie, shader/scenario effect, special wipe, telop, and place-info actions for browser runtime acceptance.
- `rare-chart-sus`: charts that trigger uncommon SUS syntax or currently unsupported LiveExact parsing branches; these should become matched only after parser support is proven, otherwise remain `unsupported-chart-format`.

## Next Round Suggestions

- Formula deep-calibration round: refresh real `worldBlooms`, `eventCardBonusLimits`, and raw `gameCharacters` master collections, then extend parity from synthetic cases to full fixture-backed deck/live/recommend comparisons. Use an active Finale event and a UID with matching owned honors/non-empty saved support deck; keep unavailable fixture cases as `missing-data`.
- Ranking/history deepening round: add longer-term historical comparisons across past events, optional export/download of raw samples, source outage timeline, and explicit operator-controlled cleanup/archive tooling. Preserve raw real samples and keep prediction experimental.
- Frontend productization round: after Deck Comparator, prioritize MySekai asset editing/review, clearer formula readiness surfaces, and focused visual polish for existing `/me` workflows before adding unrelated pages.
- Content/playback deepening round: validate rare Story action samples across five regions, improve Cubism compatibility diagnostics, MC event filters, character/costume mapping, setlist search, and Virtual Live source outage diagnostics.
- Live2D/MySekai round: improve mobile gestures and rare shader/scenario-effect assets where real resources exist, plus MySekai fixture/gate/canvas editing and event/support bonus input UX. The core Story runtime and MySekai CardCalculator paths are no longer listed as unfinished.
- Chart/player-assistant round: enhance chart preview and evaluate MikuMikuWorld/WASM only for player-assistant use cases such as chart inspection, practice planning, and song efficiency analysis.
- QQ approval follow-up: run real OAuth end-to-end testing, verify production callback URLs, and document deployment environment variables after QQ Connect approval.

## External Requirements for Public Launch

Deployment was intentionally paused on 2026-07-12. This section tracks services, accounts, approvals, domains, credentials, and operational subscriptions that are outside the project code. It is not a list of product-feature gaps. The preliminary `render.yaml` remains only a candidate deployment configuration.

### Required hosting and infrastructure services

- **Frontend hosting:** choose a public web host such as Sites, Cloudflare Pages, Netlify, or Vercel. The host must support SPA route fallback, HTTPS, environment-specific builds, custom domains, and the final `VITE_API_BASE_URL`.
- **Long-running API hosting:** obtain a service capable of running the Node/Fastify API continuously, accepting public HTTPS traffic, running scheduled ranking/master refresh jobs, proxying images/media, and allowing outbound access to every approved upstream source. Candidate services include Render, Railway, Fly.io, or a VPS.
- **Production PostgreSQL:** obtain a persistent PostgreSQL service such as Supabase, Neon, Render PostgreSQL, Railway PostgreSQL, or managed VPS PostgreSQL. Record storage, connection, backup, retention, suspension, and free-tier expiry limits before using it for real accounts.
- **Optional Redis:** obtain a managed Redis-compatible service only if production request coordination, shared cache, or multi-instance deployment requires it. Do not depend on local process memory when multiple API instances are running.
- **Persistent cache/object storage:** decide whether large cache files, generated artifacts, and proxy results need object storage such as R2/S3. Render/Railway instance disks may be ephemeral and must not be assumed durable.

### Accounts, authorization, and approvals to obtain

- **Open-source release compliance:** before public availability, publish the exact deployed source revision under `AGPL-3.0-or-later`, retain `LICENSE` and `THIRD_PARTY_NOTICES.md`, publish a stable source link in the web/API legal information, and tag the deployed commit. See `OPEN_SOURCE_COMPLIANCE.md`.
- **GitHub hosting authorization:** authorize the selected API/frontend deployment providers to read the `lwh-440/pjsktools` repository and deploy the selected branch. Keep permissions repository-scoped where possible.
- **QQ Connect approval:** complete the QQ website application review before enabling QQ login. Obtain the production App ID and App Key, register the exact HTTPS callback URL, and set the approved domain. Until approval is complete, QQ login stays disabled.
- **Email delivery account:** prepare a production SMTP account or transactional email provider for verification codes. For QQ Mail, obtain and safely store an SMTP authorization code; alternatively select Resend, Postmark, Mailgun, Amazon SES, or another provider and verify its sending domain.
- **Domain registration:** purchase or designate the final domain and control its DNS. Plan at least the web hostname and API hostname, for example `pjsk.example.com` and `api.pjsk.example.com`.
- **TLS/HTTPS:** ensure the frontend host and API host issue and renew certificates automatically. OAuth callbacks, email links, iframe content, cookies, and API requests must use the final HTTPS domains.
- **Upstream-source permission review:** confirm acceptable public use and redistribution terms for Sekai.best, Haruki, Uni/Haruki, Moesekai metadata, rks-n, official notices, game assets, audio, Story, Live2D, and player data. Contact maintainers when attribution or usage permission is unclear.
- **Official-game legal review:** prepare an unofficial-project disclaimer and review whether publicly proxying or redistributing copyrighted game images, audio, scenarios, Live2D models, and announcements is acceptable. Obtain advice or permission where required.

### Production credentials and environment values

- `VITE_API_BASE_URL`: final public HTTPS API origin used when building the frontend.
- `PUBLIC_WEB_BASE_URL`: final frontend origin used by the API for redirects and links.
- `DATABASE_URL`: production PostgreSQL connection string stored only in the host secret manager.
- `JWT_SECRET`: newly generated production-only secret; never reuse the development fallback.
- `QQ_CONNECT_APP_ID`, `QQ_CONNECT_APP_KEY`, `QQ_CONNECT_REDIRECT_URI`, `QQ_CONNECT_SCOPE`: set only after QQ approval.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: production email provider values.
- `HARUKI_API_BASE_URL`, `MASTER_RAW_BASE_URL`, refresh intervals, and any proxy/source allowlists: confirm production-reachable values and provider terms.
- `REDIS_URL`: add only when a managed Redis service is selected.
- Keep development, staging, and production credentials separate. No real credential may be committed to Git, written into `agent.md`, included in screenshots, or pasted into public issue logs.

### DNS and provider configuration

- Point the frontend hostname to the selected frontend provider and the API hostname to the API provider.
- Configure frontend SPA rewrites so direct visits to routes such as `/section/stories/...` do not return 404.
- Configure API CORS to allow only the final frontend and approved staging origins.
- Register the final domain with QQ Connect and the email provider before production verification.
- Configure asset/iframe proxy allowlists for production domains and verify that providers do not block large responses, Range requests, WebSockets if later needed, or long-running media downloads.
- Decide whether the public site is private beta, public beta, or general availability and configure provider access restrictions accordingly.

### External monitoring and operations services

- **Uptime monitoring:** obtain a service such as UptimeRobot, Better Stack, Pingdom, or equivalent to monitor the web URL, `/health`, and important public endpoints.
- **Error tracking:** obtain Sentry or equivalent projects for both Web and API, with separate production/staging environments and source-map handling.
- **Log retention:** choose the hosting provider's logs or an external log service and define retention. Logs must not contain passwords, verification codes, tokens, email contents, or imported player payloads.
- **Database backups:** enable automated backups or schedule verified exports. Record restore instructions and provider retention limits.
- **Status/contact channel:** create a support email or issue channel and, if public traffic warrants it, a status page for outages and upstream-source failures.
- **Analytics:** optional. If analytics are enabled, choose a privacy-conscious provider and disclose it in the privacy policy; do not add tracking silently.

### Public documents and contact information

- Privacy policy covering account data, email, UID bindings, uploaded assets, logs, analytics, retention, export, and deletion.
- Terms/usage notice and unofficial-project disclaimer.
- Data and asset attribution page; the existing About page is the starting point but does not replace legal review.
- Account deletion and data-export instructions with a working support contact.
- Copyright/takedown contact and process.
- Provider-specific privacy disclosures for hosting, database, SMTP, OAuth, monitoring, analytics, and error tracking.

### Cost and free-tier decisions

- Record the selected provider, owner account, billing contact, free-tier limit, sleep behavior, bandwidth/storage quota, database expiry policy, and expected upgrade price.
- Render-style free API instances may sleep and create long first-load delays; scheduled background refresh may be unreliable while sleeping.
- Free managed PostgreSQL may pause, expire, limit storage, or restrict backup retention. Do not use it for real user accounts without accepting those terms.
- Large game images, audio, Live2D, and proxy traffic can exceed free bandwidth quickly. Estimate bandwidth before public promotion.
- Set billing alerts and hard spending limits where the provider supports them.

### Recommended external-service sequence

1. Register the final domain and create a dedicated project email/support address.
2. Choose the production PostgreSQL provider and verify backup/retention terms.
3. Choose an always-on or acceptable-sleep API host and authorize the GitHub repository.
4. Deploy the API, obtain its HTTPS URL, and verify outbound access to required data sources.
5. Choose the frontend host, set `VITE_API_BASE_URL`, deploy the Web build, and configure SPA rewrites.
6. Configure DNS, HTTPS, `PUBLIC_WEB_BASE_URL`, CORS, SMTP, and approved OAuth callbacks.
7. Add uptime monitoring, error tracking, backup alerts, billing alerts, and support contacts.
8. Publish privacy/terms/disclaimer/attribution/deletion documents before opening registration to the public.

### Current external readiness

- GitHub repository exists and deployment providers can be authorized against it.
- No final frontend host, API host, production domain, or production API URL is selected.
- `render.yaml` exists as an optional Render Blueprint but deployment is paused.
- Supabase has been used as hosted PostgreSQL during development, but the final production database ownership, plan, backup policy, and connection values still need confirmation.
- QQ Connect approval and production callback registration are still pending.
- Production SMTP credentials, monitoring, error tracking, support contact, privacy policy, terms, disclaimer, and takedown process are not yet finalized.
- Sites frontend publication remains blocked until a stable public API URL and its allowed frontend origin are available.
# 卡牌技能与服装图鉴数据约束

- 卡牌技能详情必须使用 Moesekai `formatSkillDescription` 语义解析模板占位符，并保留 effect ID、等级数值、持续时间与增强参数。旧缓存缺 effect ID 时，只能从当前区服 reference skills master 补齐；无法补齐时显示 `missing-data`，不得展示原始 `{{...}}` 作为正式描述。
- 服装图鉴主目录使用当前区服 `moe_costume.json`，按 `costumeNumber` 每套服装一条；`costume3dModels.json` 仅可用于角色适配补充，禁止重新作为服装列表。
- 服装代表图按 `body -> hair -> head -> extraParts` 选择，资产路径为 `thumbnail/costume/{assetbundleName}.webp`。五区目录固定为 `sekai-jp/en/tw/kr/cn-assets`，其中 TW 必须是 `sekai-tw-assets`，禁止跨区 fallback。

# 实时排名周回数据约束

- rks-n v2 是实时榜、档线时序和正式周回统计的权威来源；普通活动使用同区 `/churn`，World Link 使用同区 `/worldlink-churn?gameCharacterId=...`。Haruki Toolbox 只负责玩家详情、profile 和轨迹 fallback。
- 正式周回字段必须直接消费服务端 `churn_1h`、`churn_20min`、`churn_48h`、`hourly_churn`、`recent_score_changes` 与 `parking_periods`，不得从 Haruki 采样点数量重新推导并标记为真实周回。
- churn 缺失时只能展示“PT 更新次数”，并明确说明不能代表实际周回场次。JP 高强度周回会显著放大降采样误差；CN/EN 旧结果看似接近并不代表旧算法准确。
- churn 缓存必须按 `region + eventId + boardType + gameCharacterId` 隔离。所有后续实时排名与周回改动必须同时验证 `jp/en/tw/kr/cn`，并单独验证 World Link 角色榜上下文。

## Android Round 3: Catalog Layout and Detail Reliability

- Android catalog list and detail models preserve every backend-proxied image candidate. Lists prefer thumbnails, details prefer full-size assets, and normal and trained card artwork remain separate purposes.
- `BackendImage` may contact only the configured backend host. It remembers a successful candidate, temporarily suppresses failed candidates, includes the actual URL digest in cache identity, and exposes an explicit retry after all candidates fail.
- Room schema version 3 stores song and card details independently from directory summaries. Full catalog replacement must never erase detail payloads or leave fresh metadata pointing at an empty detail record. Migration from version 2 preserves all existing catalog data and settings.
- Song catalogs default to publication date descending. The values `mv` and `mv_2d` are song categories, not units. Known category, attribute, unit, rarity, costume part, source, gender, and material values use localized display labels while unknown raw values remain visible.
- Card catalogs default to ID descending. Card details expose normal/trained artwork, formatted skill descriptions for levels 1 through 4, special-training skills, related events, and related gachas. Missing skill inputs remain an explicit data state and unresolved placeholders are never presented as final copy.
- Song details present metadata, fixed-order difficulty selection, and the chart belonging to the selected difficulty. Chart candidates are attempted in this order: primary SVG, Sekai Viewer SVG, then PNG. The viewer supports pan, zoom, reset, and full-screen display without parsing SUS or generating substitute charts.
- Gacha catalogs default to opening time descending; all other extension catalogs default to ID descending. Filters are grouped by semantic facet in a bottom sheet, and each catalog type has content-specific list metadata and detail sections.
- Backend changes for this round are additive Android contract fields only. Existing web routes, payload order, DOM, styles, filters, pagination, and sorting behavior remain unchanged and require snapshot/build regression coverage.
- Completion requires OpenAPI generation drift checks, Room schema verification, API contract tests, Android unit tests, `assembleDebug`, `lintDebug`, Web build, and emulator acceptance showing a formatted card skill and a real selectable-difficulty chart.

## Android Round 4: Account Favorites and Unified Catalog Filters

- Android favorites are authenticated cloud data shared with the Web application. There is no guest favorite store and offline favorite data is read-only.
- `:feature:account` owns email login, registration, email verification, session restoration, and logout. `:feature:favorites` owns the cross-catalog favorite center, folder management, search, type and region filters, and bulk organization.
- Access and refresh tokens are encrypted with an Android Keystore AES-GCM key before DataStore persistence. Bearer credentials may be attached only to the configured project backend. A 401 triggers one synchronized refresh and one request retry; refresh failure clears the session and account-private Room rows.
- Room schema version 4 adds account-scoped `favorites` and `favorite_folders`. The migration preserves every public catalog, detail, image metadata, region preference, and prior schema row. Logout clears only the active account's private rows.
- Favorite targets are limited to `player`, `event`, `song`, `card`, `gacha`, `honor`, `material`, `costume`, `stamp`, and `comic`. Writes use generated request bodies, stable per-attempt idempotency keys, and `If-Match` where a server version exists. Conflict responses must resynchronize before another write.
- Catalog, event, song, card, and collection list/detail surfaces expose a localized favorite action. Signed-out actions navigate to account authentication without destroying the originating catalog query, selected item, or scroll anchor.
- The Catalog header exposes the cross-type favorite center and synchronized favorite count. Opening another region's favorite changes the global region before navigating to catalog content. Unavailable targets remain visible and may still be organized or removed.
- All nine catalog families use `CatalogFilterState`: multi-select values are `Map<String, Set<String>>`, independent switches are `Map<String, Boolean>`. Ordinary values use OR within one group and AND between groups; event bonus characters use ALL semantics.
- Online filtered pages are authoritative for order, pagination, and dynamic counts. Android passes generated multi-value query parameters and renders backend `filterMeta` labels, counts, match modes, icon candidates, colors, and dedicated switches.
- Offline filtering uses only per-item facets stored with the complete catalog. Android must show a missing-filter-cache state when a dimension cannot be confirmed; it must never invent Pickup, availability, related-card, or other derived values.
- Query state is isolated by region and catalog type and includes text, sort, selections, switches, page, and scroll anchor. Any query change returns to page one and the top. Switching catalog types returns to the top; returning from a detail restores the original item and offset.
- Mobile filters use a grouped bottom sheet; expanded layouts use a wide panel or side panel. Selection chips can be removed independently, filter panels remain open during result refresh, and all copy is localized in resources with dark theme, large text, and TalkBack coverage.
- Backend and OpenAPI work in this round is additive. Existing Web routes, response semantics, DOM, styles, sorting, filtering, and navigation behavior must remain unchanged.
- Completion requires API contract and compatibility tests, deterministic OpenAPI generation, Room migration coverage, Android repository and Compose tests, Web regression build, `testDebugUnitTest`, `assembleDebug`, `lintDebug`, and emulator acceptance of login, filtering, favorite synchronization, and detail-return scroll restoration.

## Android Round 5: Event Analytics and Home Workbench

- The Android Events destination contains three independently restorable surfaces: current rankings, forecast analysis, and historical events. Routes and state must remain isolated by region and event.
- Current rankings use one atomic `LiveRankingSnapshot` for Top 100, border lines, source health, and update time. While the current-ranking page is visible and the process is resumed, Android refreshes every ten seconds; leaving the page or backgrounding the app stops polling immediately, and overlapping requests are merged.
- Overall and World Link rankings are distinct backend requests. World Link requires a real character ID, uses same-region data only, and isolates runtime and Room caches by region, event, board type, and character ID. Missing World Link context or source data is explicit and never falls back to Overall data.
- Ranking rows open typed player or border tracking details with score, speed, churn or observed PT updates, leader information, adjacent ranks, and real trace samples. Charts and lists use only backend samples and never interpolate or invent points.
- Forecast analysis supports `all`, `1h`, `3h`, and `6h` windows. Each window exposes sample health, line count, span, confidence, warnings, current PT, speed, one-hour, three-hour, and event-end projections, plus accessible textual data beside any Canvas chart.
- Target planning uses generated `ScoreControlRequest` and domain repositories. The form covers target rank, current and target PT, remaining time, PT per run, available runs, and an optional player binding. Results show remaining PT, required runs, hourly requirements, feasibility, formula version, warnings, and calculation detail without rendering raw JSON.
- Signed-in users can load, select, or create a same-region player binding from the forecast page. Credentials and binding responses remain private; UI never accesses generated DTOs or Retrofit directly. Signed-out users return to the preserved forecast form after authentication.
- Historical event detail caches full event data by region and event ID for seven days. It displays event identity, type, unit, schedule, story summary, bonus context, and typed related songs, cards, and gachas. Missing, unreleased, stale, offline, and unavailable states remain distinct.
- Home is a compact responsive workbench rather than a marketing page. It displays region and catalog metrics, current event and Top 3, account/favorite state, and grouped tool entries. Implemented tools navigate directly; future tools remain disabled with a localized `in development` state and TalkBack description.
- Room schema version 5 preserves all prior public catalogs, details, favorites, account data, and settings while adding event details and event analytics. Ranking, forecast, and detail caches remain region-scoped and use their documented refresh periods.
- Backend changes are additive and preserve existing Web routes, payload semantics, DOM, CSS, filters, and ordering. `getLiveRanking`, event detail, ranking detail, forecast, score control, event-point estimate, and player-binding contracts remain strongly typed in the committed OpenAPI client.
- OpenAPI drift checks must export and regenerate in an isolated temporary directory, compare files independently of Git worktree state, and clean temporary output. In-place generation remains an explicit developer action.
- Completion requires API and compatibility tests, Web TypeScript and production builds, OpenAPI drift checks, Room schema verification, Android unit tests, `assembleDebug`, `lintDebug`, and emulator acceptance of Home, current rankings, forecast planning, World Link context, and a historical event detail.

## Android Round 6: Web-Equivalent Events Experience

- The Web current-ranking, forecast, and historical-event surfaces are the behavioral baseline. Android uses native compact layouts, but it must retain the same public fields, source states, real calculations, and user actions.
- `LiveRankingSnapshot` atomically carries the current event, border lines, Top 100, board type, selected World Link character, available World Link characters, update time, warnings, and complete source health. Overall and World Link caches remain isolated by region, event, board type, and character ID.
- Current rankings refresh every ten seconds only while the current-ranking surface is visible and the process is resumed. Leaving the surface or backgrounding the app stops polling, and an unfinished refresh prevents another request from stacking.
- Top 100 rows preserve leader card and character image candidates, card ID, level, Master Rank, player identity, score, hourly growth, and update time. Image requests continue to use only backend proxy or resolver URLs.
- Ranking detail preserves profile text, public honors, player and line traces, neighboring ranks, sampling interval, rank growth, official churn fields, 48-hour heat data, recent score changes, parking periods, and churn update status. Missing churn is described as observed PT updates and is never labeled as real play count.
- Forecast windows are `all`, `1h`, `3h`, and `6h`. The `all` request omits `windowHours`; bounded windows pass only their matching value. Charts use persisted history samples only and never interpolate or connect current values to projections as substitute history.
- Forecast planning keeps target rank and PT, current PT, remaining time, PT per run, available runs, formula version, feasibility, warnings, and calculation evidence. Same-region player bindings may estimate PT without exposing generated DTOs or credentials to UI code.
- Historical events retain Web-equivalent search, filters, sorting, pagination, favorites, banners, schedule, story, bonus context, and related songs, cards, and gachas. Related targets are emitted by `:feature:events` and resolved by `:app`; feature modules must not depend on each other.
- Phone detail uses a full page and system back handling. Expanded layouts keep the list visible beside detail. Ranking and historical-event list state survives detail selection so returning restores the previous item and scroll offset.
- Room schema version 7 adds JSON snapshot caches for live ranking and ranking detail. Migration from version 6 preserves catalogs, favorites, account data, settings, event detail, and forecast analytics. Snapshot and detail keys include every region, event, board, character, and rank discriminator required by the contract.
- Event strings are valid Simplified Chinese resources. Missing, unreleased, stale, refreshing, offline, fallback-source, and unavailable states remain distinct and are not collapsed into a generic load failure.
- Backend and OpenAPI changes are additive. Existing Web routes, response semantics, DOM, CSS, sorting, and interaction remain unchanged. The committed generated client and its compatibility DTO bridge must retain every strong ranking and forecast field.
- Completion requires API contract tests, OpenAPI export and drift checks, Web production build, mapper and forecast-window tests, Room schema checks, Android unit tests, `assembleDebug`, `lintDebug`, and emulator acceptance showing leader images, Top 100, ranking detail, real forecast trends, and historical event detail.

# 收藏夹与全图鉴筛选实现

本轮已经完成后端与 Web 实现，目标是达到可部署状态，但没有执行生产发布或线上数据库迁移。Android 业务页面、鉴权、仓储和交互均未接入本轮功能；只有 OpenAPI 合约一致性检查需要时才允许同步生成代码。

## 收藏数据与语义

- 收藏目标按 `(user_id, type, region, target_id)` 全局唯一。支持的类型固定为 `player | event | song | card | gacha | honor | material | costume | stamp | comic`。
- 收藏与收藏夹是多对多关系。一个收藏可以同时属于多个收藏夹，也可以不属于任何收藏夹；Web 将后者显示为“未分类”。
- 数据库迁移位于 `apps/api/src/db/migrations/010_favorite_folders.sql`。迁移增加 `favorite_folders`、`favorite_folder_items`、收藏 `updated_at` 和唯一目标约束，并在创建约束前合并历史重复收藏。历史收藏默认保持未分类。
- 收藏夹名称按用户执行 `lower(trim(name))` 后唯一。所有收藏夹关联写入必须验证收藏夹属于当前用户，并在事务中完成，禁止跨用户读取或整理。
- 删除收藏夹只删除关联，收藏本体保留并进入未分类；删除收藏本体必须同时清理它与所有收藏夹的关联。
- 重复创建收藏不是冲突：返回已有收藏并合并请求中的 `folderIds`。`PATCH` 原子替换收藏夹关联，空数组表示未分类；批量整理支持 `add | remove | replace`。
- 新增图鉴收藏时，后端验证当前区服目标并生成名称、图片候选等摘要。历史目标失效时返回 `available: false`，但仍允许用户移动、取消分类或删除。
- 收藏响应包含 `folderIds`、`updatedAt` 和 `target` 摘要。写接口继续遵守现有 `Idempotency-Key` 与 `If-Match` 乐观并发规则。

## 收藏 API

- `GET/POST /api/me/favorite-folders`
- `PATCH/DELETE /api/me/favorite-folders/{id}`
- `GET /api/me/favorites` 支持 `folderId`、`unfiled`、`type`、`region`、`q`、`page` 和 `pageSize`。
- `POST /api/me/favorites` 接受可选 `folderIds: string[]`，重复目标采用幂等合并语义。
- `PATCH /api/me/favorites/{id}` 原子替换 `folderIds`。
- `PATCH /api/me/favorites/bulk` 以 `add | remove | replace` 模式批量整理。
- 保留既有单项删除接口。所有接口、分页响应和模型以 `apps/api/openapi/openapi.json` 为公共合约。

## 全图鉴筛选

- 统一列表路由为 `/api/master/{region}/catalogs/{type}`，覆盖 `events`、`songs`、`cards`、`gachas`、`honors`、`materials`、`costumes`、`stamps`、`comics`。旧通用路由和旧单值参数继续兼容。
- 多选参数同时接受重复查询参数与逗号分隔值。同一普通维度内按 OR，不同维度间按 AND；活动 `bonusCharacterIds` 按 Moesekai 行为使用 ALL 匹配。
- 活动支持活动类型、活动组合、加成角色、看板角色和加成属性。
- 歌曲支持组合标签及 MV/歌曲分类。
- 卡牌支持角色、组合、支援组合、属性、稀有度、供给类型和技能类型。
- 卡池支持卡池类型、Pickup 角色和组合；Pickup 必须从真实 `gachaPickups` 派生，禁止把全部卡池详情误判为 Pickup。
- 称号支持称号类型、稀有度和同组只显示一次。
- 素材支持素材类型和仅可使用；“可使用”必须包含 master 中的 `canUse` 语义。
- 服装支持角色、组合、部件、来源、稀有度、性别和仅关联卡牌。
- 贴纸支持贴纸类型、角色和组合；角色/组合应从 `characterId1`、`characterId2`、`gameCharacterUnitId` 等真实关系派生。
- 漫画支持漫画类型。
- 每个分页响应包含 `filterMeta` 和 `appliedFilters`。筛选组选项包含稳定值、易读名称、数量、匹配模式、`iconKey`、颜色和可用图片候选。
- Facet 数量必须基于搜索词和其他筛选维度计算，但忽略当前维度自身，避免选择一个值后同组其他选项错误消失。
- 角色、组合、属性和稀有度优先使用图标或颜色；其他枚举使用易读标签。复用外部项目的实际图标或资源时，必须同步更新第三方来源声明。
- 同步数据包含筛选所需的 `musicTags`、`cardSupplies`、技能字段、活动加成/组合/看板角色及集合图鉴派生字段。缺失数据必须保持明确的 unavailable/missing 语义，禁止编造选项。

## Web 收藏与筛选交互

- 所有九类图鉴使用 `apps/web/src/components/CatalogFilterPanel.tsx` 统一渲染筛选。桌面使用可展开面板，窄屏使用底部抽屉式布局。
- 筛选状态同步到 URL。搜索采用约 250ms 防抖，筛选立即应用，任一查询条件变更后回到第一页；刷新、浏览器前进/后退和复制 URL 后必须能够恢复搜索、筛选、开关、页码与每页数量。
- “往期活动”是正式活动图鉴，不再是临时入口，并使用统一筛选与收藏。
- 图鉴列表卡片以及歌曲、卡牌、活动和集合详情均提供收藏按钮。登录用户可以同时选择多个收藏夹；未登录用户跳转登录，并通过安全的 `returnTo` 返回原页面。
- `/me/favorites` 提供收藏夹创建、改名、删除、全部/未分类视图、搜索、类型/区服筛选、多选和批量添加、移除或替换收藏夹。
- 收藏和整理操作采用乐观更新，接口失败必须回滚。失效目标展示明确状态，同时保留整理和删除能力。

## React 渲染、折叠状态与滚动位置约束

- 不要在 `App` 或其他频繁重渲染的组件内部声明一个临时 React 组件，再以 `<NestedComponent />` 方式渲染筛选页面。函数会在父组件每次渲染时产生新的组件类型，React 会卸载并重新挂载整个子树，导致内部状态、焦点和滚动锚点丢失。本实现中的图鉴页面辅助函数必须直接调用，或在需要组件化时移到模块顶层并保持稳定身份。
- 不要把 `<details open={!narrow}>` 作为桌面默认展开的实现。`open` 属性一旦由固定表达式控制，用户手动收起后，任何筛选结果、URL 或父状态更新都会重新强制展开。
- `CatalogFilterPanel` 必须用独立 state 保存用户当前的展开/收起状态，并通过 `onToggle` 与原生 `<details>` 状态同步。响应式断点只在屏幕宽度真正跨过断点时重设默认状态，禁止在数据刷新或普通重渲染时重设。
- 搜索、切换筛选、清空筛选、分页以及 URL `replace` 不得主动调用 `window.scrollTo(0, 0)`，也不得通过更换 `key`、临时组件类型或条件性根节点使图鉴区域重新挂载。
- 更新 Facet 数量和结果列表时，应保持筛选面板 DOM 身份稳定。收起的筛选框必须保持收起，展开的筛选框必须保持展开，当前页面滚动位置不得因上方筛选区域突然改变高度而跳回顶部。
- 后续修改统一筛选组件或 `LegacySections`/图鉴路由时，必须回归验证：在页面中部收起筛选框，连续选择和取消多个条件、输入搜索词、切换分页，并确认折叠状态和滚动位置始终保持。

## 验证与测试要求

- 数据库测试覆盖历史重复收藏合并、未分类保留、关联级联、跨用户隔离、收藏夹唯一名称和收藏目标唯一约束。
- API 测试覆盖幂等创建、多收藏夹、空文件夹集合、批量整理、并发版本冲突、失效目标和所有新增收藏类型。
- 筛选测试逐类覆盖多选 OR/AND、活动角色 ALL、Facet 自身维度忽略、搜索组合、分页、排序和旧参数兼容。
- Web 回归覆盖列表/详情收藏、登录回跳、收藏夹 CRUD、未分类、批量整理、URL 恢复、移动端筛选，以及折叠状态和滚动位置保持。
- 提交前至少执行 API 合约测试、Web/API 构建、OpenAPI 导出及一致性检查、编码检查和本地 smoke。`scripts/smoke-local.mjs` 必须在测试子进程中禁用 SMTP 并使用开发验证码，禁止本地 smoke 意外发送真实邮件。
- 数据库迁移最终仍需使用一次性真实 PostgreSQL 实例执行验收。若本机 Docker daemon 不可用，必须明确记录该环境限制，不能把 MemoryStore 测试描述为 PostgreSQL 迁移已通过。
