---
description: Standard workflow rules for Git pull on start, Supabase migration synchronization, build & auto-deploy (Vercel & GAS), and proactive status reporting on completion.
---

# Mandatory Agent Workflow Rules

Every Antigravity agent working on this repository MUST strictly adhere to the following workflow lifecycle without waiting for explicit user prompts:

## 1. Start of Session / Pre-Task (Sync Git & Verify GAS)
- Before making any code modifications, planning, or running analysis commands:
  1. **Pull Git Updates**:
     ```bash
     git pull --rebase
     ```
  2. **Verify GAS Live Status**:
     ```bash
     node tools/gas_status.cjs
     ```
- This ensures your local workspace is completely synchronized with GitHub and that the Google Apps Script live production environment is reachable and consistent.

## 2. Supabase Migration & Schema Synchronization
Whenever there are schema or data structure changes (whether pulled from remote, modified in DDL scripts like `src/services/supabase.ts`, `.sql` files, TypeScript interfaces in `src/types/`, or GAS synchronization payloads):
- **Automatically Inspect & Update Migration Scripts**: Check all migration modules and utilities (such as `migrate.js`, `tools/migrate-supabase.cjs`, and testing scripts like `test-webhook.ts`).
- **Synchronize Column Mapping**: Ensure field mappings in the migration scripts match the current Supabase tables.
- **Maintain Schema Consistency**: Keep DDL and migration files mutually consistent.

## 3. End of Session / Post-Task (Build, Auto-Deploy & Status Reporting)
Whenever code modifications or fixes are completed:
1. **Validate Build**: Always verify that the project builds cleanly by running:
   ```bash
   npm run build
   ```
   Fix any syntax, import, or build errors before proceeding.
2. **Deploy Google Apps Script (GAS)**: If any file under `gas/` or GAS tools was touched:
   ```bash
   node tools/gas_deploy.cjs
   ```
3. **Commit & Push (Vercel)**: Automatically stage, commit with a descriptive conventional commit message, and push to GitHub:
   ```bash
   git add <modified-files>
   git commit -m "<type>: <concise description of changes>"
   git push origin main
   ```
4. **Mandatory Proactive Deployment Status**: ALWAYS conclude the response with a dedicated `### 🚀 Deployment Status` table detailing commit hash, Vercel status, and GAS version. Never wait for the user to ask.
