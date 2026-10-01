import { saveWmsSettings } from '../services/settings';
/**
 * GEOLOCATION & MULTI-LOCATION GEOFENCING UTILITIES FOR WMS PRESENSI
 * ==============================================================================
 * Mendukung deteksi lokasi GPS presisi tinggi untuk iPhone (iOS Safari PWA),
 * Android (Chrome PWA), Windows, dan Mac.
 * Mendukung multiple titik lokasi (misal: Gudang Utama, Kantor Pusat, Toko).
 */

export interface PresensiLocationItem {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number; // Toleransi radius (default: 25m, bisa 10m)
  accessMode?: 'all' | 'specific';
  allowedNikList?: string[]; // Jika kosong atau berisi '*', berlaku untuk semua karyawan. Jika berisi list NIK, hanya staf tersebut yang bisa absen di sini.
}

export interface PresensiLocationConfig {
  enabled: boolean;
  locations: PresensiLocationItem[];
  // Legacy single location compatibility
  officeName?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  updatedAt?: string;
  updatedBy?: string;
}

export const STORAGE_KEY_PRESENSI_LOCATION = 'wms_presensi_location_config';

// Default 2 titik lokasi kerja awal (Gudang Utama & Kantor Pusat)
export const DEFAULT_PRESENSI_LOCATIONS: PresensiLocationItem[] = [
  {
    id: 'loc_gudang_utama',
    name: 'Gudang Utama Chocochips',
    latitude: -6.175392,
    longitude: 106.827153,
    radiusMeters: 25,
    allowedNikList: ['*'], // Semua karyawan
  },
  {
    id: 'loc_kantor_pusat',
    name: 'Kantor Pusat / Toko Chocochips',
    latitude: -6.180555,
    longitude: 106.828333,
    radiusMeters: 25,
    allowedNikList: ['*'], // Semua karyawan
  },
];

export const DEFAULT_PRESENSI_CONFIG: PresensiLocationConfig = {
  enabled: true,
  locations: DEFAULT_PRESENSI_LOCATIONS,
  officeName: 'Gudang Utama Chocochips',
  latitude: -6.175392,
  longitude: 106.827153,
  radiusMeters: 25,
};

/**
 * Formula Haversine untuk menghitung jarak antara 2 titik koordinat (dalam satuan meter)
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 999999;
  const R = 6371000; // Radius Bumi dalam meter
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Mengambil konfigurasi titik lokasi kantor/gudang dari LocalStorage / Default
 */
export function getPresensiLocationConfig(): PresensiLocationConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PRESENSI_LOCATION);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object') {
        let locations: PresensiLocationItem[] = [];

        if (Array.isArray(parsed.locations) && parsed.locations.length > 0) {
          locations = parsed.locations.map((loc: any, idx: number) => ({
            id: String(loc.id || `loc_${idx + 1}`),
            name: String(loc.name || `Titik Lokasi ${idx + 1}`),
            latitude: Number(loc.latitude) || DEFAULT_PRESENSI_CONFIG.latitude || -6.175392,
            longitude: Number(loc.longitude) || DEFAULT_PRESENSI_CONFIG.longitude || 106.827153,
            radiusMeters: Math.max(5, Number(loc.radiusMeters) || 25),
            accessMode: loc.accessMode === 'specific' ? 'specific' : (Array.isArray(loc.allowedNikList) && !loc.allowedNikList.includes('*') && loc.allowedNikList.length > 0 ? 'specific' : 'all'),
            allowedNikList: Array.isArray(loc.allowedNikList) ? loc.allowedNikList : ['*'],
          }));
        } else if (parsed.latitude !== undefined) {
          // Migrasi dari single location lama
          locations = [
            {
              id: 'loc_1',
              name: parsed.officeName || 'Gudang Utama Chocochips',
              latitude: Number(parsed.latitude) || -6.175392,
              longitude: Number(parsed.longitude) || 106.827153,
              radiusMeters: Math.max(5, Number(parsed.radiusMeters) || 25),
              allowedNikList: ['*'],
            },
          ];
        }

        if (locations.length === 0) {
          locations = [...DEFAULT_PRESENSI_LOCATIONS];
        }

        return {
          enabled: parsed.enabled !== false,
          locations,
          officeName: locations[0]?.name || 'Gudang Utama',
          latitude: locations[0]?.latitude,
          longitude: locations[0]?.longitude,
          radiusMeters: locations[0]?.radiusMeters || 25,
          updatedAt: parsed.updatedAt,
          updatedBy: parsed.updatedBy,
        };
      }
    }
  } catch (e) {
    console.warn('Gagal membaca konfigurasi lokasi presensi:', e);
  }
  return { ...DEFAULT_PRESENSI_CONFIG };
}

