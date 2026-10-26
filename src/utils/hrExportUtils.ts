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
  kategori: string; // 'Bolos' | 'Cuti Tahunan' | 'Izin' | 'Sakit' | etc.
  isBolos: boolean;
  alasan: string;
  shiftJadwal: string;
  statusApproval: string;
  approvedBy: string;
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
      const isPresent = Boolean(
        p && (p.jam_masuk || (p.status && !['libur', 'cuti', 'alpha'].includes(p.status.toLowerCase())))
      );

      if (isPresent && p) {
        totalHadir++;
        const sLower = (p.status || '').toLowerCase();
        const catatan = p.catatan || '';
        if (sLower === 'terlambat' || /terlambat\s+\d+/i.test(catatan)) {
          totalTerlambat++;
        }
      } else {
        // TIDAK MASUK!
        // Check if there is a cuti/izin/sakit request covering this date
        const matchingCuti = myCuti.find(
          (c) => sched.tanggal >= c.tgl_mulai && sched.tanggal <= c.tgl_selesai
        );

        if (matchingCuti) {
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
        } else {
          // "Kl tidak ada absen = bolos"
          const item: DetailTidakMasukItem = {
            no: tidakMasukGlobalIndex++,
            tanggal: sched.tanggal,
            nik: kNik,
            nama: kNama,
            divisi: kDivisi,
            kategori: 'Bolos',
            isBolos: true,
            alasan: 'Tidak ada absen (Bolos)',
            shiftJadwal: sched.shift,
            statusApproval: 'Tanpa Izin',
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

    // Add presensi items to allPresensiItems
    myPresensi.forEach((p) => {
      allPresensiItems.push({
        no: presensiGlobalIndex++,
        tanggal: p.tanggal,
        nik: kNik,
        nama: kNama,
        divisi: kDivisi,
        shift: p.shift || '-',
        jamMasuk: p.jam_masuk || '-',
        jamPulang: p.jam_pulang || '-',
        status: p.status || '-',
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
    [], // empty row
    [
      'No',
      'NIK',
      'Nama Karyawan',
      'Divisi',
      'Jadwal Kerja (Hari)',
      'Total Hadir (Hari)',
      'Terlambat (Kali)',
      'Total Tidak Masuk (Hari)',
      'Cuti / Izin Resmi (Hari)',
      'Bolos / Tanpa Absen (Hari)',
      'Total Lembur ACC (Jam)',
      'Est. Upah Lembur (Rp)',
      'Rincian Tanggal Tidak Masuk & Alasan',
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
  let sumJamLembur = 0;
  let sumUangLembur = 0;

  data.summaryRows.forEach((row, i) => {
    sumJadwal += row.totalJadwalKerja;
    sumHadir += row.totalHadir;
    sumTerlambat += row.totalTerlambat;
    sumTidakMasuk += row.totalTidakMasuk;
    sumCuti += row.totalHariCuti;
    sumBolos += row.totalHariBolos;
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
    { wch: 18 }, // Hadir
    { wch: 16 }, // Terlambat
    { wch: 22 }, // Total Tidak Masuk
    { wch: 22 }, // Cuti
    { wch: 24 }, // Bolos
    { wch: 22 }, // Lembur Jam
    { wch: 22 }, // Upah Lembur
    { wch: 55 }, // Rincian Tidak Masuk
    { wch: 45 }, // Rincian Cuti
    { wch: 55 }, // Rincian Lembur
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Rekap Karyawan');

  // ----------------------------------------------------
  // SHEET 2: DETAIL TIDAK MASUK & CUTI
  // ----------------------------------------------------
  const sheet2Data: any[][] = [
    ['RINCIAN DETAIL KETIDAKHADIRAN & CUTI KARYAWAN'],
    [`Periode: ${startDate} s/d ${endDate}`],
    ['Catatan: Sesuai SOP, jika jadwal kerja aktif tanpa absen & tanpa surat izin = Bolos'],
    [],
    [
      'No',
      'Tanggal',
      'NIK',
      'Nama Karyawan',
      'Divisi',
      'Kategori',
      'Status Kehadiran / Keterangan',
      'Alasan / Surat Keterangan',
      'Jadwal Shift',
      'Status Approval',
      'Disetujui Oleh',
    ],
  ];

  if (data.allTidakMasukItems.length === 0) {
    sheet2Data.push(['-', '-', '-', '-', '-', 'Nihil', 'Seluruh karyawan hadir lengkap sesuai jadwal', '-', '-', '-', '-']);
  } else {
    data.allTidakMasukItems.forEach((item, idx) => {
      sheet2Data.push([
        idx + 1,
        item.tanggal,
        item.nik,
        item.nama,
        item.divisi,
        item.kategori,
        item.isBolos ? 'BOLOS (Tanpa Absen)' : 'Cuti / Izin',
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
    { wch: 18 }, // Kategori
    { wch: 26 }, // Status
    { wch: 40 }, // Alasan
    { wch: 16 }, // Shift
    { wch: 18 }, // Status Approval
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
