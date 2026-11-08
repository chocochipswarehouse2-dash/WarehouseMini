import * as XLSX from 'xlsx';
import {
  KaryawanRecord,
  PresensiRecord,
  RosterShiftRecord,
  LemburRecord,
  PerijinanCutiRecord,
} from '../types';

export interface DetailTidakMasukItem {
  no: number;
  tanggal: string;
  nik: string;
  nama: string;
  divisi: string;
  kategori: string; // 'Bolos (Tidak Absen Pulang)' | 'Bolos (Tidak Absen Datang)' | 'Cuti Tahunan' | 'Izin' | 'Sakit' | etc.
  isBolos: boolean;
  jenisBolos?: 'TIDAK_ABSEN_PULANG' | 'TIDAK_ABSEN_DATANG';
  jamMasuk?: string;
  jamPulang?: string;
  catatanAbsensi?: string;
  alasan: string;
  shiftJadwal: string;
  statusApproval: string;
  approvedBy: string;
}

/**
 * Evaluates a PresensiRecord for audit:
 * - Valid Masuk Kerja (Hadir) requires BOTH jam_masuk AND jam_pulang.
 * - Has jam_masuk but NO jam_pulang -> Bolos (Tidak Absen Pulang), NOT counted as Masuk Kerja, log kept for audit.
 * - No jam_masuk -> Bolos (Tidak Absen Datang).
 */
export function evaluatePresensiForAudit(p?: PresensiRecord | null): {
  hasMasuk: boolean;
  hasPulang: boolean;
  isValidHadir: boolean;
  isLeaveOrOff: boolean;
  isBolosTidakAbsenPulang: boolean;
  isBolosTidakAbsenDatang: boolean;
  auditStatusLabel: string;
  auditNote: string;
} {
  if (!p) {
    return {
      hasMasuk: false,
      hasPulang: false,
      isValidHadir: false,
      isLeaveOrOff: false,
      isBolosTidakAbsenPulang: false,
      isBolosTidakAbsenDatang: true,
      auditStatusLabel: 'Bolos (Tidak Absen Datang)',
      auditNote: 'Tidak ada catatan absen datang & pulang',
    };
  }

  const hasMasuk = Boolean(p.jam_masuk && p.jam_masuk.trim() !== '' && p.jam_masuk.trim() !== '-');
  const hasPulang = Boolean(p.jam_pulang && p.jam_pulang.trim() !== '' && p.jam_pulang.trim() !== '-');

  const sLower = (p.status || '').trim().toLowerCase();
  if (['libur', 'off', 'cuti', 'izin', 'ijin', 'sakit'].some((k) => sLower.includes(k))) {
    return {
      hasMasuk,
      hasPulang,
      isValidHadir: false,
      isLeaveOrOff: true,
      isBolosTidakAbsenPulang: false,
      isBolosTidakAbsenDatang: false,
      auditStatusLabel: p.status || 'Izin/Cuti',
      auditNote: p.catatan || '-',
    };
  }

  if (sLower === 'alpha' || sLower.includes('bolos')) {
    if (hasMasuk && !hasPulang) {
      return {
        hasMasuk,
        hasPulang,
        isValidHadir: false,
        isLeaveOrOff: false,
        isBolosTidakAbsenPulang: true,
        isBolosTidakAbsenDatang: false,
        auditStatusLabel: 'Bolos (Tidak Absen Pulang)',
        auditNote: `Absen Masuk ${p.jam_masuk}, Tidak Absen Pulang${p.catatan ? ` | ${p.catatan}` : ''}`,
      };
    }
    return {
      hasMasuk,
      hasPulang,
      isValidHadir: false,
      isLeaveOrOff: false,
      isBolosTidakAbsenPulang: false,
      isBolosTidakAbsenDatang: true,
      auditStatusLabel: 'Bolos (Tidak Absen Datang)',
      auditNote: p.catatan || 'Tidak melakukan absen datang',
    };
  }

  if (hasMasuk && !hasPulang) {
    return {
      hasMasuk,
      hasPulang,
      isValidHadir: false,
      isLeaveOrOff: false,
      isBolosTidakAbsenPulang: true,
      isBolosTidakAbsenDatang: false,
      auditStatusLabel: 'Bolos (Tidak Absen Pulang)',
      auditNote: `Absen Masuk ${p.jam_masuk}, Tidak Absen Pulang${p.catatan ? ` | ${p.catatan}` : ''}`,
    };
  }

  if (!hasMasuk) {
    return {
      hasMasuk,
      hasPulang,
      isValidHadir: false,
      isLeaveOrOff: false,
      isBolosTidakAbsenPulang: false,
      isBolosTidakAbsenDatang: true,
      auditStatusLabel: 'Bolos (Tidak Absen Datang)',
      auditNote: p.catatan ? `Tidak Absen Datang | ${p.catatan}` : 'Tidak melakukan absen datang & pulang',
    };
  }

  return {
    hasMasuk,
    hasPulang,
    isValidHadir: true,
    isLeaveOrOff: false,
    isBolosTidakAbsenPulang: false,
    isBolosTidakAbsenDatang: false,
    auditStatusLabel: p.status || 'Hadir',
    auditNote: p.catatan || '-',
  };
}

