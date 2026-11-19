import React, { useState, useEffect, useRef } from 'react';
import { Loader2, ImageOff, RefreshCw } from 'lucide-react';

const imageBlobCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string>>();

/**
 * Antrean batas konkuren pemuatan <img> (GDrive CDN & proxy Trello)
 * Mencegah lonjakan HTTP 429 Too Many Requests saat papan Kanban memuat ratusan kartu sekaligus.
 */
const MAX_CONCURRENT_IMAGE_LOADS = 10;
let activeImageLoads = 0;

type ImageLoadWaiter = {
  isCancelled: () => boolean;
  resolve: (acquired: boolean) => void;
};

const imageLoadWaiters: ImageLoadWaiter[] = [];

function acquireImageLoadSlot(isCancelled: () => boolean): Promise<boolean> {
  if (isCancelled()) return Promise.resolve(false);
  if (activeImageLoads < MAX_CONCURRENT_IMAGE_LOADS) {
    activeImageLoads++;
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => {
    imageLoadWaiters.push({ isCancelled, resolve });
  });
}

function pumpImageQueue(): void {
  while (activeImageLoads < MAX_CONCURRENT_IMAGE_LOADS && imageLoadWaiters.length > 0) {
    const next = imageLoadWaiters.shift()!;
    if (next.isCancelled()) {
      next.resolve(false);
      continue;
    }
    activeImageLoads++;
    next.resolve(true);
  }
}

function releaseImageLoadSlot(): void {
  activeImageLoads = Math.max(0, activeImageLoads - 1);
  pumpImageQueue();
}

/**
 * Konversi URL lampiran Trello ke endpoint proxy server-side Vercel (/api/trello-image)
 * agar browser tidak terblokir CORS dan tidak mengirim header OAuth lintas origin.
 */
export function getProxiedTrelloImageUrl(url?: string, retryNonce?: number): string {
  if (!url) return '';
  if (url.startsWith('/api/trello-image')) {
    if (!retryNonce || retryNonce <= 0) return url;
    const cleaned = url.replace(/[?&]r=\d+/g, (m) => (m.startsWith('?') ? '?' : '')).replace(/\?&/, '?').replace(/\?$/, '');
    return `${cleaned}${cleaned.includes('?') ? '&' : '?'}r=${retryNonce}`;
  }
  if (url.includes('trello.com')) {
    return `/api/trello-image?url=${encodeURIComponent(url)}${
      retryNonce && retryNonce > 0 ? `&r=${retryNonce}` : ''
    }`;
  }
  return url;
}

