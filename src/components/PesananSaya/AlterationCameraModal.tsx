import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  X,
  RefreshCw,
  Upload,
  Loader2,
  Check,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { compressImage } from '../../utils/imageCompressor';
import { uploadImageToGdrive } from '../../services/gdriveUpload';

interface AlterationCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoUploaded: (gdriveUrl: string) => void;
  itemTitle?: string;
  idFormAlter?: string;
}

export const AlterationCameraModal: React.FC<AlterationCameraModalProps> = ({
  isOpen,
  onClose,
  onPhotoUploaded,
  itemTitle = 'Item Alterasi',
  idFormAlter,
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileFallbackInputRef = useRef<HTMLInputElement | null>(null);

  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    setErrorMsg('');
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Kamera tidak didukung oleh browser ini. Silakan gunakan opsi upload file.');
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.warn('Gagal membuka kamera:', err);
      setErrorMsg(
        err?.message?.includes('Permission') || err?.name === 'NotAllowedError'
          ? 'Izin akses kamera ditolak. Silakan izinkan browser mengakses kamera atau gunakan opsi upload file.'
          : 'Tidak dapat mengakses perangkat kamera. Silakan pilih opsi upload foto/file.'
      );
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setCapturedPreview(null);
      setErrorMsg('');
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const handleFlipCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
  };

  const handleCaptureFrame = async () => {
    if (!videoRef.current || isCapturing || isUploading) return;
    setIsCapturing(true);

    try {
      const video = videoRef.current;
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error('Canvas context tidak tersedia');

      // Jika kamera depan, buat mirror
      if (facingMode === 'user') {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, width, height);
      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedPreview(rawDataUrl);

      // Upload langsung ke Google Drive
      await processAndUpload(rawDataUrl);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal mengambil gambar dari kamera');
      setIsCapturing(false);
    }
  };

  const processAndUpload = async (dataUrlOrFile: string | File) => {
    setIsUploading(true);
    setUploadStatus('Mengompresi foto...');

    try {
      // 1. Kompresi gambar terlebih dahulu
      let compressedDataUrl = '';
      if (typeof dataUrlOrFile === 'string') {
        // Konversi dataUrl ke blob lalu kompresi
        const res = await fetch(dataUrlOrFile);
        const blob = await res.blob();
        const compressed = await compressImage(blob, 1024, 0.7);
        compressedDataUrl = compressed.dataUrl;
      } else {
        const compressed = await compressImage(dataUrlOrFile, 1024, 0.7);
        compressedDataUrl = compressed.dataUrl;
      }

      // 2. Upload ke Google Drive via GAS Web App
      setUploadStatus('Mengunggah ke Google Drive...');
      const cleanAlterId = (idFormAlter || 'ALTER').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Alter_Store_${cleanAlterId}_${Date.now()}.jpg`;

      const uploadRes = await uploadImageToGdrive(compressedDataUrl, filename);

      if (uploadRes.success && uploadRes.url) {
        setUploadStatus('Berhasil disimpan di Google Drive!');
        onPhotoUploaded(uploadRes.url);
        setTimeout(() => {
          stopCamera();
          onClose();
        }, 600);
      } else {
        throw new Error(uploadRes.error || 'Gagal mengupload gambar ke Google Drive');
      }
    } catch (err: any) {
      console.error('Error proses & upload foto:', err);
      setErrorMsg(err?.message || 'Gagal menyimpan foto ke Google Drive');
      setCapturedPreview(null);
    } finally {
      setIsCapturing(false);
      setIsUploading(false);
    }
  };

  const handleFallbackFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    await processAndUpload(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-rose-600/30 text-rose-400 rounded-lg">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                <span>Foto Fisik Alterasi Store</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-700/60 font-mono">
                  Google Drive
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 truncate max-w-[280px]">
                {itemTitle} {idFormAlter ? `(ID: ${idFormAlter})` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/60 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder Viewport */}
        <div className="relative bg-black flex-1 min-h-[300px] max-h-[500px] flex items-center justify-center overflow-hidden">
          {errorMsg ? (
            <div className="p-6 text-center max-w-sm space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-800/80 text-rose-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-xs text-rose-300 font-medium leading-relaxed">{errorMsg}</p>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-600 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Coba Lagi Kamera</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileFallbackInputRef.current?.click()}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Pilih Foto dari Galeri / File</span>
                </button>
              </div>
            </div>
          ) : capturedPreview ? (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              <img
                src={capturedPreview}
                alt="Captured Preview"
                className="max-h-[460px] w-auto object-contain"
              />
              {isUploading && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-2xs flex flex-col items-center justify-center text-white space-y-2.5">
                  <Loader2 className="w-8 h-8 animate-spin text-rose-400" />
                  <p className="text-xs font-semibold">{uploadStatus || 'Menyimpan ke Google Drive...'}</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
              />

              {/* Viewfinder Target Guidelines */}
              <div className="absolute inset-8 pointer-events-none border-2 border-white/25 rounded-2xl flex flex-col justify-between p-3">
                <div className="flex justify-between text-white/50 text-[10px] font-mono">
                  <span>┌ TARGET ALTERASI</span>
                  <span>┐</span>
                </div>
                <div className="text-center">
                  <span className="bg-black/40 text-white/70 text-[10px] px-2 py-0.5 rounded-full backdrop-blur-2xs font-mono">
                    Arahkan ke bagian jahitan / pakaian yang dipotong
                  </span>
                </div>
                <div className="flex justify-between text-white/50 text-[10px] font-mono">
                  <span>└</span>
                  <span>┘</span>
                </div>
              </div>

              {/* Top Controls: Flip camera */}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFlipCamera}
                  title="Balik Kamera (Depan / Belakang)"
                  className="p-2.5 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-md border border-white/20 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* Hidden input for fallback upload */}
          <input
            ref={fileFallbackInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFallbackFileChange}
          />
        </div>

        {/* Footer Controls */}
        <div className="px-4 py-3 bg-slate-800/90 border-t border-slate-700 flex items-center justify-between">
          <button
            type="button"
            onClick={() => fileFallbackInputRef.current?.click()}
            disabled={isUploading}
            className="px-3 py-1.5 bg-slate-700/80 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-600 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pilih File / Galeri</span>
            <span className="sm:hidden">File</span>
          </button>

          {!errorMsg && !capturedPreview && (
            <button
              type="button"
              onClick={handleCaptureFrame}
              disabled={isCapturing || isUploading}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-bold text-xs rounded-full shadow-lg flex items-center gap-2 cursor-pointer transition-transform"
            >
              {isCapturing || isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  <span>Ambil Foto</span>
                </>
              )}
            </button>
          )}

          <div className="text-right">
            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>Drive Auto-Sync</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
