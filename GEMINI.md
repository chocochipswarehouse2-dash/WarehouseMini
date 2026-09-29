# Antigravity Agent Guidelines

These rules apply to all tasks and agents working on the WMS Inventory project:

## 1. Pre-Task: Always Sync with GitHub & Check GAS Status
Before starting any analysis, planning, edits, or commands:
1. **Pull Git Updates**: Run `git pull --rebase` to ensure the local repository has the latest commits from `origin/main`.
2. **Check GAS Live Status**: Run `node tools/gas_status.cjs` to check Google Apps Script deployment version and connectivity.

## 2. Supabase Migration & Schema Synchronization
Whenever database schemas, table structures, or payload models are updated (whether from git pull, changes to `src/services/supabase.ts`, `.sql` files, TypeScript interfaces in `src/types/`, or GAS sync logic):
- Immediately review and update Supabase migration modules (e.g., `migrate.js`, `tools/migrate-supabase.cjs`, and `test-webhook.ts`).
- Ensure all column mappings, field names, and payload structures match the latest schema specifications.

## 3. Post-Task: Build, Auto-Deploy & Proactive Status Reporting
Whenever modifications are completed, execute the full deployment lifecycle without waiting for user prompts:
1. **Validate Build**: Run `npm run build` to verify that there are no compilation or bundling errors.
2. **Deploy Google Apps Script (GAS)**: If any file under `gas/` or GAS deployment scripts was touched, run:
   ```bash
   node tools/gas_deploy.cjs
   ```
   Confirm new project version and active deployment update.
3. **Commit & Push (Vercel)**: Stage changes, commit with a concise conventional commit message, and push to GitHub:
   ```bash
   git push origin main
   ```
4. **Mandatory Proactive Deployment Status**: ALWAYS include a dedicated `### 🚀 Deployment Status` table in the response detailing:
   - Git Commit Hash & Message
   - GitHub / Vercel auto-deploy status
   - Google Apps Script version & deployment status
   The user must never need to ask whether changes are deployed.
