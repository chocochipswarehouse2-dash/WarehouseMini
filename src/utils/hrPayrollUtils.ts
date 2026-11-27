import * as XLSX from 'xlsx';
import {
  KaryawanRecord,
  PresensiRecord,
  RosterShiftRecord,
  LemburRecord,
  PerijinanCutiRecord,
  IzinPulangAwalRecord,
} from '../types';
import { buildDetailedHrReport, getDatesInRange, SummaryKaryawanRow } from './hrExportUtils';
import { calculateKpiAbsensiBatch } from './kpiCalculator';

/**
 * Siklus periode administrasi & penggajian karyawan WMS:
 * - Cut-off bulanan: Tanggal 26 bulan sebelumnya s/d Tanggal 25 bulan berjalan.
 *   Contoh: 26 Oktober – 25 November = Periode Bulan November.
 * - Jadwal Shift (Roster): TETAP mulai Tanggal 1 s/d Akhir Bulan kalender.
 */
export const PAYROLL_CUTOFF_START_DAY = 26;
export const PAYROLL_CUTOFF_END_DAY = 25;

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const INDONESIAN_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export interface HrPayrollPeriod {
  /** Format YYYY-MM, contoh: '2026-11' untuk periode November 2026 */
  monthKey: string;
  year: number;
  /** 1-12 (1 = Januari, 11 = November, 12 = Desember) */
  month: number;
  /** Contoh: 'November 2026' */
  label: string;
  /** YYYY-MM-DD (tanggal 26 bulan sebelumnya, contoh: '2026-10-26') */
  startDate: string;
  /** YYYY-MM-DD (tanggal 25 bulan berjalan, contoh: '2026-11-25') */
  endDate: string;
  /** Contoh: '26 Okt 2026 – 25 Nov 2026' */
  rangeLabel: string;
  /** Contoh: '26 Okt – 25 Nov 2026' */
  shortRangeLabel: string;
}

export interface HrShiftCalendarPeriod {
  /** Format YYYY-MM, contoh: '2026-11' */
  monthKey: string;
  year: number;
  /** 1-12 */
  month: number;
  /** Contoh: 'November 2026' */
  label: string;
  /** YYYY-MM-DD (selalu tanggal 01) */
  startDate: string;
  /** YYYY-MM-DD (selalu akhir bulan 28/29/30/31) */
  endDate: string;
  totalDays: number;
}

export type BolosDeductionMode = 'proporsional' | 'nominal' | 'tanpa_potongan';

export interface PayrollAbsenceDetailItem {
  tanggal: string;
  shiftJadwal: string;
  tipe: 'TIDAK_ABSEN_PULANG' | 'TIDAK_HADIR' | 'CUTI' | 'IZIN' | 'SAKIT';
  statusLabel: string;
  alasan: string;
  jamMasuk?: string;
  jamPulang?: string;
  presensiId?: string | number;
  rosterId?: string | number;
  potonganNominal: number;
  dibayarGajiHarian: boolean;
}

export interface PayrollLateDetailItem {
  tanggal: string;
  shiftJadwal: string;
  jamMasuk: string;
  menitTerlambat: number;
  akumulasiMenit: number;
  melewatiToleransi: boolean;
  potonganNominal: number;
  keterangan: string;
}

export interface MonthlyPayrollConfig {
  /** Cara menghitung potongan tidak hadir (tanpa absen & cuti/izin/sakit): proporsional gaji pokok / hari kerja, nominal tetap, atau tanpa potongan */
  potonganBolosMode?: BolosDeductionMode;
  /** Nominal potongan per hari tidak hadir jika potonganBolosMode === 'nominal' */
  potonganBolosNominal?: number;
  /** Potongan denda tetap untuk absen datang tapi TIDAK absen pulang (tetap dibayar gaji hari itu; default Rp 10.000) */
  potonganTidakAbsenPulangNominal?: number;
  /** Apakah Cuti, Izin, dan Sakit tidak dibayar gaji (potong upah harian; default true) */
  potongGajiCutiIzinSakit?: boolean;
  /** Toleransi akumulasi keterlambatan dalam 1 periode bulan dalam menit (default 30 menit) */
  toleransiTerlambatMenit?: number;
  /** Nominal potongan per hari terlambat setelah akumulasi > toleransi 30 menit (default Rp 5.000) */
  potonganTerlambatPerKejadian?: number;
  /** Jika true, saldo_kasbon karyawan otomatis diperhitungkan sebagai potongan kasbon bulan ini */
  sertakanPotonganKasbon?: boolean;
  /** Pembagi hari kerja standar jika karyawan belum memiliki jadwal roster di periode ini (default 26 hari) */
  defaultWorkingDaysDivisor?: number;
}

export interface EmployeeMonthlyPayrollRow {
  no: number;
  nik: string;
  nama: string;
  divisi: string;
  jabatan: string;
  payrollMonthKey: string;
  payrollPeriodLabel: string;
  startDate: string;
  endDate: string;
  totalJadwalKerja: number;
  /** Hari dengan absen masuk & pulang lengkap */
  totalHadir: number;
  /** Total hari yang tetap dibayar gaji (Hadir lengkap + Datang tapi lupa absen pulang) */
  totalHariDibayar: number;
  /** Jumlah kejadian datang tapi tidak absen pulang (denda Rp 10.000/kejadian, tetap dibayar gaji) */
  totalTidakAbsenPulang: number;
  /** Jumlah hari tidak hadir tanpa absen (kecuali libur) — dipotong upah harian */
  totalTidakHadirTanpaAbsen: number;
  totalTerlambat: number;
  totalMenitTerlambat: number;
  toleransiTerlambatMenit: number;
  totalHariTerlambatDipotong: number;
  totalHariCuti: number;
  totalHariSakit: number;
  totalHariIzin: number;
  totalHariCutiIzinSakit: number;
  /** Total gabungan hari bermasalah untuk kompatibilitas */
  totalHariBolos: number;
  totalBolosTidakAbsenPulang: number;
  totalBolosTidakAbsenDatang: number;
  totalJamLembur: number;
  nilaiKpi: number;
  gradeKpi: string;
  gajiPokok: number;
  tunjangan: number;
  rateLembur: number;
  uangLembur: number;
  upahHarian: number;
  /** Denda absen datang tapi tidak absen pulang (Rp 10.000/kejadian, tetap dibayar gaji) */
  potonganTidakAbsenPulang: number;
  /** Potongan hari tidak hadir tanpa absen (upah harian) */
  potonganTidakHadir: number;
  /** Potongan hari Cuti / Izin / Sakit yang tidak dibayar gaji (upah harian) */
  potonganCutiIzinSakit: number;
  /** Total gabungan potongan ketidakhadiran & denda tak absen pulang */
  potonganBolos: number;
  /** Potongan terlambat setelah akumulasi melewati 30 menit (Rp 5.000/hari) */
  potonganTerlambat: number;
  potonganKasbon: number;
  saldoKasbon: number;
  totalPendapatanKotor: number;
  totalPotongan: number;
  gajiBersih: number;
  detailTidakHadirItems: PayrollAbsenceDetailItem[];
  detailTerlambatItems: PayrollLateDetailItem[];
  summaryRow: SummaryKaryawanRow;
}

