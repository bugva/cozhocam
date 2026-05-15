import { useCallback, useRef, useState } from 'react';
import type { Region } from '../components/PdfViewer';

const MAX_STEPS = 30;

export function useRegionHistory(initial: Region[]) {
  const [regions, setRegionsState] = useState<Region[]>(initial);
  const undoRef = useRef<Region[][]>([]);
  const redoRef = useRef<Region[][]>([]);
  const inGestureRef = useRef(false);
  const [, tick] = useState(0);

  const commit = useCallback((next: Region[]) => {
    setRegionsState(prev => {
      if (inGestureRef.current) {
        inGestureRef.current = false;
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
        redoRef.current = [];
        tick(n => n + 1);
        return next;
      }
      if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      undoRef.current.push(prev);
      if (undoRef.current.length > MAX_STEPS) undoRef.current.shift();
      redoRef.current = [];
      tick(n => n + 1);
      return next;
    });
  }, []);

  const preview = useCallback((next: Region[]) => {
    setRegionsState(prev => {
      if (!inGestureRef.current) {
        inGestureRef.current = true;
        undoRef.current.push(prev);
        if (undoRef.current.length > MAX_STEPS) undoRef.current.shift();
        redoRef.current = [];
        tick(n => n + 1);
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    if (!undoRef.current.length) return;
    inGestureRef.current = false;
    setRegionsState(prev => {
      redoRef.current.push(prev);
      tick(n => n + 1);
      return undoRef.current.pop()!;
    });
  }, []);

  const redo = useCallback(() => {
    if (!redoRef.current.length) return;
    inGestureRef.current = false;
    setRegionsState(prev => {
      undoRef.current.push(prev);
      tick(n => n + 1);
      return redoRef.current.pop()!;
    });
  }, []);

  return {
    regions,
    setRegions: commit,
    setRegionsPreview: preview,
    undo,
    redo,
    canUndo: undoRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
  };
}
