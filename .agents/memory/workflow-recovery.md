---
name: Workflow/artifact registry desync recovery
description: What to do when artifact.toml + code exist on disk but listWorkflows()/listArtifacts() return empty and screenshot/restart_workflow can't find anything.
---

Symptom: a project has fully-built artifacts (code, `.replit-artifact/artifact.toml`, DB schema) but `listWorkflows()`, `listArtifacts()` return `[]`, `restart_workflow` says the command doesn't exist, and `screenshot(app_preview)` can't find the artifact dir. This happens when a session starts against an existing repo whose workflow/artifact registry wasn't carried over (e.g. fresh container, no fixture install yet).

**How to apply:** Don't try to re-register through `createArtifact` (fails: slug already exists) — instead:
1. `pnpm install` at the repo root (node_modules is often missing after a fresh checkout).
2. `pnpm --filter @workspace/db run push` to sync the DB schema if a Drizzle `db` package exists.
3. Read each `artifacts/<slug>/.replit-artifact/artifact.toml` to get the exact `localPort` / `PORT` / `BASE_PATH` values, then use `configureWorkflow()` to start each service with those same ports inlined into the command (e.g. `PORT=22025 BASE_PATH=/ pnpm --filter @workspace/<slug> run dev`). Matching the toml's declared port is what makes the external proxy (`$REPLIT_DEV_DOMAIN`) route correctly, even though the artifact metadata registry itself may stay empty.
4. Verify with `curl https://$REPLIT_DEV_DOMAIN/` and the API health path directly — the `screenshot` tool may keep failing ("Valid artifact_dir_name values: .") even after the app is fully functional, since it depends on the same stale registry. Don't block on it; curl-based verification is sufficient.
