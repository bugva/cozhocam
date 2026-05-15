const KEY = 'cozhocam_onboarding';

export type OnboardingFlag =
  | 'draw_regions'
  | 'solve_dock'
  | 'pdf_pinch'
  | 'solve_focus'
  | 'doc_pan_reset'
  | 'pencil_squeeze';

const ALL_FLAGS: OnboardingFlag[] = [
  'draw_regions',
  'solve_dock',
  'pdf_pinch',
  'solve_focus',
  'doc_pan_reset',
  'pencil_squeeze',
];

export function hasSeenOnboarding(flag: OnboardingFlag): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const seen = JSON.parse(raw) as string[];
    return Array.isArray(seen) && seen.includes(flag);
  } catch {
    return false;
  }
}

export function markOnboardingSeen(flag: OnboardingFlag): void {
  try {
    const raw = localStorage.getItem(KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    if (!seen.includes(flag)) {
      seen.push(flag);
      localStorage.setItem(KEY, JSON.stringify(seen));
    }
  } catch { /* ignore */ }
}

export function resetAllOnboarding(): void {
  try {
    localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export function listOnboardingFlags(): readonly OnboardingFlag[] {
  return ALL_FLAGS;
}
