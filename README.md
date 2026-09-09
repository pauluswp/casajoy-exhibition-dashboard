# CasaJoy Cloudflare migration

This directory contains the private online dashboard deployment. D1 is the authoritative online database; the local JSON database remains a backup/source artifact.

## What exists

- `wrangler.toml`: Worker D1/R2 bindings, variables, and scheduled backup configuration.
- `migrations/0001_initial.sql`: contacts and edit-history schema.
- `scripts/make-seed.mjs`: converts the local `exhibition_dashboard/contacts.json` into a private D1 seed file.
- `src/worker.js`: authenticated record/image API with field allow-list, edit history, optimistic concurrency checks, and scheduled backups.
- `site/_worker.js`: Pages advanced-mode shell and same-origin API proxy.
- `site/admin.html` and `site/admin.js`: Access-protected administrator screen for creating and managing editor accounts.

## Generate the migration seed

From the workspace root:

```powershell
node "cloudflare/scripts/make-seed.mjs"
```

This creates `cloudflare/private/seed.sql`. It contains customer contact data and must not be committed or uploaded to a public repository.

## Current deployment state

- Worker API: `https://casajoy-exhibition-api.uanlejia.workers.dev`
- Pages dashboard: `https://casajoy-exhibition-dashboard.pages.dev`
- Cloudflare Access protects only the `/admin*` path with the `Paulus only` policy; the main dashboard remains publicly reachable.
- D1 contains 59 interactions across 58 companies and is the authoritative online database.
- Editor accounts use PBKDF2 password hashes and 8-hour HttpOnly sessions. The signed-in editor display name is written to `edit_history` for each change.
- `/admin` remains limited to the Paulus Cloudflare Access identity; the Access JWT is verified against the team's published signing keys.
- Pages forwards `/api/*` and private image requests to the Worker using the private `INTERNAL_API_TOKEN` secret.
- R2 bucket `casajoy-exhibition-scans` contains the 96 private form/card scans for `scan-001` through `scan-048`.
- A daily Worker backup runs at 01:00 Jakarta time. During the transition, it writes both the existing 30-day legacy snapshot and an append-only v2 snapshot with a private manifest; v2 data includes sanitized editor metadata but never password material or active sessions.
- `private/d1-initial-recovery-2026-09-08.sql` is the initial SQL recovery snapshot.

Pages deployments use `npx wrangler pages deploy site --project-name casajoy-exhibition-dashboard --branch main --commit-dirty=true` from this directory. The Worker and Pages projects intentionally keep separate Wrangler deployment commands.

## Local Worker checks

The Worker requires Cloudflare Access's authenticated-email header and an allow-list in `ALLOWED_EMAILS`. Copy `.dev.vars.example` to `.dev.vars` for local development and replace the example address. Do not commit `.dev.vars`.

The API uses `If-Match` or a record revision when updating a contact. A stale update receives HTTP 409 instead of silently overwriting a newer edit.

## Verify a private v2 backup

After downloading one v2 backup into a local private directory containing `data.json` and `manifest.json`, verify its checksum, table counts, scan inventory checksum, and absence of password/session material:

```powershell
npm run backup:verify -- private\backup-to-verify
```

Never place the downloaded backup directory inside a tracked path or upload it unencrypted to a third-party drive.

## Local dashboard safety

The existing dashboard at `http://localhost:3000` uses the separate local Node server and local JSON database. Cloudflare development files do not change that workflow. Keep local review work paused once using the online dashboard, because local JSON is no longer the online source of truth.

## First editor account

Open `https://casajoy-exhibition-dashboard.pages.dev/admin` while signed in through the Paulus Cloudflare Access account. Create editor accounts there and share each username/password through a secure channel. Passwords are never seeded in SQL, stored in the browser, or written to source files.

The Cloudflare Access application protects `/admin*` only. The main dashboard is publicly reachable, while its data and image APIs continue to require an editor session.