/**
 * Menyimpan konfigurasi titik lokasi kantor/gudang ke LocalStorage
 */
export function savePresensiLocationConfig(config: PresensiLocationConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY_PRESENSI_LOCATION, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('wms_presensi_location_changed', { detail: config }));
    // Sinkronisasi otomatis ke Supabase Cloud agar seluruh user di perangkat lain langsung terdampak
    saveWmsSettings({ presensi_locations: config }).catch((err) => {
      console.warn('Gagal sinkronisasi titik lokasi ke Supabase Cloud:', err);
    });
  } catch (e) {
    console.warn('Gagal menyimpan konfigurasi lokasi presensi:', e);
  }
}

/**
 * Evaluasi kecocokan lokasi GPS pengguna terhadap seluruh titik lokasi yang diizinkan
 */
export function evaluateUserLocationMatch(
  userLat: number,
  userLng: number,
  userNik: string,
  config: PresensiLocationConfig,
  accuracy?: number
): {
  isWithin: boolean;
  matchedLocation: PresensiLocationItem | null;
  closestLocation: PresensiLocationItem | null;
  closestDistance: number;
  allDistances: Array<{
    location: PresensiLocationItem;
    distance: number;
    isWithin: boolean;
    isAllowed: boolean;
  }>;
} {
  if (!config.enabled) {
    const defaultLoc = config.locations[0] || DEFAULT_PRESENSI_LOCATIONS[0];
    return {
      isWithin: true,
      matchedLocation: defaultLoc,
      closestLocation: defaultLoc,
      closestDistance: 0,
      allDistances: [],
    };
  }

  const results: Array<{
    location: PresensiLocationItem;
    distance: number;
    isWithin: boolean;
    isAllowed: boolean;
  }> = [];

  let matchedLocation: PresensiLocationItem | null = null;
  let closestLocation: PresensiLocationItem | null = null;
  let minDistance = Infinity;

  const locs = config.locations && config.locations.length > 0 ? config.locations : DEFAULT_PRESENSI_LOCATIONS;

  for (const loc of locs) {
    const dist = calculateHaversineDistance(userLat, userLng, loc.latitude, loc.longitude);
    const isAllowed =
      loc.accessMode !== 'specific' ||
      !loc.allowedNikList ||
      loc.allowedNikList.includes('*') ||
      loc.allowedNikList.includes(userNik);

    // Buffer akurasi GPS jika berada di dalam ruangan / warehouse
    const accuracyBuffer = accuracy && accuracy > 0 ? Math.min(accuracy * 0.5, 20) : 0;
    const effectiveRadius = (loc.radiusMeters || 25) + accuracyBuffer;
    const isWithin = isAllowed && dist <= effectiveRadius;

    results.push({
      location: loc,
      distance: dist,
      isWithin,
      isAllowed,
    });

    if (dist < minDistance && isAllowed) {
      minDistance = dist;
      closestLocation = loc;
    }

    if (isWithin && !matchedLocation) {
      matchedLocation = loc;
    }
  }

  return {
    isWithin: Boolean(matchedLocation),
    matchedLocation,
    closestLocation: closestLocation || locs[0],
    closestDistance: isFinite(minDistance) ? minDistance : 999999,
    allDistances: results,
  };
}

/**
 * Mengambil koordinat GPS dari browser/device pengguna (dengan akurasi tinggi)
 */
export function getBrowserGeolocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Perangkat atau browser Anda tidak mendukung fitur GPS Geolocation.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => {
        let msg = 'Gagal mendeteksi lokasi GPS.';
        switch (err.code) {
          case err.PERMISSION_DENIED:
            msg = 'Izin akses lokasi ditolak oleh pengguna/browser. Mohon izinkan akses lokasi (GPS) untuk presensi.';
            break;
          case err.POSITION_UNAVAILABLE:
            msg = 'Sinyal GPS tidak tersedia atau perangkat tidak dapat mendeteksi koordinat saat ini.';
            break;
          case err.TIMEOUT:
            msg = 'Waktu permintaan lokasi GPS habis (timeout). Silakan coba lagi.';
            break;
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 5000,
      }
    );
  });
}

/**
 * Format jarak menjadi teks yang mudah dibaca (misal: "8 meter" atau "1.4 km")
 */
export function formatDistanceMeters(meters: number): string {
  if (isNaN(meters) || meters >= 999990) return '-';
  if (meters < 1000) {
    return `${meters} meter`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}
