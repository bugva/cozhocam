/** Kısa dokunsal geri bildirim (destekleyen cihazlarda). */
export function hapticLight(): void {
  try {
    navigator.vibrate?.(8);
  } catch { /* ignore */ }
}

export function hapticMedium(): void {
  try {
    navigator.vibrate?.(14);
  } catch { /* ignore */ }
}

export function hapticSuccess(): void {
  try {
    navigator.vibrate?.([10, 40, 10]);
  } catch { /* ignore */ }
}