export interface DetailLemburExportItem {
  no: number;
  tanggal: string;
  nik: string;
  nama: string;
  divisi: string;
  jamMulai: string;
  jamSelesai: string;
  durasiJam: number;
  deskripsi: string;
  status: string;
  approvedBy: string;
  totalLembur: number;
}

export interface SummaryKaryawanRow {
  no: number;
  nik: string;
  nama: string;
  divisi: string;
  totalJadwalKerja: number;
  totalHadir: number;
  totalTerlambat: number;
  totalTidakMasuk: number;
  totalHariCuti: number;
  totalHariBolos: number;
  totalBolosTidakAbsenPulang: number;
  totalBolosTidakAbsenDatang: number;
  totalJamLembur: number;
  totalUangLembur: number;
  detailTidakMasukStr: string;
  detailCutiStr: string;
  detailLemburStr: string;
  tidakMasukItems: DetailTidakMasukItem[];
  lemburItems: DetailLemburExportItem[];
}

export interface DetailedHrReportResult {
  summaryRows: SummaryKaryawanRow[];
  allTidakMasukItems: DetailTidakMasukItem[];
  allLemburItems: DetailLemburExportItem[];
  allPresensiItems: Array<{
    no: number;
    tanggal: string;
    nik: string;
    nama: string;
    divisi: string;
    shift: string;
    jamMasuk: string;
    jamPulang: string;
    status: string;
    catatan: string;
  }>;
}

/**
 * Generate all calendar dates between start and end (YYYY-MM-DD)
 */
