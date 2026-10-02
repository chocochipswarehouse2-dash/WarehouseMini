---
name: wms-stock-opname
description: Definisi dan standar kalkulasi rekonsiliasi Stock Opname (SO) WMS per lokasi rak penuh (Full Location Reconciliation)
---

# WMS Stock Opname (SO) Blueprint & Calculation Standard

## 1. Core Principles
- **Unit of Calculation**: Every Stock Opname queue is calculated strictly **per scan invoice with type `SO`** (from WA `#SO`, Web Scanner, or CSV/Excel import).
- **Full Location Reconciliation**: The scan invoice represents the **exhaustive physical reality** of the specified location(s) at that time.
- **Unscanned Items (0-Scan Rule)**: Any SKU recorded in the database (`stok_real_fisik`) at that location that is **NOT scanned** during that SO session is deemed to have **`Scan Fisik = 0`**.
- **Target Equilibrium**: Upon approval, the final physical stock in the database for that location **MUST MATCH THE PHYSICAL SCAN EXACTLY**.

## 2. Standard Formula
$$\mathbf{Selisih\ /\ Adjustment} = \mathbf{Scan\ Fisik} - \mathbf{Stok\ Sistem\ Database}$$
- **Selisih > 0 (+)** $\rightarrow$ **`ADJ_IN`** (Add stock to match physical reality)
- **Selisih < 0 (-)** $\rightarrow$ **`ADJ_OUT`** (Deduct stock to match physical reality)
- **Selisih = 0** $\rightarrow$ Matched / In Sync (No adjustment log created)

## 3. Standard Calculation Truth Table
| No | Scenario | Stok Sistem (DB) | Scan Fisik (SO) | Formula ($Scan - Sistem$) | Action upon Approval | Final Stock |
|---|---|:---:|:---:|:---:|:---:|:---:|
| 1 | Unscanned item (lost/zeroed) | `1` | `0` | $0 - 1 = \mathbf{-1}$ | `ADJ_OUT (1)` | `0` |
| 2 | Newly discovered item in rack | `0` | `1` | $1 - 0 = \mathbf{+1}$ | `ADJ_IN (1)` | `1` |
| 3 | Physical count higher | `2` | `5` | $5 - 2 = \mathbf{+3}$ | `ADJ_IN (3)` | `5` |
| 4 | Physical count lower | `5` | `3` | $3 - 5 = \mathbf{-2}$ | `ADJ_OUT (2)` | `3` |
| 5 | Negative DB anomaly, physical empty | `-2` | `0` | $0 - (-2) = \mathbf{+2}$ | `ADJ_IN (2)` | `0` |
| 6 | Negative DB anomaly, physical found | `-1` | `3` | $3 - (-1) = \mathbf{+4}$ | `ADJ_IN (4)` | `3` |
| 7 | In sync | `4` | `4` | $4 - 4 = \mathbf{0}$ | Skip (no adjustment) | `4` |

## 4. Multi-Channel Ingestion Standards
All 3 ingestion methods MUST follow the exact same reconciliation blueprint:
1. **WhatsApp Ingestion**: `#SO [Lokasi]` $\rightarrow$ logged as `log_produk (type: 'SO')` $\rightarrow$ auto-reconciled against all items in `stok_real_fisik` for that `lokasi`.
2. **Web Scanner Ingestion**: Operator selects SO mode $\rightarrow$ scans items for a rack $\rightarrow$ auto-reconciled against all items in `stok_real_fisik` for that `lokasi`.
3. **CSV/Excel Ingestion**: User uploads CSV/Excel containing columns `SKU`, `Qty`, `Lokasi` $\rightarrow$ auto-reconciled against all items in `stok_real_fisik` for the specified location(s).
