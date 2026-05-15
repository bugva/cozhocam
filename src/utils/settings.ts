export type SolveLayout = 'classic' | 'document';
export type DocSolutionPlacement = 'side' | 'below';
export type BgStyle = 'plain' | 'grid';
export type ToolbarDock = 'right' | 'left' | 'bottom';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface AppSettings {
  solveLayout: SolveLayout;
  docSolutionPlacement: DocSolutionPlacement;
  palmRejection: boolean;
  defaultBgStyle: BgStyle;
  toolbarDock: ToolbarDock;
  themeMode: ThemeMode;
}

const DEFAULTS: AppSettings = {
  solveLayout: 'classic',
  docSolutionPlacement: 'side',
  palmRejection: true,
  defaultBgStyle: 'plain',
  toolbarDock: 'right',
  themeMode: 'system',
};

const KEY = 'cozhocam_settings';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const next = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
