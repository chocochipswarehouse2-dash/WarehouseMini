---
name: pre-task-sync
description: Mandates pulling latest changes from GitHub and verifying Google Apps Script (GAS) live status before beginning any analysis, planning, or code modifications.
---

# Pre-Task Synchronization & Status Verification Skill

This skill guarantees that any agent working on the WMS Inventory project ALWAYS starts with the freshest state from GitHub and Google Apps Script, preventing stale context, race conditions, or overwriting remote changes.

## When to Execute
Trigger this workflow **BEFORE** starting any task, analysis, planning, investigation, or code modification:
- When the user asks for an investigation or analysis.
- When drafting an implementation plan or proposal.
- When preparing to modify code in `src/`, `gas/`, or database scripts.

---

## Standard Execution Procedure

### Step 1: Pull Latest Commits from GitHub
Always synchronize the local workspace with the remote `origin/main` branch:
```bash
git pull --rebase
```
If there are unstaged changes from previous work, stash them temporarily (`git stash`), rebase, and restore (`git stash pop`).

---

### Step 2: Verify Google Apps Script (GAS) Live Status
Check the status, active version, and deployment of the live Google Apps Script project:
```bash
node tools/gas_status.cjs
```
This confirms:
- The Google OAuth token is valid and active.
- The live GAS project version and deployment ID are reachable.
- Any recent remote changes in Apps Script are accounted for.

---

### Step 3: Align Before Analysis
Only proceed to research, analysis, planning, or code edits after both GitHub and GAS statuses have been confirmed synchronized and up to date.
