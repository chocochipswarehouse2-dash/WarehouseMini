import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, ImageOff, RefreshCw } from 'lucide-react';
import { DEFAULT_TRELLO_KEY, DEFAULT_TRELLO_TOKEN } from '../../services/trelloSyncService';

const imageBlobCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string>>();

/**
 * Antrean batas konkuren untuk unduhan langsung dari Trello API
 * Mencegah HTTP 429 Too Many Requests saat puluhan kartu dimuat bersamaan.
 */
const MAX_CONCURRENT_TRELLO_FETCHES = 4;
let activeTrelloFetches = 0;
const pendingQueue: Array<() => void> = [];

function acquireFetchSlot(): Promise<void> {
  if (activeTrelloFetches < MAX_CONCURRENT_TRELLO_FETCHES) {
    activeTrelloFetches++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    pendingQueue.push(() => {
      activeTrelloFetches++;
      resolve();
    });
  });
}

function releaseFetchSlot(): void {
  activeTrelloFetches = Math.max(0, activeTrelloFetches - 1);
  const next = pendingQueue.shift();
  if (next) next();
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

export async function fetchTrelloImageBlob(url: string): Promise<string> {
  if (!url) return '';
  if (imageBlobCache.has(url)) return imageBlobCache.get(url)!;

  // Jika URL bukan dari trello.com (misal Google Drive thumbnail atau data URL), langsung kembalikan
  if (!url.includes('trello.com')) return url;

  if (inFlightRequests.has(url)) {
    return inFlightRequests.get(url)!;
  }

  const promise = (async () => {
    await acquireFetchSlot();
    try {
      const authHeader = `OAuth oauth_consumer_key="${DEFAULT_TRELLO_KEY}", oauth_token="${DEFAULT_TRELLO_TOKEN}"`;
      let lastErr: any = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, attempt * 700));
          }
          const response = await fetch(url, {
            headers: {
              Authorization: authHeader,
            },
          });

          if (response.status === 429) {
            lastErr = new Error('HTTP 429 Rate Limited');
            continue;
          }

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
      releaseFetchSlot();
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
  const effectivePrimary = src || fallbackSrc;

  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => {
    if (!effectivePrimary) return null;
    if (imageBlobCache.has(effectivePrimary)) return imageBlobCache.get(effectivePrimary)!;
    if (!effectivePrimary.includes('trello.com')) return effectivePrimary;
    return null;
  });
  const [fallbackStage, setFallbackStage] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(!resolvedUrl && !!effectivePrimary);
  const [hasError, setHasError] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);

  const loadSource = useCallback(
    (targetUrl: string, isMountedRef: { current: boolean }) => {
      if (!targetUrl) {
        if (isMountedRef.current) {
          setResolvedUrl(null);
          setIsLoading(false);
        }
        return;
      }

      if (imageBlobCache.has(targetUrl)) {
        if (isMountedRef.current) {
          setResolvedUrl(imageBlobCache.get(targetUrl)!);
          setIsLoading(false);
          setHasError(false);
        }
        return;
      }

      if (!targetUrl.includes('trello.com')) {
        if (isMountedRef.current) {
          setResolvedUrl(targetUrl);
          setIsLoading(false);
          setHasError(false);
        }
        return;
      }

      if (isMountedRef.current) {
        setIsLoading(true);
        setHasError(false);
      }

      fetchTrelloImageBlob(targetUrl)
        .then((blobUrl) => {
          if (isMountedRef.current) {
            setResolvedUrl(blobUrl);
            setIsLoading(false);
            setHasError(false);
          }
        })
        .catch((err) => {
          console.warn('Gagal memuat gambar Trello via Auth:', targetUrl, err);
          if (isMountedRef.current) {
            setHasError(true);
            setIsLoading(false);
          }
        });
    },
    []
  );

  useEffect(() => {
    const isMountedRef = { current: true };
    setFallbackStage(0);
    setHasError(false);

    if (!effectivePrimary) {
      setResolvedUrl(null);
      setIsLoading(false);
      return;
    }

    loadSource(effectivePrimary, isMountedRef);

    return () => {
      isMountedRef.current = false;
    };
  }, [effectivePrimary, retryCount, loadSource]);

  /**
   * Jika tag <img> gagal menampilkan URL utama (misal CDN Google Drive lh3 terkena rate-limit 429/403),
   * otomatis beralih ke:
   * - Stage 1: Google Drive Thumbnail endpoint (`drive.google.com/thumbnail?id=...&sz=w800`)
   * - Stage 2: Trello Attachment Blob asli (`fallbackSrc` via OAuth)
   */
  const handleImgError = () => {
    const fileId = extractGdriveFileIdFromUrl(resolvedUrl || effectivePrimary);

    if (fallbackStage === 0 && fileId) {
      const thumbUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
      if (thumbUrl !== resolvedUrl) {
        setFallbackStage(1);
        setResolvedUrl(thumbUrl);
        return;
      }
    }

    if (fallbackStage <= 1 && fallbackSrc && fallbackSrc !== resolvedUrl) {
      setFallbackStage(2);
      const isMountedRef = { current: true };
      loadSource(fallbackSrc, isMountedRef);
      return;
    }

    setHasError(true);
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 p-2">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-500 mb-1" />
        <span className="text-[10px] font-medium">Memuat foto...</span>
      </div>
    );
  }

  if (hasError || !resolvedUrl) {
    return (
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
    );
  }

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={handleImgError}
      className={className}
    />
  );
};
