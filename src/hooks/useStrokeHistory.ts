import { useCallback, useRef, useState } from 'react';

export function useStrokeHistory<T>(
  strokes: T[],
  onChange: (next: T[]) => void,
  maxSteps = 40,
) {
  const undoStack = useRef<T[][]>([]);
  const redoStack = useRef<T[][]>([]);
  const [hist, setHist] = useState({ undo: 0, redo: 0 });

  const push = useCallback((next: T[]) => {
    undoStack.current.push(strokes);
    if (undoStack.current.length > maxSteps) undoStack.current.shift();
    redoStack.current = [];
    onChange(next);
    setHist({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, [strokes, onChange, maxSteps]);

  const undo = useCallback(() => {
    if (!undoStack.current.length) return;
    redoStack.current.push(strokes);
    onChange(undoStack.current.pop()!);
    setHist({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, [strokes, onChange]);

  const redo = useCallback(() => {
    if (!redoStack.current.length) return;
    undoStack.current.push(strokes);
    onChange(redoStack.current.pop()!);
    setHist({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, [strokes, onChange]);

  const resetHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    setHist({ undo: 0, redo: 0 });
  }, []);

  void hist;

  return {
    push,
    undo,
    redo,
    canUndo: hist.undo > 0,
    canRedo: hist.redo > 0,
    resetHistory,
  };
}
