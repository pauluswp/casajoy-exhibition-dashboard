# CasaJoy Dashboard - Version History & Release Notes

## 📋 Quick Summary of What's Changed

| Version | Date | Changes |
|---------|------|---------|
| v1.2.4 | September 15, 2026 | Added backup/rollback system and version tracking |
| v1.2.3 | September 14, 2026 | Initial production deployment |

---

## 🔥 Latest Update - v1.2.4 (September 15, 2026)

### 🎯 Summary of Changes
**Primary Change:** Added complete version control system with automatic rollback capability

📝 **Technical Details:**
See full deployment logs in Cloudflare Dashboard

---

### What You'll Notice:
✅ **New Features**
- Backup automation before every deployment
- One-command rollback system ("Hey, can you rollback to v1.2.3?")
- Version tracking document (this file!)

⚙️ **Improvements**  
- Enhanced security for database backups
- Better error handling on login page

🐛 **Bug Fixes**
- Fixed button hover shadow effects (now visible when testing locally)
- Sign-in button now properly enabled in local testing mode

---

### Before Any New Change, We Create Backup Like This:
```bash
./scripts/deploy-guard.sh preview
# Creates: private/backup-20260915-143000/
# Contains: Git state + database export
```

### If Something Breaks, Rollback Is Simple:
```bash
node scripts/rollback-helper.mjs v1.2.4
# Everything restored! Done in < 2 minutes
```

---

## Previous Versions

### v1.2.3 - September 14, 2026
**Status:** Production deployment

#### Major Updates:
- ✅ Cloudflare Pages integration complete
- ✅ Admin authentication system functional
- ✅ D1 database connected with sample contacts
- ✅ Contact register with searchable table
- ✅ QR code scan functionality
- ✅ Export to Excel (.xlsx) feature
- ✅ Review queue for pending items
- ✅ Cloudflare Access tokens implemented
- ✅ PBKDF2 password hashing for admin users

---

## Version Format Guide

Each version follows this pattern:
```
vMAJOR.MINOR.PATCH-YYYYMMDD-HHMMSS

Example: v1.2.4-20260915-143000
         ↑    ↑    ↑     ↑          ↑
         │    │    │     │          └─ Time created
         │    │    │     └──────────── Date created  
         │    │    └────────────────── Bug fix / Patch
         │    └─────────────────────── Minor feature addition
         └──────────────────────────── Major redesign
```

---

## How To Read Change Summaries

When you see:

```
v1.3.0 - October 1, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎨 Visual Changes
• Updated button colors from blue to purple
• Dark mode toggle added to header

✅ Functional Changes
• Export function works offline now
• Search filters are case-insensitive

⚠️ Known Issues
• Mobile menu occasionally doesn't open
```

This tells you:
- What looks different (visual/UI)
- What works differently (functional improvements)  
- What problems exist (known issues to watch for)

No backend code changes shown unless they affect how you use it.

---

## Current Status

**Active Development Branch:** `main`  
**Latest Version Tag:** Check status with: `node scripts/status-checker.mjs`  
**Next Scheduled Update:** When requested

---

## Want To See Full Detail?

Ask anytime:
```
"Tell me current version" 
→ Shows latest version tag and recent changes

"Show me all available versions"
→ Lists everything we've deployed

"What changed in v1.2.3?"
→ Shows detailed changelog for that version
```

