---
name: wms-performance-anti-freeze
description: >-
  Proactive and reactive React/TypeScript performance audit and anti-freeze
  workflow for WMS Inventory. Detects and auto-heals main-thread freezes caused
  by unguarded useMemo hooks in closed modals, O(N*M) localStorage/JSON.parse
  or array.find() loops over the 28,000-item productCatalog, uncached lookup
  maps, and heavy Date allocations inside sort comparators. Activate whenever a
  page lags/freezes or before deploying heavy data views.
---

# WMS Frontend Performance & Anti-Freeze Audit Skill

## Overview

This skill provides a systematic CLI audit and auto-remediation workflow to prevent and eliminate UI freezes, main-thread blocking, and slow tab switching across the WMS Inventory application (where `productCatalog` exceeds 28,000 SKUs and operational tables hold thousands of rows).

## Dependencies

- **`wms-table-card-split-views`** ([`.agents/skills/wms-table-card-split-views/SKILL.md`](file:///d:/Antigravity/WMS%20Inventory/.agents/skills/wms-table-card-split-views/SKILL.md)): Defines pagination standards and $O(1)$ `Map` lookup rules for Table, Card, and Split views.
- **`wms-app-release-update`** ([`.agents/skills/wms-app-release-update/SKILL.md`](file:///d:/Antigravity/WMS%20Inventory/.agents/skills/wms-app-release-update/SKILL.md)): Bumps version and documents performance improvements in release notes before deployment.
- **`auto-deploy`** ([`.agents/skills/auto-deploy/SKILL.md`](file:///d:/Antigravity/WMS%20Inventory/.agents/skills/auto-deploy/SKILL.md)): Verifies production build (`npm run build`) and pushes validated fixes to `origin/main`.

## Quick Start

Run the static anti-freeze auditor across `src/` (or a specific view directory) and write findings to a JSON report file:

```bash
node tools/wms_perf_audit.cjs scan --target src --limit 50 --output C:/Users/Chocochips\ Warehouse/.gemini/antigravity/brain/perf_audit.json
```

## Utility Scripts

### `tools/wms_perf_audit.cjs`

- **`scan` Subcommand**:
  ```bash
  node tools/wms_perf_audit.cjs scan \
    --target <dir_or_file_path> \
    --limit <max_findings_required> \
    --output <path/to/perf_audit.json>
  ```
  - `--target`: Relative path from workspace root (e.g. `src` or `src/components/penerimaan`).
  - `--limit`: **Required** integer specifying the maximum number of findings to output (no silent default).
  - `--output`: **Required** file path where the structured JSON report (`findings`, `highOrCriticalCount`, `passed`) is written.

### Rules Checked by `wms_perf_audit.cjs`:
1. **`SYNC_STORAGE_IN_LOOP` (`CRITICAL`)**: Detects synchronous `JSON.parse(localStorage.getItem(...))` inside `.map()`, `.filter()`, or `.forEach()` loops.
2. **`UNGUARDED_MODAL_MEMO` (`HIGH`)**: Detects `*Modal.tsx` components that execute heavy `useMemo` computations before `if (!isOpen) return null;` without an internal `if (!isOpen)` early return.
3. **`LINEAR_CATALOG_FIND` (`HIGH`)**: Detects `productCatalog.find(...)` ($O(N)$ over 28,000 SKUs) instead of $O(1)$ `buildProductLookupMap(productCatalog).get(sku)`.
4. **`DATE_ALLOC_IN_SORT` (`MEDIUM`)**: Detects `new Date(...)` allocations inside `.sort((a, b) => ...)` comparators.

## Workflow

### 1. Run `wms_perf_audit.cjs scan`
- Execute `node tools/wms_perf_audit.cjs scan --target src --limit 50 --output <report.json>` and inspect the JSON output file.

### 2. Auto-Heal Identified Main-Thread Bottlenecks
For every finding reported (or when diagnosing a lagging page):
1. **Closed Modals Running Heavy Hooks (`UNGUARDED_MODAL_MEMO`)**:
   - Inside every `*Modal.tsx`, add `if (!isOpen) return [];` (or `new Map()`) as the very first line inside every `useMemo` that iterates over `dataList`, `items`, or `productCatalog`.
   - In the parent view, conditionally mount the modal (`{isModalOpen && <MyModal ... />}`) so closed modals consume zero CPU and memory on initial page mount.
2. **28,000-SKU Catalog Lookups (`LINEAR_CATALOG_FIND`)**:
   - Replace `productCatalog.find(...)` with [`buildProductLookupMap(productCatalog)`](file:///d:/Antigravity/WMS%20Inventory/src/utils/productLookup.ts#L28-L55), which caches the 28,000-item `Map` inside a module-level `WeakMap<ProductItem[], Map<string, ProductItem>>` (`0 ms` cost on re-renders and tab mounts).
3. **Synchronous `localStorage` Parsing (`SYNC_STORAGE_IN_LOOP`)**:
   - Never call `localStorage.getItem` + `JSON.parse` inside a per-row helper or component render loop. Cache parsed data in a module-level variable (e.g. [`getCachedPenerimaanProduksiSync()`](file:///d:/Antigravity/WMS%20Inventory/src/services/supabase.ts#L2028-L2045) or `memoryQcJobsCache`) and strip oversized `data:` base64 strings before persisting to `localStorage`.
4. **Active View-Mode Computation Isolation**:
   - When a view supports multiple modes (e.g. `matrix`, `card`, `table`), short-circuit inactive view-mode `useMemo` hooks (e.g. `if (viewMode !== 'card') return [];`) so mounting the page only computes data for the active view.
5. **Fast String Comparison in `.sort()` (`DATE_ALLOC_IN_SORT`)**:
   - For ISO dates (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss`), compare strings directly (`bDate > aDate ? 1 : -1`) instead of allocating `new Date(a).getTime()` tens of thousands of times inside `.sort()`.

### 3. Re-Run Audit & Verify Build
- Re-run `node tools/wms_perf_audit.cjs scan` to verify the fixes, then run `npm run build` and proceed with `wms-app-release-update`.

## Rate Limiting

- This skill and `tools/wms_perf_audit.cjs` perform 100% local static AST/regex analysis on workspace files and have no external API rate limits.

## Common Mistakes

1. **Placing `if (!isOpen) return null;` after heavy `useMemo` hooks without guarding the hooks**: In React, hooks before `return null` still execute on every parent render when `<Modal isOpen={false} />` is mounted. Always guard the `useMemo` body with `if (!isOpen)` AND conditionally render `{isOpen && <Modal />}` in the parent.
2. **Rebuilding a `new Map()` from `productCatalog` inside `useMemo` on every component mount**: Even building a Map of 28,000 items takes 15–30ms per component instance. Always use `WeakMap<ProductItem[], Map<...>>` at module scope (as in [`src/utils/productLookup.ts`](file:///d:/Antigravity/WMS%20Inventory/src/utils/productLookup.ts)) so the Map is built once per catalog reference across the entire app session.
3. **Falling back to `localStorage.getItem('wms_master_products_v2')` when a short code misses in `catalogMap`**: If an item uses a short production code (e.g. `"833"`) that isn't a full SKU, falling back to `JSON.parse(localStorage)` per row freezes the browser for 10+ seconds on 1,000 rows. Only consult the fallback cache when no in-memory catalog was passed (`!hasProvidedCatalog`), and cache the fallback Map in memory.

