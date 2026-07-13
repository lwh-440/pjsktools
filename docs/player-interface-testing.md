# Player interface verification

Run the five-region player-interface matrix from the repository root:

```bash
npm run verify:player-interfaces
```

The command builds the API, forces the in-memory store, removes `DATABASE_URL` from the test process, and writes timestamped JSON and Markdown summaries under `artifacts/player-interface/`. It exits non-zero when a release-blocking check fails. Full Suite payloads, access tokens, passwords, and email verification codes are never written to the reports.

Useful options can be passed to the underlying driver:

```bash
node scripts/verify-player-interfaces.mjs --skip-cn
node scripts/verify-player-interfaces.mjs --report-dir artifacts/player-interface
node scripts/verify-player-interfaces.mjs --suite-base https://suite-api.haruki.seiunx.com/public
```

`--skip-cn` runs the public ranking/profile matrix without the two CN import and tool-chain cases. The CN profile-analysis endpoint is executed in an isolated child process with the default Node heap limit so an out-of-memory regression is captured as a structured release blocker without losing results from the other endpoints.

The fixed UID inventory lives in `scripts/player-interface-cases.mjs`. JP/EN ranking event IDs and ranks are dated baselines: the verifier discovers the current event first and treats a changed event as baseline rotation instead of claiming that an old UID belongs to the new leaderboard. TW/KR public UIDs are source-coverage probes only and are never used for writes or friend requests.

The single-CN diagnostic remains available:

```bash
npm run verify:real-uid
node scripts/verify-real-uid.mjs --region cn --uid 7485933994513767206
node scripts/verify-real-uid.mjs --region cn --uid 7485929717040896807 --profile-analysis run
```

The last form is the isolated pressure probe and must complete with the default Node heap limit.

An upstream profile `404` means that the player has not uploaded data to the public database or has not enabled public access. The report records this as `expected-missing`, not as an invalid UID or a release failure. TW/KR Suite gaps confirmed against Moesekai's Haruki Suite dependency are recorded as `known-source-gap` and are not backfilled from another region.
