import { useCallback, useEffect, useRef, useState } from 'react';
import type { SaveStatus } from '../components/shell/SaveIndicator';

export interface DebouncedSaveResult {
  status: SaveStatus;
  retry: () => void;
  hasPendingError: boolean;
}

/** "Kaydediliyor" yalnızca kayıt bu kadar ms sürdükten sonra gösterilir */
const SAVING_LABEL_DELAY_MS = 700;

export function useDebouncedSave<T>(
  value: T,
  onSave: (v: T) => void | Promise<void>,
  delayMs = 400,
): DebouncedSaveResult {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const isFirst = useRef(true);
  const onSaveRef = useRef(onSave);
  const valueRef = useRef(value);
  const timerRef = useRef<number | null>(null);
  const savingLabelTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const hasPendingErrorRef = useRef(false);
  const hasPendingSaveRef = useRef(false);

  onSaveRef.current = onSave;
  valueRef.current = value;

  const clearSavingLabelTimer = () => {
    if (savingLabelTimerRef.current != null) {
      window.clearTimeout(savingLabelTimerRef.current);
      savingLabelTimerRef.current = null;
    }
  };

  const runSave = useCallback(async () => {
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    clearSavingLabelTimer();
    savingLabelTimerRef.current = window.setTimeout(() => {
      if (saveInFlightRef.current) setStatus('saving');
    }, SAVING_LABEL_DELAY_MS);

    try {
      await onSaveRef.current(valueRef.current);
      hasPendingErrorRef.current = false;
      hasPendingSaveRef.current = false;
      clearSavingLabelTimer();
      setStatus('saved');
      window.setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 1000);
    } catch {
      hasPendingErrorRef.current = true;
      hasPendingSaveRef.current = false;
      clearSavingLabelTimer();
      setStatus('error');
    } finally {
      saveInFlightRef.current = false;
    }
  }, []);

  const retry = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    hasPendingSaveRef.current = true;
    void runSave();
  }, [runSave]);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    hasPendingSaveRef.current = true;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    // Bekleme sırasında "Kaydediliyor" gösterme — yalnızca gerçek kayıt uzun sürerse
    setStatus(s => (s === 'saved' ? 'idle' : s));
    timerRef.current = window.setTimeout(() => {
      void runSave();
    }, delayMs);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [value, delayMs, runSave]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (
        hasPendingSaveRef.current
        || saveInFlightRef.current
        || status === 'saving'
        || status === 'error'
        || hasPendingErrorRef.current
      ) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status]);

  useEffect(() => () => clearSavingLabelTimer(), []);

  return {
    status,
    retry,
    hasPendingError: status === 'error' || hasPendingErrorRef.current,
  };
}
