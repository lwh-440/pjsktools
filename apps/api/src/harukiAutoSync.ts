import { fetchOAuthHarukiSuite, HarukiPlayerDataError } from "./harukiOAuthClient.js";
import { HarukiSuiteValidationError, harukiGroupIsEmpty, normalizeHarukiSuite } from "./harukiPlayerData.js";
import { harukiStore } from "./harukiStore.js";
import { ensureHarukiAccessToken } from "./harukiTokenManager.js";
import { nextPendingEmptyGroups } from "./harukiSyncState.js";

export async function syncDueHarukiBindings() {
  const due = await harukiStore.claimDueAutoSync(20);
  for (const binding of due) {
    try {
      const { accessToken } = await ensureHarukiAccessToken(binding.userId);
      let candidate: ReturnType<typeof normalizeHarukiSuite>;
      try {
        const fetched = await fetchOAuthHarukiSuite(accessToken, binding.region, binding.playerUid, binding.upstreamUploadedAt);
        if (fetched.notModified) {
          await harukiStore.updateSyncFailure(binding.userId, binding.id, "no-change", fetched.uploadTime);
          continue;
        }
        candidate = normalizeHarukiSuite(binding.region, fetched.suite);
      } catch (error) {
        if (error instanceof HarukiSuiteValidationError) throw new HarukiPlayerDataError("invalid-response", 502);
        throw error;
      }
      if (!candidate.sourceSummary.userId || !candidate.sourceSummary.region
        || candidate.sourceSummary.userId !== binding.playerUid
        || candidate.sourceSummary.region !== binding.region) {
        await harukiStore.updateSyncFailure(binding.userId, binding.id, "parse-error");
        continue;
      }
      const nonEmptyGroups = candidate.playerData.filter((group) => !harukiGroupIsEmpty(group.data)).map((group) => group.kind);
      const pendingEmptyGroups = nextPendingEmptyGroups(
        binding.pendingEmptyGroups ?? [],
        candidate,
        Object.fromEntries(candidate.playerData.map((group) => [group.kind, harukiGroupIsEmpty(group.data) ? "keep" : "update"]))
      );
      await harukiStore.applySync({
        userId: binding.userId,
        binding,
        candidate,
        updateCards: candidate.cardsPresent,
        updateGroups: nonEmptyGroups,
        pendingEmptyGroups
      });
    } catch (error) {
      const status = error instanceof HarukiPlayerDataError && error.code === "reauthorize"
        ? "reauthorize"
        : error instanceof HarukiPlayerDataError && error.code === "invalid-response"
          ? "parse-error"
          : "upstream-error";
      if (status === "reauthorize") {
        const connection = await harukiStore.getConnection(binding.userId);
        if (connection && connection.status !== "reauthorize") {
          const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = connection;
          await harukiStore.saveConnection({ ...input, userId: binding.userId, status: "reauthorize" });
        }
      }
      await harukiStore.updateSyncFailure(binding.userId, binding.id, status);
    }
  }
  return { claimed: due.length };
}
