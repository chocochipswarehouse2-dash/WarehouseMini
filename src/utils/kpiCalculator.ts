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

  // Effective cutoff date: jangan pernah menghukum tanggal masa depan atau hari ini yang belum selesai shift-nya
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const effectiveEndDate = endDate > todayStr ? todayStr : endDate;

  // Filter relevant records for this staff within effective date range (<= today)
  const myPresensi = presensiList.filter(
    (p) =>
      (p.nik || '').trim().toUpperCase() === nikUpper &&
      p.tanggal >= startDate &&
      p.tanggal <= effectiveEndDate
  );

  const myRoster = rosterList.filter(
    (r) =>
      (r.nik || '').trim().toUpperCase() === nikUpper &&
      r.tanggal >= startDate &&
      r.tanggal <= effectiveEndDate
  );

  // Map roster by date untuk lookup jam_pulang aktual & status shift (termasuk Shift 3b 20:00, SKT, CTI, BOLOS)
  const rosterByDate = new Map<string, RosterShiftRecord>();
  myRoster.forEach((r) => {
    rosterByDate.set(r.tanggal, r);
  });

  const isOffShift = (shiftVal?: string | null) => {
    const s = (shiftVal || '').trim().toLowerCase();
    return s.includes('libur') || s === 'off' || s.includes('(off)');
  };

  const isLeaveShift = (shiftVal?: string | null) => {
    const s = (shiftVal || '').trim().toLowerCase();
    return (
      s.includes('sakit') ||
      s === 'skt' ||
      s.includes('cuti') ||
      s === 'cti' ||
      s.includes('izin') ||
      s.includes('ijin') ||
      s === 'ijn'
    );
  };

  const isBolosShift = (shiftVal?: string | null) => {
    const s = (shiftVal || '').trim().toLowerCase();
    return s.includes('bolos') || s.includes('alpha');
  };

  const myLembur = lemburList.filter(
    (l) =>
      (l.nik || '').trim().toUpperCase() === nikUpper &&
      l.status === 'Disetujui' &&
      l.tanggal >= startDate &&
      l.tanggal <= effectiveEndDate
  );

  const myCuti = cutiList.filter(
    (c) =>
      (c.nik || '').trim().toUpperCase() === nikUpper &&
      c.status === 'Disetujui' &&
      !(c.tgl_selesai < startDate || c.tgl_mulai > effectiveEndDate)
  );

  const myIzinPulang = izinPulangAwalList.filter(
    (i) =>
      (i.nik || '').trim().toUpperCase() === nikUpper &&
      i.status === 'Disetujui' &&
      i.tanggal >= startDate &&
      i.tanggal <= effectiveEndDate
  );

  // Scheduled working days up to today (excluding 'Libur' / 'Off')
  // Hari ini hanya dihitung sebagai hari kerja efektif jika sudah ada presensi lengkap (masuk & pulang)
  // agar karyawan yang masih sedang bekerja hari ini tidak terpotong % kehadiran maupun dicap Bolos.
  const presensiMap = new Map<string, PresensiRecord>();
  myPresensi.forEach((p) => {
    presensiMap.set(p.tanggal, p);
  });

  const isTodayInProgress = (tanggal: string): boolean => {
    if (tanggal !== todayStr) return false;
    const pToday = presensiMap.get(tanggal);
    const hasM = Boolean(pToday?.jam_masuk && pToday.jam_masuk.trim() !== '' && pToday.jam_masuk.trim() !== '-');
    const hasP = Boolean(pToday?.jam_pulang && pToday.jam_pulang.trim() !== '' && pToday.jam_pulang.trim() !== '-');
    return !(hasM && hasP);
  };

  const workingRoster = myRoster.filter((r) => {
    if (isOffShift(r.shift)) return false;
    if (isTodayInProgress(r.tanggal)) return false;
    return true;
  });

  const totalHariKerja = workingRoster.length > 0 ? workingRoster.length : Math.max(1, myPresensi.filter((p) => !isTodayInProgress(p.tanggal)).length);

  let totalHadir = 0;
  let totalOnTime = 0;
  let totalTerlambat = 0;
  let totalMenitTerlambat = 0;
  let totalPulangNormal = 0;
  let totalPulangAwalIzin = 0;
  let totalPulangAwalTanpaIzin = 0;

  let totalSkorBerangkatAccum = 0;
  let totalSkorPulangAccum = 0;

  // Track dates counted as Alpha/Bolos due to incomplete attendance (e.g. tidak absen pulang)
  const bolosDates = new Set<string>();
  const leaveDates = new Set<string>();

  // Helper: resolve jam pulang standar berdasarkan jadwal Roster aktual (termasuk Shift 3b = 20:00, Shift 3a = 21:00)
  const resolveStandardEndMinutes = (p: PresensiRecord): number => {
    const rosterRec = rosterByDate.get(p.tanggal);
    const rosterEndMins = parseTimeToMinutes(rosterRec?.jam_pulang);
    if (rosterEndMins !== null && rosterEndMins > 0) {
      return rosterEndMins;
    }

    const shiftRaw = `${rosterRec?.shift || ''} ${p.shift || ''}`.toLowerCase();
    if (shiftRaw.includes('3b') || shiftRaw.includes('s3b')) return 20 * 60; // Shift 3b: 11:00 - 20:00
    if (shiftRaw.includes('3a') || shiftRaw.includes('s3a') || shiftRaw.includes('shift 3') || shiftRaw.trim() === '3' || shiftRaw.includes('s3')) {
      return 21 * 60; // Shift 3a: 12:00 - 21:00
    }
    if (shiftRaw.includes('shift 2') || shiftRaw.trim() === '2' || shiftRaw.includes('s2')) return 18 * 60; // Shift 2: 09:00 - 18:00
    return 17 * 60; // Shift 1 default: 08:00 - 17:00
  };

  // Evaluate each presensi record
  myPresensi.forEach((p) => {
    const sLower = (p.status || '').toLowerCase();
    if (sLower.includes('libur') || sLower.includes('cuti') || sLower.includes('izin') || sLower.includes('ijin') || sLower.includes('sakit')) {
      if (!sLower.includes('libur')) leaveDates.add(p.tanggal);
      return;
    }
    if (sLower.includes('alpha') || sLower.includes('bolos')) {
      if (!isTodayInProgress(p.tanggal)) bolosDates.add(p.tanggal);
      return;
    }

    const hasMasuk = Boolean(p.jam_masuk && p.jam_masuk.trim() !== '' && p.jam_masuk.trim() !== '-');
    const hasPulang = Boolean(p.jam_pulang && p.jam_pulang.trim() !== '' && p.jam_pulang.trim() !== '-');

    // Jika hari ini masih jam kerja (belum absen pulang), jangan dicap BOLOS dulu
    if (isTodayInProgress(p.tanggal)) {
      return;
    }

    // Karyawan yang tidak melakukan absen pulang (atau tidak absen datang) pada hari yang sudah lewat ditandai sebagai BOLOS
    if (!hasMasuk || !hasPulang) {
      bolosDates.add(p.tanggal);
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
    const standardEndMins = resolveStandardEndMinutes(p);
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
    }
  });

  // Calculate Cuti/Sakit/Izin & Alpha (Bolos: tidak absen datang ATAU tidak absen pulang)
  workingRoster.forEach((r) => {
    // Jika Roster eksplisit ditandai Sakit / Cuti / Izin (mis. SKT / CTI / IJN) -> BUKAN Bolos/Alpha
    if (isLeaveShift(r.shift)) {
      leaveDates.add(r.tanggal);
      return;
    }

    // Jika Roster eksplisit ditandai BOLOS / ALPHA -> PASTI masuk bolosDates
    if (isBolosShift(r.shift)) {
      bolosDates.add(r.tanggal);
      return;
    }

    const p = presensiMap.get(r.tanggal);
    const hasValidFullPresensi = Boolean(
      p &&
        p.jam_masuk &&
        p.jam_masuk.trim() !== '' &&
        p.jam_masuk.trim() !== '-' &&
        p.jam_pulang &&
        p.jam_pulang.trim() !== '' &&
        p.jam_pulang.trim() !== '-' &&
        !['libur', 'cuti', 'izin', 'ijin', 'sakit', 'alpha', 'bolos'].some((k) =>
          (p.status || '').toLowerCase().includes(k)
        )
    );
    const hasCuti = myCuti.some((c) => r.tanggal >= c.tgl_mulai && r.tanggal <= c.tgl_selesai);
    if (hasCuti) {
      leaveDates.add(r.tanggal);
      return;
    }
    if (!hasValidFullPresensi) {
      bolosDates.add(r.tanggal);
    }
  });

  const totalCutiFromForm = myCuti.reduce((acc, c) => acc + (Number(c.jumlah_hari) || 1), 0);
  const totalCutiIzin = Math.max(totalCutiFromForm, leaveDates.size);
  const totalAlpha = bolosDates.size;

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

