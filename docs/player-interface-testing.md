# Player interface verification

Run the five-region player-interface matrix from the repository root:

```bash
npm run verify:player-interfaces
```

The command builds the API, forces the in-memory store, removes `DATABASE_URL` from the test process, and writes timestamped JSON and Markdown summaries under `artifacts/player-interface/`. It exits non-zero when a release-blocking check fails. Full Suite payloads, access tokens, passwords, and email verification codes are never written to the reports.

Useful options can be passed to the underlying driver:

```bash
node scripts/verify-player-interfaces.mjs --report-dir artifacts/player-interface
node scripts/verify-player-interfaces.mjs --suite-base https://suite-api.haruki.seiunx.com/public
```

The fixed UID inventory lives in `scripts/player-interface-cases.mjs`. JP/EN ranking event IDs and ranks are dated baselines: the verifier discovers the current event first and treats a changed event as baseline rotation instead of claiming that an old UID belongs to the new leaderboard. TW/KR public UIDs are source-coverage probes only and are never used for writes or friend requests.

The verifier covers the public player and ranking interfaces for JP, EN, TW, KR, and CN, plus invalid-region, invalid-rank, and unauthenticated-request checks. It does not run the removed manual-import, real-user, or profile-analysis flows.

An upstream profile `404` means that the player has not uploaded data to the public database or has not enabled public access. The report records this as `expected-missing`, not as an invalid UID or a release failure. TW/KR Suite gaps confirmed against Moesekai's Haruki Suite dependency are recorded as `known-source-gap` and are not backfilled from another region.
