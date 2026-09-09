# Release and backup workflow

This repository is source-only. Customer data, scan images, password material, tokens, local D1 state, and private backup contents stay outside GitHub.

## Normal release

1. Create a feature branch from reviewed `main`.
2. Run local Worker checks against local D1 only, using synthetic or minimal sample data.
3. Deploy Pages to a branch preview and test authentication, reads, edits, conflict handling, image access, export, and administration.
4. Use a separate Worker/staging D1 environment for API or migration changes where practical.
5. Open a pull request and review the exact diff and staged file list.
6. Before a production deployment or remote migration, create and verify a private data backup.
7. Deploy the reviewed `main` commit to Worker and Pages production.
8. Verify health, authentication, reads, edits, images, exports, and admin access.
9. Record the Git commit, Worker version, Pages deployment, migration, and pre-release backup ID together.

## Emergency fix

Use a direct production fix only when necessary. Make the smallest change, verify it, and immediately reconcile the exact deployed change into the normal branch and review process with the production identifiers recorded.

## Backup gates

- Scheduled R2 backups remain enabled.
- Create a private snapshot before each production deployment, remote migration, or bulk data operation.
- Store timestamped append-only snapshots under a versioned prefix with a private `manifest.json`.
- Include backup format, backup ID, schema version, checksums, table counts, code/deployment identifiers, and restore notes in the manifest.
- The v2 D1 payload includes `contacts`, `edit_history`, sanitized `editor_users` metadata, and `auth_audit`; it excludes password hashes/salts, `editor_sessions`, and `login_attempts`.
- The manifest records a sorted private inventory of `scans/` object keys, sizes, ETags, and upload times. Image bytes remain separate R2 objects.
- The legacy `backups/d1-*` path is retained only during transition; v2 snapshots are append-only and are not subject to the legacy 30-day deletion job.
- Never include customer rows, scan contents, passwords, tokens, or backup contents in GitHub or chat.
- Keep a second encrypted copy in Google Drive, OneDrive, or an encrypted external drive. Never upload unencrypted customer data.
- Periodically test restore into a non-production D1 database and verify row counts, history, images, and editor-account behavior.

## D1 recovery

D1 Time Travel is available for this database and should be treated as a fast recovery layer. A restore must be tested on a non-production copy before relying on it operationally. No production restore or migration is part of this baseline setup.

## Backup implementation plan

1. Keep the scheduled private R2 backup running while v2 snapshots are validated. Confirm a v2 `data.json` and `manifest.json` pair exists after a supervised non-production or approved production run.
2. Add deployment metadata to the Worker release procedure so `source_commit`, Pages deployment ID, Worker version ID, and migration state are recorded rather than `unrecorded`.
3. Add a pre-deployment/pre-remote-migration command that creates a uniquely identified snapshot, downloads only the manifest for verification, and records the backup ID in the release record. It must fail closed if the snapshot or manifest cannot be verified.
4. Implement a private R2 scan-object verification/restore procedure using the manifest inventory. Do not expose image bytes through the application or commit an inventory containing customer content to GitHub.
5. Create an operator-run export that encrypts the complete backup locally before copying it to exactly one independent destination (Google Drive, OneDrive, or an encrypted external drive). Use a password manager-generated passphrase; never place the passphrase in source, `.dev.vars`, chat, or the destination filename.
6. Test restore into non-production D1 and R2: apply migrations, import the four included tables, verify counts/checksums and image inventory, then issue fresh editor sessions and reset passwords. Do not restore sessions or login-attempt state.
7. After a successful retention and restore review, choose a long-term v2 retention policy and remove legacy cleanup only in a separately reviewed change.
