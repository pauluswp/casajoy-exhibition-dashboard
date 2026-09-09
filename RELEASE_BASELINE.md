# CasaJoy production baseline

This repository baseline is reconstructed from the authenticated Cloudflare production deployment, not from the older local dashboard projects.

## Deployment record

- Captured: 2026-09-09 (UTC)
- Pages project: `casajoy-exhibition-dashboard`
- Pages deployment: `c9081a15-f51e-4ee8-a31d-4f93785b68b3`
- Pages deployment URL: `https://c9081a15.casajoy-exhibition-dashboard.pages.dev`
- Worker: `casajoy-exhibition-api`
- Active Worker version: `aa9ee5bf-aaa1-46dc-8038-a06c89c24325`
- Worker version number: `17`
- Worker URL: `https://casajoy-exhibition-api.uanlejia.workers.dev`
- D1 database: `casajoy-exhibition`
- D1 database ID: `4541e153-1372-48f9-9389-57841d3c3e89`
- R2 bucket: `casajoy-exhibition-scans`
- Remote migrations: no migrations to apply
- D1 Time Travel: available; no restore performed

## Pages asset verification

The eight deployed Pages assets were captured locally and compared byte-for-byte. Seven already matched the local source. The deployed `admin/index.html` was used as the baseline because the local copy had stale relative paths.

The deployment also reports no Pages Functions directory. The Pages deployment files are kept outside this repository in the local quarantine capture.

## Worker verification

The authenticated Worker editor exposed the active compiled bundle. Its embedded source marker is `src/worker.js`, and its deployed behavior matches the readable source committed here, including the latest account-creation audit handling and current scheduled-backup implementation.

Cloudflare reports the Worker version source as Wrangler deployment metadata rather than a source commit. The exact compiled bundle is retained locally outside Git for audit comparison.

## Security boundary

This file contains deployment identifiers and non-sensitive verification notes only. It contains no customer rows, scan contents, password material, active session tokens, API tokens, or private backup contents.
