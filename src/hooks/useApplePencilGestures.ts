import { useEffect, useRef, type RefObject } from 'react';
import { hapticLight, hapticMedium } from '../utils/haptic';

/** W3C: pen barrel = button 2 (Apple Pencil çift dokunuş), pen eraser ucu = button 5 */
const BARREL_BUTTON = 2;
const ERASER_BUTTON = 5;
const SQUEEZE_PRESSURE = 0.55;

export interface UseApplePencilGesturesOptions {
  enabled?: boolean;
  targetRef: RefObject<HTMLElement | null>;
  onToggleEraser: () => void;
  /** Her sıkma jestinde bir kez (aç/kapa) */
  onSqueezeToggle: () => void;
}

export function useApplePencilGestures({
  enabled = true,
  targetRef,
  onToggleEraser,
  onSqueezeToggle,
}: UseApplePencilGesturesOptions) {
  const squeezeEngagedRef = useRef(false);
  const onToggleRef = useRef(onToggleEraser);
  const onSqueezeToggleRef = useRef(onSqueezeToggle);
  onToggleRef.current = onToggleEraser;
  onSqueezeToggleRef.current = onSqueezeToggle;

  useEffect(() => {
    if (!enabled) return;
    const root = targetRef.current;
    if (!root) return;

    const resetSqueeze = () => {
      squeezeEngagedRef.current = false;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      if (e.button === BARREL_BUTTON || e.button === ERASER_BUTTON) {
        e.preventDefault();
        e.stopPropagation();
        hapticMedium();
        onToggleRef.current();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      const inContact = (e.buttons & 1) !== 0;
      if (!inContact) {
        resetSqueeze();
        return;
      }
      const squeezed = e.tangentialPressure >= SQUEEZE_PRESSURE;
      if (squeezed && !squeezeEngagedRef.current) {
        squeezeEngagedRef.current = true;
        hapticLight();
        onSqueezeToggleRef.current();
      } else if (!squeezed) {
        resetSqueeze();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'pen') resetSqueeze();
    };

    root.addEventListener('pointerdown', onPointerDown, true);
    root.addEventListener('pointermove', onPointerMove, true);
    root.addEventListener('pointerup', onPointerUp, true);
    root.addEventListener('pointercancel', onPointerUp, true);

    return () => {
      root.removeEventListener('pointerdown', onPointerDown, true);
      root.removeEventListener('pointermove', onPointerMove, true);
      root.removeEventListener('pointerup', onPointerUp, true);
      root.removeEventListener('pointercancel', onPointerUp, true);
      resetSqueeze();
    };
  }, [enabled, targetRef]);
}
