# Flipgame v1.12 release control

This local-only dashboard reads the integration repository, the coordinator's
status manifest, the defect ledger, and active v1.12 worktrees. It refreshes the
page every four seconds and reruns the curated smoke suite whenever the
integration commit changes (or after five minutes).

Run from the repository root:

```powershell
node tools/v112-status/server.mjs
```

Then open `http://127.0.0.1:4192/`.

Use another port with `node tools/v112-status/server.mjs --port=4193`. The
server binds only to `127.0.0.1`, uses no network services, and does not enter
the game's boot graph, service worker, web deployment, or APK.

For a machine-readable one-time snapshot:

```powershell
node tools/v112-status/server.mjs --snapshot
```

`docs/v112-status.json` is coordinator-owned release metadata. Git heads,
worktree divergence, dirty state, recent commits, defect rows, integration-log
revision, and test results are computed by the server.
