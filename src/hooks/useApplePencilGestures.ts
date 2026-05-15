import { useEffect, useRef, type RefObject } from 'react';
import { hapticLight, hapticMedium } from '../utils/haptic';

/** W3C Pointer Events: 2 = barrel (çift dokunuş), 5 = silgi ucu */
const BARREL_BUTTON = 2;
const ERASER_BUTTON = 5;
/** Apple Pencil Pro sıkıştırma — düşük eşik (Safari tutarsız olabiliyor) */
const SQUEEZE_THRESHOLD = 0.2;
const BARREL_DEBOUNCE_MS = 450;

function isPenBarrelOrEraser(e: PointerEvent): boolean {
  if (e.pointerType !== 'pen') return false;
  if (e.button === ERASER_BUTTON || e.button === BARREL_BUTTON) return true;
  // Uç dokunmadan yalnızca barrel (buttons: 2)
  if ((e.buttons & 2) !== 0 && (e.buttons & 1) === 0) return true;
  return false;
}

function squeezeAmount(e: PointerEvent): number {
  return e.tangentialPressure ?? 0;
}

function pointerOverElement(e: PointerEvent, el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return (
    e.clientX >= r.left
    && e.clientX <= r.right
    && e.clientY >= r.top
    && e.clientY <= r.bottom
  );
}

export interface UseApplePencilGesturesOptions {
  enabled?: boolean;
  targetRef: RefObject<HTMLElement | null>;
  onToggleEraser: () => void;
  /** Her sıkma jestinde bir kez (tüm çözümler aç/kapa vb.) */
  onSqueezeToggle: () => void;
}

export function useApplePencilGestures({
  enabled = true,
  targetRef,
  onToggleEraser,
  onSqueezeToggle,
}: UseApplePencilGesturesOptions) {
  const squeezeEngagedRef = useRef(false);
  const lastBarrelAtRef = useRef(0);
  const onToggleRef = useRef(onToggleEraser);
  const onSqueezeToggleRef = useRef(onSqueezeToggle);
  const enabledRef = useRef(enabled);
  onToggleRef.current = onToggleEraser;
  onSqueezeToggleRef.current = onSqueezeToggle;
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;

    const resetSqueeze = () => {
      squeezeEngagedRef.current = false;
    };

    const fireBarrel = (e: Event, opts?: { fromAuxClick?: boolean }) => {
      if (!enabledRef.current) return;
      if (!targetRef.current) return;

      if (!opts?.fromAuxClick) {
        const pe = e as PointerEvent;
        if (pe.pointerType !== 'pen') return;
        if (!isPenBarrelOrEraser(pe)) return;
      }

      const now = Date.now();
      if (now - lastBarrelAtRef.current < BARREL_DEBOUNCE_MS) return;
      lastBarrelAtRef.current = now;

      e.preventDefault();
      e.stopPropagation();
      hapticMedium();
      onToggleRef.current();
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!isPenBarrelOrEraser(e)) return;
      fireBarrel(e);
    };

    /** Safari bazen çift dokunuşu auxclick (orta tuş) olarak gönderir */
    const onAuxClick = (e: MouseEvent) => {
      if (e.button !== 1) return;
      fireBarrel(e, { fromAuxClick: true });
    };

    const onSqueezeFrame = (ev: Event) => {
      const e = ev as PointerEvent;
      if (!enabledRef.current) return;
      if (e.pointerType !== 'pen') return;
      const root = targetRef.current;
      if (!root || !pointerOverElement(e, root)) {
        resetSqueeze();
        return;
      }

      const squeezed = squeezeAmount(e) >= SQUEEZE_THRESHOLD;
      if (squeezed && !squeezeEngagedRef.current) {
        squeezeEngagedRef.current = true;
        hapticLight();
        onSqueezeToggleRef.current();
      } else if (!squeezed) {
        resetSqueeze();
      }
    };

    const captureOpts: AddEventListenerOptions = { capture: true, passive: false };
    const passiveCapture: AddEventListenerOptions = { capture: true, passive: true };

    window.addEventListener('pointerdown', onPointerDown, captureOpts);
    window.addEventListener('auxclick', onAuxClick, captureOpts);
    window.addEventListener('pointermove', onSqueezeFrame, passiveCapture);
    if ('onpointerrawupdate' in window) {
      window.addEventListener('pointerrawupdate', onSqueezeFrame, passiveCapture);
    }
    window.addEventListener('pointerup', resetSqueeze, passiveCapture);
    window.addEventListener('pointercancel', resetSqueeze, passiveCapture);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, captureOpts);
      window.removeEventListener('auxclick', onAuxClick, captureOpts);
      window.removeEventListener('pointermove', onSqueezeFrame, passiveCapture);
      if ('onpointerrawupdate' in window) {
        window.removeEventListener('pointerrawupdate', onSqueezeFrame, passiveCapture);
      }
      window.removeEventListener('pointerup', resetSqueeze, passiveCapture);
      window.removeEventListener('pointercancel', resetSqueeze, passiveCapture);
      resetSqueeze();
    };
  }, [enabled, targetRef]);
}
