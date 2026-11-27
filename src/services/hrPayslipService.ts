import { getSystemDocs, saveSystemDoc } from './supabase';
import type { EmployeeMonthlyPayrollRow, HrPayrollPeriod } from '../utils/hrPayrollUtils';

export const PAYSLIP_INDEX_DOC_ID = 'hr_published_payslips_index';
export const getPayslipPeriodDocId = (monthKey: string) =>
  `hr_published_payslips_${String(monthKey || '').trim()}`;

export interface PublishedPayslipPeriodMeta {
  monthKey: string;
  label: string;
  startDate: string;
  endDate: string;
  rangeLabel: string;
  publishedAt: string;
  publishedBy: string;
  publishedNiks: string[];
}

export interface PublishedPayslipIndex {
  periods: Record<string, PublishedPayslipPeriodMeta>;
}

/**
 * Snapshot slip gaji yang dipublikasikan oleh HR untuk dilihat karyawan terkait.
 */
export interface PublishedEmployeePayslip {
  nik: string;
  nama: string;
  divisi: string;
  jabatan: string;
  payrollMonthKey: string;
  payrollPeriodLabel: string;
  startDate: string;
  endDate: string;
  rangeLabel: string;
  publishedAt: string;
  publishedBy: string;
  totalJadwalKerja: number;
  totalHadir: number;
  totalHariDibayar: number;
  totalTidakAbsenPulang: number;
  totalTidakHadirTanpaAbsen: number;
  totalHariCuti: number;
  totalHariSakit: number;
  totalHariIzin: number;
  totalHariCutiIzinSakit: number;
  totalTerlambat: number;
  totalMenitTerlambat: number;
  toleransiTerlambatMenit: number;
  totalHariTerlambatDipotong: number;
  totalJamLembur: number;
  nilaiKpi: number;
  gradeKpi: string;
  gajiPokok: number;
  tunjangan: number;
  rateLembur: number;
  uangLembur: number;
  upahHarian: number;
  potonganTidakAbsenPulang: number;
  potonganTidakHadir: number;
  potonganCutiIzinSakit: number;
  potonganTerlambat: number;
  potonganKasbon: number;
  saldoKasbon: number;
  totalPendapatanKotor: number;
  totalPotongan: number;
  gajiBersih: number;
  detailTidakHadirItems: EmployeeMonthlyPayrollRow['detailTidakHadirItems'];
  detailTerlambatItems: EmployeeMonthlyPayrollRow['detailTerlambatItems'];
}

export interface PublishedPayslipPeriodDoc {
  monthKey: string;
  label: string;
  startDate: string;
  endDate: string;
  rangeLabel: string;
  publishedAt: string;
  publishedBy: string;
  slipsByNik: Record<string, PublishedEmployeePayslip>;
}

function safeParseJson<T>(raw?: string | null, fallback?: T): T {
  if (!raw) return fallback as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback as T;
  }
}

export function buildPublishedPayslipSnapshot(
  row: EmployeeMonthlyPayrollRow,
  period: HrPayrollPeriod,
  publishedBy: string,
  publishedAt: string
): PublishedEmployeePayslip {
  return {
    nik: (row.nik || '').trim().toUpperCase(),
    nama: row.nama,
    divisi: row.divisi,
    jabatan: row.jabatan,
    payrollMonthKey: row.payrollMonthKey,
    payrollPeriodLabel: row.payrollPeriodLabel,
    startDate: row.startDate,
    endDate: row.endDate,
    rangeLabel: period.rangeLabel,
    publishedAt,
    publishedBy,
    totalJadwalKerja: row.totalJadwalKerja,
    totalHadir: row.totalHadir,
    totalHariDibayar: row.totalHariDibayar,
    totalTidakAbsenPulang: row.totalTidakAbsenPulang,
    totalTidakHadirTanpaAbsen: row.totalTidakHadirTanpaAbsen,
    totalHariCuti: row.totalHariCuti,
    totalHariSakit: row.totalHariSakit,
    totalHariIzin: row.totalHariIzin,
    totalHariCutiIzinSakit: row.totalHariCutiIzinSakit,
    totalTerlambat: row.totalTerlambat,
    totalMenitTerlambat: row.totalMenitTerlambat,
    toleransiTerlambatMenit: row.toleransiTerlambatMenit,
    totalHariTerlambatDipotong: row.totalHariTerlambatDipotong,
    totalJamLembur: row.totalJamLembur,
    nilaiKpi: row.nilaiKpi,
    gradeKpi: row.gradeKpi,
    gajiPokok: row.gajiPokok,
    tunjangan: row.tunjangan,
    rateLembur: row.rateLembur,
    uangLembur: row.uangLembur,
    upahHarian: row.upahHarian,
    potonganTidakAbsenPulang: row.potonganTidakAbsenPulang,
    potonganTidakHadir: row.potonganTidakHadir,
    potonganCutiIzinSakit: row.potonganCutiIzinSakit,
    potonganTerlambat: row.potonganTerlambat,
    potonganKasbon: row.potonganKasbon,
    saldoKasbon: row.saldoKasbon,
    totalPendapatanKotor: row.totalPendapatanKotor,
    totalPotongan: row.totalPotongan,
    gajiBersih: row.gajiBersih,
    detailTidakHadirItems: row.detailTidakHadirItems || [],
    detailTerlambatItems: row.detailTerlambatItems || [],
  };
}

