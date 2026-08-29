import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Square, Play, RefreshCw, AlertCircle, Sparkles } from 'lucide-react';
import { CameraDevice } from '../types';

interface CameraScannerProps {
  onScan: (decodedText: string) => void;
  onRequestWakeLock: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScan, onRequestWakeLock }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastScanCodeRef = useRef<string>('');

  useEffect(() => {
    // Check available camera devices
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          const deviceList: CameraDevice[] = devices.map((d) => ({
            id: d.id,
            label: d.label || `Kamera ${d.id.slice(0, 5)}`,
          }));
          setCameras(deviceList);
          // Try to select rear camera by default
          const backCam = deviceList.find(
            (c) =>
              c.label.toLowerCase().includes('back') ||
              c.label.toLowerCase().includes('rear') ||
              c.label.toLowerCase().includes('environment') ||
              c.label.toLowerCase().includes('0')
          );
          setSelectedCameraId(backCam ? backCam.id : deviceList[0].id);
        }
      })
      .catch((err) => {
        console.warn('Gagal membaca list kamera:', err);
      });

    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async (cameraIdToUse?: string) => {
    setError(null);
    setIsInitializing(true);
    onRequestWakeLock();

    try {
      if (scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {
          // ignore
        }
      }

      const html5QrCode = new Html5Qrcode('reader-canvas');
      scannerRef.current = html5QrCode;

      const targetCamId = cameraIdToUse || selectedCameraId;
      const cameraConstraint = targetCamId
        ? { deviceId: { exact: targetCamId } }
        : { facingMode: 'environment' };

      await html5QrCode.start(
        cameraConstraint,
        {
          fps: 12,
          qrbox: { width: 260, height: 160 },
          aspectRatio: 1.333333,
        },
        (decodedText) => {
          const now = Date.now();
          const cleanText = decodedText.trim().toUpperCase();

          // Throttle identical scan for 1.8 seconds
          if (cleanText === lastScanCodeRef.current && now - lastScanTimeRef.current < 1800) {
            return;
          }

          lastScanCodeRef.current = cleanText;
          lastScanTimeRef.current = now;

          onScan(cleanText);
        },
        () => {
          // Frame error (silently ignore non-scanned frames)
        }
      );

      setIsScanning(true);
    } catch (err: unknown) {
      console.error('Error start scanner:', err);
      const msg = err instanceof Error ? err.message : 'Gagal mengakses kamera.';
      setError(`Kamera gagal dibuka: ${msg}. Pastikan izin kamera aktif.`);
      setIsScanning(false);
    } finally {
      setIsInitializing(false);
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Stop scanner error:', err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleCameraChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    if (isScanning) {
      await stopCamera();
      await startCamera(newId);
    }
  };

  return (
    <div
      id="containerKameraSection"
      className="bg-white dark:bg-[#09090B] border-b border-slate-200 dark:border-slate-800/80 transition-colors"
    >
      <div className="max-w-lg mx-auto overflow-hidden">
        {/* Camera Viewport */}
        <div className="bg-black relative aspect-[4/3] w-full flex items-center justify-center overflow-hidden">
          {/* Start overlay when camera is paused */}
          {!isScanning && (
            <div
              id="cameraStartOverlay"
              className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-black/85 backdrop-blur-sm text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-3">
                <Camera className="w-7 h-7 text-emerald-400" />
              </div>
              <h4 className="text-sm font-bold text-white mb-1">Kamera Barcode & QR Scanner</h4>
              <p className="text-xs text-slate-400 max-w-xs mb-4">
                Gunakan kamera HP Android Anda untuk memindai barcode produk & tag lokasi otomatis.
              </p>

              <button
                type="button"
                id="btnStartCamera"
                onClick={() => startCamera()}
                disabled={isInitializing}
                className="bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 active:scale-95 text-black font-extrabold px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.35)] flex items-center gap-2 text-xs tracking-wider transition-all uppercase"
              >
                {isInitializing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    <span>MENYIAPKAN LENSA...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-black text-black" />
                    <span>MULAI SCANNER KAMERA</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* HTML5 QR Canvas container */}
          <div id="reader-canvas" className="w-full h-full"></div>

          {/* Scanning frame overlay with laser effect when active */}
          {isScanning && (
            <>
              <div className="absolute inset-0 pointer-events-none border border-emerald-500/30 z-10">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-36 border-2 border-dashed border-emerald-400/80 rounded-xl">
                  <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_10px_#10b981] animate-bounce my-16"></div>
                </div>
              </div>

              <button
                type="button"
                id="btnStopCamera"
                onClick={stopCamera}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 bg-rose-600/90 hover:bg-rose-500 backdrop-blur text-white font-bold px-4 py-2 rounded-full shadow-xl text-xs flex items-center gap-1.5 transition-all active:scale-95"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>Stop Kamera</span>
              </button>
            </>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 border-b border-rose-200 dark:border-rose-900">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Camera / Lens Selector Bar */}
        {cameras.length > 0 && (
          <div
            id="cameraSelectWrapper"
            className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between gap-3 border-t border-slate-800"
          >
            <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 flex-shrink-0">
              <Camera className="w-3.5 h-3.5 text-emerald-400" /> Lensa Kamera
            </label>
            <select
              id="cameraSelect"
              value={selectedCameraId}
              onChange={handleCameraChange}
              className="flex-1 bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none font-medium truncate"
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};
