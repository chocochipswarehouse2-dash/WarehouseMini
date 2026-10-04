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

## 4. WMS Stock Opname (SO) Blueprint & Calculation Standard

### A. Core Principles
- **Unit of Calculation**: Every Stock Opname queue is calculated strictly **per scan invoice with type `SO`** (from WA `#SO`, Web Scanner, or CSV/Excel import).
- **Full Location Reconciliation**: The scan invoice represents the **exhaustive physical reality** of the specified location(s) at that time.
- **Unscanned Items (0-Scan Rule)**: Any SKU recorded in the database (`stok_real_fisik`) at that location that is **NOT scanned** during that SO session is deemed to have **`Scan Fisik = 0`**.
- **Target Equilibrium**: Upon approval, the final physical stock in the database for that location **MUST MATCH THE PHYSICAL SCAN EXACTLY**.

### B. Standard Formula
$$\mathbf{Selisih\ /\ Adjustment} = \mathbf{Scan\ Fisik} - \mathbf{Stok\ Sistem\ Database}$$
- **Selisih > 0 (+)** $\rightarrow$ **`ADJ_IN`** (Add stock to match physical reality)
- **Selisih < 0 (-)** $\rightarrow$ **`ADJ_OUT`** (Deduct stock to match physical reality)
- **Selisih = 0** $\rightarrow$ Matched / In Sync (No adjustment log created)

### C. Standard Calculation Truth Table
| No | Scenario | Stok Sistem (DB) | Scan Fisik (SO) | Formula ($Scan - Sistem$) | Action upon Approval | Final Stock |
|---|---|:---:|:---:|:---:|:---:|:---:|
| 1 | Unscanned item (lost/zeroed) | `1` | `0` | $0 - 1 = \mathbf{-1}$ | `ADJ_OUT (1)` | `0` |
| 2 | Newly discovered item in rack | `0` | `1` | $1 - 0 = \mathbf{+1}$ | `ADJ_IN (1)` | `1` |
| 3 | Physical count higher | `2` | `5` | $5 - 2 = \mathbf{+3}$ | `ADJ_IN (3)` | `5` |
| 4 | Physical count lower | `5` | `3` | $3 - 5 = \mathbf{-2}$ | `ADJ_OUT (2)` | `3` |
| 5 | Negative DB anomaly, physical empty | `-2` | `0` | $0 - (-2) = \mathbf{+2}$ | `ADJ_IN (2)` | `0` |
| 6 | Negative DB anomaly, physical found | `-1` | `3` | $3 - (-1) = \mathbf{+4}$ | `ADJ_IN (4)` | `3` |
| 7 | In sync | `4` | `4` | $4 - 4 = \mathbf{0}$ | Skip (no adjustment) | `4` |

### D. Multi-Channel Ingestion Standards
All 3 ingestion methods MUST follow the exact same reconciliation blueprint:
1. **WhatsApp Ingestion**: `#SO [Lokasi]` $\rightarrow$ logged as `log_produk (type: 'SO')` $\rightarrow$ auto-reconciled against all items in `stok_real_fisik` for that `lokasi`.
2. **Web Scanner Ingestion**: Operator selects SO mode $\rightarrow$ scans items for a rack $\rightarrow$ auto-reconciled against all items in `stok_real_fisik` for that `lokasi`.
3. **CSV/Excel Ingestion**: User uploads CSV/Excel containing columns `SKU`, `Qty`, `Lokasi` $\rightarrow$ auto-reconciled against all items in `stok_real_fisik` for the specified location(s).

## 5. WMS Core Flow (IN, OUT) & Picking Task Sync Blueprint

