import { ProductItem, StockRealtimeItem } from '../types';
import { getAreaFromLokasi } from '../services/supabase';
import { buildProductLookupMap, lookupProductBySku } from './productLookup';
import { isCorruptedSku, isMissingProductName } from './anomalyUtils';

export type StockTakeReasonType =
  | 'NEGATIVE_STOCK'
  | 'INVALID_LOCATION'
  | 'AREA_MISMATCH'
  | 'SKU_ANOMALY'
  | 'DEALPOS_MISMATCH'
  | 'RELATED_BY_SKU'
  | 'RELATED_BY_LOCATION_TYPO';

export type StockTakePriority = 'critical' | 'high' | 'related' | 'medium';

export interface StockTakeSkuDetail {
  sku: string;
  nama_produk: string;
  size?: string;
  qty: number;
  dealposQty?: number;
  totalFisikSku?: number;
  issues: string[];
  isTriggerSku: boolean;
}

export interface StockTakeLocationRecommendation {
  lokasi: string;
  area: string;
  priority: StockTakePriority;
  score: number;
  isDirectTrigger: boolean;
  isRelatedLocation: boolean;
  reasonTypes: StockTakeReasonType[];
  reasons: string[];
  /** Lokasi sumber pemicu jika lokasi ini direkomendasikan karena keterkaitan */
  relatedFromLocations: string[];
  /** Daftar lokasi terkait lain yang terhubung dengan temuan di lokasi ini */
  linkedRelatedLocations: string[];
  /** SKU yang menjadi pemicu atau terkait di lokasi ini */
  affectedSkus: string[];
  /** Seluruh SKU yang tercatat di database pada lokasi ini */
  itemsInLocation: StockTakeSkuDetail[];
  totalPcs: number;
  negativeCount: number;
  anomalySkuCount: number;
  mismatchDpCount: number;
}

export interface StockTakeRecommendationSummary {
  recommendations: StockTakeLocationRecommendation[];
  totalLocations: number;
  criticalLocations: number;
  highLocations: number;
  relatedLocations: number;
  mediumLocations: number;
  negativeStockLocations: number;
  invalidLocationCount: number;
  skuAnomalyLocations: number;
  dealposMismatchLocations: number;
}

const COMMERCIAL_AREAS = new Set(['Warehouse', 'Koli', 'Kolian', 'Blok F', 'Transit', 'Aksesoris']);

