import { useRef, useCallback } from 'react';

/** Sol kenardan sağa kaydırınca panel aç (tablet). */
export function useEdgeSwipeOpen(onOpen: () => void, edgeWidth = 28, threshold = 56) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t || t.clientX > edgeWidth) return;
    startX.current = t.clientX;
    startY.current = t.clientY;
  }, [edgeWidth]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (startX.current == null || startY.current == null) return;
    const t = e.changedTouches[0];
    if (!t) {
      startX.current = null;
      startY.current = null;
      return;
    }
    const dx = t.clientX - startX.current;
    const dy = Math.abs(t.clientY - startY.current);
    if (dx >= threshold && dy < threshold * 1.2) onOpen();
    startX.current = null;
    startY.current = null;
  }, [onOpen, threshold]);

  return { onTouchStart, onTouchEnd };
}
