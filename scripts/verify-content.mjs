import { buildApp } from "../apps/api/dist/app.js";

const regions = ["jp", "en", "tw", "kr", "cn"];
const storyGroups = ["eventStories", "unitStories", "cardEpisodes", "specialStories"];
const failures = [];
const report = {};
const app = await buildApp();

async function get(url) {
  const response = await app.inject({ method: "GET", url });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`${url}: ${response.statusCode} ${response.body}`);
  }
  return response.json();
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

function checkRegionUrls(region, value, label) {
  const text = JSON.stringify(value);
  for (const other of regions.filter((candidate) => candidate !== region)) {
    if (text.includes(`/sekai-${other}-assets/`)) failures.push(`${region}:${label}: cross-region asset ${other}`);
  }
  if (region === "tw" && text.includes("/sekai-tc-assets/")) failures.push(`${region}:${label}: legacy sekai-tc-assets path`);
}

try {
  for (const region of regions) {
    const status = await get(`/api/master/${region}/content-status`);
    const fixtureCatalog = await get(`/api/master/${region}/mysekai/catalog/fixtures?page=1&pageSize=4`);
    const materialCatalog = await get(`/api/master/${region}/mysekai/catalog/materials?page=1&pageSize=4`);
    const blueprintCatalog = await get(`/api/master/${region}/mysekai/catalog/blueprints?page=1&pageSize=4`);
    if (!fixtureCatalog.total || !materialCatalog.total || !blueprintCatalog.total) failures.push(`${region}: MySekai catalog is incomplete`);
    checkRegionUrls(region, [fixtureCatalog.items, materialCatalog.items, blueprintCatalog.items], "mysekai");

    const fixture = fixtureCatalog.items.find((item) => item.imageCandidates?.length) ?? fixtureCatalog.items[0];
    const fixtureDetail = fixture ? await get(`/api/master/${region}/mysekai/catalog/fixtures/${fixture.id}`) : null;
    if (fixture && !fixtureDetail?.item) failures.push(`${region}: fixture detail missing`);

    const exchanges = await get(`/api/master/${region}/exchanges/context`);
    if (!exchanges.summaries?.length || !exchanges.items?.length) failures.push(`${region}: exchange catalog is empty`);
    if (["materialExchanges", "exchangeItems", "exchanges"].some((name) => JSON.stringify(exchanges.warnings ?? []).includes(name))) {
      failures.push(`${region}: exchange catalog still requests a removed collection`);
    }
    if (!exchanges.items?.some((item) => item.rewards?.length && item.costs?.length)) failures.push(`${region}: exchange rewards or costs were not resolved`);
    const exchangeResources = exchanges.items?.flatMap((item) => [...rows(item.rewards), ...rows(item.costs)]) ?? [];
    for (const type of ["coin", "jewel", "virtual_coin", "practice_ticket", "skill_practice_ticket"]) {
      const resource = exchangeResources.find((item) => item.resourceType === type);
      if (!resource) continue;
      if (!resource.imageCandidates?.length || resource.assetStatus !== "matched") failures.push(`${region}: ${type} exchange image missing`);
      if (String(resource.name).includes("#0") || String(resource.name).startsWith(`${type} `)) failures.push(`${region}: ${type} exchange name unresolved`);
    }
    for (const type of ["boost_item", "gacha_ticket"]) {
      const resource = exchangeResources.find((item) => item.resourceType === type);
      if (!resource) continue;
      if (resource.lookupStatus !== "matched" || resource.assetStatus !== "reference-no-image") failures.push(`${region}: ${type} reference fallback mismatch`);
    }
    const exchange = exchanges.items?.find((item) => item.rewards?.length && item.costs?.length) ?? exchanges.items?.[0];
    const exchangeDetail = exchange ? await get(`/api/master/${region}/exchanges/${exchange.id}`) : null;
    if (!exchangeDetail?.item) failures.push(`${region}: exchange detail missing`);
    checkRegionUrls(region, exchangeDetail, "exchanges");

    const missions = await get(`/api/master/${region}/missions/context`);
    for (const group of ["normal", "beginner", "character", "honor"]) {
      if (!rows(missions.groups?.[group]).length && missions.groupStatus?.[group] !== "not-released") failures.push(`${region}: mission group ${group} is empty without not-released status`);
    }
    if (JSON.stringify(missions).includes("characterMissions.json")) failures.push(`${region}: missions still reference removed characterMissions.json`);
    const characterMission = rows(missions.groups?.character).find((item) => rows(item.stages).length > 1 && item.character?.name);
    if (!characterMission || !characterMission.maxRequirement || characterMission.lookupStatus !== "matched") failures.push(`${region}: character mission V2 stages were not resolved`);
    const fixedMission = [...rows(missions.groups?.normal), ...rows(missions.groups?.beginner), ...rows(missions.groups?.honor)].find((item) => rows(item.rewards).length);
    if (!fixedMission) failures.push(`${region}: mission rewards were not resolved`);
    if (JSON.stringify(missions.groups).match(/\{(?:requirement|progress|name)\}/)) failures.push(`${region}: mission placeholder remains unresolved`);
    checkRegionUrls(region, missions.groups, "missions");

    const liveCatalog = await get(`/api/master/${region}/virtual-lives/context`);
    const live = liveCatalog.items?.find((item) => item.setlistCount > 0) ?? liveCatalog.items?.[0];
    const liveDetail = live ? await get(`/api/master/${region}/virtual-lives/${live.id}/full`) : null;
    if (!live || !liveDetail?.live || !Array.isArray(liveDetail.setlists)) failures.push(`${region}: virtual live detail missing`);
    if (liveDetail?.playbackLoading !== "deferred") failures.push(`${region}: virtual live detail is not deferred`);
    checkRegionUrls(region, liveDetail, "virtual-live");

    const information = await get(`/api/master/${region}/information`);
    const informationItem = information.items?.find((item) => item.bannerImageCandidates?.length || item.raw?.bannerImageCandidates?.length) ?? information.items?.[0];
    const informationDetail = informationItem ? await get(`/api/master/${region}/information/${informationItem.id}`) : null;
    if (["jp", "cn"].includes(region) && !informationDetail) failures.push(`${region}: information detail missing`);
    if (region === "jp" && informationDetail?.embedStatus === "ready" && !informationDetail.embeddedDetailUrl?.startsWith("/api/master/jp/information-content/")) failures.push(`${region}: static information detail URL missing`);
    if (["jp", "cn"].includes(region)) {
      const externalItem = information.items?.find((item) => item.raw?.browseType === "external");
      const externalId = String(externalItem?.raw?.id ?? externalItem?.id ?? "");
      const externalDetail = externalId ? await get(`/api/master/${region}/information/${externalId}`) : null;
      if (!externalDetail || externalDetail.embedStatus !== "external-only" || externalDetail.embeddedDetailUrl) failures.push(`${region}: external information was classified as embedded`);

      const internalItem = information.items?.find((item) => item.raw?.browseType === "internal");
      const internalId = String(internalItem?.raw?.id ?? internalItem?.id ?? "");
      const internalDetail = internalId ? await get(`/api/master/${region}/information/${internalId}`) : null;
      if (!internalDetail || internalDetail.embedStatus !== "ready" || !internalDetail.embeddedDetailUrl) failures.push(`${region}: internal information was not classified as embedded`);
      if (internalDetail?.embeddedDetailUrl) {
        const contentResponse = await app.inject({ method: "GET", url: internalDetail.embeddedDetailUrl });
        if (contentResponse.statusCode !== 200 || !String(contentResponse.headers["content-type"]).includes("text/html")) failures.push(`${region}: embedded information did not return HTML`);
        if (contentResponse.body.includes('"statusCode"') || contentResponse.body.includes("Static information content is unavailable")) failures.push(`${region}: embedded information exposed a JSON error`);
      }
    }
    if (region === "jp" && informationItem) {
      const candidates = informationItem.bannerImageCandidates ?? informationItem.raw?.bannerImageCandidates ?? [];
      if (!candidates.some((url) => String(url).endsWith(".png"))) failures.push(`${region}: information PNG banner candidate missing`);
      if (!candidates.some((url) => String(url).startsWith("/api/assets/proxy?url="))) failures.push(`${region}: information proxy fallback missing`);
    }
    if (!["jp", "cn"].includes(region) && status.modules.information.status !== "not-released") failures.push(`${region}: information should be not-released`);

    const storyContext = await get(`/api/master/${region}/stories/context`);
    const stories = {};
    for (const group of storyGroups) {
      const story = rows(storyContext.groups?.[group])[0];
      if (!story) {
        stories[group] = "not-released";
        continue;
      }
      const storyId = String(story.id ?? story.storyId ?? story.scenarioId ?? story.unit ?? story.assetbundleName ?? "");
      const playback = await get(`/api/master/${region}/stories/${group}/${encodeURIComponent(storyId)}/playback`);
      const state = playback.unavailableReason ? "missing-resource" : rows(playback.actions).length ? "scenario-parsed" : "missing-resource";
      stories[group] = state;
      if (playback.renderAcceptance?.status !== "pending-browser-validation" && !playback.unavailableReason) failures.push(`${region}:${group}: render acceptance policy missing`);
      if (rows(playback.live2dModels).length > 12) failures.push(`${region}:${group}: excessive model preload ${playback.live2dModels.length}`);
      checkRegionUrls(region, playback, `story-${group}`);
    }

    const live2d = await get(`/api/master/${region}/live2d/models`);
    if (live2d.sourceMetadata?.scope !== "global-shared-model-asset") failures.push(`${region}: Live2D scope missing`);

    report[region] = {
      modules: status.modules,
      mysekai: { fixtures: fixtureCatalog.total, materials: materialCatalog.total, blueprints: blueprintCatalog.total },
      virtualLive: { total: liveCatalog.total, sampleId: live?.id, setlists: liveDetail?.setlists?.length ?? 0 },
      information: { total: information.items?.length ?? 0, detail: Boolean(informationDetail) },
      exchanges: { total: exchanges.total, summaries: exchanges.summaries?.length ?? 0, rewardCoverage: exchanges.rewardCoverage },
      missions: missions.summary,
      stories
    };
  }
} finally {
  await app.close();
}

console.log(JSON.stringify({ content: report }, null, 2));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Five-region real content verification passed.");
