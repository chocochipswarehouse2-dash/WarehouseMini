import React, { useState, useEffect, useCallback } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  X,
  Search,
  LocateFixed,
  Check,
  ZoomIn,
  ZoomOut,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { getBrowserGeolocation, formatDistanceMeters } from '../../utils/geoUtils';

interface LocationMapPickerModalProps {
  isOpen: boolean;
  initialLat: number;
  initialLng: number;
  initialRadius: number;
  locationName: string;
  onSave: (lat: number, lng: number) => void;
  onClose: () => void;
}

// Controller to smoothly pan the map
const MapController: React.FC<{ targetCoords: { lat: number; lng: number } }> = ({
  targetCoords,
}) => {
  const map = useMap();
  useEffect(() => {
    if (map && targetCoords.lat && targetCoords.lng) {
      map.panTo(targetCoords);
    }
  }, [map, targetCoords]);
  return null;
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
  const [searching, setSearching] = useState<boolean>(false);
  const [gettingGps, setGettingGps] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCoords({
        lat: safeInitialLat,
        lng: safeInitialLng,
      });
      setSearchError(null);
    }
  }, [isOpen, safeInitialLat, safeInitialLng]);

  // Handle map click to place pin
  const handleMapClick = useCallback((e: any) => {
    if (e.detail?.latLng) {
      const lat = Number(e.detail.latLng.lat.toFixed(6));
      const lng = Number(e.detail.latLng.lng.toFixed(6));
      setCoords({ lat, lng });
    }
  }, []);

  // Handle marker drag
  const handleMarkerDragEnd = useCallback((e: any) => {
    if (e.latLng) {
      const lat = Number(e.latLng.lat().toFixed(6));
      const lng = Number(e.latLng.lng().toFixed(6));
      setCoords({ lat, lng });
    }
  }, []);

  // Center on current GPS
  const handleJumpToMyGps = async () => {
    setGettingGps(true);
    setSearchError(null);
    try {
      const pos = await getBrowserGeolocation();
      const newCoords = {
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6)),
      };
      setCoords(newCoords);
    } catch (err: any) {
      setSearchError(err?.message || 'Gagal membaca GPS perangkat.');
    } finally {
      setGettingGps(false);
    }
  };

  // Address search via Nominatim Geocoding API (client-side free geocoder fallback)
  const handleSearchAddress = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    setSearchError(null);
    try {
      const endpoint = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        searchQuery.trim()
      )}&limit=1`;
      const res = await fetch(endpoint, {
        headers: {
          'Accept-Language': 'id,en',
        },
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        const newCoords = {
          lat: Number(parseFloat(item.lat).toFixed(6)),
          lng: Number(parseFloat(item.lon).toFixed(6)),
        };
        setCoords(newCoords);
      } else {
        setSearchError('Lokasi tidak ditemukan. Coba ketik nama jalan / area yang lebih spesifik.');
      }
    } catch (err) {
      setSearchError('Gagal mencari alamat.');
    } finally {
      setSearching(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#131d31] rounded-3xl max-w-4xl w-full h-[88vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-[#131d31]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary-500/10 flex items-center justify-center text-primary-500">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>Pilih Titik Lokasi dari Peta</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400">
                  {locationName}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Klik pada peta atau geser pin merah tepat di atas bangunan kantor / gudang Anda.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Action Bar */}
        <div className="p-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
          <div className="flex flex-col sm:flex-row items-center gap-2">
            {/* Search Input */}
            <form onSubmit={handleSearchAddress} className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama jalan, komplek pergudangan, atau gedung..."
                className="w-full pl-9 pr-20 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 font-medium"
              />
              <button
                type="submit"
                disabled={searching}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[11px] font-extrabold cursor-pointer disabled:opacity-50"
              >
                {searching ? 'Mencari...' : 'Cari'}
              </button>
            </form>

            {/* Jump to GPS Button */}
            <button
              type="button"
              onClick={handleJumpToMyGps}
              disabled={gettingGps}
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition shrink-0"
              title="Arahkan peta ke posisi GPS Anda saat ini"
            >
              <LocateFixed className={`w-3.5 h-3.5 ${gettingGps ? 'animate-spin text-primary-500' : ''}`} />
              <span>{gettingGps ? 'Membaca GPS...' : '📍 Posisi Saya'}</span>
            </button>
          </div>

          {searchError && (
            <div className="mt-2 text-xs text-rose-600 dark:text-rose-400 font-medium">
              ⚠️ {searchError}
            </div>
          )}
        </div>

        {/* Map Container */}
        <div className="relative flex-1 w-full bg-slate-100 dark:bg-slate-950 overflow-hidden">
          <APIProvider apiKey={apiKey} solutionChannel="gmp_mcp_codeassist_v1_aistudio">
            <Map
              mapId="DEMO_MAP_ID"
              center={coords}
              defaultCenter={coords}
              defaultZoom={18}
              gestureHandling="greedy"
              disableDefaultUI={false}
              onClick={handleMapClick}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <MapController targetCoords={coords} />

              {/* Pin Advanced Marker */}
              <AdvancedMarker
                position={coords}
                draggable={true}
                onDragEnd={handleMarkerDragEnd}
                title="Titik Lokasi Presensi"
              >
                <div className="relative flex flex-col items-center cursor-grab active:cursor-grabbing">
                  {/* Floating Label */}
                  <div className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-black shadow-lg mb-1 whitespace-nowrap border border-white/20 flex items-center gap-1">
                    <span>{locationName}</span>
                    <span className="text-amber-400">({initialRadius}m)</span>
                  </div>

                  {/* Marker Pin Icon */}
                  <div className="w-8 h-8 rounded-full bg-rose-500 border-2 border-white shadow-xl flex items-center justify-center text-white">
                    <MapPin className="w-4 h-4" />
                  </div>

                  {/* Pin Pointer Arrow */}
                  <div className="w-2 h-2 bg-rose-500 rotate-45 -mt-1 shadow-md"></div>
                </div>
              </AdvancedMarker>
            </Map>
          </APIProvider>

          {/* Floating Instructions Badge */}
          <div className="absolute top-3 left-3 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-lg text-[11px] text-slate-700 dark:text-slate-300 max-w-xs pointer-events-none">
            💡 <b>Tips:</b> Klik di mana saja pada peta atau geser pin merah untuk menentukan titik tengah presensi.
          </div>
        </div>

        {/* Bottom Bar: Coordinates & Confirmation */}
        <div className="p-4 bg-white dark:bg-[#131d31] border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-xs font-extrabold flex items-center gap-2">
              <span className="text-slate-400">Koordinat:</span>
              <span className="text-primary-600 dark:text-primary-400">
                {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
              </span>
            </div>
            <span className="text-xs text-slate-400">
              Radius: <b>{initialRadius}m</b>
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
