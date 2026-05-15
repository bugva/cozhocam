import { useCallback, useRef, useState } from 'react';

type Stacks = { undo: unknown[][]; redo: unknown[][] };

export function usePerKeyStrokeHistory<T>(
  allStrokes: Record<number, T[]>,
  onStrokesChange: (key: number, strokes: T[]) => void,
  maxSteps = 40,
) {
  const stacksRef = useRef<Map<number, Stacks>>(new Map());
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [, tick] = useState(0);

  const getStacks = (key: number): Stacks => {
    let s = stacksRef.current.get(key);
    if (!s) {
      s = { undo: [], redo: [] };
      stacksRef.current.set(key, s);
    }
    return s;
  };

  const commit = useCallback((key: number, next: T[]) => {
    const cur = allStrokes[key] ?? [];
    const st = getStacks(key);
    st.undo.push(cur);
    if (st.undo.length > maxSteps) st.undo.shift();
    st.redo = [];
    setFocusKey(key);
    onStrokesChange(key, next);
    tick(n => n + 1);
  }, [allStrokes, onStrokesChange, maxSteps]);

  const undo = useCallback(() => {
    if (focusKey == null) return;
    const st = getStacks(focusKey);
    if (!st.undo.length) return;
    const cur = allStrokes[focusKey] ?? [];
    st.redo.push(cur);
    onStrokesChange(focusKey, st.undo.pop()! as T[]);
    tick(n => n + 1);
  }, [allStrokes, focusKey, onStrokesChange]);

  const redo = useCallback(() => {
    if (focusKey == null) return;
    const st = getStacks(focusKey);
    if (!st.redo.length) return;
    const cur = allStrokes[focusKey] ?? [];
    st.undo.push(cur);
    onStrokesChange(focusKey, st.redo.pop()! as T[]);
    tick(n => n + 1);
  }, [allStrokes, focusKey, onStrokesChange]);

  const focusStacks = focusKey != null ? getStacks(focusKey) : { undo: [], redo: [] };

  return {
    commit,
    undo,
    redo,
    canUndo: focusStacks.undo.length > 0,
    canRedo: focusStacks.redo.length > 0,
    focusKey,
    setFocusKey,
  };
}
