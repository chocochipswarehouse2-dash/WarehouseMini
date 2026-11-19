import React, { useState, useEffect } from 'react';
import { Loader2, ImageOff, RefreshCw } from 'lucide-react';

const imageBlobCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string>>();

/**
 * Konversi URL lampiran Trello ke endpoint proxy server-side Vercel (/api/trello-image)
 * agar browser tidak terblokir CORS dan tidak mengirim header OAuth lintas origin.
 */
export function getProxiedTrelloImageUrl(url?: string, retryNonce?: number): string {
  if (!url) return '';
  if (url.startsWith('/api/trello-image')) {
    return retryNonce && retryNonce > 0
      ? `${url}${url.includes('?') ? '&' : '?'}r=${retryNonce}`
      : url;
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
  if (url.startsWith('/api/trello-image')) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_r=${retryCount}`;
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

  const resolveInitialUrl = (rawUrl: string, retry: number): string | null => {
    if (!rawUrl) return null;
    if (imageBlobCache.has(rawUrl)) return imageBlobCache.get(rawUrl)!;
    if (rawUrl.includes('trello.com') || rawUrl.startsWith('/api/trello-image')) {
      return getProxiedTrelloImageUrl(rawUrl, retry);
    }
    return appendRetryParam(rawUrl, retry);
  };

  const [retryCount, setRetryCount] = useState<number>(0);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() =>
    resolveInitialUrl(effectivePrimary, 0)
  );
  const [fallbackStage, setFallbackStage] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    setFallbackStage(0);
    setHasError(false);
    setIsLoading(false);

    if (!effectivePrimary) {
      setResolvedUrl(null);
      return;
    }

    setResolvedUrl(resolveInitialUrl(effectivePrimary, retryCount));
  }, [effectivePrimary, retryCount]);

  /**
   * Jika tag <img> gagal menampilkan URL utama (misal CDN Google Drive lh3 terkena rate-limit 429/403),
   * otomatis beralih ke:
   * - Stage 1: Google Drive Thumbnail endpoint (`drive.google.com/thumbnail?id=...&sz=w800`)
   * - Stage 2: Trello Attachment via Proxy `/api/trello-image` (`fallbackSrc`)
   */
  const handleImgError = () => {
    const fileId = extractGdriveFileIdFromUrl(resolvedUrl || effectivePrimary);

    if (fallbackStage === 0 && fileId) {
      const thumbUrl = appendRetryParam(
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
        retryCount
      );
      if (thumbUrl !== resolvedUrl) {
        setFallbackStage(1);
        setResolvedUrl(thumbUrl);
        return;
      }
    }

    if (fallbackStage <= 1 && fallbackSrc) {
      const proxiedFallback =
        fallbackSrc.includes('trello.com') || fallbackSrc.startsWith('/api/trello-image')
          ? getProxiedTrelloImageUrl(fallbackSrc, retryCount)
          : appendRetryParam(fallbackSrc, retryCount);
      if (proxiedFallback && proxiedFallback !== resolvedUrl) {
        setFallbackStage(2);
        setResolvedUrl(proxiedFallback);
        return;
      }
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