/**
 * Ambil indeks semua periode slip gaji yang sudah dipublikasikan oleh HR.
 */
export async function fetchPublishedPayslipIndex(
  forceRefresh = false
): Promise<PublishedPayslipIndex> {
  const docs = await getSystemDocs(PAYSLIP_INDEX_DOC_ID, forceRefresh);
  const raw = docs?.[0]?.content;
  const parsed = safeParseJson<PublishedPayslipIndex>(raw, { periods: {} });
  return {
    periods: parsed?.periods && typeof parsed.periods === 'object' ? parsed.periods : {},
  };
}

/**
 * Ambil dokumen slip gaji terpublikasi untuk 1 periode bulan tertentu (mis. '2026-11').
 */
export async function fetchPublishedPayslipsForPeriod(
  monthKey: string,
  forceRefresh = false
): Promise<PublishedPayslipPeriodDoc | null> {
  if (!monthKey) return null;
  const docs = await getSystemDocs(getPayslipPeriodDocId(monthKey), forceRefresh);
  const raw = docs?.[0]?.content;
  if (!raw) return null;
  const parsed = safeParseJson<PublishedPayslipPeriodDoc | null>(raw, null);
  if (!parsed || !parsed.slipsByNik) return null;
  return parsed;
}

/**
 * HR Publish slip gaji untuk satu atau semua karyawan pada periode bulan tertentu.
 * Karyawan terkait baru dapat melihat slip gajinya setelah fungsi ini dijalankan.
 */
export async function publishPayslipsForPeriod({
  period,
  rows,
  publishedBy,
  mergeExisting = true,
}: {
  period: HrPayrollPeriod;
  rows: EmployeeMonthlyPayrollRow[];
  publishedBy: string;
  mergeExisting?: boolean;
}): Promise<PublishedPayslipPeriodDoc> {
  const nowIso = new Date().toISOString();
  const existingPeriodDoc = mergeExisting
    ? await fetchPublishedPayslipsForPeriod(period.monthKey, true)
    : null;

  const slipsByNik: Record<string, PublishedEmployeePayslip> = {
    ...(existingPeriodDoc?.slipsByNik || {}),
  };

  rows.forEach((row) => {
    const nikKey = (row.nik || '').trim().toUpperCase();
    if (!nikKey) return;
    slipsByNik[nikKey] = buildPublishedPayslipSnapshot(row, period, publishedBy, nowIso);
  });

  const periodDoc: PublishedPayslipPeriodDoc = {
    monthKey: period.monthKey,
    label: period.label,
    startDate: period.startDate,
    endDate: period.endDate,
    rangeLabel: period.rangeLabel,
    publishedAt: nowIso,
    publishedBy,
    slipsByNik,
  };

  await saveSystemDoc({
    section_id: getPayslipPeriodDocId(period.monthKey),
    content: JSON.stringify(periodDoc),
    updated_by: publishedBy,
    updated_at: nowIso,
  });

  const index = await fetchPublishedPayslipIndex(true);
  const nextIndex: PublishedPayslipIndex = {
    periods: {
      ...index.periods,
      [period.monthKey]: {
        monthKey: period.monthKey,
        label: period.label,
        startDate: period.startDate,
        endDate: period.endDate,
        rangeLabel: period.rangeLabel,
        publishedAt: nowIso,
        publishedBy,
        publishedNiks: Object.keys(slipsByNik).sort(),
      },
    },
  };

  await saveSystemDoc({
    section_id: PAYSLIP_INDEX_DOC_ID,
    content: JSON.stringify(nextIndex),
    updated_by: publishedBy,
    updated_at: nowIso,
  });

  return periodDoc;
}

/**
 * HR Tarik kembali (Unpublish) slip gaji untuk 1 karyawan atau seluruh periode bulan tertentu.
 * Setelah di-unpublish, karyawan tidak dapat lagi melihat slip periode tersebut.
 */