### A. The Supremacy of `log_produk` (Single Source of Truth)
- **Append-Only Ledger**: `log_produk` is the immutable ledger for all movements (IN, OUT, SO, ADJ).
- **Equal Ingestion Channels**: WhatsApp (WA), Web App Scanner, and CSV Import are strictly ingestion channels. They share the same hierarchy and logic rules.
- **HARD CONSTRAINT (NO AUTO-ADJUSTMENT)**: During normal operations (Picking, Inbound, Outbound), agents and systems are **STRICTLY FORBIDDEN** from automatically generating shadow `#IN` or `#OUT` mutations to artificially balance stock. All physical stock mutations MUST originate from explicit physical operator scans.
- **SOLE EXCEPTION**: The system is ONLY permitted to inject automated mutation data (`ADJ_IN` or `ADJ_OUT`) strictly when the "Approve Stock Opname" function is executed by an authorized user, to force database stock to match the physical reality.

### B. The Picking Task Sync (Explicit Invoicing)
- **Entity Definitions**:
  - `no_sj` (e.g., 26.10.00010) is a Business Document ID. It is NOT guaranteed to be globally unique (may be duplicated across routes).
  - **`invoice_picking`** (e.g., WA20261003IZZO) is a Queue Registration ID. It is **GUARANTEED UNIQUE** and is auto-generated by the system *when a request module (Refill, SPS, Shopee) registers a task into the Picking Queue*.
- **HARD CONSTRAINT (NO GUESSWORK)**: The system MUST use `invoice_picking` to correlate WA scans (e.g., `#OUT WA20261003IZZO`) with Picking targets. Agents are FORBIDDEN from using `no_sj`, location, or timestamps to infer correlations.

### C. Anomaly Resolution & Self-Healing
The WMS acts purely as a stateless calculator and notification auditor.
- **Under-pick Scenario**: Fonnte WA alerts operator $\rightarrow$ Operator physically retrieves item $\rightarrow$ Operator scans `#OUT [invoice_picking]`.
- **Wrong/Over-pick Scenario**: Fonnte WA alerts operator $\rightarrow$ Operator physically returns item to shelf $\rightarrow$ Operator scans standard `#IN`.
- **HARD CONSTRAINT (HUMAN ACCOUNTABILITY)**: The system is FORBIDDEN from automatically closing anomalies. It only recalculates the `invoice_picking` totals and updates the warning status (e.g., "Still missing 2"). Final task resolution is the absolute responsibility of the human operator.

## 6. System Restore Points (Safe Fallback)
If the system becomes unstable or logic breaks during the implementation of the "Smart Picking & WA Sync" architecture, agents MUST offer the user to revert to the pre-picking-sync stable state.
- **Git Tag**: `restore-point-pre-picking-sync`
- **Agent Instruction**: To rollback, execute `git reset --hard restore-point-pre-picking-sync` and push force if necessary, then confirm GAS/Supabase states. This tag guarantees a pristine state before any Picking/WA sync codebase changes were made.

## 7. WMS Area & Location Prioritization Blueprint

### A. Location Definitions & Mapping
All location string inputs MUST be strictly mapped to their respective areas using the master function (`getAreaFromLokasi`).
- **Warehouse**: `A001`-`A100`, `B001`-`B100`, `C001`-`C100`, `D001`-`D100`
- **Aksesoris**: `BELT...`, `CARD...`, `GIFT...`, `BOX...`
- **Transit**: `X` / `TRANSIT`
- **Kolian**: `R0...`, `V0...`, `Z0...`
- **Blok F**: `TIKTOK`, `SHOPEE`, `STUDIO`
- **Perbaikan**: `CC...` (Cuci), `PMK...` (Permak), `DF...` (Defect)
- **Anomaly**: Any location string not fitting the above patterns MUST be flagged as an anomaly.

### B. Picking Prioritization Hierarchy
Agents modifying UI sorting or task allocation MUST strictly enforce the following hierarchy (Priority 1 = Top):
1. **Priority 1**: Warehouse + Aksesoris + Transit
2. **Priority 2**: Kolian
3. **Priority 3**: Blok F
4. **Priority 4 (Fallback)**: Empty / Null locations
5. **DO NOT PICK**: `Perbaikan` (Cuci, Permak, Defect) and `Anomali` areas are strictly excluded from automated picking recommendations.

*Note: The frontend UI must display ALL valid picking locations simultaneously (grouped/sorted by priority) so that pickers have full visibility if Priority 1 stock is insufficient.*
