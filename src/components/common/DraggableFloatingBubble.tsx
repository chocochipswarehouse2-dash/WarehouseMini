import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

export type FloatingBubbleAnchor = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

interface BubblePosition {
  left: number;
  top: number;
}

interface DraggableFloatingBubbleProps {
  storageKey: string;
  defaultAnchor?: FloatingBubbleAnchor;
  defaultOffset?: { x: number; y: number };
  zIndexClass?: string;
  margin?: number;
  className?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}

const STORAGE_PREFIX = 'wms_bubble_pos_';
const DRAG_THRESHOLD_PX = 5;

const clampToViewport = (
  left: number,
  top: number,
  width: number,
  height: number,
  margin: number
): BubblePosition => {
  if (typeof window === 'undefined') {
    return { left, top };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const safeW = Math.max(0, width);
  const safeH = Math.max(0, height);
  const maxLeft = Math.max(margin, vw - safeW - margin);
  const maxTop = Math.max(margin, vh - safeH - margin);
  return {
    left: Math.round(Math.min(maxLeft, Math.max(margin, left))),
    top: Math.round(Math.min(maxTop, Math.max(margin, top))),
  };
};

const readStoredPosition = (storageKey: string): BubblePosition | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}_v1`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.left === 'number' &&
      Number.isFinite(parsed.left) &&
      typeof parsed?.top === 'number' &&
      Number.isFinite(parsed.top)
    ) {
      return { left: parsed.left, top: parsed.top };
    }
  } catch {
    // Ignore malformed localStorage entries
  }
  return null;
};

const writeStoredPosition = (storageKey: string, pos: BubblePosition | null) => {
  if (typeof window === 'undefined') return;
  try {
    const key = `${STORAGE_PREFIX}${storageKey}_v1`;
    if (!pos) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify({ left: Math.round(pos.left), top: Math.round(pos.top) }));
    }
  } catch {
    // Ignore storage quota or private-mode errors
  }
};

export const DraggableFloatingBubble: React.FC<DraggableFloatingBubbleProps> = ({
  storageKey,
  defaultAnchor = 'bottom-left',
  defaultOffset = { x: 16, y: 80 },
  zIndexClass = 'z-50',
  margin = 8,
  className = '',
  ariaLabel,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<BubblePosition | null>(() => readStoredPosition(storageKey));
  const [isDragging, setIsDragging] = useState(false);

  const posRef = useRef<BubblePosition | null>(pos);
  posRef.current = pos;

  const suppressClickUntilRef = useRef<number>(0);

  const dragSessionRef = useRef<{
    active: boolean;
    hasMoved: boolean;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startLeft: number;
    startTop: number;
    width: number;
    height: number;
  }>({
    active: false,
    hasMoved: false,
    pointerId: -1,
    startClientX: 0,
    startClientY: 0,
    startLeft: 0,
    startTop: 0,
    width: 0,
    height: 0,
  });

  const syncClampedPosition = useCallback(() => {
    const el = containerRef.current;
    const current = posRef.current;
    if (!el || !current) return;
    const rect = el.getBoundingClientRect();
    const clamped = clampToViewport(current.left, current.top, rect.width, rect.height, margin);
    if (Math.abs(clamped.left - current.left) >= 1 || Math.abs(clamped.top - current.top) >= 1) {
      posRef.current = clamped;
      setPos(clamped);
    }
  }, [margin]);

  useLayoutEffect(() => {
    syncClampedPosition();
  }, [syncClampedPosition]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === 'undefined') return;

    const handleResize = () => syncClampedPosition();
    window.addEventListener('resize', handleResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        syncClampedPosition();
      });
      observer.observe(el);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [syncClampedPosition]);

  const handleResetPosition = useCallback(() => {
    posRef.current = null;
    setPos(null);
    writeStoredPosition(storageKey, null);
  }, [storageKey]);

  const cleanupWindowListeners = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupWindowListeners.current?.();
      cleanupWindowListeners.current = null;
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const target = e.target as HTMLElement | null;
    if (!target) return;

    const isHandle = Boolean(target.closest('[data-drag-handle="true"]'));
    if (!isHandle) {
      const isInteractive = Boolean(
        target.closest('button, a, input, select, textarea, [data-no-drag="true"]')
      );
      if (isInteractive) return;
    }

    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();

    cleanupWindowListeners.current?.();

    dragSessionRef.current = {
      active: true,
      hasMoved: false,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      width: rect.width,
      height: rect.height,
    };

    const handleWindowMove = (ev: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session.active || ev.pointerId !== session.pointerId) return;

      const dx = ev.clientX - session.startClientX;
      const dy = ev.clientY - session.startClientY;

      if (!session.hasMoved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        session.hasMoved = true;
        setIsDragging(true);
      }

      const currentRect = containerRef.current?.getBoundingClientRect();
      const w = currentRect?.width || session.width;
      const h = currentRect?.height || session.height;

      const nextPos = clampToViewport(session.startLeft + dx, session.startTop + dy, w, h, margin);
      posRef.current = nextPos;
      setPos(nextPos);
    };

    const finishDrag = (ev: PointerEvent) => {
      const session = dragSessionRef.current;
      if (!session.active || ev.pointerId !== session.pointerId) return;

      session.active = false;
      cleanupWindowListeners.current?.();
      cleanupWindowListeners.current = null;
      setIsDragging(false);

      if (session.hasMoved) {
        suppressClickUntilRef.current = Date.now() + 260;
        if (posRef.current) {
          writeStoredPosition(storageKey, posRef.current);
        }
      }
    };

    window.addEventListener('pointermove', handleWindowMove, { passive: true });
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);

    cleanupWindowListeners.current = () => {
      window.removeEventListener('pointermove', handleWindowMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  };

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (Date.now() < suppressClickUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickUntilRef.current = 0;
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-drag-handle="true"]')) {
      e.preventDefault();
      e.stopPropagation();
      handleResetPosition();
    }
  };

  const defaultStyle: React.CSSProperties = pos
    ? { left: `${pos.left}px`, top: `${pos.top}px` }
    : {
        ...(defaultAnchor.includes('left')
          ? { left: `${defaultOffset.x}px` }
          : { right: `${defaultOffset.x}px` }),
        ...(defaultAnchor.includes('top')
          ? { top: `${defaultOffset.y}px` }
          : { bottom: `${defaultOffset.y}px` }),
      };

  return (
    <div
      ref={containerRef}
      style={defaultStyle}
      onPointerDown={handlePointerDown}
      onClickCapture={handleClickCapture}
      onDoubleClick={handleDoubleClick}
      aria-label={ariaLabel}
      className={`fixed ${zIndexClass} print:hidden select-none touch-none ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      } ${className}`}
    >
      <div
        className={`transition-transform duration-150 ${
          isDragging ? 'scale-[1.015] drop-shadow-2xl ring-2 ring-indigo-400/60 rounded-2xl' : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
};

interface BubbleDragHandleProps {
  tone?: 'dark' | 'light';
  className?: string;
}

export const BubbleDragHandle: React.FC<BubbleDragHandleProps> = ({
  tone = 'dark',
  className = '',
}) => (
  <span
    data-drag-handle="true"
    onClick={(e) => e.stopPropagation()}
    title="Geser posisi sesuka hati (klik 2x untuk reset posisi)"
    aria-label="Geser posisi bubble"
    className={`inline-flex items-center justify-center shrink-0 cursor-grab active:cursor-grabbing touch-none rounded-md p-0.5 transition-colors ${
      tone === 'dark'
        ? 'text-slate-400/80 hover:text-slate-200 hover:bg-white/10'
        : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
    } ${className}`}
  >
    <GripVertical className="w-3.5 h-3.5 pointer-events-none" />
  </span>
);