/**
 * Batch O(N + M) KPI calculation for all employees by pre-grouping records by NIK once
 */
export function calculateKpiAbsensiBatch({
  karyawanList,
  presensiList,
  rosterList,
  lemburList = [],
  cutiList = [],
  izinPulangAwalList = [],
  startDate,
  endDate,
}: {
  karyawanList: { nik: string; nama: string; divisi?: string }[];
  presensiList: PresensiRecord[];
  rosterList: RosterShiftRecord[];
  lemburList?: LemburRecord[];
  cutiList?: PerijinanCutiRecord[];
  izinPulangAwalList?: IzinPulangAwalRecord[];
  startDate: string;
  endDate: string;
}): Record<string, KpiAbsensiSummary> {
  const presensiByNik = new Map<string, PresensiRecord[]>();
  const rosterByNik = new Map<string, RosterShiftRecord[]>();
  const lemburByNik = new Map<string, LemburRecord[]>();
  const cutiByNik = new Map<string, PerijinanCutiRecord[]>();
  const izinByNik = new Map<string, IzinPulangAwalRecord[]>();

  for (const p of presensiList) {
    if (p.tanggal < startDate || p.tanggal > endDate) continue;
    const k = (p.nik || '').trim().toUpperCase();
    if (!k) continue;
    const arr = presensiByNik.get(k);
    if (arr) arr.push(p);
    else presensiByNik.set(k, [p]);
  }

  for (const r of rosterList) {
    if (r.tanggal < startDate || r.tanggal > endDate) continue;
    const k = (r.nik || '').trim().toUpperCase();
    if (!k) continue;
    const arr = rosterByNik.get(k);
    if (arr) arr.push(r);
    else rosterByNik.set(k, [r]);
  }

  for (const l of lemburList) {
    if (l.status !== 'Disetujui' || l.tanggal < startDate || l.tanggal > endDate) continue;
    const k = (l.nik || '').trim().toUpperCase();
    if (!k) continue;
    const arr = lemburByNik.get(k);
    if (arr) arr.push(l);
    else lemburByNik.set(k, [l]);
  }

  for (const c of cutiList) {
    if (
      c.status !== 'Disetujui' ||
      !((c.tgl_mulai >= startDate && c.tgl_mulai <= endDate) ||
        (c.tgl_selesai >= startDate && c.tgl_selesai <= endDate) ||
        (c.tgl_mulai <= startDate && c.tgl_selesai >= endDate))
    ) {
      continue;
    }
    const k = (c.nik || '').trim().toUpperCase();
    if (!k) continue;
    const arr = cutiByNik.get(k);
    if (arr) arr.push(c);
    else cutiByNik.set(k, [c]);
  }

  for (const i of izinPulangAwalList) {
    if (i.status !== 'Disetujui' || i.tanggal < startDate || i.tanggal > endDate) continue;
    const k = (i.nik || '').trim().toUpperCase();
    if (!k) continue;
    const arr = izinByNik.get(k);
    if (arr) arr.push(i);
    else izinByNik.set(k, [i]);
  }

  const map: Record<string, KpiAbsensiSummary> = {};
  for (const k of karyawanList) {
    const nikUpper = (k.nik || '').trim().toUpperCase();
    if (!nikUpper) continue;
    map[nikUpper] = calculateKpiAbsensi({
      karyawan: k,
      presensiList: presensiByNik.get(nikUpper) || [],
      rosterList: rosterByNik.get(nikUpper) || [],
      lemburList: lemburByNik.get(nikUpper) || [],
      cutiList: cutiByNik.get(nikUpper) || [],
      izinPulangAwalList: izinByNik.get(nikUpper) || [],
      startDate,
      endDate,
    });
  }
  return map;
}

