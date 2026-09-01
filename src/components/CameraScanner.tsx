import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, Square, Play, RefreshCw, AlertCircle, Zap, ZapOff, CheckCircle2 } from 'lucide-react';
import { CameraDevice } from '../types';

interface CameraScannerProps {
  onScan: (decodedText: string) => void;
  onRequestWakeLock?: () => void;
  id?: string;
  autoStart?: boolean;
}

// Supported barcode formats in warehouse (1D linear & 2D QR/DataMatrix)
const SUPPORTED_BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
];

// Audio beep feedback for camera scanner
const playCameraScanBeep = () => {
  try {
    if (typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window)) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6 tone
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    }
  } catch {}
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }
  } catch {}
};

export const CameraScanner: React.FC<CameraScannerProps> = ({
  onScan,
  onRequestWakeLock,
  id = 'reader-canvas',
  autoStart = true,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [lastScannedText, setLastScannedText] = useState<string | null>(null);
  const [flashSuccess, setFlashSuccess] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastScanCodeRef = useRef<string>('');
  const camerasLoadedRef = useRef(false);
  const isMountedRef = useRef(true);

  // Load cameras list
  const loadCamerasIfNeeded = async (): Promise<boolean> => {
    if (camerasLoadedRef.current && cameras.length > 0) return true;
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        const deviceList: CameraDevice[] = devices.map((d) => ({
          id: d.id,
          label: d.label || `Kamera ${d.id.slice(0, 5)}`,
        }));
        if (isMountedRef.current) {
          setCameras(deviceList);
          const backCam = deviceList.find(
            (c) =>
              c.label.toLowerCase().includes('back') ||
              c.label.toLowerCase().includes('rear') ||
              c.label.toLowerCase().includes('environment') ||
              c.label.toLowerCase().includes('belakang') ||
              c.label.toLowerCase().includes('0')
          );
          setSelectedCameraId(backCam ? backCam.id : deviceList[0].id);
        }
        camerasLoadedRef.current = true;
        return true;
      }
      return false;
    } catch (err: unknown) {
      console.warn('Gagal membaca list kamera:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAllowed') || msg.includes('Permission') || msg.includes('denied')) {
        if (isMountedRef.current) setPermissionDenied(true);
      }
      return false;
    }
  };

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Stop scanner error:', err);
      }
      scannerRef.current = null;
    }
    if (isMountedRef.current) {
      setIsScanning(false);
      setIsTorchOn(false);
    }
  }, []);

  const startCamera = useCallback(
    async (cameraIdToUse?: string) => {
      if (!isMountedRef.current) return;
      setError(null);
      setIsInitializing(true);
      if (onRequestWakeLock) {
        try {
          onRequestWakeLock();
        } catch {}
      }

      // Ensure container element exists in DOM
      const container = document.getElementById(id);
      if (!container) {
        console.warn(`Container element #${id} not found in DOM yet.`);
        setIsInitializing(false);
        return;
      }

      // Stop previous instance if any
      await stopCamera();
      await new Promise((resolve) => setTimeout(resolve, 150));

      if (!isMountedRef.current) return;

      try {
        const html5QrCode = new Html5Qrcode(id, {
          formatsToSupport: SUPPORTED_BARCODE_FORMATS,
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
        scannerRef.current = html5QrCode;

        // Determine constraint: prefer specific back camera ID if available, else environment facingMode
        const targetCamId = cameraIdToUse || selectedCameraId;
        const cameraConstraint = targetCamId ? targetCamId : { facingMode: 'environment' };

        const scanConfig = {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const width = Math.min(Math.floor(viewfinderWidth * 0.88), 380);
            const height = Math.min(Math.floor(viewfinderHeight * 0.6), 220);
            return { width: Math.max(width, 220), height: Math.max(height, 100) };
          },
          aspectRatio: 1.333333,
        };

        await html5QrCode.start(
          cameraConstraint,
          scanConfig,
          (decodedText) => {
            if (!decodedText) return;
            const now = Date.now();
            const cleanText = decodedText.trim().toUpperCase();

            // Anti-bounce: ignore identical barcode within 1.5 seconds, but allow rapid scan of different barcodes (300ms)
            if (cleanText === lastScanCodeRef.current && now - lastScanTimeRef.current < 1500) {
              return;
            }
            if (cleanText !== lastScanCodeRef.current && now - lastScanTimeRef.current < 300) {
              return;
            }

            lastScanCodeRef.current = cleanText;
            lastScanTimeRef.current = now;

            // Audio & Haptic feedback
            playCameraScanBeep();
            if (isMountedRef.current) {
              setLastScannedText(cleanText);
              setFlashSuccess(true);
              setTimeout(() => {
                if (isMountedRef.current) setFlashSuccess(false);
              }, 400);
            }

            // Emit scanned code
            onScan(cleanText);
          },
          () => {
            // Silently ignore empty/non-barcode frames
          }
        );

        if (isMountedRef.current) {
          setIsScanning(true);
          setPermissionDenied(false);
        }

        // Lazy load camera list for switching if not loaded yet
        loadCamerasIfNeeded();
      } catch (err: unknown) {
        console.error('Error start scanner:', err);

        // Fallback: try basic environment facingMode if specific deviceId failed
        try {
          if (scannerRef.current) {
            try {
              if (scannerRef.current.isScanning) await scannerRef.current.stop();
              scannerRef.current.clear();
            } catch {}
          }
          await new Promise((resolve) => setTimeout(resolve, 300));
          if (!isMountedRef.current) return;

          const fallbackQrCode = new Html5Qrcode(id, {
            formatsToSupport: SUPPORTED_BARCODE_FORMATS,
            verbose: false,
          });
          scannerRef.current = fallbackQrCode;

          await fallbackQrCode.start(
            { facingMode: 'environment' },
            { fps: 12, qrbox: { width: 260, height: 160 } },
            (decodedText) => {
              const now = Date.now();
              const cleanText = decodedText.trim().toUpperCase();
              if (cleanText === lastScanCodeRef.current && now - lastScanTimeRef.current < 1500) return;
              lastScanCodeRef.current = cleanText;
              lastScanTimeRef.current = now;
              playCameraScanBeep();
              if (isMountedRef.current) {
                setLastScannedText(cleanText);
                setFlashSuccess(true);
                setTimeout(() => isMountedRef.current && setFlashSuccess(false), 400);
              }
              onScan(cleanText);
            },
            () => {}
          );

          if (isMountedRef.current) {
            setIsScanning(true);
            setPermissionDenied(false);
          }
          return;
        } catch (fallbackErr) {
          console.error('Fallback start scanner failed:', fallbackErr);
        }

        const msg = err instanceof Error ? err.message : 'Gagal mengakses kamera.';
        if (msg.includes('NotAllowed') || msg.includes('Permission') || msg.includes('denied')) {
          if (isMountedRef.current) setPermissionDenied(true);
        }
        if (isMountedRef.current) {
          setError(`Kamera gagal dibuka: ${msg}. Pastikan izin kamera telah diizinkan pada browser.`);
          setIsScanning(false);
        }
      } finally {
        if (isMountedRef.current) {
          setIsInitializing(false);
        }
      }
    },
    [id, onRequestWakeLock, onScan, selectedCameraId, stopCamera]
  );

  // Auto-start on mount if requested
  useEffect(() => {
    isMountedRef.current = true;

    if (autoStart) {
      const timer = setTimeout(() => {
        startCamera();
      }, 100);
      return () => {
        clearTimeout(timer);
        isMountedRef.current = false;
        stopCamera();
      };
    }

    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [autoStart, startCamera, stopCamera]);

  const toggleTorch = async () => {
    if (!scannerRef.current || !isScanning) return;
    try {
      const newTorchState = !isTorchOn;
      await (scannerRef.current as any).applyVideoConstraints({
        advanced: [{ torch: newTorchState }],
      });
      setIsTorchOn(newTorchState);
      setError(null);
    } catch (err) {
      console.warn('Torch failed with advanced constraint:', err);
      try {
        await (scannerRef.current as any).applyVideoConstraints({ torch: !isTorchOn });
        setIsTorchOn(!isTorchOn);
        setError(null);
      } catch (err2) {
        console.error('Torch fallback failed:', err2);
        setError('Senter (Flash) tidak didukung pada browser/kamera ini.');
      }
    }
  };

  return (
    <div
      id="containerKameraSection"
      className="bg-white dark:bg-[#09090B] border-b border-slate-200 dark:border-slate-800/80 transition-colors"
    >
      <div className="max-w-lg mx-auto overflow-hidden">
        {/* Camera Viewport */}
        <div className={`bg-black relative aspect-[4/3] w-full max-h-[32vh] sm:max-h-[260px] flex items-center justify-center overflow-hidden transition-all ${flashSuccess ? 'ring-4 ring-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)]' : ''}`}>
          {/* Start overlay when camera is paused */}
          {!isScanning && (
            <div
              id="cameraStartOverlay"
              className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 bg-black/85 backdrop-blur-sm text-center"
            >
              {permissionDenied ? (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-3">
                    <Camera className="w-7 h-7 text-rose-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">Izin Kamera Ditolak</h4>
                  <p className="text-xs text-slate-400 max-w-xs mb-4">
                    Mohon izinkan akses kamera di pengaturan browser/situs Anda untuk menggunakan fitur scanner.
                  </p>
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 cursor-pointer transition-all"
                  >
                    <RefreshCw className="w-4 h-4" /> Coba Lagi Izin Kamera
                  </button>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                    <Camera className="w-7 h-7 text-emerald-400" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1">Kamera Scanner Barcode & QR</h4>
                  <p className="text-xs text-slate-400 max-w-xs mb-4">
                    Arahkan kamera ke barcode produk, hangtag garmen, atau barcode lokasi rak.
                  </p>

                  <button
                    type="button"
                    id="btnStartCamera"
                    onClick={() => startCamera()}
                    disabled={isInitializing}
                    className="bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 active:scale-95 text-black font-extrabold px-6 py-3 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.35)] flex items-center gap-2 text-xs tracking-wider transition-all uppercase cursor-pointer"
                  >
                    {isInitializing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-black" />
                        <span>MENYIAPKAN KAMERA...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-black text-black" />
                        <span>BUKA KAMERA SCANNER</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}

          {/* HTML5 QR Canvas container */}
          <div
            id={id}
            className="w-full h-full [&>video]:object-cover [&>video]:w-full [&>video]:h-full [&>video]:!max-h-[32vh] sm:[&>video]:!max-h-[260px]"
          ></div>

          {/* Scanning frame overlay with laser effect when active */}
          {isScanning && (
            <>
              {/* Laser / Wide Target Guide */}
              <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                <div className="relative w-[85%] max-w-[340px] h-[140px] border-2 border-dashed border-emerald-400/80 rounded-2xl shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-x-0 h-0.5 bg-emerald-400 shadow-[0_0_12px_#10b981] animate-pulse"></div>
                  <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-emerald-400"></div>
                  <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-emerald-400"></div>
                  <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-emerald-400"></div>
                  <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-emerald-400"></div>
                  <span className="text-[10px] font-mono font-bold text-emerald-300 bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm z-20">
                    Arahkan Barcode ke Sini
                  </span>
                </div>
              </div>

              {/* Last Scanned Chip Notice */}
              {lastScannedText && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                  <div className="bg-emerald-500 text-black text-[11px] font-mono font-black px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5 animate-bounce">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>SCAN: {lastScannedText}</span>
                  </div>
                </div>
              )}

              {/* Controls bar */}
              <div className="absolute bottom-3 left-0 right-0 flex justify-center items-center gap-3 z-20 pointer-events-none">
                <button
                  type="button"
                  id="btnToggleTorch"
                  onClick={toggleTorch}
                  className={`pointer-events-auto backdrop-blur font-bold px-4 py-2 rounded-full shadow-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                    isTorchOn
                      ? 'bg-amber-500/90 hover:bg-amber-400 text-black'
                      : 'bg-slate-800/90 hover:bg-slate-700 text-white'
                  }`}
                >
                  {isTorchOn ? <Zap className="w-4 h-4 fill-black" /> : <ZapOff className="w-4 h-4" />}
                  <span>{isTorchOn ? 'Flash On' : 'Flash Off'}</span>
                </button>

                <button
                  type="button"
                  id="btnStopCamera"
                  onClick={stopCamera}
                  className="pointer-events-auto bg-rose-600/90 hover:bg-rose-500 backdrop-blur text-white font-bold px-4 py-2 rounded-full shadow-xl text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-white" />
                  <span>Stop Kamera</span>
                </button>
              </div>
            </>
          )}

          {/* Floating Camera Toggle Button */}
          {cameras.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
                const nextIndex = (currentIndex + 1) % cameras.length;
                const newId = cameras[nextIndex].id;
                setSelectedCameraId(newId);
                if (isScanning) {
                  startCamera(newId);
                }
              }}
              className="absolute top-3 left-3 z-30 p-2 bg-black/60 backdrop-blur-sm border border-white/20 rounded-full text-white hover:bg-black/80 transition-all shadow-lg flex items-center gap-1.5 cursor-pointer"
              title="Ganti Lensa Kamera"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold tracking-wider pr-1">GANTI LENSA</span>
            </button>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 border-b border-rose-200 dark:border-rose-900">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