export interface MonthlyPayrollSummaryTotals {
  totalKaryawan: number;
  totalJadwalKerja: number;
  totalHadir: number;
  totalHariDibayar: number;
  totalTidakAbsenPulang: number;
  totalTidakHadirTanpaAbsen: number;
  totalTerlambat: number;
  totalHariTerlambatDipotong: number;
  totalHariCuti: number;
  totalHariCutiIzinSakit: number;
  totalHariBolos: number;
  totalJamLembur: number;
  totalGajiPokok: number;
  totalTunjangan: number;
  totalUangLembur: number;
  totalPotonganTidakAbsenPulang: number;
  totalPotonganTidakHadir: number;
  totalPotonganCutiIzinSakit: number;
  totalPotonganBolos: number;
  totalPotonganTerlambat: number;
  totalPotonganKasbon: number;
  totalPotongan: number;
  totalPendapatanKotor: number;
  totalGajiBersih: number;
}

export interface MonthlyPayrollResult {
  period: HrPayrollPeriod;
  /** Referensi kalender jadwal shift (tetap tgl 1 s/d akhir bulan) yang mencakup periode 26–25 ini */
  shiftCalendarMonths: {
    previousMonth: HrShiftCalendarPeriod;
    currentMonth: HrShiftCalendarPeriod;
  };
  config: Required<MonthlyPayrollConfig>;
  rows: EmployeeMonthlyPayrollRow[];
  totals: MonthlyPayrollSummaryTotals;
}

/**
 * Format Date lokal ke YYYY-MM-DD (aman untuk zona waktu WIB/WITA/WIT tanpa geser hari UTC)
 */
export function formatLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatIndonesianShortDate(isoDate: string): string {
  const parts = (isoDate || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return isoDate;
  const [y, m, d] = parts;
  const monthShort = INDONESIAN_MONTHS_SHORT[m - 1] || String(m);
  return `${d} ${monthShort} ${y}`;
}

/**
 * Menghasilkan periode administrasi & gaji untuk bulan target (YYYY, 1..12):
 * Tanggal 26 bulan sebelumnya s/d Tanggal 25 bulan berjalan.
 * Contoh: getPayrollPeriodForMonth(2026, 11) => 2026-10-26 s/d 2026-11-25 (November 2026).
 */
export function getPayrollPeriodForMonth(year: number, month1Based: number): HrPayrollPeriod {
  const normalizedDate = new Date(year, month1Based - 1, 1);
  const targetYear = normalizedDate.getFullYear();
  const targetMonth = normalizedDate.getMonth() + 1; // 1..12

  const prevMonthDate = new Date(targetYear, targetMonth - 2, PAYROLL_CUTOFF_START_DAY);
  const currentCutoffDate = new Date(targetYear, targetMonth - 1, PAYROLL_CUTOFF_END_DAY);

  const startDate = formatLocalIsoDate(prevMonthDate);
  const endDate = formatLocalIsoDate(currentCutoffDate);
  const monthKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
  const label = `${INDONESIAN_MONTHS[targetMonth - 1]} ${targetYear}`;

  const prevShort = INDONESIAN_MONTHS_SHORT[prevMonthDate.getMonth()];
  const currShort = INDONESIAN_MONTHS_SHORT[currentCutoffDate.getMonth()];
  const prevYear = prevMonthDate.getFullYear();
  const currYear = currentCutoffDate.getFullYear();

  const rangeLabel = `${PAYROLL_CUTOFF_START_DAY} ${prevShort} ${prevYear} – ${PAYROLL_CUTOFF_END_DAY} ${currShort} ${currYear}`;
  const shortRangeLabel =
    prevYear === currYear
      ? `${PAYROLL_CUTOFF_START_DAY} ${prevShort} – ${PAYROLL_CUTOFF_END_DAY} ${currShort} ${currYear}`
      : rangeLabel;

  return {
    monthKey,
    year: targetYear,
    month: targetMonth,
    label,
    startDate,
    endDate,
    rangeLabel,
    shortRangeLabel,
  };
}

/**
 * Parse monthKey ('YYYY-MM') menjadi HrPayrollPeriod (26 bulan lalu s/d 25 bulan target).
 */
export function getPayrollPeriodByMonthKey(monthKey?: string | null): HrPayrollPeriod {
  if (monthKey && /^\d{4}-\d{2}$/.test(monthKey.trim())) {
    const [y, m] = monthKey.trim().split('-').map(Number);
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      return getPayrollPeriodForMonth(y, m);
    }
  }
  return getActivePayrollPeriod();
}

/**
 * Menentukan bulan periode administrasi/gaji (YYYY-MM) dari tanggal tertentu:
 * - Tgl 1..25 => masuk periode bulan berjalan.
 * - Tgl 26..31 => masuk periode bulan BERIKUTNYA.
 * Contoh: 26 Oktober 2026 => '2026-11' (November 2026); 25 November 2026 => '2026-11'; 26 November 2026 => '2026-12'.
 */