export async function unpublishPayslipsForPeriod({
  monthKey,
  targetNik,
  updatedBy,
}: {
  monthKey: string;
  targetNik?: string;
  updatedBy: string;
}): Promise<PublishedPayslipPeriodDoc | null> {
  const nowIso = new Date().toISOString();
  const existingPeriodDoc = await fetchPublishedPayslipsForPeriod(monthKey, true);
  const index = await fetchPublishedPayslipIndex(true);

  if (!targetNik) {
    const emptyDoc: PublishedPayslipPeriodDoc = {
      monthKey,
      label: existingPeriodDoc?.label || monthKey,
      startDate: existingPeriodDoc?.startDate || '',
      endDate: existingPeriodDoc?.endDate || '',
      rangeLabel: existingPeriodDoc?.rangeLabel || '',
      publishedAt: '',
      publishedBy: updatedBy,
      slipsByNik: {},
    };
    await saveSystemDoc({
      section_id: getPayslipPeriodDocId(monthKey),
      content: JSON.stringify(emptyDoc),
      updated_by: updatedBy,
      updated_at: nowIso,
    });

    const nextPeriods = { ...index.periods };
    delete nextPeriods[monthKey];
    await saveSystemDoc({
      section_id: PAYSLIP_INDEX_DOC_ID,
      content: JSON.stringify({ periods: nextPeriods }),
      updated_by: updatedBy,
      updated_at: nowIso,
    });
    return null;
  }

  const nikUpper = targetNik.trim().toUpperCase();
  const nextSlips = { ...(existingPeriodDoc?.slipsByNik || {}) };
  delete nextSlips[nikUpper];

  const remainingNiks = Object.keys(nextSlips).sort();
  const updatedDoc: PublishedPayslipPeriodDoc = {
    monthKey,
    label: existingPeriodDoc?.label || monthKey,
    startDate: existingPeriodDoc?.startDate || '',
    endDate: existingPeriodDoc?.endDate || '',
    rangeLabel: existingPeriodDoc?.rangeLabel || '',
    publishedAt: remainingNiks.length > 0 ? existingPeriodDoc?.publishedAt || nowIso : '',
    publishedBy: existingPeriodDoc?.publishedBy || updatedBy,
    slipsByNik: nextSlips,
  };

  await saveSystemDoc({
    section_id: getPayslipPeriodDocId(monthKey),
    content: JSON.stringify(updatedDoc),
    updated_by: updatedBy,
    updated_at: nowIso,
  });

  const nextPeriods = { ...index.periods };
  if (remainingNiks.length === 0) {
    delete nextPeriods[monthKey];
  } else if (nextPeriods[monthKey]) {
    nextPeriods[monthKey] = {
      ...nextPeriods[monthKey],
      publishedNiks: remainingNiks,
    };
  }
  await saveSystemDoc({
    section_id: PAYSLIP_INDEX_DOC_ID,
    content: JSON.stringify({ periods: nextPeriods }),
    updated_by: updatedBy,
    updated_at: nowIso,
  });

  return remainingNiks.length > 0 ? updatedDoc : null;
}

/**
 * Ambil daftar periode yang SUDAH dipublikasikan khusus untuk 1 karyawan (NIK).
 * Periode yang belum di-publish HR tidak akan pernah muncul.
 */
export async function fetchEmployeePublishedPeriods(
  nik: string,
  forceRefresh = false
): Promise<PublishedPayslipPeriodMeta[]> {
  const nikUpper = (nik || '').trim().toUpperCase();
  if (!nikUpper) return [];
  const index = await fetchPublishedPayslipIndex(forceRefresh);
  return Object.values(index.periods)
    .filter(
      (meta) =>
        Array.isArray(meta.publishedNiks) &&
        meta.publishedNiks.some((n) => String(n).trim().toUpperCase() === nikUpper)
    )
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

/**
 * Ambil slip gaji milik 1 karyawan pada 1 periode (hanya mengembalikan data jika sudah di-publish HR).
 */
export async function fetchEmployeePublishedPayslip(
  nik: string,
  monthKey: string,
  forceRefresh = false
): Promise<PublishedEmployeePayslip | null> {
  const nikUpper = (nik || '').trim().toUpperCase();
  if (!nikUpper || !monthKey) return null;
  const doc = await fetchPublishedPayslipsForPeriod(monthKey, forceRefresh);
  if (!doc || !doc.slipsByNik) return null;
  return doc.slipsByNik[nikUpper] || null;
}
