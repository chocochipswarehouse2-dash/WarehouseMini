# Antigravity Agent Guidelines

These rules apply to all tasks and agents working on the WMS Inventory project:

## 1. Pre-Task: Always Sync with GitHub (Pull First)
Before starting any analysis, edits, or commands:
- Run `git pull --rebase` to ensure the local repository has the latest commits from `origin/main`.

## 2. Supabase Migration & Schema Synchronization
Whenever database schemas, table structures, or payload models are updated (whether from git pull, changes to `src/services/supabase.ts`, `.sql` files, TypeScript interfaces in `src/types/`, or GAS sync logic):
- Immediately review and update Supabase migration modules (e.g., `migrate.js`, `tools/migrate-supabase.cjs`, and `test-webhook.ts`).
- Ensure all column mappings, field names, and payload structures match the latest schema specifications.

## 3. Post-Task: Build & Auto-Deploy (Commit & Push)
Whenever modifications are completed:
- Run `npm run build` to verify that there are no compilation or bundling errors.
- Stage changes and commit with a concise conventional commit message.
- Push to GitHub (`git push origin main`), which triggers automatic deployment via GitHub Actions / Vercel.
- Inform the user of the push and deploy status.