function normalizeTextCompare(val?: string | null): string {
  return String(val || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeSizeCompare(val?: string | null): string {
  const s = String(val || '').trim().toUpperCase();
  if (!s || s === '-' || s === 'ALL SIZE' || s === 'ALL' || s === 'DEFAULT' || s === 'NO SIZE') return '';
  return s;
}

/**
 * Mencoba menormalkan lokasi anomali/typo menjadi kode rak kanonik jika memungkinkan
 * Misal: "A-05" -> "A005", "A 5" -> "A005", "R12" -> "R012", "DF 5" -> "DF005"
 */
export function inferCanonicalRackFromTypo(rawLok: string): string | null {
  const clean = String(rawLok || '').trim().toUpperCase().replace(/[\s\-_]+/g, '');
  if (!clean || clean === '-') return null;

  // Pola 1 huruf + 1-3 digit (misal A5, A05, B12, E5, R5, V12, Z3)
  const m1 = clean.match(/^([ABCDERVZ])0*(\d{1,3})$/);
  if (m1) {
    const candidate = `${m1[1]}${m1[2].padStart(3, '0')}`;
    if (candidate !== String(rawLok || '').trim().toUpperCase() && getAreaFromLokasi(candidate) !== 'Anomali') {
      return candidate;
    }
  }

  // Pola CC/PMK/DF + 1-3 digit (misal DF5, PMK12, CC3)
  const m2 = clean.match(/^(CC|PMK|DF)0*(\d{1,3})$/);
  if (m2) {
    const candidate = `${m2[1]}${m2[2].padStart(3, '0')}`;
    if (candidate !== String(rawLok || '').trim().toUpperCase() && getAreaFromLokasi(candidate) !== 'Anomali') {
      return candidate;
    }
  }

  return null;
}

/**
 * Menganalisis stok fisik realtime & master katalog produk untuk menghasilkan
 * rekomendasi lokasi yang perlu di-Stock Take Ulang / Reset Scan Data,
 * termasuk lokasi lain yang berpotensi berkaitan dengan SKU atau lokasi error tersebut.
 */
export function analyzeStockTakeRecommendations(
  productCatalog: ProductItem[],
  stockRows: StockRealtimeItem[]
): StockTakeRecommendationSummary {
  const catalogMap = buildProductLookupMap(productCatalog || []);

  // 1. Pre-compute commercial DealPOS & total physical stock per SKU
  const skuCommercialFisik = new Map<string, number>();
  const skuCommercialDp = new Map<string, number>();
  const skuLocationsMap = new Map<string, Set<string>>();
  const rowsByLocation = new Map<string, StockRealtimeItem[]>();

  for (const row of stockRows || []) {
    const rawLok = String(row.lokasi || '').trim() || '-';
    const lokUp = rawLok.toUpperCase();
    const rawSku = String(row.sku || '').trim();
    const skuUp = rawSku.toUpperCase();
    const qty = Number(row.sisa_stok) || 0;
    const area = getAreaFromLokasi(rawLok);

    if (!rowsByLocation.has(lokUp)) rowsByLocation.set(lokUp, []);
    rowsByLocation.get(lokUp)!.push(row);

    if (skuUp) {
      if (qty !== 0) {
        if (!skuLocationsMap.has(skuUp)) skuLocationsMap.set(skuUp, new Set());
        skuLocationsMap.get(skuUp)!.add(lokUp);
      }

      if (COMMERCIAL_AREAS.has(area)) {
        skuCommercialFisik.set(skuUp, (skuCommercialFisik.get(skuUp) || 0) + qty);
      }

      if (!skuCommercialDp.has(skuUp)) {
        const lookup = lookupProductBySku(rawSku, catalogMap);
        const master = lookup.masterItem;
        const dpVal = master
          ? Number(master.dp ?? master.dealpos_qty ?? master.stok_dealpos ?? 0) || 0
          : Number((row as any).stok_dealpos ?? 0) || 0;
        skuCommercialDp.set(skuUp, dpVal);
      }
    }
  }

  // Track builder per location
  interface LocAccumulator {
    lokasi: string;
    area: string;
    reasonTypes: Set<StockTakeReasonType>;
    reasons: Set<string>;
    relatedFromLocations: Set<string>;
    linkedRelatedLocations: Set<string>;
    affectedSkus: Set<string>;
    itemsInLocation: StockTakeSkuDetail[];
    totalPcs: number;
    negativeCount: number;
    anomalySkuCount: number;
    mismatchDpCount: number;
    isDirectTrigger: boolean;
  }

  const locMap = new Map<string, LocAccumulator>();

  const ensureLoc = (lokUp: string, displayLok?: string): LocAccumulator => {
    let acc = locMap.get(lokUp);
    if (!acc) {
      const label = displayLok || lokUp;
      acc = {
        lokasi: label,
        area: getAreaFromLokasi(label),
        reasonTypes: new Set(),
        reasons: new Set(),
        relatedFromLocations: new Set(),
        linkedRelatedLocations: new Set(),
        affectedSkus: new Set(),
        itemsInLocation: [],
        totalPcs: 0,
        negativeCount: 0,
        anomalySkuCount: 0,
        mismatchDpCount: 0,
        isDirectTrigger: false,
      };
      locMap.set(lokUp, acc);
    }
    return acc;
  };

  // Track trigger SKUs -> source locations so we can propagate to related sibling locations
  const triggerSkuSources = new Map<string, Set<string>>();
  // Track typo location -> canonical location
  const typoLinks: Array<{ sourceLok: string; targetCanonical: string }> = [];

  // 2. Pass 1: Evaluate each location for direct anomalies, minus stock, & data mismatches
  rowsByLocation.forEach((locRows, lokUp) => {
    const sampleLok = String(locRows[0]?.lokasi || lokUp).trim() || '-';
    const expectedArea = getAreaFromLokasi(sampleLok);
    const isInvalidLoc = expectedArea === 'Anomali' || sampleLok === '-' || sampleLok === '';

    let hasDirectIssue = false;
    const accReasons = new Set<string>();
    const accTypes = new Set<StockTakeReasonType>();
    const accAffectedSkus = new Set<string>();
    const skuDetails: StockTakeSkuDetail[] = [];

    let totalPcs = 0;
    let negativeCount = 0;
    let anomalySkuCount = 0;
    let mismatchDpCount = 0;
    let hasAreaMismatch = false;

    if (isInvalidLoc) {
      hasDirectIssue = true;
      accTypes.add('INVALID_LOCATION');
      accReasons.add(`Kode lokasi "${sampleLok}" tidak valid / tidak terdaftar di denah rak standar`);
      const canonical = inferCanonicalRackFromTypo(sampleLok);
      if (canonical) {
        typoLinks.push({ sourceLok: lokUp, targetCanonical: canonical });
      }
    }

    for (const row of locRows) {
      const qty = Number(row.sisa_stok) || 0;
      totalPcs += qty;

      const rawSku = String(row.sku || '').trim();
      const skuUp = rawSku.toUpperCase();
      const dbArea = String(row.area || '').trim();

      if (!isInvalidLoc && dbArea && dbArea.toLowerCase() !== expectedArea.toLowerCase()) {
        // Kolian vs Koli alias check
        const isKoliAlias =
          (dbArea.toLowerCase() === 'kolian' && expectedArea.toLowerCase() === 'koli') ||
          (dbArea.toLowerCase() === 'koli' && expectedArea.toLowerCase() === 'kolian');
        if (!isKoliAlias) {
          hasAreaMismatch = true;
        }
      }

      const skuIssues: string[] = [];
      let isTriggerSku = false;

      if (qty < 0) {
        hasDirectIssue = true;
        isTriggerSku = true;
        negativeCount++;
        accTypes.add('NEGATIVE_STOCK');
        skuIssues.push(`Stok minus (${qty} pcs)`);
        accReasons.add(`Terdapat stok minus pada SKU ${rawSku || '-'} (${qty} pcs)`);
      }

      const lookup = rawSku ? lookupProductBySku(rawSku, catalogMap) : { matched: false, masterItem: undefined };
      const master = lookup.masterItem;

      if (isCorruptedSku(rawSku)) {
        hasDirectIssue = true;
        isTriggerSku = true;
        anomalySkuCount++;
        accTypes.add('SKU_ANOMALY');
        skuIssues.push('Format SKU rusak/korup');
        accReasons.add(`Format SKU rusak/korup ("${rawSku}")`);
      } else if (!master) {
        if (qty !== 0) {
          hasDirectIssue = true;
          isTriggerSku = true;
          anomalySkuCount++;
          accTypes.add('SKU_ANOMALY');
          skuIssues.push('SKU tidak ada di Master Produk');
          accReasons.add(`SKU ${rawSku} tidak ditemukan di Master Produk`);
        }
      } else {
        const dbName = row.nama_produk;
        const dbSize = row.size;
        const nameMismatch =
          isMissingProductName(dbName, rawSku) ||
          (master.n && normalizeTextCompare(dbName) !== normalizeTextCompare(master.n));
        const sizeMismatch =
          normalizeSizeCompare(master.s) !== '' &&
          normalizeSizeCompare(dbSize) !== '' &&
          normalizeSizeCompare(dbSize) !== normalizeSizeCompare(master.s);

        if (nameMismatch || sizeMismatch) {
          hasDirectIssue = true;
          isTriggerSku = true;
          anomalySkuCount++;
          accTypes.add('SKU_ANOMALY');
          if (nameMismatch) skuIssues.push('Nama produk tidak sesuai master');
          if (sizeMismatch) skuIssues.push(`Size tidak sesuai master (${dbSize} vs ${master.s})`);
          accReasons.add(`Data nama/size SKU ${rawSku} tidak sesuai Master Produk`);
        }
      }

      const totalFisikSku = skuCommercialFisik.get(skuUp) ?? qty;
      const dpQty = skuCommercialDp.get(skuUp) ?? 0;

      // Flag DealPOS mismatch for commercial racks where stock != 0 and DP != Fisik
      if (COMMERCIAL_AREAS.has(expectedArea) && qty !== 0 && totalFisikSku !== dpQty) {
        hasDirectIssue = true;
        isTriggerSku = true;
        mismatchDpCount++;
        accTypes.add('DEALPOS_MISMATCH');
        const diff = totalFisikSku - dpQty;
        skuIssues.push(`Selisih Fisik vs DP (${diff > 0 ? `+${diff}` : diff})`);
        accReasons.add(`Selisih stok Fisik (${totalFisikSku}) vs DealPOS (${dpQty}) pada SKU ${rawSku}`);
      }

      if (isTriggerSku && skuUp) {
        accAffectedSkus.add(skuUp);
        if (!triggerSkuSources.has(skuUp)) triggerSkuSources.set(skuUp, new Set());
        triggerSkuSources.get(skuUp)!.add(lokUp);
      }

      skuDetails.push({
        sku: rawSku || '-',
        nama_produk: master?.n || row.nama_produk || '-',
        size: master?.s || row.size,
        qty,
        dealposQty: dpQty,
        totalFisikSku,
        issues: skuIssues,
        isTriggerSku,
      });
    }

    if (hasAreaMismatch) {
      hasDirectIssue = true;
      accTypes.add('AREA_MISMATCH');
      accReasons.add(`Label area di database tidak cocok dengan kode lokasi ${sampleLok} (${expectedArea})`);
    }

    if (hasDirectIssue) {
      const acc = ensureLoc(lokUp, sampleLok);
      acc.isDirectTrigger = true;
      acc.totalPcs = totalPcs;
      acc.negativeCount = negativeCount;
      acc.anomalySkuCount = anomalySkuCount;
      acc.mismatchDpCount = mismatchDpCount;
      acc.itemsInLocation = skuDetails;
      accTypes.forEach((t) => acc.reasonTypes.add(t));
      accReasons.forEach((r) => acc.reasons.add(r));
      accAffectedSkus.forEach((s) => acc.affectedSkus.add(s));
    }
  });

  // 3. Pass 2: Propagate to RELATED locations (same SKU in other racks + canonical typo matches)
  triggerSkuSources.forEach((sourceLocs, skuUp) => {
    const allLocsWithSku = skuLocationsMap.get(skuUp);
    if (!allLocsWithSku) return;

    allLocsWithSku.forEach((candidateLok) => {
      sourceLocs.forEach((srcLok) => {
        if (candidateLok === srcLok) return;

        // Only propagate if source has critical/high issue (minus, invalid loc, sku anomaly) OR DP mismatch
        const srcAcc = locMap.get(srcLok);
        if (!srcAcc) return;

        const srcHasCriticalOrHigh =
          srcAcc.reasonTypes.has('NEGATIVE_STOCK') ||
          srcAcc.reasonTypes.has('INVALID_LOCATION') ||
          srcAcc.reasonTypes.has('SKU_ANOMALY');

        // Link source -> related
        srcAcc.linkedRelatedLocations.add(candidateLok);

        const candAcc = ensureLoc(candidateLok);
        candAcc.reasonTypes.add('RELATED_BY_SKU');
        candAcc.relatedFromLocations.add(srcLok);
        candAcc.affectedSkus.add(skuUp);

        const triggerKindLabel = srcAcc.reasonTypes.has('NEGATIVE_STOCK')
          ? 'stok minus'
          : srcAcc.reasonTypes.has('INVALID_LOCATION')
          ? 'lokasi anomali'
          : srcAcc.reasonTypes.has('SKU_ANOMALY')
          ? 'anomali SKU'
          : 'selisih DealPOS';

        candAcc.reasons.add(
          `Menyimpan SKU ${skuUp} yang juga tercatat ${triggerKindLabel} di ${srcLok} (potensi salah ambil / salah putaway)`
        );

        // Populate itemsInLocation if this related location wasn't populated in Pass 1
        if (candAcc.itemsInLocation.length === 0) {
          const candRows = rowsByLocation.get(candidateLok) || [];
          let candTotal = 0;
          candAcc.itemsInLocation = candRows.map((r) => {
            const q = Number(r.sisa_stok) || 0;
            candTotal += q;
            const rSkuUp = String(r.sku || '').trim().toUpperCase();
            const lookup = rSkuUp ? lookupProductBySku(rSkuUp, catalogMap) : { masterItem: undefined };
            return {
              sku: String(r.sku || '-').trim(),
              nama_produk: lookup.masterItem?.n || r.nama_produk || '-',
              size: lookup.masterItem?.s || r.size,
              qty: q,
              dealposQty: skuCommercialDp.get(rSkuUp),
              totalFisikSku: skuCommercialFisik.get(rSkuUp),
              issues: rSkuUp === skuUp ? [`Terkait temuan di ${srcLok}`] : [],
              isTriggerSku: rSkuUp === skuUp,
            };
          });
          candAcc.totalPcs = candTotal;
        }

        // If source is only DP mismatch and candidate wasn't already flagged, keep note clear
        if (!srcHasCriticalOrHigh && !candAcc.isDirectTrigger) {
          candAcc.linkedRelatedLocations.add(srcLok);
        }
      });
    });
  });

  // Typo canonical location links
  for (const link of typoLinks) {
    const srcAcc = locMap.get(link.sourceLok);
    if (srcAcc) {
      srcAcc.linkedRelatedLocations.add(link.targetCanonical);
    }
    const targetAcc = ensureLoc(link.targetCanonical);
    targetAcc.reasonTypes.add('RELATED_BY_LOCATION_TYPO');
    targetAcc.relatedFromLocations.add(link.sourceLok);
    targetAcc.reasons.add(
      `Lokasi standar yang mirip dengan lokasi anomali "${link.sourceLok}" (potensi salah ketik/scan lokasi saat input)`
    );
    if (targetAcc.itemsInLocation.length === 0) {
      const tRows = rowsByLocation.get(link.targetCanonical) || [];
      let tTotal = 0;
      targetAcc.itemsInLocation = tRows.map((r) => {
        const q = Number(r.sisa_stok) || 0;
        tTotal += q;
        const rSkuUp = String(r.sku || '').trim().toUpperCase();
        const lookup = rSkuUp ? lookupProductBySku(rSkuUp, catalogMap) : { masterItem: undefined };
        return {
          sku: String(r.sku || '-').trim(),
          nama_produk: lookup.masterItem?.n || r.nama_produk || '-',
          size: lookup.masterItem?.s || r.size,
          qty: q,
          dealposQty: skuCommercialDp.get(rSkuUp),
          totalFisikSku: skuCommercialFisik.get(rSkuUp),
          issues: [],
          isTriggerSku: false,
        };
      });
      targetAcc.totalPcs = tTotal;
    }
  }

  // 4. Score & sort recommendations
  const recommendations: StockTakeLocationRecommendation[] = [];
  let criticalLocations = 0;
  let highLocations = 0;
  let relatedLocations = 0;
  let mediumLocations = 0;
  let negativeStockLocations = 0;
  let invalidLocationCount = 0;
  let skuAnomalyLocations = 0;
  let dealposMismatchLocations = 0;

  locMap.forEach((acc) => {
    const hasNeg = acc.reasonTypes.has('NEGATIVE_STOCK');
    const hasInvalidLoc = acc.reasonTypes.has('INVALID_LOCATION');
    const hasSkuAnom = acc.reasonTypes.has('SKU_ANOMALY');
    const hasAreaMismatch = acc.reasonTypes.has('AREA_MISMATCH');
    const hasDpMismatch = acc.reasonTypes.has('DEALPOS_MISMATCH');
    const hasRelated =
      acc.reasonTypes.has('RELATED_BY_SKU') || acc.reasonTypes.has('RELATED_BY_LOCATION_TYPO');

    let priority: StockTakePriority = 'medium';
    if (hasNeg || hasInvalidLoc) {
      priority = 'critical';
      criticalLocations++;
    } else if (hasSkuAnom || hasAreaMismatch) {
      priority = 'high';
      highLocations++;
    } else if (hasRelated && !hasDpMismatch) {
      priority = 'related';
      relatedLocations++;
    } else if (hasDpMismatch) {
      priority = 'medium';
      mediumLocations++;
    } else if (hasRelated) {
      priority = 'related';
      relatedLocations++;
    }

    if (hasNeg) negativeStockLocations++;
    if (hasInvalidLoc) invalidLocationCount++;
    if (hasSkuAnom) skuAnomalyLocations++;
    if (hasDpMismatch) dealposMismatchLocations++;

    const score =
      (hasNeg ? 100 : 0) +
      (hasInvalidLoc ? 90 : 0) +
      (hasSkuAnom ? 65 : 0) +
      (hasAreaMismatch ? 50 : 0) +
      (hasRelated ? 30 : 0) +
      (hasDpMismatch ? 20 : 0) +
      acc.negativeCount * 5 +
      acc.anomalySkuCount * 3;

    // Sort items inside location: trigger/problematic items first, then by SKU
    const sortedItems = [...acc.itemsInLocation].sort((a, b) => {
      if (a.isTriggerSku !== b.isTriggerSku) return a.isTriggerSku ? -1 : 1;
      if ((a.qty < 0) !== (b.qty < 0)) return a.qty < 0 ? -1 : 1;
      return a.sku.localeCompare(b.sku);
    });

    recommendations.push({
      lokasi: acc.lokasi,
      area: acc.area,
      priority,
      score,
      isDirectTrigger: acc.isDirectTrigger,
      isRelatedLocation: hasRelated,
      reasonTypes: Array.from(acc.reasonTypes),
      reasons: Array.from(acc.reasons),
      relatedFromLocations: Array.from(acc.relatedFromLocations).sort(),
      linkedRelatedLocations: Array.from(acc.linkedRelatedLocations).sort(),
      affectedSkus: Array.from(acc.affectedSkus).sort(),
      itemsInLocation: sortedItems,
      totalPcs: acc.totalPcs,
      negativeCount: acc.negativeCount,
      anomalySkuCount: acc.anomalySkuCount,
      mismatchDpCount: acc.mismatchDpCount,
    });
  });

  recommendations.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.lokasi.localeCompare(b.lokasi);
  });

  return {
    recommendations,
    totalLocations: recommendations.length,
    criticalLocations,
    highLocations,
    relatedLocations,
    mediumLocations,
    negativeStockLocations,
    invalidLocationCount,
    skuAnomalyLocations,
    dealposMismatchLocations,
  };
}
