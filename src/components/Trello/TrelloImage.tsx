import React, { useState, useEffect } from 'react';
import { Loader2, ImageOff } from 'lucide-react';
import { DEFAULT_TRELLO_KEY, DEFAULT_TRELLO_TOKEN } from '../../services/trelloSyncService';

const imageBlobCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string>>();

export async function fetchTrelloImageBlob(url: string): Promise<string> {
  if (!url) return '';
  if (imageBlobCache.has(url)) return imageBlobCache.get(url)!;

  // Jika URL bukan dari trello.com (misal Google Drive thumbnail atau data URL), langsung kembalikan
  if (!url.includes('trello.com')) return url;

  if (inFlightRequests.has(url)) {
    return inFlightRequests.get(url)!;
  }

  const promise = (async () => {
    try {
      const authHeader = `OAuth oauth_consumer_key="${DEFAULT_TRELLO_KEY}", oauth_token="${DEFAULT_TRELLO_TOKEN}"`;
      const response = await fetch(url, {
        headers: {
          Authorization: authHeader,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      imageBlobCache.set(url, objectUrl);
      return objectUrl;
    } finally {
      inFlightRequests.delete(url);
    }
  })();

  inFlightRequests.set(url, promise);
  return promise;
}

interface TrelloImageProps {
  src?: string;
  alt?: string;
  className?: string;
  fallbackText?: string;
}

export const TrelloImage: React.FC<TrelloImageProps> = ({
  src,
  alt = 'Foto Produk',
  className = 'w-full h-full object-cover',
  fallbackText = 'No Photo',
}) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(() => {
    if (!src) return null;
    if (imageBlobCache.has(src)) return imageBlobCache.get(src)!;
    if (!src.includes('trello.com')) return src;
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(!resolvedUrl && !!src);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    if (!src) {
      setResolvedUrl(null);
      setIsLoading(false);
      return;
    }

    if (imageBlobCache.has(src)) {
      setResolvedUrl(imageBlobCache.get(src)!);
      setIsLoading(false);
      return;
    }

    if (!src.includes('trello.com')) {
      setResolvedUrl(src);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setHasError(false);

    fetchTrelloImageBlob(src)
      .then((url) => {
        if (isMounted) {
          setResolvedUrl(url);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Gagal memuat gambar Trello via Auth:', src, err);
        if (isMounted) {
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [src]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 p-2">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500 mb-1" />
        <span className="text-[10px] font-medium">Memuat foto...</span>
      </div>
    );
  }

  if (hasError || !resolvedUrl) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 p-2 text-center">
        <ImageOff className="w-5 h-5 mb-1 opacity-60" />
        <span className="text-[10px] font-semibold">{fallbackText}</span>
      </div>
    );
  }

  return <img src={resolvedUrl} alt={alt} className={className} />;
};
