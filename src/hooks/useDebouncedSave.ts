import { useEffect, useRef, useState } from 'react';
import type { SaveStatus } from '../components/shell/SaveIndicator';

export function useDebouncedSave<T>(
  value: T,
  onSave: (v: T) => void | Promise<void>,
  delayMs = 400,
): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const isFirst = useRef(true);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    setStatus('saving');
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await onSaveRef.current(value);
          setStatus('saved');
          window.setTimeout(() => setStatus('idle'), 2000);
        } catch {
          setStatus('idle');
        }
      })();
    }, delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return status;
}