function appendRetryParam(url: string, retryCount: number): string {
  if (!url || retryCount <= 0 || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  if (url.startsWith('/api/trello-image') || url.includes('trello.com')) {
    return getProxiedTrelloImageUrl(url, retryCount);
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_r=${retryCount}`;
}

function resolveStageUrl(rawUrl: string, retryCount: number): string {
  if (!rawUrl) return '';
  if (imageBlobCache.has(rawUrl)) return imageBlobCache.get(rawUrl)!;
  if (rawUrl.includes('trello.com') || rawUrl.startsWith('/api/trello-image')) {
    return getProxiedTrelloImageUrl(rawUrl, retryCount);
  }
  return appendRetryParam(rawUrl, retryCount);
}

function extractGdriveFileIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const lh3Match = url.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
  if (lh3Match) return lh3Match[1];
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  const dMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch) return dMatch[1];
  return null;
}

/**
 * Ambil URL / Object URL aman untuk gambar Trello (dipakai juga di cetak A4).
 * Menggunakan proxy `/api/trello-image` sehingga bebas CORS browser.
 */
export async function fetchTrelloImageBlob(url: string): Promise<string> {
  if (!url) return '';
  if (imageBlobCache.has(url)) return imageBlobCache.get(url)!;

  if (!url.includes('trello.com') && !url.startsWith('/api/trello-image')) return url;

  if (inFlightRequests.has(url)) {
    return inFlightRequests.get(url)!;
  }

  const promise = (async () => {
    try {
      const proxiedUrl = getProxiedTrelloImageUrl(url);
      let lastErr: any = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, attempt * 600));
          }
          const response = await fetch(proxiedUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          imageBlobCache.set(url, objectUrl);
          return objectUrl;
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error('Gagal memuat gambar Trello');
    } finally {
      inFlightRequests.delete(url);
    }
  })();

  inFlightRequests.set(url, promise);
  return promise;
}

interface TrelloImageProps {
  src?: string;
  fallbackSrc?: string;
  alt?: string;
  className?: string;
  fallbackText?: string;
  eager?: boolean;
}

export const TrelloImage: React.FC<TrelloImageProps> = ({
  src,
  fallbackSrc,
  alt = 'Foto Produk',
  className = 'w-full h-full object-cover',
  fallbackText = 'No Photo',
  eager = false,
}) => {
  const effectivePrimary = src || fallbackSrc || '';

  const containerRef = useRef<HTMLDivElement | null>(null);
  const slotHeldRef = useRef<boolean>(false);
  const retryTimerRef = useRef<number | null>(null);
  const mountedRef = useRef<boolean>(true);

  const [retryCount, setRetryCount] = useState<number>(0);
  const [isInView, setIsInView] = useState<boolean>(
    () => eager || typeof IntersectionObserver === 'undefined'
  );
  const [slotReady, setSlotReady] = useState<boolean>(() => eager);
  const [resolvedUrl, setResolvedUrl] = useState<string>(() =>
    effectivePrimary ? resolveStageUrl(effectivePrimary, 0) : ''
  );
  const [fallbackStage, setFallbackStage] = useState<number>(0);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  const clearRetryTimer = () => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const releaseSlotIfHeld = () => {
    if (slotHeldRef.current) {
      slotHeldRef.current = false;
      releaseImageLoadSlot();
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearRetryTimer();
      releaseSlotIfHeld();
    };
  }, []);

  // Viewport gating menggunakan IntersectionObserver untuk kartu lazy di papan Kanban/Grid/Tabel
  useEffect(() => {
    if (!effectivePrimary || eager || typeof IntersectionObserver === 'undefined') {
      setIsInView(true);
      return;
    }

    if (isInView) return;

    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: '180px 260px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [effectivePrimary, eager, isInView]);

  // Reset state & akuisisi slot pemuatan saat URL sumber berubah atau user klik Ulangi
  useEffect(() => {
    let cancelled = false;
    clearRetryTimer();
    releaseSlotIfHeld();

    setFallbackStage(0);
    setHasError(false);
    setIsRetrying(false);

    if (!effectivePrimary) {
      setResolvedUrl('');
      setSlotReady(false);
      return;
    }

    const initialUrl = resolveStageUrl(effectivePrimary, retryCount);
    setResolvedUrl(initialUrl);

    const isInstantUrl =
      eager ||
      initialUrl.startsWith('data:') ||
      initialUrl.startsWith('blob:') ||
      imageBlobCache.has(effectivePrimary);

    if (isInstantUrl) {
      setSlotReady(true);
      return () => {
        cancelled = true;
        clearRetryTimer();
        releaseSlotIfHeld();
      };
    }

    if (!isInView) {
      setSlotReady(false);
      return () => {
        cancelled = true;
      };
    }

    setSlotReady(false);
    acquireImageLoadSlot(() => cancelled || !mountedRef.current).then((acquired) => {
      if (!acquired || cancelled || !mountedRef.current) return;
      slotHeldRef.current = true;
      setSlotReady(true);
    });

    return () => {
      cancelled = true;
      clearRetryTimer();
      releaseSlotIfHeld();
    };
  }, [effectivePrimary, retryCount, eager, isInView]);

  const handleImgLoad = () => {
    releaseSlotIfHeld();
    setIsRetrying(false);
    setHasError(false);
  };

  /**
   * Penanganan kegagalan <img> dengan jeda bertahap agar tidak memicu 429 beruntun:
   * - Stage 0 -> 1: Google Drive Thumbnail (`drive.google.com/thumbnail?id=...&sz=w800`)
   * - Stage 1 -> 2: Proxy Trello (`/api/trello-image`) dari `fallbackSrc`
   * - Stage 2 -> 3: Auto-retry 1x cache-busted untuk pulih dari 429/network blip sesaat
   */
  const handleImgError = () => {
    releaseSlotIfHeld();
    clearRetryTimer();

    if (!effectivePrimary) {
      setIsRetrying(false);
      setHasError(true);
      return;
    }

    const fileId = extractGdriveFileIdFromUrl(resolvedUrl || effectivePrimary);

    if (fallbackStage === 0 && fileId) {
      const thumbUrl = appendRetryParam(
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
        retryCount
      );
      if (thumbUrl && thumbUrl !== resolvedUrl) {
        const delayMs = 450 + Math.floor(Math.random() * 400);
        setIsRetrying(true);
        retryTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current) return;
          setFallbackStage(1);
          setResolvedUrl(thumbUrl);
          setIsRetrying(false);
        }, delayMs);
        return;
      }
    }

    if (fallbackStage <= 1 && fallbackSrc) {
      const proxiedFallback = resolveStageUrl(fallbackSrc, retryCount);
      if (proxiedFallback && proxiedFallback !== resolvedUrl) {
        const delayMs = 750 + Math.floor(Math.random() * 500);
        setIsRetrying(true);
        retryTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current) return;
          setFallbackStage(2);
          setResolvedUrl(proxiedFallback);
          setIsRetrying(false);
        }, delayMs);
        return;
      }
    }

    if (fallbackStage <= 2) {
      const finalTarget = fallbackSrc
        ? resolveStageUrl(fallbackSrc, retryCount + 100)
        : resolveStageUrl(effectivePrimary, retryCount + 100);
      if (finalTarget && finalTarget !== resolvedUrl) {
        const delayMs = 1500 + Math.floor(Math.random() * 700);
        setIsRetrying(true);
        retryTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current) return;
          setFallbackStage(3);
          setResolvedUrl(finalTarget);
          setIsRetrying(false);
        }, delayMs);
        return;
      }
    }

    setIsRetrying(false);
    setHasError(true);
  };

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {!effectivePrimary || hasError ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 p-2 text-center">
          <ImageOff className="w-4 h-4 mb-1 opacity-60" />
          <span className="text-[10px] font-semibold leading-tight">{fallbackText}</span>
          {effectivePrimary && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRetryCount((c) => c + 1);
              }}
              className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 text-[9px] font-bold text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 hover:text-indigo-600 transition cursor-pointer"
              title="Coba muat ulang foto"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              <span>Ulangi</span>
            </button>
          )}
        </div>
      ) : isRetrying ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 p-2">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-500 mb-1" />
          <span className="text-[10px] font-medium">Memuat foto...</span>
        </div>
      ) : !isInView || !slotReady || !resolvedUrl ? (
        <div className="w-full h-full bg-slate-100 dark:bg-slate-800" />
      ) : (
        <img
          src={resolvedUrl}
          alt={alt}
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={handleImgLoad}
          onError={handleImgError}
          className={className}
        />
      )}
    </div>
  );
};
