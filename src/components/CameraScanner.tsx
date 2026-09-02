import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, Square, Play, RefreshCw, AlertCircle, Zap, ZapOff } from 'lucide-react';
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

// Force release any video stream attached to DOM video elements
const forceStopAllStreams = () => {
  try {
    const videoElements = document.querySelectorAll('video');
    videoElements.forEach((video) => {
      if (video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((track) => {
          try {
            track.enabled = false;
            track.stop();
          } catch {}
        });
        video.srcObject = null;
      }
    });
  } catch {}
};

// Audio beep feedback for camera scanner
const playCameraScanBeep = () => {
  try {
    if (typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window)) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
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
  const [flashSuccess, setFlashSuccess] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastScanCodeRef = useRef<string>('');
  const isMountedRef = useRef(true);
  const isStartingRef = useRef(false);

  // Safely enumerate devices using native Web API without creating conflict stream
  const enumerateAvailableCameras = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devs.filter((d) => d.kind === 'videoinput');
        if (videoDevs.length > 0 && isMountedRef.current) {
          const deviceList: CameraDevice[] = videoDevs.map((d, idx) => ({
            id: d.deviceId,
            label: d.label || `Kamera ${idx + 1}`,
          }));
          setCameras(deviceList);
        }
      }
    } catch (e) {
      console.warn('Gagal membaca list kamera:', e);
    }
  }, []);

  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.getState() === 2 /* Html5QrcodeScannerState.SCANNING */ || scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Stop scanner warn:', err);
      }
      scannerRef.current = null;
    }
    forceStopAllStreams();
    if (isMountedRef.current) {
      setIsScanning(false);
      setIsTorchOn(false);
    }
  }, []);

  const startCamera = useCallback(
    async (cameraIdToUse?: string) => {
      if (!isMountedRef.current || isStartingRef.current) return;
      isStartingRef.current = true;
      setError(null);
      setIsInitializing(true);

      if (onRequestWakeLock) {
        try {
          onRequestWakeLock();
        } catch {}
      }

      const container = document.getElementById(id);
      if (!container) {
        setIsInitializing(false);
        isStartingRef.current = false;
        return;
      }

      // 1. Thoroughly stop any previous session and wait for hardware to release
      await stopCamera();
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (!isMountedRef.current) {
        isStartingRef.current = false;
        return;
      }

      try {
        const html5QrCode = new Html5Qrcode(id, {
          formatsToSupport: SUPPORTED_BARCODE_FORMATS,
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
        scannerRef.current = html5QrCode;

        // Determine constraint: prefer specific ID if provided, otherwise default to environment
        const cameraConfig = cameraIdToUse
          ? cameraIdToUse
          : { facingMode: 'environment' };

        const scanConfig = {
          fps: 15,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const width = Math.min(Math.floor(viewfinderWidth * 0.95), 450);
            const height = Math.min(Math.floor(viewfinderHeight * 0.9), 350);
            return { width: Math.max(width, 220), height: Math.max(height, 100) };
          },
          aspectRatio: 1.333333,
        };

        await html5QrCode.start(
          cameraConfig,
          scanConfig,
          (decodedText) => {
            if (!decodedText) return;
            const now = Date.now();
            const cleanText = decodedText.trim().toUpperCase();

            if (cleanText === lastScanCodeRef.current && now - lastScanTimeRef.current < 1500) {
              return;
            }
            if (cleanText !== lastScanCodeRef.current && now - lastScanTimeRef.current < 300) {
              return;
            }

            lastScanCodeRef.current = cleanText;
            lastScanTimeRef.current = now;

            playCameraScanBeep();
            if (isMountedRef.current) {
              setFlashSuccess(true);
              setTimeout(() => {
                if (isMountedRef.current) setFlashSuccess(false);
              }, 300);
            }

            onScan(cleanText);
          },
          () => {}
        );

        if (isMountedRef.current) {
          setIsScanning(true);
          setPermissionDenied(false);
          if (cameraIdToUse) {
            setSelectedCameraId(cameraIdToUse);
          }
        }

        // Enumerate devices once stream is established and permission is granted
        await enumerateAvailableCameras();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('Error starting camera attempt 1:', err);

        // Fallback strategy for NotReadableError or device busy: wait 350ms and retry with general environment
        if (msg.includes('NotReadableError') || msg.includes('Could not start video source') || cameraIdToUse) {
          try {
            if (scannerRef.current) {
              try {
                if ((scannerRef.current as any).getState?.() === 2 || scannerRef.current.isScanning) {
                  await scannerRef.current.stop();
                }
                scannerRef.current.clear();
              } catch {}
            }
            forceStopAllStreams();
            await new Promise((resolve) => setTimeout(resolve, 350));
            if (!isMountedRef.current) return;

            const fallbackQrCode = new Html5Qrcode(id, {
              formatsToSupport: SUPPORTED_BARCODE_FORMATS,
              verbose: false,
            });
            scannerRef.current = fallbackQrCode;

            await fallbackQrCode.start(
              { facingMode: 'environment' },
              { fps: 12 },
              (decodedText) => {
                const now = Date.now();
                const cleanText = decodedText.trim().toUpperCase();
                if (cleanText === lastScanCodeRef.current && now - lastScanTimeRef.current < 1500) return;
                lastScanCodeRef.current = cleanText;
                lastScanTimeRef.current = now;
                playCameraScanBeep();
                if (isMountedRef.current) {
                  setFlashSuccess(true);
                  setTimeout(() => isMountedRef.current && setFlashSuccess(false), 300);
                }
                onScan(cleanText);
              },
              () => {}
            );

            if (isMountedRef.current) {
              setIsScanning(true);
              setPermissionDenied(false);
            }
            await enumerateAvailableCameras();
            return;
          } catch (fallbackErr) {
            console.error('Fallback camera start failed:', fallbackErr);
          }
        }

        const finalMsg = err instanceof Error ? err.message : 'Gagal mengakses kamera.';
        if (finalMsg.includes('NotAllowed') || finalMsg.includes('Permission') || finalMsg.includes('denied')) {
          if (isMountedRef.current) setPermissionDenied(true);
        }
        if (isMountedRef.current) {
          setError(`Kamera gagal dibuka: ${finalMsg}`);
          setIsScanning(false);
        }
      } finally {
        if (isMountedRef.current) {
          setIsInitializing(false);
        }
        isStartingRef.current = false;
      }
    },
    [id, onRequestWakeLock, onScan, stopCamera, enumerateAvailableCameras]
  );

  // Mount effect: run device enumeration and autostart cleanly
  useEffect(() => {
    isMountedRef.current = true;
    enumerateAvailableCameras();

    if (autoStart) {
      const timer = setTimeout(() => {
        startCamera();
      }, 150);
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
  }, []);

  const toggleTorch = async () => {
    if (!scannerRef.current || !isScanning) return;
    try {
      const newTorchState = !isTorchOn;
      let trackApplied = false;

      const videoEl = document.querySelector(`#${id} video`) as HTMLVideoElement | null;
      if (videoEl && videoEl.srcObject) {
        const stream = videoEl.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        if (track) {
          try {
            await track.applyConstraints({ advanced: [{ torch: newTorchState }] } as any);
            trackApplied = true;
          } catch {
            try {
              const fallbackConstraints: any = { torch: newTorchState };
              await track.applyConstraints(fallbackConstraints);
              trackApplied = true;
            } catch {}
          }
        }
      }

      if (!trackApplied) {
        try {
          await (scannerRef.current as any).applyVideoConstraints({
            advanced: [{ torch: newTorchState }],
          });
        } catch {
          await (scannerRef.current as any).applyVideoConstraints({
            torch: newTorchState,
          });
        }
      }

      setIsTorchOn(newTorchState);
      setError(null);
    } catch {
      setError('Flash tidak didukung pada kamera yang aktif.');
    }
  };

  return (
    <div
      id="containerKameraSection"
      className="bg-white dark:bg-[#09090B] border-b border-slate-200 dark:border-slate-800/80 transition-colors"
    >
      <div className="max-w-lg mx-auto overflow-hidden">
        {/* Compact Camera Toolbar */}
        <div className="px-3 py-2 bg-slate-50 dark:bg-[#0F0F12] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <Camera className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <select
              value={selectedCameraId}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedCameraId(newId);
                startCamera(newId);
              }}
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs rounded-lg px-2 py-1 outline-none truncate focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer"
            >
              {cameras.length > 0 ? (
                cameras.map((cam, idx) => (
                  <option key={cam.id || idx} value={cam.id}>
                    {cam.label || `Kamera ${idx + 1}`}
                  </option>
                ))
              ) : (
                <option value="">Pilih Kamera / Default</option>
              )}
            </select>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isScanning ? (
              <>
                <button
                  type="button"
                  id="btnToggleTorch"
                  onClick={toggleTorch}
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                    isTorchOn
                      ? 'bg-amber-500 text-black'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300'
                  }`}
                  title="Flash On/Off"
                >
                  {isTorchOn ? <Zap className="w-3.5 h-3.5 fill-black" /> : <ZapOff className="w-3.5 h-3.5" />}
                  <span>{isTorchOn ? 'Flash On' : 'Flash'}</span>
                </button>

                <button
                  type="button"
                  id="btnStopCamera"
                  onClick={stopCamera}
                  className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                  title="Stop Kamera"
                >
                  <Square className="w-3 h-3 fill-white" />
                  <span>Stop</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                id="btnStartCameraSmall"
                onClick={() => startCamera(selectedCameraId)}
                disabled={isInitializing}
                className="bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-extrabold px-3 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all uppercase"
              >
                <Play className="w-3 h-3 fill-black text-black" />
                <span>Buka</span>
              </button>
            )}
          </div>
        </div>

        {/* Clean Camera Viewport - No overlays, no lasers, no blocking texts */}
        <div
          className={`bg-black relative aspect-[4/3] w-full max-h-[32vh] sm:max-h-[260px] flex items-center justify-center overflow-hidden transition-all ${
            flashSuccess ? 'ring-4 ring-emerald-500' : ''
          }`}
        >
          {!isScanning && (
            <div
              id="cameraStartOverlay"
              className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 bg-black/85 text-center"
            >
              {permissionDenied ? (
                <>
                  <h4 className="text-xs font-bold text-white mb-1">Izin Kamera Ditolak</h4>
                  <p className="text-[11px] text-slate-400 max-w-xs mb-3">
                    Izinkan akses kamera di pengaturan browser untuk menggunakan scanner.
                  </p>
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Coba Lagi
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  id="btnStartCamera"
                  onClick={() => startCamera(selectedCameraId)}
                  disabled={isInitializing}
                  className="bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 active:scale-95 text-black font-extrabold px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs uppercase cursor-pointer"
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
              )}
            </div>
          )}

          {/* Pure HTML5 QR Canvas container */}
          <div
            id={id}
            className="w-full h-full [&>video]:object-cover [&>video]:w-full [&>video]:h-full [&>video]:!max-h-[32vh] sm:[&>video]:!max-h-[260px]"
          ></div>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2 border-b border-rose-200 dark:border-rose-900">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="text-[11px]">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