export function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  if (!start || !end) return dates;
  const curr = new Date(start + 'T00:00:00');
  const stop = new Date(end + 'T00:00:00');
  if (isNaN(curr.getTime()) || isNaN(stop.getTime())) return dates;
  while (curr <= stop) {
    dates.push(curr.toISOString().slice(0, 10));
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

/**
 * Builds the comprehensive HR dataset for report and export
 */
export function buildDetailedHrReport({
  karyawanList,
  presensiList,
  rosterList,
  lemburList,
  cutiList,
  startDate,
  endDate,
}: {
  karyawanList: KaryawanRecord[];
  presensiList: PresensiRecord[];
  rosterList: RosterShiftRecord[];
  lemburList: LemburRecord[];
  cutiList: PerijinanCutiRecord[];
  startDate: string;
  endDate: string;
}): DetailedHrReportResult {
  const datesInRange = getDatesInRange(startDate, endDate);

  const summaryRows: SummaryKaryawanRow[] = [];
  const allTidakMasukItems: DetailTidakMasukItem[] = [];
  const allLemburItems: DetailLemburExportItem[] = [];
  const allPresensiItems: DetailedHrReportResult['allPresensiItems'] = [];

  let tidakMasukGlobalIndex = 1;
  let lemburGlobalIndex = 1;
  let presensiGlobalIndex = 1;

  karyawanList.forEach((k, idx) => {
    const kNik = (k.nik || '').trim();
    const kNama = k.nama || '-';
    const kDivisi = k.divisi || '-';

    // Filter relevant records for this employee
    const myRosters = rosterList.filter(
      (r) => (r.nik || '').trim() === kNik && r.tanggal >= startDate && r.tanggal <= endDate
    );
    const myPresensi = presensiList.filter(
      (p) => (p.nik || '').trim() === kNik && p.tanggal >= startDate && p.tanggal <= endDate
    );
    const myCuti = cutiList.filter(
      (c) =>
        (c.nik || '').trim() === kNik &&
        !(c.tgl_selesai < startDate || c.tgl_mulai > endDate)
    );
    const myLembur = lemburList.filter(
      (l) => (l.nik || '').trim() === kNik && l.tanggal >= startDate && l.tanggal <= endDate
    );

    // Map scheduled working dates
    // 1) If employee has explicit roster shifts
    let scheduledWorkDays: Array<{ tanggal: string; shift: string }> = [];
    if (myRosters.length > 0) {
      scheduledWorkDays = myRosters
        .filter((r) => {
          const s = (r.shift || '').toLowerCase();
          return !s.includes('libur') && !s.includes('off');
        })
        .map((r) => ({ tanggal: r.tanggal, shift: r.shift || 'Reguler' }));
    } else {
      // 2) Fallback: Monday-Saturday in the date range
      scheduledWorkDays = datesInRange
        .filter((d) => new Date(d + 'T00:00:00').getDay() !== 0) // exclude Sunday
        .map((d) => ({ tanggal: d, shift: 'Reguler' }));
    }

    // Ensure any date where employee tapped presensi is also evaluated if not in scheduledWorkDays
    const scheduledDateSet = new Set(scheduledWorkDays.map((s) => s.tanggal));
    myPresensi.forEach((p) => {
      if (p.tanggal && !scheduledDateSet.has(p.tanggal)) {
        const s = (p.shift || '').toLowerCase();
        if (!s.includes('libur') && !s.includes('off')) {
          scheduledDateSet.add(p.tanggal);
          scheduledWorkDays.push({ tanggal: p.tanggal, shift: p.shift || 'Reguler' });
        }
      }
    });

    // Sort scheduled dates ascending
    scheduledWorkDays.sort((a, b) => a.tanggal.localeCompare(b.tanggal));

    // Evaluate attendance and absences
    let totalHadir = 0;
    let totalTerlambat = 0;
    const empTidakMasukItems: DetailTidakMasukItem[] = [];

    // Map presensi by date for fast lookup
    const presensiByDate = new Map<string, PresensiRecord>();
    myPresensi.forEach((p) => {
      presensiByDate.set(p.tanggal, p);
    });

    scheduledWorkDays.forEach((sched) => {
      const p = presensiByDate.get(sched.tanggal);
      const evalRes = evaluatePresensiForAudit(p);

      if (evalRes.isValidHadir && p) {
        totalHadir++;
        const sLower = (p.status || '').toLowerCase();
        const catatan = p.catatan || '';
        if (sLower === 'terlambat' || /terlambat\s+\d+/i.test(catatan)) {
          totalTerlambat++;
        }
      } else {
        // TIDAK DIHITUNG MASUK KERJA!
        // Check if there is a cuti/izin/sakit request covering this date (only if they didn't tap partial check-in without checkout, or if they had official leave)
        const matchingCuti = myCuti.find(
          (c) => sched.tanggal >= c.tgl_mulai && sched.tanggal <= c.tgl_selesai
        );

        if (matchingCuti && !evalRes.isBolosTidakAbsenPulang) {
          const item: DetailTidakMasukItem = {
            no: tidakMasukGlobalIndex++,
            tanggal: sched.tanggal,
            nik: kNik,
            nama: kNama,
            divisi: kDivisi,
            kategori: matchingCuti.jenis || 'Cuti',
            isBolos: false,
            alasan: matchingCuti.alasan || matchingCuti.jenis || 'Izin/Cuti Resmi',
            shiftJadwal: sched.shift,
            statusApproval: matchingCuti.status,
            approvedBy: matchingCuti.approved_by || '-',
          };
          empTidakMasukItems.push(item);
          allTidakMasukItems.push(item);
        } else if (evalRes.isBolosTidakAbsenPulang && p) {
          // Bolos karena tidak melakukan absen pulang (catatan absensi masuk tetap disimpan untuk audit)
          const item: DetailTidakMasukItem = {
            no: tidakMasukGlobalIndex++,
            tanggal: sched.tanggal,
            nik: kNik,
            nama: kNama,
            divisi: kDivisi,
            kategori: 'Bolos (Tidak Absen Pulang)',
            isBolos: true,
            jenisBolos: 'TIDAK_ABSEN_PULANG',
            jamMasuk: p.jam_masuk || '-',
            jamPulang: 'Tidak Absen Pulang',
            catatanAbsensi: p.catatan || '-',
            alasan: `Absen Masuk (${p.jam_masuk || '-'}), Tidak Absen Pulang${p.catatan ? ` — Catatan: ${p.catatan}` : ''}`,
            shiftJadwal: p.shift || sched.shift,
            statusApproval: 'Bolos (Tidak Absen Pulang)',
            approvedBy: '-',
          };
          empTidakMasukItems.push(item);
          allTidakMasukItems.push(item);
        } else {
          // Bolos karena tidak melakukan absen datang
          const item: DetailTidakMasukItem = {
            no: tidakMasukGlobalIndex++,
            tanggal: sched.tanggal,
            nik: kNik,
            nama: kNama,
            divisi: kDivisi,
            kategori: 'Bolos (Tidak Absen Datang)',
            isBolos: true,
            jenisBolos: 'TIDAK_ABSEN_DATANG',
            jamMasuk: 'Tidak Absen Datang',
            jamPulang: '-',
            catatanAbsensi: p?.catatan || 'Tidak ada log tap presensi',
            alasan: p?.catatan
              ? `Tidak Absen Datang — Catatan: ${p.catatan}`
              : 'Tidak melakukan absen datang & pulang (Bolos)',
            shiftJadwal: sched.shift,
            statusApproval: 'Bolos (Tidak Absen Datang)',
            approvedBy: '-',
          };
          empTidakMasukItems.push(item);
          allTidakMasukItems.push(item);
        }
      }
    });

    // Also include any approved cuti dates that might fall outside roster (e.g. multi-day leave)
    myCuti.forEach((c) => {
      const cutiDates = getDatesInRange(
        c.tgl_mulai < startDate ? startDate : c.tgl_mulai,
        c.tgl_selesai > endDate ? endDate : c.tgl_selesai
      );
      cutiDates.forEach((cd) => {
        const alreadyIncluded = empTidakMasukItems.some((tm) => tm.tanggal === cd);
        if (!alreadyIncluded) {
          const item: DetailTidakMasukItem = {
            no: tidakMasukGlobalIndex++,
            tanggal: cd,
            nik: kNik,
            nama: kNama,
            divisi: kDivisi,
            kategori: c.jenis || 'Cuti',
            isBolos: false,
            alasan: c.alasan || c.jenis || 'Izin/Cuti Resmi',
            shiftJadwal: 'Izin/Cuti',
            statusApproval: c.status,
            approvedBy: c.approved_by || '-',
          };
          empTidakMasukItems.push(item);
          allTidakMasukItems.push(item);
        }
      });
    });

    // Sort employee absences by date
    empTidakMasukItems.sort((a, b) => a.tanggal.localeCompare(b.tanggal));

    const totalHariBolos = empTidakMasukItems.filter((i) => i.isBolos).length;
    const totalBolosTidakAbsenPulang = empTidakMasukItems.filter(
      (i) => i.isBolos && i.jenisBolos === 'TIDAK_ABSEN_PULANG'
    ).length;
    const totalBolosTidakAbsenDatang = empTidakMasukItems.filter(
      (i) => i.isBolos && i.jenisBolos !== 'TIDAK_ABSEN_PULANG'
    ).length;
    const totalHariCuti = empTidakMasukItems.filter((i) => !i.isBolos).length;
    const totalTidakMasuk = empTidakMasukItems.length;

    // String representation of absences for summary table
    const detailTidakMasukStr = empTidakMasukItems.length > 0
      ? empTidakMasukItems
          .map((i) => `${i.tanggal}: ${i.kategori}${i.alasan && i.alasan !== i.kategori ? ` (${i.alasan})` : ''}`)
          .join('; ')
      : 'Nihil (Hadir Lengkap)';

    // String representation of cuti
    const detailCutiStr = myCuti.length > 0
      ? myCuti
          .map((c) => {
            const range = c.tgl_mulai === c.tgl_selesai ? c.tgl_mulai : `${c.tgl_mulai} s/d ${c.tgl_selesai}`;
            return `${range} (${c.jenis}: ${c.alasan || '-'} [${c.status}])`;
          })
          .join('; ')
      : 'Nihil';

    // Lembur Details
    const empLemburItems: DetailLemburExportItem[] = [];
    let totalJamLembur = 0;
    let totalUangLembur = 0;

    myLembur.forEach((l) => {
      const durasi = Number(l.durasi_jam) || 0;
      const uang = Number(l.total_lembur) || 0;
      if (l.status === 'Disetujui') {
        totalJamLembur += durasi;
        totalUangLembur += uang;
      }

      const item: DetailLemburExportItem = {
        no: lemburGlobalIndex++,
        tanggal: l.tanggal,
        nik: kNik,
        nama: kNama,
        divisi: kDivisi,
        jamMulai: (l.jam_mulai || '').slice(0, 5),
        jamSelesai: (l.jam_selesai || '').slice(0, 5),
        durasiJam: durasi,
        deskripsi: l.deskripsi || '-',
        status: l.status,
        approvedBy: l.approved_by || '-',
        totalLembur: uang,
      };
      empLemburItems.push(item);
      allLemburItems.push(item);
    });

    empLemburItems.sort((a, b) => a.tanggal.localeCompare(b.tanggal));

    const detailLemburStr = empLemburItems.length > 0
      ? empLemburItems
          .map((l) => `${l.tanggal} (${l.jamMulai}-${l.jamSelesai}, ${l.durasiJam} Jam: ${l.deskripsi} [${l.status}])`)
          .join('; ')
      : 'Nihil';

    // Add presensi items to allPresensiItems (preserving raw log for audit with clear Bolos label)
    myPresensi.forEach((p) => {
      const evalRes = evaluatePresensiForAudit(p);
      allPresensiItems.push({
        no: presensiGlobalIndex++,
        tanggal: p.tanggal,
        nik: kNik,
        nama: kNama,
        divisi: kDivisi,
        shift: p.shift || '-',
        jamMasuk: p.jam_masuk || 'Tidak Absen Datang',
        jamPulang: p.jam_pulang || (evalRes.isBolosTidakAbsenPulang ? 'Tidak Absen Pulang' : '-'),
        status: evalRes.auditStatusLabel,
        catatan: p.catatan || '-',
      });
    });

    summaryRows.push({
      no: idx + 1,
      nik: kNik,
      nama: kNama,
      divisi: kDivisi,
      totalJadwalKerja: scheduledWorkDays.length,
      totalHadir,
      totalTerlambat,
      totalTidakMasuk,
      totalHariCuti,
      totalHariBolos,
      totalBolosTidakAbsenPulang,
      totalBolosTidakAbsenDatang,
      totalJamLembur,
      totalUangLembur,
      detailTidakMasukStr,
      detailCutiStr,
      detailLemburStr,
      tidakMasukItems: empTidakMasukItems,
      lemburItems: empLemburItems,
    });
  });

  return {
    summaryRows,
    allTidakMasukItems,
    allLemburItems,
    allPresensiItems,
  };
}

/**
 * Export to neatly formatted multi-sheet Excel (.xlsx) file
 */
export function exportHrReportToXlsx({
  data,
  startDate,
  endDate,
}: {
  data: DetailedHrReportResult;
  startDate: string;
  endDate: string;
}) {
  const wb = XLSX.utils.book_new();

  // ----------------------------------------------------
  // SHEET 1: REKAPITULASI KARYAWAN (Summary)
  // ----------------------------------------------------
  const sheet1Data: any[][] = [
    ['REKAPITULASI LAPORAN KARYAWAN WMS'],
    [`Periode: ${startDate} s/d ${endDate}`],
    [`Dicetak pada: ${new Date().toLocaleString('id-ID')}`],
    ['Catatan Audit: Karyawan yang tidak melakukan absen pulang ditandai sebagai BOLOS dan tidak dihitung masuk kerja, namun catatan absensi tetap tersimpan untuk audit.'],
    [], // empty row
    [
      'No',
      'NIK',
      'Nama Karyawan',
      'Divisi',
      'Jadwal Kerja (Hari)',
      'Total Hadir Lengkap (Hari)',
      'Terlambat (Kali)',
      'Total Tidak Masuk (Hari)',
      'Cuti / Izin Resmi (Hari)',
      'Total Bolos (Hari)',
      'Bolos Tidak Absen Pulang (Hari)',
      'Bolos Tidak Absen Datang (Hari)',
      'Total Lembur ACC (Jam)',
      'Est. Upah Lembur (Rp)',
      'Rincian Tanggal Tidak Masuk & Alasan Audit',
      'Rincian Cuti (Tanggal, Jenis & Alasan)',
      'Rincian Lembur (Tanggal, Jam, Tugas & Status)',
    ],
  ];

  let sumJadwal = 0;
  let sumHadir = 0;
  let sumTerlambat = 0;
  let sumTidakMasuk = 0;
  let sumCuti = 0;
  let sumBolos = 0;
  let sumBolosTidakPulang = 0;
  let sumBolosTidakDatang = 0;
  let sumJamLembur = 0;
  let sumUangLembur = 0;

  data.summaryRows.forEach((row, i) => {
    sumJadwal += row.totalJadwalKerja;
    sumHadir += row.totalHadir;
    sumTerlambat += row.totalTerlambat;
    sumTidakMasuk += row.totalTidakMasuk;
    sumCuti += row.totalHariCuti;
    sumBolos += row.totalHariBolos;
    sumBolosTidakPulang += row.totalBolosTidakAbsenPulang;
    sumBolosTidakDatang += row.totalBolosTidakAbsenDatang;
    sumJamLembur += row.totalJamLembur;
    sumUangLembur += row.totalUangLembur;

    sheet1Data.push([
      i + 1,
      row.nik,
      row.nama,
      row.divisi,
      row.totalJadwalKerja,
      row.totalHadir,
      row.totalTerlambat,
      row.totalTidakMasuk,
      row.totalHariCuti,
      row.totalHariBolos,
      row.totalBolosTidakAbsenPulang,
      row.totalBolosTidakAbsenDatang,
      row.totalJamLembur,
      row.totalUangLembur,
      row.detailTidakMasukStr,
      row.detailCutiStr,
      row.detailLemburStr,
    ]);
  });

  // Grand Total Row
  sheet1Data.push([
    '',
    '',
    'TOTAL KESELURUHAN',
    '',
    sumJadwal,
    sumHadir,
    sumTerlambat,
    sumTidakMasuk,
    sumCuti,
    sumBolos,
    sumBolosTidakPulang,
    sumBolosTidakDatang,
    sumJamLembur,
    sumUangLembur,
    '',
    '',
    '',
  ]);

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  ws1['!cols'] = [
    { wch: 5 },  // No
    { wch: 12 }, // NIK
    { wch: 24 }, // Nama
    { wch: 15 }, // Divisi
    { wch: 18 }, // Jadwal
    { wch: 22 }, // Hadir Lengkap
    { wch: 16 }, // Terlambat
    { wch: 22 }, // Total Tidak Masuk
    { wch: 22 }, // Cuti
    { wch: 18 }, // Total Bolos
    { wch: 26 }, // Bolos Tidak Absen Pulang
    { wch: 26 }, // Bolos Tidak Absen Datang
    { wch: 22 }, // Lembur Jam
    { wch: 22 }, // Upah Lembur
    { wch: 60 }, // Rincian Tidak Masuk
    { wch: 45 }, // Rincian Cuti
    { wch: 55 }, // Rincian Lembur
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Rekap Karyawan');

  // ----------------------------------------------------
  // SHEET 2: DETAIL TIDAK MASUK & CUTI (AUDIT BOLOS)
  // ----------------------------------------------------
  const sheet2Data: any[][] = [
    ['RINCIAN DETAIL KETIDAKHADIRAN, AUDIT BOLOS & CUTI KARYAWAN'],
    [`Periode: ${startDate} s/d ${endDate}`],
    ['Catatan SOP: Tidak absen datang ATAU tidak absen pulang = BOLOS (tidak dihitung masuk kerja). Catatan tap absensi tetap ditampilkan untuk audit.'],
    [],
    [
      'No',
      'Tanggal',
      'NIK',
      'Nama Karyawan',
      'Divisi',
      'Kategori',
      'Status Audit Kehadiran',
      'Jam Masuk (Audit)',
      'Jam Pulang (Audit)',
      'Alasan / Catatan Log Presensi',
      'Jadwal Shift',
      'Status Approval',
      'Disetujui Oleh',
    ],
  ];

  if (data.allTidakMasukItems.length === 0) {
    sheet2Data.push(['-', '-', '-', '-', '-', 'Nihil', 'Seluruh karyawan hadir lengkap (datang & pulang) sesuai jadwal', '-', '-', '-', '-', '-', '-']);
  } else {
    data.allTidakMasukItems.forEach((item, idx) => {
      sheet2Data.push([
        idx + 1,
        item.tanggal,
        item.nik,
        item.nama,
        item.divisi,
        item.kategori,
        item.isBolos
          ? item.jenisBolos === 'TIDAK_ABSEN_PULANG'
            ? 'BOLOS (Tidak Absen Pulang)'
            : 'BOLOS (Tidak Absen Datang)'
          : 'Cuti / Izin Resmi',
        item.jamMasuk || '-',
        item.jamPulang || '-',
        item.alasan,
        item.shiftJadwal,
        item.statusApproval,
        item.approvedBy,
      ]);
    });
  }

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = [
    { wch: 5 },  // No
    { wch: 14 }, // Tanggal
    { wch: 12 }, // NIK
    { wch: 24 }, // Nama
    { wch: 15 }, // Divisi
    { wch: 26 }, // Kategori
    { wch: 28 }, // Status
    { wch: 20 }, // Jam Masuk
    { wch: 20 }, // Jam Pulang
    { wch: 50 }, // Alasan / Catatan
    { wch: 16 }, // Shift
    { wch: 24 }, // Status Approval
    { wch: 18 }, // Disetujui Oleh
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Detail Tidak Masuk & Cuti');

  // ----------------------------------------------------
  // SHEET 3: DETAIL LEMBUR KARYAWAN
  // ----------------------------------------------------
  const sheet3Data: any[][] = [
    ['RINCIAN DATA LEMBUR KARYAWAN'],
    [`Periode: ${startDate} s/d ${endDate}`],
    [],
    [
      'No',
      'Tanggal Lembur',
      'NIK',
      'Nama Karyawan',
      'Divisi',
      'Jam Mulai',
      'Jam Selesai',
      'Durasi (Jam)',
      'Tugas / Alasan / Pekerjaan Lembur',
      'Status Lembur',
      'Disetujui Oleh',
      'Estimasi Upah Lembur (Rp)',
    ],
  ];

  if (data.allLemburItems.length === 0) {
    sheet3Data.push(['-', '-', '-', '-', '-', '-', '-', 0, 'Tidak ada data lembur pada periode ini', '-', '-', 0]);
  } else {
    data.allLemburItems.forEach((item, idx) => {
      sheet3Data.push([
        idx + 1,
        item.tanggal,
        item.nik,
        item.nama,
        item.divisi,
        item.jamMulai,
        item.jamSelesai,
        item.durasiJam,
        item.deskripsi,
        item.status,
        item.approvedBy,
        item.totalLembur,
      ]);
    });
  }

  const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
  ws3['!cols'] = [
    { wch: 5 },  // No
    { wch: 14 }, // Tanggal
    { wch: 12 }, // NIK
    { wch: 24 }, // Nama
    { wch: 15 }, // Divisi
    { wch: 12 }, // Jam Mulai
    { wch: 12 }, // Jam Selesai
    { wch: 14 }, // Durasi
    { wch: 45 }, // Tugas
    { wch: 16 }, // Status
    { wch: 18 }, // Disetujui Oleh
    { wch: 22 }, // Upah
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Detail Lembur');

  // ----------------------------------------------------
  // SHEET 4: LOG PRESENSI HARIAN
  // ----------------------------------------------------
  const sheet4Data: any[][] = [
    ['LOG DATA PRESENSI HARIAN'],
    [`Periode: ${startDate} s/d ${endDate}`],
    [],
    [
      'No',
      'Tanggal',
      'NIK',
      'Nama Karyawan',
      'Divisi',
      'Shift',
      'Jam Masuk',
      'Jam Pulang',
      'Status Tap',
      'Catatan Presensi',
    ],
  ];

  if (data.allPresensiItems.length === 0) {
    sheet4Data.push(['-', '-', '-', '-', '-', '-', '-', '-', 'Nihil', 'Tidak ada data presensi']);
  } else {
    data.allPresensiItems.forEach((item, idx) => {
      sheet4Data.push([
        idx + 1,
        item.tanggal,
        item.nik,
        item.nama,
        item.divisi,
        item.shift,
        item.jamMasuk,
        item.jamPulang,
        item.status,
        item.catatan,
      ]);
    });
  }

  const ws4 = XLSX.utils.aoa_to_sheet(sheet4Data);
  ws4['!cols'] = [
    { wch: 5 },  // No
    { wch: 14 }, // Tanggal
    { wch: 12 }, // NIK
    { wch: 24 }, // Nama
    { wch: 15 }, // Divisi
    { wch: 14 }, // Shift
    { wch: 14 }, // Masuk
    { wch: 14 }, // Pulang
    { wch: 16 }, // Status
    { wch: 50 }, // Catatan
  ];
  XLSX.utils.book_append_sheet(wb, ws4, 'Presensi Harian');

  // Trigger file download in browser
  const filename = `Laporan_Rekap_Karyawan_${startDate}_sd_${endDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Export to consolidated CSV format with all detailed columns
 */
export function exportHrReportToCsv({
  data,
  startDate,
  endDate,
}: {
  data: DetailedHrReportResult;
  startDate: string;
  endDate: string;
}) {
  const csvRows: string[] = [];

  // Title and metadata
  csvRows.push(`"REKAPITULASI LAPORAN KARYAWAN WMS"`);
  csvRows.push(`"Periode: ${startDate} s/d ${endDate}"`);
  csvRows.push(`"Waktu Ekspor: ${new Date().toLocaleString('id-ID')}"`);
  csvRows.push(''); // blank row

  // Header row
  const headers = [
    'No',
    'NIK',
    'Nama Karyawan',
    'Divisi',
    'Jadwal Hari Kerja',
    'Total Hadir',
    'Terlambat (Kali)',
    'Total Tidak Masuk',
    'Cuti / Izin (Hari)',
    'Bolos / Tanpa Absen (Hari)',
    'Total Lembur (Jam)',
    'Est Upah Lembur (Rp)',
    'Rincian Tanggal Tidak Masuk & Keterangan',
    'Rincian Cuti (Tanggal, Jenis & Alasan)',
    'Rincian Lembur (Tanggal, Jam, Tugas & Status)',
  ];
  csvRows.push(headers.map((h) => `"${h}"`).join(','));

  // Data rows
  data.summaryRows.forEach((r, idx) => {
    const rowValues = [
      idx + 1,
      r.nik,
      r.nama,
      r.divisi,
      r.totalJadwalKerja,
      r.totalHadir,
      r.totalTerlambat,
      r.totalTidakMasuk,
      r.totalHariCuti,
      r.totalHariBolos,
      r.totalJamLembur,
      r.totalUangLembur,
      r.detailTidakMasukStr,
      r.detailCutiStr,
      r.detailLemburStr,
    ];

    csvRows.push(
      rowValues
        .map((val) => {
          const s = String(val ?? '');
          return `"${s.replace(/"/g, '""')}"`;
        })
        .join(',')
    );
  });

  // UTF-8 BOM for clean display in Microsoft Excel
  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Rekap_Karyawan_Lengkap_${startDate}_sd_${endDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
