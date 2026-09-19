import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  X,
  Upload,
  RefreshCw,
  MapPin,
  Check,
  AlertCircle,
  Clock,
  User,
  ShieldCheck,
  Image as ImageIcon,
  Loader2,
  Trash2,
} from 'lucide-react';
import { LocationStamp } from '../../types';
import { applyPhotoWatermark } from '../../services/penerimaanBarang';
import { uploadImageToGdrive } from '../../services/gdriveUpload';

interface CameraWatermarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotosUploaded: (urls: string[], location?: LocationStamp) => void;
  title: string; // e.g. "Mutasi Store" or "Penerimaan Paket"
  entityName?: string; // e.g. "Store Mall Kelapa Gading" or "J&T Express"
  picName: string;
  picUsername?: string;
  qtyInfo?: string;
}

export const CameraWatermarkModal: React.FC<CameraWatermarkModalProps> = ({
  isOpen,
  onClose,
  onPhotosUploaded,
  title,
  entityName,
  picName,
  picUsername,
  qtyInfo,
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [location, setLocation] = useState<LocationStamp | null>(null);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'success' | 'error' | 'idle'>('idle');
  const [cameraActive, setCameraActive] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Fetch Geolocation
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setErrorMsg('Geolocation tidak didukung oleh browser');
      return;
    }

    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: LocationStamp = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: new Date(pos.timestamp).toISOString(),
        };
        setLocation(loc);
        setLocationStatus('success');
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setLocationStatus('error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // 2. Start Camera Stream
  const startCamera = async () => {
    setErrorMsg('');
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Gagal akses kamera:', err);
      setCameraActive(false);
      setErrorMsg('Kamera tidak dapat diakses atau diblokir. Gunakan tombol Upload File.');
    }
  };

  // Stop camera when closing
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      requestLocation();
      startCamera();
      setCapturedImages([]);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  // Flip Camera
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // 3. Take Photo from Video Stream
  const handleCapture = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.9);

    // Apply auto watermark immediately
    setIsProcessing(true);
    try {
      const watermarked = await applyPhotoWatermark(rawDataUrl, {
        title,
        entityName,
        location: location || undefined,
        picName,
        picUsername,
        qtyInfo,
      });
      setCapturedImages((prev) => [...prev, watermarked]);
    } catch (e) {
      setCapturedImages((prev) => [...prev, rawDataUrl]);
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      await new Promise<void>((resolve) => {
        reader.onload = async (event) => {
          const rawDataUrl = event.target?.result as string;
          if (rawDataUrl) {
            const watermarked = await applyPhotoWatermark(rawDataUrl, {
              title,
              entityName,
              location: location || undefined,
              picName,
              picUsername,
              qtyInfo,
            });
            setCapturedImages((prev) => [...prev, watermarked]);
          }
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }
    setIsProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 5. Remove captured image
  const handleRemoveImage = (index: number) => {
    setCapturedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // 6. Save & Upload to Google Drive
  const handleUploadAndFinish = async () => {
    if (capturedImages.length === 0) return;

    setIsProcessing(true);
    setUploadProgress('Mengunggah foto ke Google Drive...');
    const uploadedUrls: string[] = [];

    try {
      for (let i = 0; i < capturedImages.length; i++) {
        setUploadProgress(`Mengunggah foto ${i + 1} dari ${capturedImages.length}...`);
        const imgData = capturedImages[i];
        const filename = `${title.replace(/\s+/g, '_')}_${Date.now()}_${i + 1}.jpg`;
        const res = await uploadImageToGdrive(imgData, filename);
        if (res.success && res.url) {
          uploadedUrls.push(res.url);
        } else {
          // Fallback to the watermarked base64 image if GDrive failed
          uploadedUrls.push(imgData);
        }
      }

      onPhotosUploaded(uploadedUrls, location || undefined);
      stopCamera();
      onClose();
    } catch (err: any) {
      console.warn('Gagal upload ke Google Drive, menyimpan foto lokal:', err);
      onPhotosUploaded(capturedImages, location || undefined);
      stopCamera();
      onClose();
    } finally {
      setIsProcessing(false);
      setUploadProgress('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#131d31] w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header Modal */}
        <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Dokumentasi Foto dengan Watermark
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Auto-stamp: Tanggal, Waktu, Koordinat GPS, dan Info PIC
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info & Geolocation Bar */}
        <div className="px-3 sm:px-4 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            {locationStatus === 'loading' ? (
              <span className="flex items-center gap-1 text-slate-500">
                <Loader2 className="w-3 h-3 animate-spin" /> Mendeteksi koordinat GPS...
              </span>
            ) : locationStatus === 'success' && location ? (
              <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                {location.latitude?.toFixed(5)}, {location.longitude?.toFixed(5)} (±{Math.round(location.accuracy || 0)}m)
              </span>
            ) : (
              <span className="text-slate-500 text-[11px]">
                GPS Belum Aktif (Gunakan stamp default gudang)
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={requestLocation}
            className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Refresh GPS
          </button>
        </div>

        {/* Body / Camera Viewport */}
        <div className="p-3 sm:p-4 overflow-y-auto space-y-3 flex-1">
          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Camera View */}
          {cameraActive ? (
            <div className="relative bg-black rounded-2xl overflow-hidden aspect-video flex items-center justify-center shadow-inner group">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Live Overlay Stamp Preview */}
              <div className="absolute bottom-2 left-2 right-2 p-2 bg-slate-900/80 backdrop-blur-xs rounded-xl border border-slate-700/50 text-white pointer-events-none text-[10px] sm:text-xs space-y-0.5">
                <div className="font-bold text-sky-400 truncate">
                  📦 {title.toUpperCase()} {entityName ? `• ${entityName}` : ''}
                </div>
                <div className="text-slate-200 text-[10px] truncate">
                  📅 {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} • {new Date().toLocaleTimeString('id-ID')} WIB | 👤 {picName}
                </div>
                {location && (
                  <div className="text-emerald-400 font-mono text-[9px] truncate">
                    📍 Lat: {location.latitude?.toFixed(5)}, Lng: {location.longitude?.toFixed(5)}
                  </div>
                )}
              </div>

              {/* Floating Camera Controls */}
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  type="button"
                  onClick={toggleFacingMode}
                  title="Balik Kamera"
                  className="p-2 bg-slate-900/70 hover:bg-slate-900 text-white rounded-full backdrop-blur-xs transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center bg-slate-50/50 dark:bg-slate-900/20">
              <Camera className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Kamera tidak aktif
              </p>
              <p className="text-[11px] text-slate-500 mb-3">
                Silakan upload foto dari galeri atau coba aktifkan kembali kamera.
              </p>
              <button
                type="button"
                onClick={startCamera}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700"
              >
                Coba Kamera Lagi
              </button>
            </div>
          )}

          {/* Action Buttons: Capture & File Picker */}
          <div className="flex items-center gap-2">
            {cameraActive && (
              <button
                type="button"
                onClick={handleCapture}
                disabled={isProcessing}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                <span>Ambil Foto</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>Upload dari HP / File</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          {/* Captured Photos Preview List */}
          {capturedImages.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Foto Terambil & Watermark ({capturedImages.length})</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                  ✓ Siap diunggah ke Google Drive
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {capturedImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 aspect-video shadow-xs"
                  >
                    <img src={img} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      className="absolute top-1 right-1 p-1 bg-rose-600/90 text-white rounded-lg opacity-90 hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-slate-900/80 text-[9px] text-white rounded font-mono">
                      Foto #{idx + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40 gap-2">
          <div className="text-[11px] text-slate-500 truncate">
            {uploadProgress ? (
              <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-semibold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {uploadProgress}
              </span>
            ) : (
              <span>{capturedImages.length} foto terpilih</span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleUploadAndFinish}
              disabled={capturedImages.length === 0 || isProcessing}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition-all"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Selesai & Pakai ({capturedImages.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