export function getActivePayrollMonthKey(referenceDate: Date = new Date()): string {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth(); // 0..11
  const d = referenceDate.getDate();

  const target = d >= PAYROLL_CUTOFF_START_DAY ? new Date(y, m + 1, 1) : new Date(y, m, 1);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
}

export function getPayrollMonthKeyForDate(isoDate: string): string {
  const parts = (isoDate || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return getActivePayrollMonthKey();
  }
  const [y, m, d] = parts;
  return getActivePayrollMonthKey(new Date(y, m - 1, d));
}

export function getActivePayrollPeriod(referenceDate: Date = new Date()): HrPayrollPeriod {
  return getPayrollPeriodByMonthKey(getActivePayrollMonthKey(referenceDate));
}

export function getPreviousPayrollPeriod(reference: Date | string = new Date()): HrPayrollPeriod {
  const basePeriod =
    typeof reference === 'string'
      ? getPayrollPeriodByMonthKey(reference)
      : getActivePayrollPeriod(reference);
  return getPayrollPeriodForMonth(basePeriod.year, basePeriod.month - 1);
}

/**
 * Mencocokkan rentang tanggal kustom (startDate..endDate) dengan siklus payroll 26–25.
 * Mengembalikan HrPayrollPeriod jika cocok tepat (26 bulan lalu s/d 25 bulan berjalan), atau null jika rentang kustom.
 */
export function detectMatchingPayrollPeriod(
  startDate: string,
  endDate: string
): HrPayrollPeriod | null {
  if (!startDate || !endDate) return null;
  const parts = endDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [endY, endM, endD] = parts;
  if (endD !== PAYROLL_CUTOFF_END_DAY) return null;
  const candidate = getPayrollPeriodForMonth(endY, endM);
  return candidate.startDate === startDate && candidate.endDate === endDate ? candidate : null;
}

/**
 * Kalender Jadwal Shift (Roster): TETAP mulai tanggal 1 sampai akhir bulan (28/29/30/31).
 */
export function getShiftCalendarPeriodForMonth(
  year: number,
  month1Based: number
): HrShiftCalendarPeriod {
  const normalized = new Date(year, month1Based - 1, 1);
  const y = normalized.getFullYear();
  const m = normalized.getMonth() + 1;
  const totalDays = new Date(y, m, 0).getDate();
  const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const endDate = `${y}-${String(m).padStart(2, '0')}-${String(totalDays).padStart(2, '0')}`;
  return {
    monthKey: `${y}-${String(m).padStart(2, '0')}`,
    year: y,
    month: m,
    label: `${INDONESIAN_MONTHS[m - 1]} ${y}`,
    startDate,
    endDate,
    totalDays,
  };
}

export function getShiftCalendarPeriodByMonthKey(monthKey?: string | null): HrShiftCalendarPeriod {
  if (monthKey && /^\d{4}-\d{2}$/.test(monthKey.trim())) {
    const [y, m] = monthKey.trim().split('-').map(Number);
    if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
      return getShiftCalendarPeriodForMonth(y, m);
    }
  }
  const now = new Date();
  return getShiftCalendarPeriodForMonth(now.getFullYear(), now.getMonth() + 1);
}

