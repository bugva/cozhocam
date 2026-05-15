import { useEffect, useRef, type RefObject } from 'react';
import { hapticLight, hapticMedium } from '../utils/haptic';

/**
 * Apple Pencil çift dokunuş / sıkıştırma çoğu PWA’da Safari’ye hiç iletilmez (yalnızca native
 * UIPencilInteraction). Burada Pointer Events ile yakalanabildiği kadar dinlenir; güvenilir
 * kullanım için araç çubuğundaki yedek düğmeleri kullanın.
 */
const BARREL_BUTTON = 2;
const ERASER_BUTTON = 5;
const SQUEEZE_THRESHOLD = 0.12;
const BARREL_DEBOUNCE_MS = 400;

function isCoarsePointerDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/** Çift dokunuş veya silgi ucu */
function isPenBarrelOrEraser(e: PointerEvent): boolean {
  if (e.pointerType !== 'pen') return false;
  if (e.button === ERASER_BUTTON || e.button === BARREL_BUTTON) return true;
  // Barrel basılı, uç yok (buttons: 2)
  if ((e.buttons & 2) !== 0 && (e.buttons & 1) === 0) return true;
  // Bazı WebKit sürümleri: pressure 0, yalnızca barrel
  if (e.pressure === 0 && e.buttons === 2) return true;
  return false;
}

function squeezeAmount(e: PointerEvent): number {
  return Math.abs(e.tangentialPressure ?? 0);
}

function pointerInRoot(e: PointerEvent, root: HTMLElement): boolean {
  const r = root.getBoundingClientRect();
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
  /** Sıkıştırma: tüm çözümler aç/kapa */
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

    const fireBarrel = (e: Event) => {
      if (!enabledRef.current || !targetRef.current) return;

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

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'pen') resetSqueeze();
      if (isPenBarrelOrEraser(e)) fireBarrel(e);
    };

    /** iPad Safari bazen orta tık olarak gönderir — yalnızca dokunmatik cihazda */
    const onAuxClick = (e: MouseEvent) => {
      if (e.button !== 1 || !isCoarsePointerDevice()) return;
      fireBarrel(e);
    };

    const onSqueezeFrame = (ev: Event) => {
      const e = ev as PointerEvent;
      if (!enabledRef.current) return;
      if (e.pointerType !== 'pen') return;

      const root = targetRef.current;
      if (!root || !pointerInRoot(e, root)) {
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

    const root = document.documentElement;
    root.addEventListener('pointerdown', onPointerDown, captureOpts);
    root.addEventListener('pointerup', onPointerUp, captureOpts);
    root.addEventListener('auxclick', onAuxClick, captureOpts);
    root.addEventListener('pointermove', onSqueezeFrame, passiveCapture);
    root.addEventListener('pointercancel', resetSqueeze, passiveCapture);
    if ('onpointerrawupdate' in window) {
      root.addEventListener('pointerrawupdate', onSqueezeFrame, passiveCapture);
    }

    return () => {
      root.removeEventListener('pointerdown', onPointerDown, captureOpts);
      root.removeEventListener('pointerup', onPointerUp, captureOpts);
      root.removeEventListener('auxclick', onAuxClick, captureOpts);
      root.removeEventListener('pointermove', onSqueezeFrame, passiveCapture);
      root.removeEventListener('pointercancel', resetSqueeze, passiveCapture);
      if ('onpointerrawupdate' in window) {
        root.removeEventListener('pointerrawupdate', onSqueezeFrame, passiveCapture);
      }
      resetSqueeze();
    };
  }, [enabled, targetRef]);
}
