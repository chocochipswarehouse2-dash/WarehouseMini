import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  APIProvider,
  Map,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  X,
  Search,
  LocateFixed,
  Check,
  Plus,
  Minus,
  Navigation,
  Compass,
} from 'lucide-react';
import { getBrowserGeolocation } from '../../utils/geoUtils';

interface LocationMapPickerModalProps {
  isOpen: boolean;
  initialLat: number;
  initialLng: number;
  initialRadius: number;
  locationName: string;
  onSave: (lat: number, lng: number) => void;
  onClose: () => void;
}

// Inner component to access Map instance and Google Geocoding library
const MapContent: React.FC<{
  initialCoords: { lat: number; lng: number };
  locationName: string;
  initialRadius: number;
  coords: { lat: number; lng: number };
  setCoords: React.Dispatch<React.SetStateAction<{ lat: number; lng: number }>>;
  searchTrigger: { query: string; timestamp: number } | null;
  onSearchResult: (address: string | null, error: string | null) => void;
  jumpGpsTrigger: number;
  onGpsResult: (error: string | null) => void;
}> = ({
  initialCoords,
  locationName,
  initialRadius,
  coords,
  setCoords,
  searchTrigger,
  onSearchResult,
  jumpGpsTrigger,
  onGpsResult,
}) => {
  const map = useMap();
  const geocodingLib = useMapsLibrary('geocoding');
  const [isDragging, setIsDragging] = useState(false);

  // Handle address search via official Google Geocoding
  useEffect(() => {
    if (!searchTrigger || !searchTrigger.query.trim()) return;

    if (!geocodingLib) {
      onSearchResult(null, 'Modul pencarian Google Maps sedang dimuat, mohon coba sebentar lagi.');
      return;
    }

    const geocoder = new geocodingLib.Geocoder();
    // Prioritize Indonesia geocoding with fallback
    geocoder.geocode(
      {
        address: searchTrigger.query.trim(),
        componentRestrictions: { country: 'ID' },
      },
      (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location;
          const newPos = {
            lat: Number(loc.lat().toFixed(6)),
            lng: Number(loc.lng().toFixed(6)),
          };
          if (map) {
            map.panTo(newPos);
            map.setZoom(18);
          }
          setCoords(newPos);
          onSearchResult(results[0].formatted_address, null);
        } else {
          // Fallback search without country restriction
          geocoder.geocode({ address: searchTrigger.query.trim() }, (res2, stat2) => {
            if (stat2 === 'OK' && res2 && res2[0]) {
              const loc = res2[0].geometry.location;
              const newPos = {
                lat: Number(loc.lat().toFixed(6)),
                lng: Number(loc.lng().toFixed(6)),
              };
              if (map) {
                map.panTo(newPos);
                map.setZoom(18);
              }
              setCoords(newPos);
              onSearchResult(res2[0].formatted_address, null);
            } else {
              onSearchResult(null, 'Alamat atau tempat tidak ditemukan. Coba ketik nama jalan, nomor, atau kota.');
            }
          });
        }
      }
    );
  }, [searchTrigger, geocodingLib, map, onSearchResult, setCoords]);

  // Handle jump to current GPS
  useEffect(() => {
    if (jumpGpsTrigger === 0) return;

    getBrowserGeolocation()
      .then((pos) => {
        const newPos = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        if (map) {
          map.panTo(newPos);
          map.setZoom(19);
        }
        setCoords(newPos);
        onGpsResult(null);
      })
      .catch((err) => {
        onGpsResult(err?.message || 'Gagal mendeteksi lokasi GPS perangkat.');
      });
  }, [jumpGpsTrigger, map, setCoords, onGpsResult]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <Map
        mapId="DEMO_MAP_ID"
        defaultCenter={initialCoords}
        defaultZoom={17}
        gestureHandling="greedy"
        disableDefaultUI={true}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        onDragstart={() => setIsDragging(true)}
        onDragend={() => setIsDragging(false)}
        onCameraChanged={(ev) => {
          const c = ev.detail.center;
          if (c) {
            setCoords({
              lat: Number(c.lat.toFixed(6)),
              lng: Number(c.lng.toFixed(6)),
            });
          }
        }}
        style={{ width: '100%', height: '100%', touchAction: 'none' }}
      />

      {/* FIXED CENTER PIN (Gojek / Grab / Google Maps Style) */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-20 flex flex-col items-center">
        {/* Floating Label */}
        <div
          className={`px-3 py-1 rounded-xl bg-slate-900/90 backdrop-blur-md text-white text-[11px] font-black shadow-2xl mb-1 flex items-center gap-1.5 border border-white/20 whitespace-nowrap transition-all duration-150 ${
            isDragging ? '-translate-y-2 scale-105 opacity-90' : 'scale-100 opacity-100'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>{locationName}</span>
          <span className="text-amber-300 font-mono">({initialRadius}m)</span>
        </div>

        {/* Pin Marker */}
        <div
          className={`relative transition-all duration-150 ${
            isDragging ? '-translate-y-2 scale-110 drop-shadow-2xl' : 'translate-y-0 scale-100'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-rose-500 border-2 border-white shadow-2xl flex items-center justify-center text-white">
            <MapPin className="w-5 h-5 fill-white text-rose-500 drop-shadow-xs" />
          </div>
          <div className="w-3 h-3 bg-rose-600 rotate-45 mx-auto -mt-1.5 shadow-md"></div>
        </div>

        {/* Pin Ground Target Shadow & Crosshair */}
        <div
          className={`w-4 h-1.5 bg-slate-900/40 rounded-full blur-[1px] mt-0.5 transition-all duration-150 ${
            isDragging ? 'scale-75 opacity-30' : 'scale-100 opacity-70'
          }`}
        ></div>
      </div>

      {/* Floating Center Crosshair Ring for Visual Precision */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10 w-8 h-8 rounded-full border border-dashed border-rose-500/50 flex items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full bg-rose-500/80"></div>
      </div>

      {/* Floating Zoom & Map Controls */}
      <div className="absolute right-3.5 bottom-6 z-20 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => map && map.setZoom((map.getZoom() || 17) + 1)}
          className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
          title="Perbesar Peta"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => map && map.setZoom((map.getZoom() || 17) - 1)}
          className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
          title="Perkecil Peta"
        >
          <Minus className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export const LocationMapPickerModal: React.FC<LocationMapPickerModalProps> = ({
  isOpen,
  initialLat,
  initialLng,
  initialRadius,
  locationName,
  onSave,
  onClose,
}) => {
  const apiKey =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    'AIzaSyD6raDoQ-wyzgdhGNCgTxEgE0pjNT9Vacw';

  // Fallback to Jakarta coordinates if 0 or invalid
  const safeInitialLat = !isNaN(initialLat) && initialLat !== 0 ? initialLat : -6.175392;
  const safeInitialLng = !isNaN(initialLng) && initialLng !== 0 ? initialLng : 106.827153;

  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: safeInitialLat,
    lng: safeInitialLng,
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchTrigger, setSearchTrigger] = useState<{ query: string; timestamp: number } | null>(null);
  const [searching, setSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

  const [jumpGpsTrigger, setJumpGpsTrigger] = useState<number>(0);
  const [gettingGps, setGettingGps] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setCoords({
        lat: safeInitialLat,
        lng: safeInitialLng,
      });
      setSearchQuery('');
      setSearchError(null);
      setResolvedAddress(null);
    }
  }, [isOpen, safeInitialLat, safeInitialLng]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResolvedAddress(null);
    setSearchTrigger({ query: searchQuery.trim(), timestamp: Date.now() });
  };

  const handleSearchResult = useCallback((address: string | null, error: string | null) => {
    setSearching(false);
    if (error) {
      setSearchError(error);
      setResolvedAddress(null);
    } else {
      setSearchError(null);
      setResolvedAddress(address);
    }
  }, []);

  const handleTriggerGps = () => {
    setGettingGps(true);
    setSearchError(null);
    setJumpGpsTrigger(Date.now());
  };

  const handleGpsResult = useCallback((error: string | null) => {
    setGettingGps(false);
    if (error) {
      setSearchError(error);
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#131d31] rounded-3xl w-full max-w-3xl h-[92vh] sm:h-[86vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-[#131d31]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-500 shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                <span>Pilih Titik Lokasi Peta</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400">
                  {locationName}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Geser peta dengan jari Anda. Titik merah di tengah layar adalah koordinat terpilih.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & GPS Bar */}
        <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800 shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            {/* Address Search */}
            <form onSubmit={handleSearchSubmit} className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari jalan, komplek pergudangan, ruko, gedung..."
                className="w-full pl-9 pr-16 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium"
              />
              <button
                type="submit"
                disabled={searching}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[11px] font-black cursor-pointer disabled:opacity-50"
              >
                {searching ? 'Cari...' : 'Cari'}
              </button>
            </form>

            {/* Jump to GPS */}
            <button
              type="button"
              onClick={handleTriggerGps}
              disabled={gettingGps}
              className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition shrink-0"
              title="Arahkan peta ke posisi GPS Anda saat ini"
            >
              <LocateFixed className={`w-3.5 h-3.5 ${gettingGps ? 'animate-spin text-primary-500' : ''}`} />
              <span className="hidden sm:inline">{gettingGps ? 'Membaca...' : 'Posisi Saya'}</span>
            </button>
          </div>

          {/* Feedback status */}
          {searchError && (
            <div className="text-[11px] text-rose-600 dark:text-rose-400 font-medium px-1 flex items-center gap-1">
              <span>⚠️</span>
              <span>{searchError}</span>
            </div>
          )}
          {resolvedAddress && (
            <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium px-1 truncate flex items-center gap-1">
              <span>📍</span>
              <span className="truncate"><b>Ditemukan:</b> {resolvedAddress}</span>
            </div>
          )}
        </div>

        {/* Map View Area */}
        <div className="relative flex-1 w-full bg-slate-100 dark:bg-slate-950 overflow-hidden">
          <APIProvider apiKey={apiKey} solutionChannel="gmp_mcp_codeassist_v1_aistudio">
            <MapContent
              initialCoords={{ lat: safeInitialLat, lng: safeInitialLng }}
              locationName={locationName}
              initialRadius={initialRadius}
              coords={coords}
              setCoords={setCoords}
              searchTrigger={searchTrigger}
              onSearchResult={handleSearchResult}
              jumpGpsTrigger={jumpGpsTrigger}
              onGpsResult={handleGpsResult}
            />
          </APIProvider>
        </div>

        {/* Bottom Action Footer */}
        <div className="p-3 sm:p-4 bg-white dark:bg-[#131d31] border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center justify-between w-full sm:w-auto gap-2">
            <div className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] sm:text-xs font-bold flex items-center gap-1.5">
              <span className="text-slate-400">Titik:</span>
              <span className="text-primary-600 dark:text-primary-400 font-black">
                {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Toleransi: <b>{initialRadius}m</b>
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(coords.lat, coords.lng);
                onClose();
              }}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-xs font-black shadow-md shadow-primary-500/25 flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Gunakan Titik Koordinat Ini</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