function parsePayrollTimeToMinutes(tStr?: string | null): number | null {
  if (!tStr) return null;
  const clean = tStr.replace(/\./g, ':').trim();
  const parts = clean.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function resolveScheduledStartMinutes(
  rosterRec?: RosterShiftRecord | null,
  presensiRec?: PresensiRecord | null
): number {
  const rosterStart = parsePayrollTimeToMinutes(rosterRec?.jam_masuk);
  if (rosterStart !== null && rosterStart > 0) return rosterStart;
  const shiftRaw = `${rosterRec?.shift || ''} ${presensiRec?.shift || ''}`.toLowerCase();
  if (shiftRaw.includes('3b') || shiftRaw.includes('s3b')) return 11 * 60;
  if (shiftRaw.includes('3a') || shiftRaw.includes('s3a') || shiftRaw.includes('shift 3') || shiftRaw.trim() === '3' || shiftRaw.includes('s3')) {
    return 12 * 60;
  }
  if (shiftRaw.includes('shift 2') || shiftRaw.trim() === '2' || shiftRaw.includes('s2')) return 9 * 60;
  return 8 * 60;
}

function extractOrComputeLateMinutes(
  p: PresensiRecord,
  r?: RosterShiftRecord | null
): number {
  const note = p.catatan || '';
  const match = note.match(/Terlambat\s+(\d+)\s*mnt/i);
  if (match && match[1]) {
    return parseInt(match[1], 10) || 0;
  }
  if ((p.status || '').toLowerCase() === 'terlambat' && p.jam_masuk) {
    const act = parsePayrollTimeToMinutes(p.jam_masuk);
    const sched = resolveScheduledStartMinutes(r, p);
    if (act !== null && act > sched) {
      return act - sched;
    }
  }
  return 0;
}

function classifyLeaveSubtype(rawText: string): 'CUTI' | 'SAKIT' | 'IZIN' | null {
  const s = rawText.trim().toLowerCase();
  if (!s) return null;
  if (s.includes('sakit') || s === 'skt') return 'SAKIT';
  if (s.includes('cuti') || s === 'cti') return 'CUTI';
  if (s.includes('izin') || s.includes('ijin') || s === 'ijn') return 'IZIN';
  return null;
}

/**
 * Fungsi utama kalkulasi gaji bulanan karyawan dengan siklus periode 26 bulan sebelumnya s/d 25 bulan berjalan.
 * Aturan potongan:
 * 1) Datang tapi tidak absen pulang -> denda Rp 10.000/kejadian, tetap dibayar gaji harian.
 * 2) Tidak ada absen (kecuali Libur/Off) -> potong gaji harian + rincian tanggal.
 * 3) Cuti / Izin / Sakit -> tidak dibayar gaji (potong upah harian) + rincian tanggal.
 * 4) Terlambat -> toleransi akumulasi 30 menit/periode; keterlambatan setelah >30 menit kena Rp 5.000/hari.
 */
export function calculateMonthlyPayroll({
  monthKey,
  startDateOverride,
  endDateOverride,
  karyawanList,
  presensiList,
  rosterList,
  lemburList,
  cutiList,
  izinPulangAwalList = [],
  config = {},
}: {
  /** Target bulan gaji dalam format 'YYYY-MM', contoh: '2026-11' (26 Okt – 25 Nov 2026) */
  monthKey: string;
  /** Opsional: override tanggal mulai jika sedang mengecek rentang kustom */
  startDateOverride?: string;
  /** Opsional: override tanggal selesai jika sedang mengecek rentang kustom */
  endDateOverride?: string;
  karyawanList: KaryawanRecord[];
  presensiList: PresensiRecord[];
  rosterList: RosterShiftRecord[];
  lemburList: LemburRecord[];
  cutiList: PerijinanCutiRecord[];
  izinPulangAwalList?: IzinPulangAwalRecord[];
  config?: MonthlyPayrollConfig;
}): MonthlyPayrollResult {
  const basePeriod = getPayrollPeriodByMonthKey(monthKey);
  const effectiveStartDate = startDateOverride || basePeriod.startDate;
  const effectiveEndDate = endDateOverride || basePeriod.endDate;

  const isExactCycle =
    effectiveStartDate === basePeriod.startDate && effectiveEndDate === basePeriod.endDate;

  const period: HrPayrollPeriod = isExactCycle
    ? basePeriod
    : {
        ...basePeriod,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
        rangeLabel: `${formatIndonesianShortDate(effectiveStartDate)} – ${formatIndonesianShortDate(effectiveEndDate)}`,
        shortRangeLabel: `${formatIndonesianShortDate(effectiveStartDate)} – ${formatIndonesianShortDate(effectiveEndDate)}`,
      };

  const shiftCalendarMonths = {
    previousMonth: getShiftCalendarPeriodForMonth(basePeriod.year, basePeriod.month - 1),
    currentMonth: getShiftCalendarPeriodForMonth(basePeriod.year, basePeriod.month),
  };

  const resolvedConfig: Required<MonthlyPayrollConfig> = {
    potonganBolosMode: config.potonganBolosMode ?? 'proporsional',
    potonganBolosNominal: Math.max(0, Number(config.potonganBolosNominal) || 0),
    potonganTidakAbsenPulangNominal:
      config.potonganTidakAbsenPulangNominal !== undefined
        ? Math.max(0, Number(config.potonganTidakAbsenPulangNominal) || 0)
        : 10000,
    potongGajiCutiIzinSakit: config.potongGajiCutiIzinSakit ?? true,
    toleransiTerlambatMenit:
      config.toleransiTerlambatMenit !== undefined
        ? Math.max(0, Number(config.toleransiTerlambatMenit) || 0)
        : 30,
    potonganTerlambatPerKejadian:
      config.potonganTerlambatPerKejadian !== undefined
        ? Math.max(0, Number(config.potonganTerlambatPerKejadian) || 0)
        : 5000,
    sertakanPotonganKasbon: Boolean(config.sertakanPotonganKasbon),
    defaultWorkingDaysDivisor: Math.max(1, Number(config.defaultWorkingDaysDivisor) || 26),
  };

  const todayStr = formatLocalIsoDate(new Date());
  const effectiveEvalEndDate = period.endDate > todayStr ? todayStr : period.endDate;
  const allDatesInEvalRange = getDatesInRange(period.startDate, effectiveEvalEndDate);

  // Bangun rekap kehadiran, bolos, cuti, & lembur tepat pada rentang evaluasi
  const detailedReport = buildDetailedHrReport({
    karyawanList,
    presensiList,
    rosterList,
    lemburList,
    cutiList,
    startDate: period.startDate,
    endDate: effectiveEvalEndDate,
  });

  const kpiBatch = calculateKpiAbsensiBatch({
    karyawanList,
    presensiList,
    rosterList,
    lemburList,
    cutiList,
    izinPulangAwalList,
    startDate: period.startDate,
    endDate: effectiveEvalEndDate,
  });

  // Lookup O(1) master karyawan, presensi, roster, dan cuti by NIK
  const karyawanByNik = new Map<string, KaryawanRecord>();
  for (const k of karyawanList) {
    const key = (k.nik || '').trim().toUpperCase();
    if (key) karyawanByNik.set(key, k);
  }

  const presensiByNikDate = new Map<string, Map<string, PresensiRecord>>();
  for (const p of presensiList) {
    if (p.tanggal < period.startDate || p.tanggal > effectiveEvalEndDate) continue;
    const key = (p.nik || '').trim().toUpperCase();
    if (!key) continue;
    if (!presensiByNikDate.has(key)) presensiByNikDate.set(key, new Map());
    presensiByNikDate.get(key)!.set(p.tanggal, p);
  }

  const rosterByNikDate = new Map<string, Map<string, RosterShiftRecord>>();
  for (const r of rosterList) {
    if (r.tanggal < period.startDate || r.tanggal > effectiveEvalEndDate) continue;
    const key = (r.nik || '').trim().toUpperCase();
    if (!key) continue;
    if (!rosterByNikDate.has(key)) rosterByNikDate.set(key, new Map());
    rosterByNikDate.get(key)!.set(r.tanggal, r);
  }

  const cutiByNik = new Map<string, PerijinanCutiRecord[]>();
  for (const c of cutiList) {
    if (c.status !== 'Disetujui') continue;
    if (c.tgl_selesai < period.startDate || c.tgl_mulai > effectiveEvalEndDate) continue;
    const key = (c.nik || '').trim().toUpperCase();
    if (!key) continue;
    const arr = cutiByNik.get(key);
    if (arr) arr.push(c);
    else cutiByNik.set(key, [c]);
  }

  const isOffText = (val?: string | null) => {
    const s = (val || '').trim().toLowerCase();
    return s.includes('libur') || s === 'off' || s.includes('(off)');
  };

  const rows: EmployeeMonthlyPayrollRow[] = detailedReport.summaryRows.map((summary, index) => {
    const nikUpper = (summary.nik || '').trim().toUpperCase();
    const emp = karyawanByNik.get(nikUpper);
    const kpi = kpiBatch[nikUpper];

    const empPresensiMap = presensiByNikDate.get(nikUpper) || new Map<string, PresensiRecord>();
    const empRosterMap = rosterByNikDate.get(nikUpper) || new Map<string, RosterShiftRecord>();
    const empCutiList = cutiByNik.get(nikUpper) || [];

    const gajiPokok = Math.max(0, Number(emp?.gaji_pokok) || 0);
    const tunjangan = Math.max(0, Number(emp?.tunjangan) || 0);
    const rateLembur = Math.max(0, Number(emp?.rate_lembur) || 10000);
    const saldoKasbon = Math.max(0, Number(emp?.saldo_kasbon) || 0);

    const uangLembur =
      summary.totalUangLembur > 0
        ? Math.round(summary.totalUangLembur)
        : Math.round(summary.totalJamLembur * rateLembur);

    // Kumpulkan seluruh tanggal kerja terjadwal pada periode evaluasi (roster non-libur, atau Senin-Sabtu jika belum ada roster)
    const scheduledDatesMap = new Map<string, { shiftJadwal: string; rosterRec?: RosterShiftRecord }>();
    if (empRosterMap.size > 0) {
      empRosterMap.forEach((r, tgl) => {
        if (!isOffText(r.shift)) {
          scheduledDatesMap.set(tgl, { shiftJadwal: r.shift || 'Shift 1', rosterRec: r });
        }
      });
    } else {
      allDatesInEvalRange.forEach((d) => {
        const dayOfWeek = new Date(d + 'T00:00:00').getDay();
        if (dayOfWeek !== 0) {
          scheduledDatesMap.set(d, { shiftJadwal: 'Shift 1' });
        }
      });
    }

    // Sertakan juga tanggal di mana karyawan melakukan tap presensi non-libur
    empPresensiMap.forEach((p, tgl) => {
      if (!scheduledDatesMap.has(tgl) && !isOffText(p.status) && !isOffText(p.shift)) {
        scheduledDatesMap.set(tgl, {
          shiftJadwal: empRosterMap.get(tgl)?.shift || p.shift || 'Shift 1',
          rosterRec: empRosterMap.get(tgl),
        });
      }
    });

    const sortedDates = Array.from(scheduledDatesMap.keys()).sort();

    // Hitung jumlah hari kerja efektif (kecualikan hari ini yang masih jam kerja / belum tap pulang)
    const isTodayStillWorking = (tgl: string): boolean => {
      if (tgl !== todayStr) return false;
      const pToday = empPresensiMap.get(tgl);
      if (!pToday) return true;
      const hasM = Boolean(pToday.jam_masuk && pToday.jam_masuk.trim() !== '' && pToday.jam_masuk.trim() !== '-');
      const hasP = Boolean(pToday.jam_pulang && pToday.jam_pulang.trim() !== '' && pToday.jam_pulang.trim() !== '-');
      const sL = (pToday.status || '').toLowerCase();
      if (isOffText(sL) || classifyLeaveSubtype(sL) || sL.includes('alpha') || sL.includes('bolos')) {
        return false;
      }
      return !(hasM && hasP);
    };

    const evaluatedDates = sortedDates.filter((d) => !isTodayStillWorking(d));
    const totalJadwalKerja = evaluatedDates.length > 0 ? evaluatedDates.length : summary.totalJadwalKerja;
    const pembagiHari = totalJadwalKerja > 0 ? totalJadwalKerja : resolvedConfig.defaultWorkingDaysDivisor;
    const upahHarian = gajiPokok > 0 ? Math.round(gajiPokok / pembagiHari) : 0;

    let totalHadir = 0;
    let totalHariDibayar = 0;
    let totalTidakAbsenPulang = 0;
    let totalTidakHadirTanpaAbsen = 0;
    let totalHariCuti = 0;
    let totalHariSakit = 0;
    let totalHariIzin = 0;
    let totalTerlambat = 0;
    let totalMenitTerlambat = 0;
    let totalHariTerlambatDipotong = 0;
    let akumulasiMenitTerlambat = 0;
    let potonganTerlambat = 0;

    const detailTidakHadirItems: PayrollAbsenceDetailItem[] = [];
    const detailTerlambatItems: PayrollLateDetailItem[] = [];

    const checkLatenessForDate = (
      tgl: string,
      p: PresensiRecord,
      r: RosterShiftRecord | undefined,
      shiftJadwal: string
    ) => {
      const lateMins = extractOrComputeLateMinutes(p, r);
      const isMarkedLate = (p.status || '').toLowerCase() === 'terlambat' || lateMins > 0;
      if (!isMarkedLate) return;
      totalTerlambat++;
      totalMenitTerlambat += lateMins;
      akumulasiMenitTerlambat += lateMins;
      const melewatiToleransi = akumulasiMenitTerlambat > resolvedConfig.toleransiTerlambatMenit;
      const denda = melewatiToleransi ? resolvedConfig.potonganTerlambatPerKejadian : 0;
      if (melewatiToleransi && denda > 0) {
        totalHariTerlambatDipotong++;
        potonganTerlambat += denda;
      }
      detailTerlambatItems.push({
        tanggal: tgl,
        shiftJadwal,
        jamMasuk: p.jam_masuk || '-',
        menitTerlambat: lateMins,
        akumulasiMenit: akumulasiMenitTerlambat,
        melewatiToleransi,
        potonganNominal: denda,
        keterangan: p.catatan || `Terlambat ${lateMins} mnt`,
      });
    };

    evaluatedDates.forEach((tgl) => {
      const meta = scheduledDatesMap.get(tgl)!;
      const p = empPresensiMap.get(tgl);
      const r = meta.rosterRec || empRosterMap.get(tgl);
      const shiftJadwal = r?.shift || p?.shift || meta.shiftJadwal || 'Shift 1';

      if (isOffText(p?.status) || isOffText(r?.shift)) {
        return;
      }

      const hasMasuk = Boolean(p?.jam_masuk && p.jam_masuk.trim() !== '' && p.jam_masuk.trim() !== '-');
      const hasPulang = Boolean(p?.jam_pulang && p.jam_pulang.trim() !== '' && p.jam_pulang.trim() !== '-');
      const pStatusLower = (p?.status || '').trim().toLowerCase();
      const isAlphaStatus = pStatusLower.includes('alpha') || pStatusLower.includes('bolos') || (r?.shift || '').toLowerCase().includes('bolos') || (r?.shift || '').toLowerCase().includes('alpha');

      const matchingCuti = empCutiList.find((c) => tgl >= c.tgl_mulai && tgl <= c.tgl_selesai);
      const leaveFromPresensi = classifyLeaveSubtype(p?.status || '');
      const leaveFromRoster = classifyLeaveSubtype(r?.shift || '');
      const leaveFromForm = matchingCuti ? classifyLeaveSubtype(matchingCuti.jenis || 'Cuti') || 'CUTI' : null;

      // 1) Hadir Lengkap (Datang & Pulang ada)
      if (p && hasMasuk && hasPulang && !leaveFromPresensi && !isAlphaStatus) {
        totalHadir++;
        totalHariDibayar++;
        checkLatenessForDate(tgl, p, r, shiftJadwal);
        return;
      }

      // 2) Absen Datang tapi Tidak Absen Pulang -> Denda Rp 10.000/kejadian, TETAP DIBAYAR gaji harian
      if (p && hasMasuk && !hasPulang && !leaveFromPresensi) {
        totalTidakAbsenPulang++;
        totalHariDibayar++;
        const dendaTakPulang = resolvedConfig.potonganTidakAbsenPulangNominal;
        detailTidakHadirItems.push({
          tanggal: tgl,
          shiftJadwal,
          tipe: 'TIDAK_ABSEN_PULANG',
          statusLabel: 'Datang, Tidak Absen Pulang',
          alasan: `Absen masuk ${p.jam_masuk}, tidak absen pulang (tetap dibayar gaji, denda Rp ${dendaTakPulang.toLocaleString('id-ID')})${p.catatan ? ` · ${p.catatan}` : ''}`,
          jamMasuk: p.jam_masuk || undefined,
          jamPulang: undefined,
          presensiId: p.id,
          rosterId: r?.id,
          potonganNominal: dendaTakPulang,
          dibayarGajiHarian: true,
        });
        checkLatenessForDate(tgl, p, r, shiftJadwal);
        return;
      }

      // 3) Cuti / Izin / Sakit -> Tidak dibayar gaji (potong upah harian)
      const leaveSubtype = leaveFromPresensi || leaveFromForm || leaveFromRoster;
      if (leaveSubtype && !isAlphaStatus) {
        if (leaveSubtype === 'SAKIT') totalHariSakit++;
        else if (leaveSubtype === 'IZIN') totalHariIzin++;
        else totalHariCuti++;

        const potLeave = resolvedConfig.potongGajiCutiIzinSakit ? upahHarian : 0;
        const label =
          leaveSubtype === 'SAKIT'
            ? 'Sakit (Unpaid)'
            : leaveSubtype === 'IZIN'
            ? 'Izin (Unpaid)'
            : 'Cuti (Unpaid)';
        detailTidakHadirItems.push({
          tanggal: tgl,
          shiftJadwal,
          tipe: leaveSubtype,
          statusLabel: label,
          alasan:
            matchingCuti?.alasan ||
            p?.catatan ||
            (leaveSubtype === 'SAKIT'
              ? 'Sakit — tidak dibayar gaji harian'
              : leaveSubtype === 'IZIN'
              ? 'Izin — tidak dibayar gaji harian'
              : 'Cuti — tidak dibayar gaji harian'),
          jamMasuk: p?.jam_masuk || undefined,
          jamPulang: p?.jam_pulang || undefined,
          presensiId: p?.id,
          rosterId: r?.id,
          potonganNominal: potLeave,
          dibayarGajiHarian: !resolvedConfig.potongGajiCutiIzinSakit,
        });
        return;
      }

      // 4) Tidak Hadir / Tanpa Absen (kecuali Libur) -> Potong Gaji Harian
      totalTidakHadirTanpaAbsen++;
      const potAbsent =
        resolvedConfig.potonganBolosMode === 'proporsional'
          ? upahHarian
          : resolvedConfig.potonganBolosMode === 'nominal'
          ? resolvedConfig.potonganBolosNominal
          : 0;
      detailTidakHadirItems.push({
        tanggal: tgl,
        shiftJadwal,
        tipe: 'TIDAK_HADIR',
        statusLabel: isAlphaStatus ? 'Alpha / Bolos' : 'Tidak Ada Absen',
        alasan: p?.catatan || 'Tidak ada absen datang & pulang pada hari kerja (bukan Libur)',
        jamMasuk: p?.jam_masuk || undefined,
        jamPulang: p?.jam_pulang || undefined,
        presensiId: p?.id,
        rosterId: r?.id,
        potonganNominal: potAbsent,
        dibayarGajiHarian: false,
      });
    });

    const totalHariCutiIzinSakit = totalHariCuti + totalHariSakit + totalHariIzin;
    const potonganTidakAbsenPulang = Math.round(
      totalTidakAbsenPulang * resolvedConfig.potonganTidakAbsenPulangNominal
    );
    const potonganTidakHadir =
      totalTidakHadirTanpaAbsen > 0
        ? resolvedConfig.potonganBolosMode === 'proporsional'
          ? Math.round(upahHarian * totalTidakHadirTanpaAbsen)
          : resolvedConfig.potonganBolosMode === 'nominal'
          ? Math.round(resolvedConfig.potonganBolosNominal * totalTidakHadirTanpaAbsen)
          : 0
        : 0;
    const potonganCutiIzinSakit =
      resolvedConfig.potongGajiCutiIzinSakit && totalHariCutiIzinSakit > 0
        ? Math.round(upahHarian * totalHariCutiIzinSakit)
        : 0;

    const potonganBolos = potonganTidakHadir + potonganCutiIzinSakit + potonganTidakAbsenPulang;
    const totalHariBolos = totalTidakHadirTanpaAbsen + totalTidakAbsenPulang;

    const potonganKasbon = resolvedConfig.sertakanPotonganKasbon ? saldoKasbon : 0;

    const totalPendapatanKotor = gajiPokok + tunjangan + uangLembur;
    const totalPotongan =
      potonganTidakAbsenPulang +
      potonganTidakHadir +
      potonganCutiIzinSakit +
      potonganTerlambat +
      potonganKasbon;
    const gajiBersih = Math.max(0, totalPendapatanKotor - totalPotongan);

    return {
      no: index + 1,
      nik: summary.nik,
      nama: summary.nama,
      divisi: summary.divisi,
      jabatan: emp?.jabatan || emp?.role || '-',
      payrollMonthKey: period.monthKey,
      payrollPeriodLabel: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
      totalJadwalKerja,
      totalHadir,
      totalHariDibayar,
      totalTidakAbsenPulang,
      totalTidakHadirTanpaAbsen,
      totalTerlambat,
      totalMenitTerlambat,
      toleransiTerlambatMenit: resolvedConfig.toleransiTerlambatMenit,
      totalHariTerlambatDipotong,
      totalHariCuti,
      totalHariSakit,
      totalHariIzin,
      totalHariCutiIzinSakit,
      totalHariBolos,
      totalBolosTidakAbsenPulang: totalTidakAbsenPulang,
      totalBolosTidakAbsenDatang: totalTidakHadirTanpaAbsen,
      totalJamLembur: summary.totalJamLembur,
      nilaiKpi: kpi?.nilaiKpiAbsensi ?? 100,
      gradeKpi: kpi?.grade ?? '-',
      gajiPokok,
      tunjangan,
      rateLembur,
      uangLembur,
      upahHarian,
      potonganTidakAbsenPulang,
      potonganTidakHadir,
      potonganCutiIzinSakit,
      potonganBolos,
      potonganTerlambat,
      potonganKasbon,
      saldoKasbon,
      totalPendapatanKotor,
      totalPotongan,
      gajiBersih,
      detailTidakHadirItems,
      detailTerlambatItems,
      summaryRow: summary,
    };
  });

  const totals: MonthlyPayrollSummaryTotals = rows.reduce(
    (acc, r) => {
      acc.totalKaryawan += 1;
      acc.totalJadwalKerja += r.totalJadwalKerja;
      acc.totalHadir += r.totalHadir;
      acc.totalHariDibayar += r.totalHariDibayar;
      acc.totalTidakAbsenPulang += r.totalTidakAbsenPulang;
      acc.totalTidakHadirTanpaAbsen += r.totalTidakHadirTanpaAbsen;
      acc.totalTerlambat += r.totalTerlambat;
      acc.totalHariTerlambatDipotong += r.totalHariTerlambatDipotong;
      acc.totalHariCuti += r.totalHariCuti;
      acc.totalHariCutiIzinSakit += r.totalHariCutiIzinSakit;
      acc.totalHariBolos += r.totalHariBolos;
      acc.totalJamLembur += r.totalJamLembur;
      acc.totalGajiPokok += r.gajiPokok;
      acc.totalTunjangan += r.tunjangan;
      acc.totalUangLembur += r.uangLembur;
      acc.totalPotonganTidakAbsenPulang += r.potonganTidakAbsenPulang;
      acc.totalPotonganTidakHadir += r.potonganTidakHadir;
      acc.totalPotonganCutiIzinSakit += r.potonganCutiIzinSakit;
      acc.totalPotonganBolos += r.potonganBolos;
      acc.totalPotonganTerlambat += r.potonganTerlambat;
      acc.totalPotonganKasbon += r.potonganKasbon;
      acc.totalPotongan += r.totalPotongan;
      acc.totalPendapatanKotor += r.totalPendapatanKotor;
      acc.totalGajiBersih += r.gajiBersih;
      return acc;
    },
    {
      totalKaryawan: 0,
      totalJadwalKerja: 0,
      totalHadir: 0,
      totalHariDibayar: 0,
      totalTidakAbsenPulang: 0,
      totalTidakHadirTanpaAbsen: 0,
      totalTerlambat: 0,
      totalHariTerlambatDipotong: 0,
      totalHariCuti: 0,
      totalHariCutiIzinSakit: 0,
      totalHariBolos: 0,
      totalJamLembur: 0,
      totalGajiPokok: 0,
      totalTunjangan: 0,
      totalUangLembur: 0,
      totalPotonganTidakAbsenPulang: 0,
      totalPotonganTidakHadir: 0,
      totalPotonganCutiIzinSakit: 0,
      totalPotonganBolos: 0,
      totalPotonganTerlambat: 0,
      totalPotonganKasbon: 0,
      totalPotongan: 0,
      totalPendapatanKotor: 0,
      totalGajiBersih: 0,
    }
  );

  return {
    period,
    shiftCalendarMonths,
    config: resolvedConfig,
    rows,
    totals,
  };
}

/**
 * Ekspor Rekap Kalkulasi Gaji Bulanan (Siklus 26 s/d 25) ke file Excel (.xlsx)
 */
export function exportMonthlyPayrollToXlsx(result: MonthlyPayrollResult): void {
  const wb = XLSX.utils.book_new();
  const { period, shiftCalendarMonths, rows, totals, config } = result;

  const bolosModeLabel =
    config.potonganBolosMode === 'proporsional'
      ? 'Proporsional (Gaji Pokok / Hari Kerja)'
      : config.potonganBolosMode === 'nominal'
      ? `Nominal Tetap Rp ${config.potonganBolosNominal.toLocaleString('id-ID')} / hari`
      : 'Tanpa Potongan Tidak Hadir';

  const sheetData: any[][] = [
    [`REKAP KALKULASI GAJI BULANAN KARYAWAN — PERIODE ${period.label.toUpperCase()}`],
    [`Siklus Periode Gaji (Cut-off 26–25): ${period.startDate} s/d ${period.endDate} (${period.rangeLabel})`],
    [
      `Sumber Jadwal Shift (Kalender 1–Akhir Bulan): ${shiftCalendarMonths.previousMonth.label} (${shiftCalendarMonths.previousMonth.startDate}..${shiftCalendarMonths.previousMonth.endDate}) & ${shiftCalendarMonths.currentMonth.label} (${shiftCalendarMonths.currentMonth.startDate}..${shiftCalendarMonths.currentMonth.endDate})`,
    ],
    [
      `Aturan Potongan: Datang Tak Pulang = Rp ${config.potonganTidakAbsenPulangNominal.toLocaleString('id-ID')}/kejadian (gaji dibayar) | Tidak Hadir = ${bolosModeLabel} | Cuti/Izin/Sakit = ${config.potongGajiCutiIzinSakit ? 'Unpaid (Potong Upah Harian)' : 'Dibayar'} | Telat = Toleransi ${config.toleransiTerlambatMenit} mnt/bln lalu Rp ${config.potonganTerlambatPerKejadian.toLocaleString('id-ID')}/hari`,
    ],
    [`Dicetak pada: ${new Date().toLocaleString('id-ID')}`],
    [],
    [
      'No',
      'NIK',
      'Nama Karyawan',
      'Divisi',
      'Jadwal (Hari)',
      'Hadir Lengkap',
      'Dibayar (Hari)',
      'Tak Pulang (Kali)',
      'Cuti/Izin/Sakit',
      'Tidak Hadir (Hari)',
      'Telat (Kali / Mnt)',
      'Telat >30m (Hari)',
      'Lembur ACC (Jam)',
      'Nilai KPI',
      'Gaji Pokok (Rp)',
      'Tunjangan (Rp)',
      'Upah Lembur (Rp)',
      'Pendapatan Kotor (Rp)',
      'Denda Tak Pulang (Rp)',
      'Pot. Tidak Hadir (Rp)',
      'Pot. Cuti/Izin/Sakit (Rp)',
      'Pot. Telat >30m (Rp)',
      'Pot. Kasbon (Rp)',
      'Total Potongan (Rp)',
      'Gaji Bersih / Take-Home Pay (Rp)',
    ],
  ];

  rows.forEach((r) => {
    sheetData.push([
      r.no,
      r.nik,
      r.nama,
      r.divisi,
      r.totalJadwalKerja,
      r.totalHadir,
      r.totalHariDibayar,
      r.totalTidakAbsenPulang,
      r.totalHariCutiIzinSakit,
      r.totalTidakHadirTanpaAbsen,
      `${r.totalTerlambat}x (${r.totalMenitTerlambat} mnt)`,
      r.totalHariTerlambatDipotong,
      r.totalJamLembur,
      `${r.nilaiKpi} (${r.gradeKpi})`,
      r.gajiPokok,
      r.tunjangan,
      r.uangLembur,
      r.totalPendapatanKotor,
      r.potonganTidakAbsenPulang,
      r.potonganTidakHadir,
      r.potonganCutiIzinSakit,
      r.potonganTerlambat,
      r.potonganKasbon,
      r.totalPotongan,
      r.gajiBersih,
    ]);
  });

  sheetData.push([
    '',
    '',
    'TOTAL KESELURUHAN',
    '',
    totals.totalJadwalKerja,
    totals.totalHadir,
    totals.totalHariDibayar,
    totals.totalTidakAbsenPulang,
    totals.totalHariCutiIzinSakit,
    totals.totalTidakHadirTanpaAbsen,
    totals.totalTerlambat,
    totals.totalHariTerlambatDipotong,
    totals.totalJamLembur,
    '',
    totals.totalGajiPokok,
    totals.totalTunjangan,
    totals.totalUangLembur,
    totals.totalPendapatanKotor,
    totals.totalPotonganTidakAbsenPulang,
    totals.totalPotonganTidakHadir,
    totals.totalPotonganCutiIzinSakit,
    totals.totalPotonganTerlambat,
    totals.totalPotonganKasbon,
    totals.totalPotongan,
    totals.totalGajiBersih,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 5 },
    { wch: 12 },
    { wch: 24 },
    { wch: 14 },
    { wch: 12 },
    { wch: 13 },
    { wch: 13 },
    { wch: 15 },
    { wch: 14 },
    { wch: 15 },
    { wch: 18 },
    { wch: 14 },
    { wch: 15 },
    { wch: 12 },
    { wch: 16 },
    { wch: 15 },
    { wch: 16 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 18 },
    { wch: 15 },
    { wch: 18 },
    { wch: 26 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, `Gaji ${period.monthKey}`);

  // Worksheet 2: Rincian Ketidakhadiran & Denda Absensi
  const detailRows: any[][] = [
    [`RINCIAN KETIDAKHADIRAN & DENDA ABSENSI — PERIODE ${period.label.toUpperCase()}`],
    [],
    [
      'NIK',
      'Nama Karyawan',
      'Tanggal',
      'Shift Jadwal',
      'Kategori',
      'Jam Masuk',
      'Jam Pulang',
      'Gaji Harian',
      'Potongan (Rp)',
      'Keterangan',
    ],
  ];
  rows.forEach((r) => {
    r.detailTidakHadirItems.forEach((d) => {
      detailRows.push([
        r.nik,
        r.nama,
        d.tanggal,
        d.shiftJadwal,
        d.statusLabel,
        d.jamMasuk || '-',
        d.jamPulang || '-',
        d.dibayarGajiHarian ? 'Dibayar' : 'Tidak Dibayar',
        d.potonganNominal,
        d.alasan,
      ]);
    });
  });
  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetail['!cols'] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 13 },
    { wch: 12 },
    { wch: 26 },
    { wch: 11 },
    { wch: 11 },
    { wch: 14 },
    { wch: 15 },
    { wch: 48 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Rincian Ketidakhadiran');

  const filename = `Kalkulasi_Gaji_${period.monthKey}_${period.startDate}_sd_${period.endDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}
