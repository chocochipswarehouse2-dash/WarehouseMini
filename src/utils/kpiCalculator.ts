import {
  PresensiRecord,
  RosterShiftRecord,
  LemburRecord,
  PerijinanCutiRecord,
  IzinPulangAwalRecord,
  KpiAbsensiSummary,
} from '../types';

interface KpiCalculatorParams {
  karyawan: { nik: string; nama: string; divisi?: string };
  presensiList: PresensiRecord[];
  rosterList: RosterShiftRecord[];
  lemburList?: LemburRecord[];
  cutiList?: PerijinanCutiRecord[];
  izinPulangAwalList?: IzinPulangAwalRecord[];
  startDate: string;
  endDate: string;
}

/**
 * Helper to parse time HH:mm into total minutes
 */
function parseTimeToMinutes(tStr?: string | null): number | null {
  if (!tStr) return null;
  const clean = tStr.replace(/\./g, ':').trim();
  const parts = clean.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Extracts late minutes from note e.g. "Terlambat 25 mnt"
 */
function extractLateMinutes(note?: string | null): number {
  if (!note) return 0;
  const match = note.match(/Terlambat\s+(\d+)\s*mnt/i);
  if (match && match[1]) {
    return parseInt(match[1], 10) || 0;
  }
  return 0;
}

/**
 * Calculates complete KPI Attendance & Disciplinary Score for an employee
 */
export function calculateKpiAbsensi({
  karyawan,
  presensiList,
  rosterList,
  lemburList = [],
  cutiList = [],
  izinPulangAwalList = [],
  startDate,
  endDate,
}: KpiCalculatorParams): KpiAbsensiSummary {
  const nikUpper = (karyawan.nik || '').trim().toUpperCase();

  // Filter relevant records for this staff within date range
  const myPresensi = presensiList.filter(
    (p) =>
      (p.nik || '').trim().toUpperCase() === nikUpper &&
      p.tanggal >= startDate &&
      p.tanggal <= endDate
  );

  const myRoster = rosterList.filter(
    (r) =>
      (r.nik || '').trim().toUpperCase() === nikUpper &&
      r.tanggal >= startDate &&
      r.tanggal <= endDate
  );

  const myLembur = lemburList.filter(
    (l) =>
      (l.nik || '').trim().toUpperCase() === nikUpper &&
      l.status === 'Disetujui' &&
      l.tanggal >= startDate &&
      l.tanggal <= endDate
  );

  const myCuti = cutiList.filter(
    (c) =>
      (c.nik || '').trim().toUpperCase() === nikUpper &&
      c.status === 'Disetujui' &&
      ((c.tgl_mulai >= startDate && c.tgl_mulai <= endDate) ||
        (c.tgl_selesai >= startDate && c.tgl_selesai <= endDate))
  );

  const myIzinPulang = izinPulangAwalList.filter(
    (i) =>
      (i.nik || '').trim().toUpperCase() === nikUpper &&
      i.status === 'Disetujui' &&
      i.tanggal >= startDate &&
      i.tanggal <= endDate
  );

  // Scheduled working days (excluding 'Libur' / 'Off')
  const workingRoster = myRoster.filter((r) => {
    const s = (r.shift || '').toLowerCase();
    return !s.includes('libur') && !s.includes('off');
  });

  const totalHariKerja = workingRoster.length > 0 ? workingRoster.length : Math.max(1, myPresensi.length);

  let totalHadir = 0;
  let totalOnTime = 0;
  let totalTerlambat = 0;
  let totalMenitTerlambat = 0;
  let totalPulangNormal = 0;
  let totalPulangAwalIzin = 0;
  let totalPulangAwalTanpaIzin = 0;

  let totalSkorBerangkatAccum = 0;
  let totalSkorPulangAccum = 0;

  // Map presensi by date for fast lookup
  const presensiMap = new Map<string, PresensiRecord>();
  myPresensi.forEach((p) => {
    presensiMap.set(p.tanggal, p);
  });

  // Evaluate each presensi record
  myPresensi.forEach((p) => {
    const sLower = (p.status || '').toLowerCase();
    if (sLower.includes('libur') || sLower.includes('cuti') || sLower.includes('alpha')) {
      return;
    }

    totalHadir++;

    // 1. EVALUASI ABSEN BERANGKAT (CHECK-IN)
    const lateMins = extractLateMinutes(p.catatan);
    totalMenitTerlambat += lateMins;

    if (p.status === 'Terlambat' || lateMins > 0) {
      totalTerlambat++;
      if (lateMins <= 15) {
        totalSkorBerangkatAccum += 85;
      } else if (lateMins <= 30) {
        totalSkorBerangkatAccum += 70;
      } else {
        totalSkorBerangkatAccum += 50;
      }
    } else {
      totalOnTime++;
      totalSkorBerangkatAccum += 100;
    }

    // 2. EVALUASI ABSEN PULANG (CHECK-OUT)
    const hasApprovedEarlyOut = myIzinPulang.some((i) => i.tanggal === p.tanggal);

    // Standard shift end time
    let standardEndMins = 17 * 60; // default 17:00
    const pShift = (p.shift || '').toLowerCase();
    if (pShift.includes('shift 2') || pShift === '2') standardEndMins = 18 * 60;
    else if (pShift.includes('shift 3') || pShift === '3') standardEndMins = 21 * 60;

    const actualEndMins = parseTimeToMinutes(p.jam_pulang);

    if (hasApprovedEarlyOut) {
      totalPulangAwalIzin++;
      totalSkorPulangAccum += 90; // Approved early checkout
    } else if (actualEndMins !== null) {
      if (actualEndMins >= standardEndMins - 10) {
        // Pulang tepat waktu atau lebih (lembur)
        totalPulangNormal++;
        totalSkorPulangAccum += 100;
      } else {
        // Pulang lebih awal tanpa izin
        totalPulangAwalTanpaIzin++;
        totalSkorPulangAccum += 40;
      }
    } else {
      // Belum absen pulang
      totalSkorPulangAccum += 60;
    }
  });

  // Calculate Cuti & Alpha
  const totalCutiIzin = myCuti.reduce((acc, c) => acc + (Number(c.jumlah_hari) || 1), 0);
  
  // Alpha: scheduled working day with no attendance record & no approved cuti
  let totalAlpha = 0;
  workingRoster.forEach((r) => {
    const hasPresensi = presensiMap.has(r.tanggal);
    const hasCuti = myCuti.some((c) => r.tanggal >= c.tgl_mulai && r.tanggal <= c.tgl_selesai);
    if (!hasPresensi && !hasCuti) {
      totalAlpha++;
    }
  });

  const totalLemburJam = myLembur.reduce((acc, l) => acc + (Number(l.durasi_jam) || 0), 0);

  // Percentages
  const persenKehadiran = totalHariKerja > 0 ? Math.min(100, Math.round((totalHadir / totalHariKerja) * 100)) : 100;
  const persenOnTime = totalHadir > 0 ? Math.round((totalOnTime / totalHadir) * 100) : 100;

  // Average Scores (0 - 100)
  const skorBerangkat = totalHadir > 0 ? Math.round(totalSkorBerangkatAccum / totalHadir) : 100;
  const skorPulang = totalHadir > 0 ? Math.round(totalSkorPulangAccum / totalHadir) : 100;

  // Overall Attendance KPI Score
  let nilaiKpiAbsensi = Math.round(
    skorBerangkat * 0.45 +
    skorPulang * 0.35 +
    persenKehadiran * 0.20 -
    totalAlpha * 8 -
    totalPulangAwalTanpaIzin * 5
  );

  nilaiKpiAbsensi = Math.max(0, Math.min(100, nilaiKpiAbsensi));

  // Determine Grade
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' = 'D';
  let labelStatus = 'Kurang Disiplin';

  if (nilaiKpiAbsensi >= 95) {
    grade = 'A+';
    labelStatus = 'Sangat Teladan';
  } else if (nilaiKpiAbsensi >= 90) {
    grade = 'A';
    labelStatus = 'Sangat Disiplin';
  } else if (nilaiKpiAbsensi >= 80) {
    grade = 'B';
    labelStatus = 'Disiplin Baik';
  } else if (nilaiKpiAbsensi >= 70) {
    grade = 'C';
    labelStatus = 'Perlu Perhatian';
  } else {
    grade = 'D';
    labelStatus = 'Kurang Disiplin';
  }

  return {
    nik: nikUpper,
    nama: karyawan.nama,
    divisi: karyawan.divisi || 'Warehouse',
    totalHariKerja,
    totalHadir,
    totalOnTime,
    totalTerlambat,
    totalMenitTerlambat,
    totalPulangNormal,
    totalPulangAwalIzin,
    totalPulangAwalTanpaIzin,
    totalCutiIzin,
    totalAlpha,
    totalLemburJam,
    persenKehadiran,
    persenOnTime,
    skorBerangkat,
    skorPulang,
    nilaiKpiAbsensi,
    grade,
    labelStatus,
  };
}
