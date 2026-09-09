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
- Never include customer rows, scan contents, passwords, tokens, or backup contents in GitHub or chat.
- Keep a second encrypted copy in Google Drive, OneDrive, or an encrypted external drive. Never upload unencrypted customer data.
- Periodically test restore into a non-production D1 database and verify row counts, history, images, and editor-account behavior.

## D1 recovery

D1 Time Travel is available for this database and should be treated as a fast recovery layer. A restore must be tested on a non-production copy before relying on it operationally. No production restore or migration is part of this baseline setup.
