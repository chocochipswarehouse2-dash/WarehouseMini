import * as XLSX from 'xlsx';
import {
  KaryawanRecord,
  PresensiRecord,
  RosterShiftRecord,
  LemburRecord,
  PerijinanCutiRecord,
  IzinPulangAwalRecord,
} from '../types';
import { buildDetailedHrReport, SummaryKaryawanRow } from './hrExportUtils';
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

export interface MonthlyPayrollConfig {
  /** Cara menghitung potongan bolos: proporsional gaji pokok / hari kerja, nominal tetap per hari, atau tanpa potongan */
  potonganBolosMode?: BolosDeductionMode;
  /** Nominal potongan per hari bolos jika potonganBolosMode === 'nominal' */
  potonganBolosNominal?: number;
  /** Nominal potongan per kejadian terlambat (opsional, default 0) */
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
  totalHadir: number;
  totalTerlambat: number;
  totalMenitTerlambat: number;
  totalHariCuti: number;
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
  potonganBolos: number;
  potonganTerlambat: number;
  potonganKasbon: number;
  saldoKasbon: number;
  totalPendapatanKotor: number;
  totalPotongan: number;
  gajiBersih: number;
  summaryRow: SummaryKaryawanRow;
}

export interface MonthlyPayrollSummaryTotals {
  totalKaryawan: number;
  totalJadwalKerja: number;
  totalHadir: number;
  totalTerlambat: number;
  totalHariCuti: number;
  totalHariBolos: number;
  totalJamLembur: number;
  totalGajiPokok: number;
  totalTunjangan: number;
  totalUangLembur: number;
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

/**
 * Fungsi utama kalkulasi gaji bulanan karyawan dengan siklus periode 26 bulan sebelumnya s/d 25 bulan berjalan.
 * Data jadwal shift (roster) tetap menggunakan kalender 1 s/d akhir bulan: kalkulasi otomatis menarik
 * irisan jadwal tgl 26–akhir bulan sebelumnya + tgl 1–25 bulan berjalan.
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
    potonganTerlambatPerKejadian: Math.max(0, Number(config.potonganTerlambatPerKejadian) || 0),
    sertakanPotonganKasbon: Boolean(config.sertakanPotonganKasbon),
    defaultWorkingDaysDivisor: Math.max(1, Number(config.defaultWorkingDaysDivisor) || 26),
  };

  // Bangun rekap kehadiran, bolos, cuti, & lembur tepat pada rentang 26..25
  const detailedReport = buildDetailedHrReport({
    karyawanList,
    presensiList,
    rosterList,
    lemburList,
    cutiList,
    startDate: period.startDate,
    endDate: period.endDate,
  });

  const kpiBatch = calculateKpiAbsensiBatch({
    karyawanList,
    presensiList,
    rosterList,
    lemburList,
    cutiList,
    izinPulangAwalList,
    startDate: period.startDate,
    endDate: period.endDate,
  });

  // Lookup O(1) master karyawan by NIK
  const karyawanByNik = new Map<string, KaryawanRecord>();
  for (const k of karyawanList) {
    const key = (k.nik || '').trim().toUpperCase();
    if (key) karyawanByNik.set(key, k);
  }

  const rows: EmployeeMonthlyPayrollRow[] = detailedReport.summaryRows.map((summary, index) => {
    const nikUpper = (summary.nik || '').trim().toUpperCase();
    const emp = karyawanByNik.get(nikUpper);
    const kpi = kpiBatch[nikUpper];

    const gajiPokok = Math.max(0, Number(emp?.gaji_pokok) || 0);
    const tunjangan = Math.max(0, Number(emp?.tunjangan) || 0);
    const rateLembur = Math.max(0, Number(emp?.rate_lembur) || 10000);
    const saldoKasbon = Math.max(0, Number(emp?.saldo_kasbon) || 0);

    // Upah lembur disetujui: utamakan nominal total_lembur dari record ACC; fallback durasi * rate_lembur
    const uangLembur =
      summary.totalUangLembur > 0
        ? Math.round(summary.totalUangLembur)
        : Math.round(summary.totalJamLembur * rateLembur);

    const pembagiHari =
      summary.totalJadwalKerja > 0
        ? summary.totalJadwalKerja
        : resolvedConfig.defaultWorkingDaysDivisor;
    const upahHarian = gajiPokok > 0 ? Math.round(gajiPokok / pembagiHari) : 0;

    let potonganBolos = 0;
    if (summary.totalHariBolos > 0) {
      if (resolvedConfig.potonganBolosMode === 'proporsional') {
        potonganBolos = Math.round(upahHarian * summary.totalHariBolos);
      } else if (resolvedConfig.potonganBolosMode === 'nominal') {
        potonganBolos = Math.round(resolvedConfig.potonganBolosNominal * summary.totalHariBolos);
      }
    }

    const potonganTerlambat =
      summary.totalTerlambat > 0 && resolvedConfig.potonganTerlambatPerKejadian > 0
        ? Math.round(summary.totalTerlambat * resolvedConfig.potonganTerlambatPerKejadian)
        : 0;

    const potonganKasbon = resolvedConfig.sertakanPotonganKasbon ? saldoKasbon : 0;

    const totalPendapatanKotor = gajiPokok + tunjangan + uangLembur;
    const totalPotongan = potonganBolos + potonganTerlambat + potonganKasbon;
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
      totalJadwalKerja: summary.totalJadwalKerja,
      totalHadir: summary.totalHadir,
      totalTerlambat: summary.totalTerlambat,
      totalMenitTerlambat: kpi?.totalMenitTerlambat || 0,
      totalHariCuti: summary.totalHariCuti,
      totalHariBolos: summary.totalHariBolos,
      totalBolosTidakAbsenPulang: summary.totalBolosTidakAbsenPulang,
      totalBolosTidakAbsenDatang: summary.totalBolosTidakAbsenDatang,
      totalJamLembur: summary.totalJamLembur,
      nilaiKpi: kpi?.nilaiKpiAbsensi ?? 100,
      gradeKpi: kpi?.grade ?? '-',
      gajiPokok,
      tunjangan,
      rateLembur,
      uangLembur,
      upahHarian,
      potonganBolos,
      potonganTerlambat,
      potonganKasbon,
      saldoKasbon,
      totalPendapatanKotor,
      totalPotongan,
      gajiBersih,
      summaryRow: summary,
    };
  });

  const totals: MonthlyPayrollSummaryTotals = rows.reduce(
    (acc, r) => {
      acc.totalKaryawan += 1;
      acc.totalJadwalKerja += r.totalJadwalKerja;
      acc.totalHadir += r.totalHadir;
      acc.totalTerlambat += r.totalTerlambat;
      acc.totalHariCuti += r.totalHariCuti;
      acc.totalHariBolos += r.totalHariBolos;
      acc.totalJamLembur += r.totalJamLembur;
      acc.totalGajiPokok += r.gajiPokok;
      acc.totalTunjangan += r.tunjangan;
      acc.totalUangLembur += r.uangLembur;
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
      totalTerlambat: 0,
      totalHariCuti: 0,
      totalHariBolos: 0,
      totalJamLembur: 0,
      totalGajiPokok: 0,
      totalTunjangan: 0,
      totalUangLembur: 0,
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
      ? 'Proporsional (Gaji Pokok / Hari Jadwal Kerja)'
      : config.potonganBolosMode === 'nominal'
      ? `Nominal Tetap Rp ${config.potonganBolosNominal.toLocaleString('id-ID')} / hari`
      : 'Tanpa Potongan Bolos';

  const sheetData: any[][] = [
    [`REKAP KALKULASI GAJI BULANAN KARYAWAN — PERIODE ${period.label.toUpperCase()}`],
    [`Siklus Periode Gaji (Cut-off 26–25): ${period.startDate} s/d ${period.endDate} (${period.rangeLabel})`],
    [
      `Sumber Jadwal Shift (Kalender 1–Akhir Bulan): ${shiftCalendarMonths.previousMonth.label} (${shiftCalendarMonths.previousMonth.startDate}..${shiftCalendarMonths.previousMonth.endDate}) & ${shiftCalendarMonths.currentMonth.label} (${shiftCalendarMonths.currentMonth.startDate}..${shiftCalendarMonths.currentMonth.endDate})`,
    ],
    [
      `Aturan Potongan: Bolos = ${bolosModeLabel} | Terlambat = Rp ${config.potonganTerlambatPerKejadian.toLocaleString('id-ID')}/kejadian | Kasbon = ${config.sertakanPotonganKasbon ? 'Dipotong' : 'Tidak Dipotong'}`,
    ],
    [`Dicetak pada: ${new Date().toLocaleString('id-ID')}`],
    [],
    [
      'No',
      'NIK',
      'Nama Karyawan',
      'Divisi',
      'Jadwal (Hari)',
      'Hadir (Hari)',
      'Cuti/Izin (Hari)',
      'Bolos (Hari)',
      'Terlambat (Kali)',
      'Lembur ACC (Jam)',
      'Nilai KPI',
      'Gaji Pokok (Rp)',
      'Tunjangan (Rp)',
      'Upah Lembur (Rp)',
      'Pendapatan Kotor (Rp)',
      'Pot. Bolos (Rp)',
      'Pot. Terlambat (Rp)',
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
      r.totalHariCuti,
      r.totalHariBolos,
      r.totalTerlambat,
      r.totalJamLembur,
      `${r.nilaiKpi} (${r.gradeKpi})`,
      r.gajiPokok,
      r.tunjangan,
      r.uangLembur,
      r.totalPendapatanKotor,
      r.potonganBolos,
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
    totals.totalHariCuti,
    totals.totalHariBolos,
    totals.totalTerlambat,
    totals.totalJamLembur,
    '',
    totals.totalGajiPokok,
    totals.totalTunjangan,
    totals.totalUangLembur,
    totals.totalPendapatanKotor,
    totals.totalPotonganBolos,
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
    { wch: 13 },
    { wch: 13 },
    { wch: 15 },
    { wch: 12 },
    { wch: 15 },
    { wch: 16 },
    { wch: 12 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 18 },
    { wch: 26 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, `Gaji ${period.monthKey}`);
  const filename = `Kalkulasi_Gaji_${period.monthKey}_${period.startDate}_sd_${period.endDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}
