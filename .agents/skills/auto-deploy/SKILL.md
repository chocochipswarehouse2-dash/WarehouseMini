---
name: auto-deploy
description: Automatically builds, commits, pushes to GitHub (Vercel), and deploys Google Apps Script (GAS) upon task completion, proactively reporting full deployment status without waiting for user prompts.
---

# Auto-Deploy & Status Verification Skill

This skill enforces seamless, autonomous deployment and mandatory proactive status reporting whenever modifications are completed on the WMS Inventory project.

## When to Execute
Trigger this workflow automatically at the conclusion of every task that modifies source code, database schemas, or GAS scripts:
1. When TypeScript/React frontend files (`src/`) are modified.
2. When Supabase migration/schema files (`supabase_*.sql`, `src/services/supabase.ts`) are updated.
3. When Google Apps Script backend files (`gas/`) are modified.

---

## Standard Execution Procedure

### Step 1: Verification & Build
Always ensure the TypeScript project compiles and bundles with zero errors:
```bash
npm run build
```
If errors occur, resolve them immediately before attempting to commit or deploy.

---

### Step 2: Google Apps Script (GAS) Deployment (If GAS files changed)
If any files inside `gas/` or GAS integration tools were touched:
```bash
node tools/gas_deploy.cjs
```
Verify the output confirms:
- PUSH successful.
- New version created (e.g. Version 879).
- Active Web App deployment updated.

---

### Step 3: Git Commit & Push to GitHub (Vercel)
Stage the modified files, commit with a concise conventional commit message, and push:
```bash
git add <modified-files>
git commit -m "<type>(<scope>): <concise description>"
git push origin main
```
Confirm `git push origin main` exits with code 0 (`main -> main`).

---

### Step 4: Mandatory Proactive Deployment Status Block
Never end a task without presenting this standardized deployment block. The user must never need to ask whether changes are live.

Format in the response:

```markdown
### 🚀 Deployment Status

| Component | Target | Status | Details |
| :--- | :--- | :--- | :--- |
| **Frontend / Web** | GitHub `main` & Vercel | ✅ Deployed | Commit: `<hash>` (`<commit message>`) |
| **Google Apps Script** | GAS Cloud Production | ✅ Deployed / ⚪ No Changes | Version: `<version_number>` (Project: `1kxPON...`) |
| **Database / Supabase**| Supabase Cloud | ✅ Synchronized | Instance: `ilhqerecxbywqrhfpbbc.supabase.co` |
```
